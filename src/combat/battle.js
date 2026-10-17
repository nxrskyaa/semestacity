// HOLO-TABLE ROBOT BATTLE — entry point (see docs/ARCHITECTURE.md, "Combat API").
//
//   startBattle({ scene, camera, renderer, collision, audio, input, center:{x,z,rotY},
//                 playerName, rivalName, playerRobot:'ray', rivalRobot:'fang', difficulty:1,
//                 onEnd(result:'win'|'lose') }) -> { update(dt,time), dispose(), debug }
//
// Owns the camera while active (restores position/rotation/fov on dispose) and the DOM HUD
// (#battle-hud). All gameplay runs in ARENA-LOCAL space under arena.root, which is placed at
// `center` (rotated by center.rotY). The world collision is NOT used: the arena has its own.
import * as THREE from 'three';
import { createArena, FLOOR_Y, HOLO_CYAN, ARENA_A, octDist } from './arena.js';
import { createRobot, ROBOT_INFO } from './robots.js';
import { createFX } from './fx.js';
import { createWeapons } from './weapons.js';
import { Fighter, MAX_HP } from './fighter.js';
import { createAI } from './ai.js';
import { createHUD } from './hud.js';
import { clamp, damp, dampAngle, lerp, smooth } from '../core/util.js';

// intro timeline (seconds)
const T_BUILD = 2.2;          // arena materializes 0 -> T_BUILD
const T_WARP_P = 1.45, T_WARP_R = 2.0, WARP_DUR = 0.95;
const T_OVER = 1.9;           // camera reaches the overview
const T_READY = 3.05;         // READY... banner + camera glides behind the player
const T_BEHIND = 1.15;
const T_GO = 4.45;            // GO! — control starts
const KO_SLOW = 0.22, KO_DUR = 1.9;
const RESULT_HOLD = 3.2;      // seconds of VICTORY/DEFEAT before onEnd
const SPAWN_Z = 3.0;
const BATTLE_FOV = 58;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3();
const _v2 = new THREE.Vector2();

export function startBattle(opts) {
  const {
    scene, camera, renderer, audio, input,
    center = { x: 0, z: 0, rotY: 0 },
    playerName = 'Player', rivalName = 'Raka',
    playerRobot = 'ray', rivalRobot = 'fang', difficulty = 1,
    onEnd = () => {},
    // gear perks from the gacha (src/systems/perks.js battleMods); all optional
    playerMods = null,
  } = opts;
  const M = { dmg: 1, gun: 1, bomb: 1, run: 1, jump: 1, cooldown: 1, armor: 0, regen: 0, shield: 0, ...(playerMods || {}) };
  let shield = M.shield;

  // ------------------------------------------------------------ save camera / renderer
  const saved = {
    pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov,
    near: camera.near, far: camera.far, clip: renderer.localClippingEnabled,
  };
  renderer.localClippingEnabled = true;

  // ------------------------------------------------------------ scene setup
  const arena = createArena();
  const root = arena.root;
  root.position.set(center.x || 0, center.y || 0, center.z || 0);
  root.rotation.y = center.rotY || 0;
  scene.add(root);
  root.updateMatrixWorld(true);
  const toLocal = (v) => root.worldToLocal(v);
  const toWorld = (v) => root.localToWorld(v);

  // soft cyan bounce from the holo floor so the toon robots read at night (no shadows, cheap)
  const holoLight = new THREE.HemisphereLight(0x9fc8ff, 0x2fb8d8, 0.0);
  scene.add(holoLight);

  const fx = createFX(root);
  const weapons = createWeapons({ root, arena, fx, audio, onHit: (h) => dealDamage(h.target, h.attacker, h.dmg, h.kind, h.pos, h.dir, false) });

  const pRobot = createRobot(playerRobot);
  const rRobot = createRobot(rivalRobot);
  root.add(pRobot.root, rRobot.root);
  pRobot.setVisible(false); rRobot.setVisible(false);
  const D = clamp(difficulty, 0.3, 2.5);
  const player = new Fighter({ kind: playerRobot, robot: pRobot, arena, weapons, fx, audio, toLocal });
  if (playerMods) {
    // per-battle copy of the stats so gear never leaks into the shared STATS table
    const st = JSON.parse(JSON.stringify(player.st));
    st.run *= M.run; st.jump *= Math.sqrt(M.jump);
    st.gun.dmg = Math.round(st.gun.dmg * M.gun * M.dmg);
    st.bomb.dmg = Math.round(st.bomb.dmg * M.bomb * M.dmg);
    st.pod.dmg = Math.round(st.pod.dmg * M.dmg);
    player.st = st;
    player.anim.runSpeed = st.run;
    for (const k of ['gun', 'bomb', 'pod']) player.cdMax[k] = st[k].cooldown * M.cooldown;
  }
  const rival = new Fighter({ kind: rivalRobot, robot: rRobot, arena, weapons, fx, audio, toLocal, cdScale: 1.22 - 0.2 * D });
  player.place(0, -SPAWN_Z, 0);
  rival.place(0, SPAWN_Z, Math.PI);
  const fighters = [player, rival];
  let ai = createAI({ self: rival, target: player, arena, weapons, difficulty: D, seed: (Math.random() * 1e9) | 0 });
  let autoAI = null; // debug autopilot for the player

  // blob shadows
  const shTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shGeo = new THREE.PlaneGeometry(0.9, 0.9); shGeo.rotateX(-Math.PI / 2);
  const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, fog: false });
  const shadows = fighters.map(() => { const m = new THREE.Mesh(shGeo, shMat); m.renderOrder = 5; m.visible = false; root.add(m); return m; });

  // warp beams (teleport columns)
  const beamGeo = new THREE.CylinderGeometry(0.42, 0.55, 3.2, 24, 1, true); beamGeo.translate(0, 1.6, 0);
  const beamMat = () => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: HOLO_CYAN.clone().multiplyScalar(1.4) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
      void main(){ float g = pow(1.0 - vUv.y, 2.2); float lines = 0.6 + 0.4 * step(0.5, fract(vUv.y * 40.0 - uTime * 3.0));
        float edge = 0.35 + 0.65 * pow(abs(sin(vUv.x * 3.14159 * 6.0 + uTime * 2.0)), 6.0);
        gl_FragColor = vec4(uColor * g * lines * edge * uOpacity, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beams = fighters.map(() => {
    const m = new THREE.Mesh(beamGeo, beamMat());
    m.visible = false; m.renderOrder = 6; root.add(m); return m;
  });

  // HUD
  const hud = createHUD({
    p1Label: (ROBOT_INFO[playerRobot] || ROBOT_INFO.ray).label,
    p2Label: (ROBOT_INFO[rivalRobot] || ROBOT_INFO.fang).label,
    playerName, rivalName, maxHp: MAX_HP,
  });
  hud.setCooldowns(1, 1, 1);

  audio.setMusic('battle');
  audio.sfx('warp', { volume: 0.8 });

  // ------------------------------------------------------------ state
  let phase = 'intro';          // intro | fight | ko | result | ended
  let phaseT = 0;               // real seconds in phase
  let simTime = 0;
  let timeScale = 1, hitStop = 0;
  let disposed = false, ended = false;
  let loser = null, winner = null, result = null;
  let fightTime = 0;
  let readyShown = false, warpP = false, warpR = false, warpPDone = false, warpRDone = false;
  let koBooms = 0;
  let aiEnabled = true;

  // camera (arena-local)
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const startPos = toLocal(saved.pos.clone());
  const startLook = toLocal(new THREE.Vector3(0, 0, -6).applyQuaternion(saved.quat).add(saved.pos));
  camPos.copy(startPos); camLook.copy(startLook);
  const overPos = new THREE.Vector3(), overLook = new THREE.Vector3(0, 0.35, 0);
  const tgtPos = new THREE.Vector3(), tgtLook = new THREE.Vector3();
  const fromPos = new THREE.Vector3(), fromLook = new THREE.Vector3();
  let camYaw = 0, yawOff = 0, camFov = saved.fov, downCam = 0;
  let shakeX = 0, shakeY = 0;

  const intentP = { mx: 0, mz: 0, jump: false, dash: false, gun: false, bomb: false, pod: false, aimPoint: new THREE.Vector3(), bombPoint: new THREE.Vector3() };

  // ------------------------------------------------------------ damage
  function dealDamage(target, attacker, dmg, kind, pos, dir, force) {
    if (phase !== 'fight' && !force) return false;
    if (force) { target.invulnT = 0; if (target.mode === 'down' || target.mode === 'getup') target.mode = 'normal'; }
    if (target === player && !force) {
      dmg = Math.max(1, Math.round(dmg * (1 - M.armor)));
      if (shield > 0) {
        const absorbed = Math.min(shield, dmg);
        shield -= absorbed; dmg -= absorbed;
        fx.hit(pos, HOLO_CYAN, _u.copy(dir).negate());
        if (dmg <= 0) { hud.popDamage(toWorld(_p.copy(pos)), 0, true); return false; }
      }
    }
    if (!target.takeHit(dmg, kind, dir, simTime)) return false;
    const col = attacker ? attacker.color : HOLO_CYAN;
    fx.hit(pos, col, _u.copy(dir).negate());
    audio.sfx('hit', { volume: kind === 'gun' ? 0.7 : 1 });
    if (attacker) { attacker.stats.hits++; attacker.stats.dmgDealt += dmg; }
    hitStop = kind === 'gun' ? 0.045 : 0.09;
    if (target === player) { fx.shake(kind === 'gun' ? 0.07 : 0.16); hud.hitFlash(kind === 'gun' ? 0.6 : 1); }
    else fx.shake(kind === 'gun' ? 0.025 : 0.08);
    hud.popDamage(toWorld(_p.copy(pos)), dmg, target === player);
    hud.setHP(target === player ? 0 : 1, target.hp);
    if (target.hp <= 0 && phase === 'fight') startKO(target);
    return true;
  }

  function startKO(who) {
    phase = 'ko'; phaseT = 0; koBooms = 0;
    loser = who; winner = who === player ? rival : player;
    result = who === rival ? 'win' : 'lose';
    weapons.clear();
    fromPos.copy(camPos); fromLook.copy(camLook);
  }

  // ------------------------------------------------------------ camera helpers
  function battleCamTarget(dt, outPos, outLook) {
    const p = player.pos, e = rival.pos;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.7) camYaw = dampAngle(camYaw, Math.atan2(dx, dz) + yawOff, 5.5, dt);
    const fx_ = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx_;
    const dd = clamp(d, 0, 10);
    const downing = player.mode === 'down' || player.mode === 'getup' || player.mode === 'ko';
    downCam = damp(downCam, downing ? 1 : 0, 3, dt);
    const back = 2.7 + dd * 0.13 + downCam * 1.3;
    const h = 1.55 + dd * 0.09 + downCam * 0.9;
    const py = Math.min(p.y, FLOOR_Y + 2.2);
    outPos.set(p.x - fx_ * back + rx * 0.5, py * 0.7 + h, p.z - fz * back + rz * 0.5);
    // keep the camera inside the energy wall: pull in and rise instead
    const lim = ARENA_A + 0.6;
    const od = octDist(outPos.x, outPos.z);
    if (od > lim) {
      const po = octDist(p.x, p.z);
      const k = clamp((od - lim) / Math.max(0.01, od - po), 0, 0.6);
      const pulled = k * back;
      outPos.x = lerp(outPos.x, p.x, k); outPos.z = lerp(outPos.z, p.z, k);
      outPos.y += pulled * 0.6;
    }
    outLook.set(lerp(p.x, e.x, 0.45), lerp(py, Math.min(e.y, 2), 0.4) + 0.35, lerp(p.z, e.z, 0.45));
  }

  let camOverride = null;
  function applyCamera(dt) {
    if (camOverride) { camPos.fromArray(camOverride.pos); camLook.fromArray(camOverride.look); }
    _v.copy(camPos); toWorld(_v);
    _w.copy(camLook); toWorld(_w);
    const s = fx.shakeAmount;
    shakeX = (Math.random() - 0.5) * 2 * s * 0.35;
    shakeY = (Math.random() - 0.5) * 2 * s * 0.35;
    camera.position.copy(_v);
    camera.position.y += shakeY;
    camera.lookAt(_w);
    camera.position.addScaledVector(_u.set(1, 0, 0).applyQuaternion(camera.quaternion), shakeX);
    if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(); // fresh matrixWorldInverse for HUD projection this frame
  }

  // ------------------------------------------------------------ projection for HUD
  const projOut = { x: 0, y: 0, visible: false };
  let rect = null;
  function project(x, y, z) {
    _p.set(x, y, z).project(camera);
    const r = rect || (rect = renderer.domElement.getBoundingClientRect());
    projOut.visible = _p.z < 1 && _p.z > -1;
    projOut.x = r.left + (_p.x * 0.5 + 0.5) * r.width;
    projOut.y = r.top + (-_p.y * 0.5 + 0.5) * r.height;
    return projOut;
  }

  // ------------------------------------------------------------ player input
  function readPlayer(dt) {
    const ax = input.axis();
    const fx_ = Math.sin(camYaw), fz = Math.cos(camYaw);
    intentP.mx = fx_ * ax.y - fz * ax.x;
    intentP.mz = fz * ax.y + fx_ * ax.x;
    intentP.jump = input.pressed('Space');
    intentP.dash = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    intentP.gun = input.mouseDown(0) || input.down('KeyJ');
    intentP.bomb = input.mousePressed(2) || input.pressed('KeyK');
    intentP.pod = input.pressed('KeyE') || input.pressed('KeyQ') || input.pressed('KeyL');
    const e = rival;
    const dist = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    const lt = dist / player.st.gun.speed * 0.5;
    intentP.aimPoint.set(e.pos.x + e.vel.x * lt, e.chestY - 0.05, e.pos.z + e.vel.z * lt);
    intentP.bombPoint.set(e.pos.x + e.vel.x * 0.55, e.pos.y, e.pos.z + e.vel.z * 0.55);
    // mouse nudges the lock-on camera a little; it drifts back to centre
    if (input.looking && input.mouse.dx) yawOff = clamp(yawOff - input.mouse.dx * 0.0025, -0.55, 0.55);
    yawOff = damp(yawOff, 0, 1.6, dt);
    return intentP;
  }

  // ------------------------------------------------------------ warp-in
  function warpUpdate(f, idx, t0, dt) {
    const robot = f.robot;
    const t = (phaseT - t0) / WARP_DUR;
    const beam = beams[idx];
    if (t < 0) return false;
    if (!robot.root.visible) {
      robot.setVisible(true);
      beam.visible = true;
      audio.sfx('warp');
      fx.ring(_v.set(f.pos.x, FLOOR_Y + 0.03, f.pos.z), HOLO_CYAN, 0.2, 1.4, 0.6);
    }
    const worldY = root.position.y + f.pos.y;
    if (t < 1) {
      robot.setMaterialize(smooth(clamp(t, 0, 1)), worldY);
      beam.position.set(f.pos.x, f.pos.y, f.pos.z);
      beam.material.uniforms.uOpacity.value = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 0.75;
      beam.material.uniforms.uTime.value = phaseT;
      beam.scale.set(1 - t * 0.4, 1, 1 - t * 0.4);
      // rising holo "voxels"
      if (Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.25;
        fx.spark(f.pos.x + Math.cos(a) * r, f.pos.y + t * 1.1 + Math.random() * 0.2, f.pos.z + Math.sin(a) * r,
          0, 0.8 + Math.random(), 0, HOLO_CYAN, 0.07, 0.5, 0, 0.5);
      }
      return false;
    }
    robot.finishMaterialize();
    beam.visible = false;
    fx.flash(_v.set(f.pos.x, f.pos.y + 0.6, f.pos.z), HOLO_CYAN, 0.6, 0.25);
    fx.burst(_v, 24, HOLO_CYAN, 3, 0.06, 0.5, -2);
    return true;
  }

  // ------------------------------------------------------------ update
  function update(dtIn, time) {
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, dtIn || 0));
    phaseT += dt;
    root.updateMatrixWorld();

    // time scale (KO slow-mo, hit-stop)
    let ts = 1;
    if (phase === 'ko') ts = phaseT < KO_DUR - 0.45 ? KO_SLOW : lerp(KO_SLOW, 1, clamp((phaseT - (KO_DUR - 0.45)) / 0.45, 0, 1));
    if (hitStop > 0) { hitStop -= dt; ts *= 0.12; }
    timeScale = ts;
    const sdt = dt * ts;
    simTime += sdt;

    holoLight.intensity = damp(holoLight.intensity, phase === 'intro' ? clamp(phaseT / T_BUILD, 0, 1) * 0.35 : 0.35, 4, dt);
    arena.setBuild(phase === 'intro' ? clamp(phaseT / T_BUILD, 0, 1) : 1);
    arena.update(sdt, simTime);

    // ---------------------------------------------- intents
    let ip = null, ir = null;
    if (phase === 'fight' && M.regen > 0 && !player.dead && player.hp > 0 && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + M.regen * dt);
      hud.setHP(0, Math.round(player.hp));
    }
    if (phase === 'fight') {
      ip = autoAI ? autoAI.update(sdt, simTime) : readPlayer(dt);
      ir = aiEnabled ? ai.update(sdt, simTime) : null;
      fightTime += sdt;
    } else if (phase === 'intro') {
      // warp-in sequence
      if (!warpPDone) warpPDone = warpUpdate(player, 0, T_WARP_P, dt);
      if (!warpRDone) warpRDone = warpUpdate(rival, 1, T_WARP_R, dt);
      if (!readyShown && phaseT >= T_READY) { readyShown = true; hud.showBanner('READY...', 'ready'); audio.sfx('blip'); }
      if (phaseT >= T_GO) {
        phase = 'fight'; phaseT = 0;
        player.mode = 'normal'; rival.mode = 'normal';
        hud.showBanner('GO!', 'go', 0.95);
        audio.sfx('lock');
        audio.sfx('confirm');
        arena.flash(1);
      }
    }

    player.update(sdt, simTime, ip, rival);
    rival.update(sdt, simTime, ir, player);
    // robots don't overlap (simple circle separation)
    {
      const dx = rival.pos.x - player.pos.x, dz = rival.pos.z - player.pos.z;
      const dy = Math.abs(rival.pos.y - player.pos.y);
      const d = Math.hypot(dx, dz);
      if (d < 0.62 && dy < 0.9 && d > 1e-4) {
        const push = (0.62 - d) * 0.5;
        player.pos.x -= dx / d * push; player.pos.z -= dz / d * push;
        rival.pos.x += dx / d * push; rival.pos.z += dz / d * push;
        arena.resolveCircle(player.pos, 0.34); arena.resolveCircle(rival.pos, 0.34);
        player.robot.root.position.copy(player.pos); rival.robot.root.position.copy(rival.pos);
      }
    }
    weapons.update(sdt, fighters);
    fx.update(sdt);

    // blob shadows
    for (let i = 0; i < 2; i++) {
      const f = fighters[i];
      const sh = shadows[i];
      sh.visible = f.robot.root.visible;
      const g = arena.groundAt(f.pos.x, f.pos.z, 0.34, f.pos.y + 0.01);
      const hgt = Math.max(0, f.pos.y - g);
      sh.position.set(f.pos.x, g + 0.012, f.pos.z);
      const s = (f.mode === 'down' || f.mode === 'ko' ? 1.5 : 1) * Math.max(0.4, 1 - hgt * 0.35);
      sh.scale.set(s, 1, s);
    }

    // ---------------------------------------------- phase logic + camera
    if (phase === 'intro') {
      const a = -0.55 + phaseT * 0.12;
      overPos.set(Math.sin(a) * 9.2, 6.3, -Math.cos(a) * 9.2);
      if (phaseT < T_OVER) {
        const k = smooth(clamp(phaseT / T_OVER, 0, 1));
        // swoop: arc up and over from the street camera
        camPos.lerpVectors(startPos, overPos, k);
        camPos.y += Math.sin(k * Math.PI) * 1.5;
        camLook.lerpVectors(startLook, overLook, k);
        camFov = lerp(saved.fov, 50, k);
      } else if (phaseT < T_READY) {
        camPos.copy(overPos); camLook.copy(overLook); camFov = 50;
        fromPos.copy(camPos); fromLook.copy(camLook);
        camYaw = 0;
      } else {
        battleCamTarget(dt, tgtPos, tgtLook);
        const k = smooth(clamp((phaseT - T_READY) / T_BEHIND, 0, 1));
        camPos.lerpVectors(fromPos, tgtPos, k);
        camLook.lerpVectors(fromLook, tgtLook, k);
        camFov = lerp(50, BATTLE_FOV, k);
      }
    } else if (phase === 'fight') {
      battleCamTarget(dt, tgtPos, tgtLook);
      camPos.x = damp(camPos.x, tgtPos.x, 7, dt); camPos.y = damp(camPos.y, tgtPos.y, 5, dt); camPos.z = damp(camPos.z, tgtPos.z, 7, dt);
      camLook.x = damp(camLook.x, tgtLook.x, 9, dt); camLook.y = damp(camLook.y, tgtLook.y, 7, dt); camLook.z = damp(camLook.z, tgtLook.z, 9, dt);
      camFov = damp(camFov, BATTLE_FOV, 4, dt);
    } else if (phase === 'ko') {
      // big boom sequence on the loser (real-time spaced)
      const L = loser;
      const boomAt = [0.0, 0.32, 0.62];
      while (koBooms < boomAt.length && phaseT >= boomAt[koBooms]) {
        _v.set(L.pos.x + (Math.random() - 0.5) * 0.4 * koBooms, L.pos.y + 0.5 + Math.random() * 0.3, L.pos.z + (Math.random() - 0.5) * 0.4 * koBooms);
        fx.explosion(_v, koBooms === 0 ? 1.9 : 1.25, koBooms === 1 ? L.color : null);
        fx.shake(0.35);
        arena.flash(1.2);
        audio.sfx('explode', { volume: 1, pitch: koBooms === 0 ? 0.8 : 1 });
        if (koBooms === 0) { hud.hitFlash(0.8); hud.setControlsVisible(false); }
        koBooms++;
      }
      // side-on dramatic shot around the loser
      const ang = Math.atan2(L.pos.x - winner.pos.x, L.pos.z - winner.pos.z) + Math.PI / 2 + phaseT * 0.25;
      tgtPos.set(L.pos.x + Math.sin(ang) * 3.8, L.pos.y + 1.4, L.pos.z + Math.cos(ang) * 3.8);
      tgtLook.set(L.pos.x, L.pos.y + 0.45, L.pos.z);
      const k = smooth(clamp(phaseT / 0.5, 0, 1));
      camPos.lerpVectors(fromPos, tgtPos, k);
      camLook.lerpVectors(fromLook, tgtLook, k);
      camFov = damp(camFov, 48, 3, dt);
      if (phaseT >= KO_DUR) {
        phase = 'result'; phaseT = 0;
        winner.setVictory();
        fromPos.copy(camPos); fromLook.copy(camLook);
        const win = result === 'win';
        hud.showBanner(win ? 'VICTORY!' : 'DEFEAT…', win ? 'win' : 'lose');
        audio.sfx(win ? 'victory' : 'defeat');
        const acc = player.stats.shots ? Math.round((player.stats.hits / player.stats.shots) * 100) : 0;
        const mm = Math.floor(fightTime / 60), ss = Math.floor(fightTime % 60);
        hud.showResult(`<div>TIME<b>${mm}:${String(ss).padStart(2, '0')}</b></div><div>HITS<b>${player.stats.hits}</b></div><div>ACCURACY<b>${acc}%</b></div><div>DAMAGE<b>${player.stats.dmgDealt}</b></div>`);
      }
    } else if (phase === 'result') {
      // winner faces the camera; slow orbit in front of it
      const W = winner;
      const ang = W.yaw + 0.35 + phaseT * 0.12;
      tgtPos.set(W.pos.x + Math.sin(ang) * 3.3, W.pos.y + 1.05, W.pos.z + Math.cos(ang) * 3.3);
      tgtLook.set(W.pos.x, W.pos.y + 1.0, W.pos.z);
      const k = smooth(clamp(phaseT / 0.9, 0, 1));
      camPos.lerpVectors(fromPos, tgtPos, k);
      camLook.lerpVectors(fromLook, tgtLook, k);
      camFov = damp(camFov, 42, 3, dt);
      if (phaseT >= RESULT_HOLD && !ended) {
        ended = true;
        try { onEnd(result); } catch (err) { console.error(err); }
      }
    }
    applyCamera(dt);

    // ---------------------------------------------- HUD
    rect = renderer.domElement.getBoundingClientRect(); // once per frame
    const cdr = (k) => 1 - player.cd[k] / player.cdMax[k];
    hud.setCooldowns(cdr('gun'), cdr('bomb'), cdr('pod'));
    renderer.getDrawingBufferSize(_v2);
    fx.setPointScale(_v2.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
    if (phase === 'fight' && rival.robot.root.visible) {
      _p.set(rival.pos.x, rival.pos.y + 0.6, rival.pos.z); toWorld(_p);
      const dist = camera.position.distanceTo(_p);
      const pr = project(_p.x, _p.y, _p.z);
      _v.set(player.pos.x, player.pos.y + 0.6, player.pos.z);
      _w.set(rival.pos.x, rival.pos.y + 0.6, rival.pos.z);
      const hot = arena.lineOfSight(_v, _w) && Math.hypot(rival.pos.x - player.pos.x, rival.pos.z - player.pos.z) < 9;
      hud.setReticle(pr.x, pr.y, pr.visible, hot, clamp(5 / Math.max(1, dist), 0.55, 1.3));
    } else hud.setReticle(0, 0, false);
    hud.update(dt, project);
  }

  // ------------------------------------------------------------ dispose
  function dispose() {
    if (disposed) return;
    disposed = true;
    hud.dispose();
    weapons.dispose();
    fx.dispose();
    pRobot.dispose(); rRobot.dispose();
    for (const b of beams) b.material.dispose();
    beamGeo.dispose(); shGeo.dispose(); shMat.dispose(); shTex.dispose();
    scene.remove(holoLight); holoLight.dispose && holoLight.dispose();
    arena.dispose();
    renderer.localClippingEnabled = saved.clip;
    camera.position.copy(saved.pos);
    camera.quaternion.copy(saved.quat);
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ debug hooks (harness only)
  const debug = {
    damageRival(n = 100) { if (phase === 'fight') dealDamage(rival, player, n, 'bomb', _v.set(rival.pos.x, rival.pos.y + 0.6, rival.pos.z), _u.set(0, 0, 1), true); },
    damagePlayer(n = 100) { if (phase === 'fight') dealDamage(player, rival, n, 'bomb', _v.set(player.pos.x, player.pos.y + 0.6, player.pos.z), _u.set(0, 0, -1), true); },
    setAI(on) { aiEnabled = !!on; },
    camOverride(pos, look) { camOverride = pos ? { pos, look } : null; },
    autoPlay(on, diff = 1) { autoAI = on ? createAI({ self: player, target: rival, arena, weapons, difficulty: diff, seed: 99 }) : null; },
    get phase() { return phase; },
    get fightTime() { return fightTime; },
    get hp() { return [player.hp, rival.hp]; },
    player, rival, arena, fx, weapons,
  };

  return { update, dispose, debug };
}
