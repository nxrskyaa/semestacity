// Projectiles (arena-local space): homing gun bullets, lobbed bombs with arc + ground marker,
// slow homing pods. Pooled meshes; collision vs arena (cubes/wall/floor) and robots.
import * as THREE from 'three';
import { FLOOR_Y } from './arena.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const ZF = new THREE.Vector3(0, 0, 1);
const hitOut = { kind: null, cube: null };

/** squared distance from point p to segment a-b */
function segDist2(ax, ay, az, bx, by, bz, px, py, pz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + abx * t - px, dy = ay + aby * t - py, dz = az + abz * t - pz;
  return dx * dx + dy * dy + dz * dz;
}

export function createWeapons({ root, arena, fx, audio, onHit }) {
  const group = new THREE.Group();
  group.name = 'projectiles';
  root.add(group);
  const geos = [], mats = [];

  // ------------------------------------------------------------- bullets
  const boltGeo = new THREE.SphereGeometry(1, 10, 6);
  boltGeo.scale(0.045, 0.045, 0.16);
  const trailGeo = new THREE.ConeGeometry(0.04, 0.7, 8, 1, true);
  trailGeo.rotateX(-Math.PI / 2); trailGeo.translate(0, 0, -0.35 - 0.05); // tip trails backwards (-Z)
  geos.push(boltGeo, trailGeo);
  const BUL = [];
  for (let i = 0; i < 48; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const tm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    mats.push(m, tm);
    const mesh = new THREE.Mesh(boltGeo, m);
    const trail = new THREE.Mesh(trailGeo, tm);
    mesh.add(trail);
    mesh.visible = false; mesh.renderOrder = 9; trail.renderOrder = 9;
    group.add(mesh);
    BUL.push({ active: false, mesh, trail, pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3(),
      owner: null, target: null, life: 0, age: 0, homing: 0, dmg: 0, speed: 0, color: new THREE.Color() });
  }
  let bulNext = 0;

  function fireBullet(owner, origin, dir, target, o) {
    const b = BUL[bulNext]; bulNext = (bulNext + 1) % BUL.length;
    b.active = true; b.owner = owner; b.target = target;
    b.pos.copy(origin); b.prev.copy(origin);
    b.speed = o.speed; b.vel.copy(dir).multiplyScalar(o.speed);
    b.life = o.life; b.age = 0; b.homing = o.homing; b.dmg = o.dmg;
    b.color.copy(o.color);
    b.mesh.material.color.copy(o.color).multiplyScalar(1.6);
    b.trail.material.color.copy(o.color).multiplyScalar(0.7);
    b.mesh.visible = true;
    orient(b.mesh, b.pos, b.vel);
    return b;
  }
  function orient(mesh, p, v) {
    mesh.position.copy(p);
    _a.copy(v).normalize();
    _q.setFromUnitVectors(ZF, _a);
    mesh.quaternion.copy(_q);
  }
  function killBullet(b) { b.active = false; b.mesh.visible = false; }

  // ------------------------------------------------------------- bombs
  const bombGeo = new THREE.IcosahedronGeometry(0.11, 1);
  const bombRingGeo = new THREE.TorusGeometry(0.16, 0.015, 6, 24);
  const markGeo = new THREE.RingGeometry(0.75, 0.85, 40); markGeo.rotateX(-Math.PI / 2);
  const markInGeo = new THREE.RingGeometry(0.0, 0.12, 20); markInGeo.rotateX(-Math.PI / 2);
  geos.push(bombGeo, bombRingGeo, markGeo, markInGeo);
  const ARC_N = 26;
  const BOMB = [];
  for (let i = 0; i < 6; i++) {
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const mm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const am = new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    mats.push(bm, rm, mm, am);
    const mesh = new THREE.Mesh(bombGeo, bm);
    const ring = new THREE.Mesh(bombRingGeo, rm);
    mesh.add(ring);
    const mark = new THREE.Group();
    mark.add(new THREE.Mesh(markGeo, mm), new THREE.Mesh(markInGeo, mm));
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
    geos.push(arcGeo);
    const arc = new THREE.Points(arcGeo, am);
    arc.frustumCulled = false;
    mesh.visible = mark.visible = arc.visible = false;
    mesh.renderOrder = 9; mark.renderOrder = 8; arc.renderOrder = 8;
    group.add(mesh, mark, arc);
    BOMB.push({ active: false, mesh, ring, mark, arc, arcGeo, mm, am, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      prev: new THREE.Vector3(), target: new THREE.Vector3(), owner: null, age: 0, flight: 1, dmg: 0, radius: 1.8, color: new THREE.Color() });
  }
  let bombNext = 0;
  const BOMB_G = 14;

  function fireBomb(owner, origin, targetPos, o) {
    const b = BOMB[bombNext]; bombNext = (bombNext + 1) % BOMB.length;
    b.active = true; b.owner = owner; b.age = 0; b.dmg = o.dmg; b.radius = o.radius;
    b.color.copy(o.color);
    b.pos.copy(origin); b.prev.copy(origin);
    b.target.copy(targetPos); b.target.y = arena.groundAt(targetPos.x, targetPos.z, 0.05, targetPos.y + 0.2);
    const dx = b.target.x - origin.x, dz = b.target.z - origin.z;
    const dist = Math.hypot(dx, dz);
    const T = Math.min(1.15, Math.max(0.6, 0.5 + dist * 0.075));
    b.flight = T;
    b.vel.set(dx / T, (b.target.y - origin.y + 0.5 * BOMB_G * T * T) / T, dz / T);
    b.mesh.material.color.copy(o.color).multiplyScalar(1.2);
    b.ring.material.color.copy(o.color).multiplyScalar(2);
    b.mm.color.copy(o.color).multiplyScalar(1.6);
    b.am.color.copy(o.color).multiplyScalar(1.4);
    b.mark.position.set(b.target.x, b.target.y + 0.02, b.target.z);
    b.mark.scale.setScalar(o.radius / 0.85);
    // arc preview
    const arr = b.arcGeo.attributes.position.array;
    for (let i = 0; i < ARC_N; i++) {
      const t = (i / (ARC_N - 1)) * T;
      arr[i * 3] = origin.x + b.vel.x * t;
      arr[i * 3 + 1] = origin.y + b.vel.y * t - 0.5 * BOMB_G * t * t;
      arr[i * 3 + 2] = origin.z + b.vel.z * t;
    }
    b.arcGeo.attributes.position.needsUpdate = true;
    b.mesh.visible = b.mark.visible = b.arc.visible = true;
    b.mesh.position.copy(origin);
    return b;
  }
  function explodeBomb(b, fighters) {
    b.active = false; b.mesh.visible = b.mark.visible = b.arc.visible = false;
    fx.explosion(b.pos, 1.15, b.color);
    fx.ring(_c.set(b.pos.x, Math.max(FLOOR_Y + 0.03, b.pos.y - 0.2), b.pos.z), b.color, 0.3, b.radius * 1.15, 0.45);
    arena.flash(0.6);
    audio.sfx('explode', { volume: 0.9 });
    aoe(b.owner, b.pos, b.radius, b.dmg, 'bomb', fighters);
  }

  function aoe(owner, p, radius, dmg, kind, fighters) {
    for (const f of fighters) {
      if (f === owner) continue;
      const dx = f.pos.x - p.x, dy = f.pos.y + 0.55 - p.y, dz = f.pos.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius + 0.3) continue;
      const fall = 1 - 0.45 * Math.min(1, Math.max(0, d - 0.3) / radius);
      _d.set(dx, 0, dz);
      if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1);
      _d.normalize();
      onHit({ target: f, attacker: owner, dmg: Math.round(dmg * fall), kind, pos: _c.set(f.pos.x, f.pos.y + 0.6, f.pos.z), dir: _d });
    }
  }

  // ------------------------------------------------------------- pods
  const podGeo = new THREE.IcosahedronGeometry(0.13, 1);
  const podEyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const podRingGeo = new THREE.TorusGeometry(0.2, 0.014, 5, 20);
  geos.push(podGeo, podEyeGeo, podRingGeo);
  const POD = [];
  for (let i = 0; i < 6; i++) {
    const shellM = new THREE.MeshToonMaterial({ color: 0x2a2d38 });
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    mats.push(shellM, eyeM, ringM);
    const mesh = new THREE.Mesh(podGeo, shellM);
    mesh.castShadow = true;
    const eye = new THREE.Mesh(podEyeGeo, eyeM); eye.position.z = 0.1;
    const ring = new THREE.Mesh(podRingGeo, ringM); ring.rotation.x = Math.PI / 2;
    mesh.add(eye, ring);
    mesh.visible = false;
    group.add(mesh);
    POD.push({ active: false, mesh, eye, ring, eyeM, ringM, pos: new THREE.Vector3(), dir: new THREE.Vector3(), prev: new THREE.Vector3(),
      owner: null, target: null, age: 0, life: 6, speed: 3, dmg: 70, turn: 1.6, color: new THREE.Color() });
  }
  let podNext = 0;

  function firePod(owner, origin, target, o) {
    const p = POD[podNext]; podNext = (podNext + 1) % POD.length;
    if (p.active) killPod(p, true);
    p.active = true; p.owner = owner; p.target = target; p.age = 0;
    p.life = o.life; p.speed = o.speed; p.dmg = o.dmg; p.turn = o.turn;
    p.color.copy(o.color);
    p.pos.copy(origin); p.prev.copy(origin);
    p.dir.set(target.pos.x - origin.x, 0, target.pos.z - origin.z).normalize();
    p.eyeM.color.copy(o.color).multiplyScalar(3);
    p.ringM.color.copy(o.color).multiplyScalar(1.5);
    p.mesh.visible = true;
    p.mesh.position.copy(origin);
    return p;
  }
  function killPod(p, silent = false, fighters = null) {
    p.active = false; p.mesh.visible = false;
    if (!silent) {
      fx.explosion(p.pos, 0.7, p.color);
      audio.sfx('explode', { volume: 0.6, pitch: 1.3 });
      if (fighters) aoe(p.owner, p.pos, 1.15, p.dmg, 'pod', fighters);
    }
  }

  // ------------------------------------------------------------- update
  let time = 0;
  function update(dt, fighters) {
    time += dt;
    // bullets
    for (const b of BUL) {
      if (!b.active) continue;
      b.age += dt;
      if (b.age > b.life) { killBullet(b); fx.flash(b.pos, b.color, 0.08, 0.1); continue; }
      // gentle homing during the first part of the flight
      if (b.target && b.homing > 0 && b.age < 0.55 && !b.target.invuln) {
        _a.set(b.target.pos.x - b.pos.x, b.target.pos.y + 0.55 - b.pos.y, b.target.pos.z - b.pos.z);
        const dist = _a.length();
        _b.copy(b.vel).normalize();
        if (dist > 0.4 && _a.dot(_b) > 0) {
          _a.divideScalar(dist);
          const maxTurn = b.homing * dt;
          const ang = Math.acos(Math.min(1, Math.max(-1, _a.dot(_b))));
          const t = ang > 1e-4 ? Math.min(1, maxTurn / ang) : 1;
          _b.lerp(_a, t).normalize();
          b.vel.copy(_b).multiplyScalar(b.speed);
        }
      }
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      // robots
      let hitF = null;
      for (const f of fighters) {
        if (f === b.owner || f.invuln || f.dead) continue;
        const r = 0.36;
        if (segDist2(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, f.pos.x, f.pos.y + 0.35, f.pos.z) < r * r ||
            segDist2(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, f.pos.x, f.pos.y + 0.8, f.pos.z) < r * r) { hitF = f; break; }
      }
      if (hitF) {
        _d.copy(b.vel).normalize();
        _c.copy(b.pos);
        killBullet(b);
        onHit({ target: hitF, attacker: b.owner, dmg: b.dmg, kind: 'gun', pos: _c, dir: _d });
        continue;
      }
      // pods can be shot down
      let podHit = false;
      for (const p of POD) {
        if (!p.active || p.owner === b.owner) continue;
        if (segDist2(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, p.pos.x, p.pos.y, p.pos.z) < 0.06) {
          killBullet(b); killPod(p, false, null); podHit = true; break;
        }
      }
      if (podHit) continue;
      const t = arena.segmentHit(b.prev, b.pos, hitOut);
      if (t >= 0) {
        _c.copy(b.prev).lerp(b.pos, t);
        killBullet(b);
        _d.copy(b.vel).normalize().negate();
        fx.hit(_c, b.color, _d);
        if (hitOut.kind === 'wall') arena.wallHit(_c);
        else if (hitOut.kind === 'cube') arena.cubeHit(hitOut.cube);
        continue;
      }
      orient(b.mesh, b.pos, b.vel);
      if (Math.random() < 0.6) fx.spark(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, b.color, 0.05, 0.16, 0, 0);
    }

    // bombs
    for (const b of BOMB) {
      if (!b.active) continue;
      b.age += dt;
      b.prev.copy(b.pos);
      b.vel.y -= BOMB_G * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.ring.rotation.x += dt * 9; b.ring.rotation.y += dt * 6;
      const pulse = 0.85 + 0.15 * Math.sin(time * 22);
      b.mark.scale.setScalar(b.radius / 0.85 * pulse);
      b.mark.rotation.y += dt * 2;
      b.am.opacity = Math.max(0, 1 - b.age / b.flight) * 0.9;
      if (Math.random() < 0.8) fx.spark(b.pos.x, b.pos.y, b.pos.z, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, b.color, 0.07, 0.3, 0, 1);
      // direct hit on a robot
      let direct = false;
      for (const f of fighters) {
        if (f === b.owner || f.invuln || f.dead) continue;
        if (segDist2(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, f.pos.x, f.pos.y + 0.55, f.pos.z) < 0.25) { direct = true; break; }
      }
      const t = direct ? 1 : arena.segmentHit(b.prev, b.pos, hitOut);
      if (t >= 0 || b.age > 3) {
        if (!direct && t >= 0) b.pos.copy(b.prev).lerp(b.pos, t);
        if (hitOut.kind === 'wall' && !direct) arena.wallHit(b.pos);
        explodeBomb(b, fighters);
      }
    }

    // pods
    for (const p of POD) {
      if (!p.active) continue;
      p.age += dt;
      const tgt = p.target;
      if (p.age > p.life) { killPod(p, false, fighters); continue; }
      if (tgt && !tgt.dead && p.age > 0.35) {
        _a.set(tgt.pos.x - p.pos.x, 0, tgt.pos.z - p.pos.z);
        const d = _a.length();
        if (d > 0.01) {
          _a.divideScalar(d);
          const cross = p.dir.x * _a.z - p.dir.z * _a.x;
          const dot = p.dir.x * _a.x + p.dir.z * _a.z;
          const ang = Math.atan2(cross, dot);
          const turn = Math.max(-p.turn * dt, Math.min(p.turn * dt, ang));
          const c = Math.cos(turn), s = Math.sin(turn);
          const nx = p.dir.x * c - p.dir.z * s, nz = p.dir.x * s + p.dir.z * c;
          p.dir.set(nx, 0, nz);
        }
      }
      p.prev.copy(p.pos);
      const hoverY = FLOOR_Y + 0.55 + Math.sin(p.age * 5) * 0.06;
      const speed = p.age < 0.35 ? p.speed * 0.6 : p.speed;
      p.pos.x += p.dir.x * speed * dt;
      p.pos.z += p.dir.z * speed * dt;
      p.pos.y += (hoverY - p.pos.y) * Math.min(1, dt * 4);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = Math.atan2(p.dir.x, p.dir.z);
      p.ring.rotation.z += dt * 8;
      const blink = Math.sin(p.age * (8 + p.age * 5)) > 0 ? 1 : 0.25;
      p.eyeM.color.copy(p.color).multiplyScalar(3 * blink);
      if (Math.random() < 0.5) fx.spark(p.pos.x, p.pos.y - 0.08, p.pos.z, 0, -0.6, 0, p.color, 0.05, 0.25, 0, 1);
      // proximity fuse
      let boom = false;
      for (const f of fighters) {
        if (f === p.owner || f.dead || f.invuln) continue;
        const dx = f.pos.x - p.pos.x, dy = f.pos.y + 0.5 - p.pos.y, dz = f.pos.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < 0.62 * 0.62) { boom = true; break; }
      }
      if (boom || arena.segmentHit(p.prev, p.pos, hitOut) >= 0) killPod(p, false, fighters);
    }
  }

  function forEachActiveBullet(fn) { for (const b of BUL) if (b.active) fn(b); }
  function activeBombs(fn) { for (const b of BOMB) if (b.active) fn(b); }
  function activePods(fn) { for (const p of POD) if (p.active) fn(p); }

  function clear() {
    for (const b of BUL) killBullet(b);
    for (const b of BOMB) { b.active = false; b.mesh.visible = b.mark.visible = b.arc.visible = false; }
    for (const p of POD) { p.active = false; p.mesh.visible = false; }
  }

  function dispose() {
    group.removeFromParent();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }

  return { fireBullet, fireBomb, firePod, update, clear, dispose, forEachActiveBullet, activeBombs, activePods };
}
