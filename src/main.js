// SEMESTA CITY — boot, state machine and main loop.
//   loading -> title -> (creator | continue) -> explore <-> dialog -> battle -> explore
import * as THREE from 'three';
import { createRenderer } from './core/renderer.js';
import { input } from './core/input.js';
import { audio } from './core/audio.js';
import { Collision } from './core/collision.js';
import { PlayerController } from './core/player.js';
import { settings, saveSettings, t, STR, newSave, loadGame, saveGame } from './core/state.js';
import { clamp } from './core/util.js';
import { NPCS, SPECIALISTS, SPIDER, pickQuiz } from './data/rialo.js';
import { createSpider } from './characters/spider.js';
import { PAT_HAND, TOSS_AT } from './characters/anims.js';
import { createNXR } from './characters/nxr.js';
import { createTitle, openPause, openCertificate, openSettings, openAboutRialo, openCredits, openHelp } from './ui/menu.js';
import { createLoading } from './ui/loading.js';
import { createTouchControls, onTouchActivated } from './ui/touch.js';
import { createDialog } from './ui/dialog.js';
import { createHUD } from './ui/hud.js';
import { buildCity, buildEnvScene } from './world/city.js';
import { createAvatar } from './characters/avatar.js';
import { createNPC } from './characters/npc.js';
import { preloadCharacterModels, hasModel, setCharacterCamera } from './characters/glbAvatar.js';
import { PRESETS, DEFAULT_APPEARANCE, sanitizeAppearance } from './characters/appearance.js';
import { openCreator } from './ui/creator.js';
import { startBattle } from './combat/battle.js';
import { createChain } from './systems/chain.js';
import { ensureGachaSave } from './systems/gacha.js';
import { openPlayground } from './ui/playground.js';
import { openGacha } from './ui/gacha.js';
import { ITEM_BY_ID } from './data/cosmetics.js';
import { computePerks, battleMods, equippedPerkSummary } from './systems/perks.js';
import { rialoMarkDataURL } from './gfx/rialoLogo.js';
import '/src/ui/creator.css';
import '/src/ui/hud.css';
import '/src/combat/battle.css';

const BADGES = [
  { id: 'pioneer', icon: '◆', name: NPCS.guide.badge.name },
  { id: 'builder', icon: '⌘', name: NPCS.engineer.badge.name },
  { id: 'agent', icon: '✦', name: NPCS.agentdev.badge.name },
  { id: 'rwa', icon: '▣', name: NPCS.rwa.badge.name },
  { id: 'explorer', icon: '★', name: { en: 'Rialo Explorer', id: 'Rialo Explorer' } },
  { id: 'champion', icon: '♛', name: { en: 'Holo Champion', id: 'Juara Holo' } },
];

const G = {
  state: 'loading',
  save: null,
  time: 0,
  clock: 23 * 60 + 41,
  npcs: {},
  fade: 0, fadeTarget: 0,
  camMode: 'player', // 'player' | 'rig'
  rig: { pos: new THREE.Vector3(), look: new THREE.Vector3(), tpos: new THREE.Vector3(), tlook: new THREE.Vector3(), speed: 3 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// per-frame hooks: fn(dt) runs after characters update each frame until it returns true (props that ride a hand)
const frameHooks = new Set();
const onFrame = (fn) => new Promise((res) => { const h = (dt) => { if (fn(dt)) { frameHooks.delete(h); res(); } }; frameHooks.add(h); });
const tick = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });

// ------------------------------------------------------------------ boot
const canvas = document.getElementById('game');
const R = createRenderer(canvas);
const { scene, camera, renderer } = R;
input.attach(canvas);
R.setQuality(settings.quality);
audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });

async function boot() {
  const load = createLoading();
  // overall bar = 60% boot stages + 40% character model download (by bytes); models start fetching right away
  let stageP = 0, modelP = 0;
  const upd = () => load.progress(0.6 * stageP + 0.4 * modelP);
  const stage = (label, p) => { stageP = p; load.stage(label); upd(); };
  const modelsReady = preloadCharacterModels((f) => { modelP = f; upd(); });
  // onload (not img.decode(): decode never settles while the tab is in the background) + a hard cap
  const imagesReady = Promise.all(['/brand/semesta-logo.png', '/brand/rialohub-banner.png', '/brand/nxr.png'].map((src) => new Promise((res) => {
    const im = new Image(); im.onload = im.onerror = res; im.src = src; setTimeout(res, 8000);
  })));
  stage(t({ en: 'Loading fonts…', id: 'Memuat font…' }), 0.05);
  try { await Promise.race([document.fonts.ready, sleep(3000)]); } catch { /* ignore */ }
  await tick();

  // lights: moonlight (only shadow caster) + sky/ground fill
  const hemi = new THREE.HemisphereLight(0x5a6ab0, 0x141428, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb2ff, 0.6);
  moon.position.set(-18, 30, 12);
  moon.castShadow = true;
  moon.shadow.mapSize.set(R.shadowSize, R.shadowSize);
  const sc = moon.shadow.camera;
  sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 80;
  moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.03;
  scene.add(moon, moon.target);
  G.moon = moon;

  stage(t({ en: 'Building Semesta City…', id: 'Membangun Semesta City…' }), 0.15);
  await tick();
  G.collision = new Collision();
  G.city = buildCity(scene, { collision: G.collision, renderer, quality: settings.quality });

  stage(t({ en: 'Lighting the neon…', id: 'Menyalakan neon…' }), 0.45);
  await tick();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envScene = null;
  try { envScene = buildEnvScene(); } catch (e) { console.warn('env scene failed', e); }
  if (!envScene) {
    envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x1d2a4f);
    const cols = [0x5ee7ff, 0xff5fa2, 0xffcf4a, 0xffe0b0];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: cols[i % 4], side: THREE.DoubleSide }));
      const a = (i / 24) * Math.PI * 2;
      m.position.set(Math.cos(a) * 20, 2 + (i % 3) * 3, Math.sin(a) * 20);
      m.lookAt(0, 3, 0);
      envScene.add(m);
    }
  }
  const env = pmrem.fromScene(envScene, 0.035).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  stage(t({ en: 'Waking up the residents…', id: 'Membangunkan warga…' }), 0.6);
  await tick();
  const saved = loadGame();
  const app = sanitizeAppearance(saved ? saved.appearance : { ...DEFAULT_APPEARANCE, ...(PRESETS.hero || {}) });
  G.avatar = createAvatar(app);
  scene.add(G.avatar.root);
  G.player = new PlayerController({ avatar: G.avatar, collision: G.collision, camera, roofs: G.city.roofs || [], groundAt: G.city.heightAt ? (x, z) => G.city.heightAt(x, z) : null });
  G.player.onJump = () => audio.sfx('jump', { volume: 0.5 });
  G.player.onLand = (v) => audio.sfx('land', { volume: clamp(v / 8, 0.2, 1) });
  G.avatar.onFootstep = () => { if (G.state === 'explore') audio.sfx('step', { volume: G.player.speed > 3.5 ? 0.9 : 0.55 }); };
  const sp = G.city.spawn;
  G.player.place(sp.x, sp.z, sp.rotY);

  if (modelP < 1) stage(t({ en: 'Downloading characters…', id: 'Mengunduh karakter…' }), 0.6);
  await Promise.all([modelsReady, imagesReady]);
  setCharacterCamera(camera);
  for (const [id, def] of Object.entries(NPCS)) {
    const spot = G.city.npcSpots?.[id];
    if (!spot) continue;
    const groundAt = G.city.heightAt ? (x, z) => G.city.heightAt(x, z) : null;
    const model = id === 'nxr' ? 'nxr' : def.preset;          // Blender GLBs in public/models (procedural fallback)
    const procNXR = id === 'nxr' && !hasModel('nxr');
    const npc = procNXR
      ? createNXR({ id, name: def.name, x: spot.x, z: spot.z, rotY: spot.rotY ?? 0, groundAt })
      : createNPC({ id, name: def.name, appearance: PRESETS[def.preset] || PRESETS.hero, model, x: spot.x, z: spot.z, rotY: spot.rotY ?? 0, idle: def.idle, roofs: G.city.roofs || [] });
    if (!procNXR && G.city.heightAt) npc.root.position.y = G.city.heightAt(spot.x, spot.z);
    scene.add(npc.root);
    G.npcs[id] = npc;
  }
  // Spider the black cat roams the pet path
  if (G.city.petPath && G.city.petPath.length > 2) {
    G.spider = createSpider({ path: G.city.petPath, home: G.city.petHome, groundAt: G.city.heightAt ? (x, z) => G.city.heightAt(x, z) : null, collision: G.collision });
    G.spider.onSound = (name) => {
      if (!G.player) return;
      const d = G.spider.position.distanceTo(G.player.pos);
      if (d < 9) audio.sfx(name, { volume: Math.max(0.15, 1 - d / 9) });
    };
    scene.add(G.spider.root);
  }
  // footstep-free NPCs collide as circles so the player can't walk through them
  for (const n of Object.values(G.npcs)) n._col = G.collision.addCircle(n.root.position.x, n.root.position.z, 0.3, { tag: 'npc' });

  G.city.onEvent = (name) => { if (name === 'konbini-door') audio.sfx('door', { volume: 0.7 }); };
  const door = (G.city.interactables || []).find((i) => i.id === 'hq-door');
  if (door) G.city.hqSpot = { x: door.x, z: door.z };
  onTouchActivated((tc) => { G.touch = tc; if (G.hud) G.hud.onPrompt = (label) => tc.setAction(label); });
  G.touch = createTouchControls();         // before the HUD: it reads body.touch for its layout
  G.dialog = createDialog();
  G.hud = createHUD();
  G.hud.show(false);
  G.hud.setMap(G.collision, G.city.bounds);

  if (G.touch) G.hud.onPrompt = (label) => G.touch.setAction(label);
  G.hud.onMenu = menuAction;
  G.hud.onSound = toggleSound;
  G.hud.setSound(!G.muted);

  stage(t({ en: 'Warming up shaders…', id: 'Memanaskan shader…' }), 0.85);
  await tick();
  setTitleCamera(true);
  try { renderer.compile(scene, camera); } catch { /* ignore */ }
  // upload every texture now so the first seconds of play don't hitch
  scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k of ['map', 'emissiveMap', 'normalMap', 'alphaMap']) if (m[k]?.isTexture) { try { renderer.initTexture(m[k]); } catch { /* ignore */ } }
  });
  R.render(0);
  stage(t({ en: 'Ready', id: 'Siap' }), 1);
  enterTitle();
  requestAnimationFrame(loop);
  await load.done();
}

// ------------------------------------------------------------------ camera rig
/**
 * Camera rig. Two modes: an eased tween (cinematic cuts into/out of dialogue) and an
 * exponential follow (title drift). A tween always starts from where the camera IS right
 * now — never from a stale rig position — so there is no jump.
 */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function currentLook(out) {
  if (G.camMode === 'player' && G.player) return out.copy(G.player.lookSm || G.player.camLook);
  if (G.camMode === 'rig') return out.copy(G.rig.look);
  return camera.getWorldDirection(out).multiplyScalar(4).add(camera.position);
}
function setRig(pos, look, snap = false, speed = 3, tween = 0) {
  if (!snap) {
    // seed from the live camera so the move starts exactly where we are
    const fromLook = currentLook(new THREE.Vector3());
    G.rig.pos.copy(camera.position);
    G.rig.look.copy(fromLook);
  }
  G.camMode = 'rig';
  G.rig.tpos.copy(pos); G.rig.tlook.copy(look); G.rig.speed = speed;
  G.rig.tween = !snap && tween > 0 ? { t: 0, dur: tween, p0: G.rig.pos.clone(), l0: G.rig.look.clone() } : null;
  if (snap) { G.rig.pos.copy(pos); G.rig.look.copy(look); }
}
function updateRig(dt) {
  const tw = G.rig.tween;
  if (tw) {
    tw.t = Math.min(tw.dur, tw.t + dt);
    const k = easeInOut(tw.t / tw.dur);
    G.rig.pos.lerpVectors(tw.p0, G.rig.tpos, k);
    G.rig.look.lerpVectors(tw.l0, G.rig.tlook, k);
    if (tw.t >= tw.dur) G.rig.tween = null;
  } else {
    const k = 1 - Math.exp(-G.rig.speed * dt);
    G.rig.pos.lerp(G.rig.tpos, k);
    G.rig.look.lerp(G.rig.tlook, k);
  }
  camera.position.copy(G.rig.pos);
  camera.lookAt(G.rig.look);
}
function setTitleCamera(snap) {
  const p = G.player.pos, f = G.player.facing;
  const fx = Math.sin(f), fz = Math.cos(f);
  setRig(new THREE.Vector3(p.x - fx * 3.0 + fz * 0.8, 1.3, p.z - fz * 3.0 - fx * 0.8),
    new THREE.Vector3(p.x + fx * 12, 2.3, p.z + fz * 12), snap, 1.2);
}

// ------------------------------------------------------------------ states
function enterTitle() {
  G.state = 'title';
  G.hud.show(false);
  G.player.enabled = false;
  input.exitLock();
  const sp = G.city.spawn;
  G.player.place(sp.x, sp.z, sp.rotY);
  setTitleCamera(true);
  audio.setRain(0.8);
  G.title = createTitle({
    onNew: () => startCreator(),
    onContinue: () => { const s = loadGame(); if (s) { G.title.dispose(); G.title = null; beginExplore(s, true); } },
    onSettingsChange,
  });
}

function onSettingsChange(key) {
  if (key === 'quality') R.setQuality(settings.quality);
  if (key === 'lang') { G.hud.renderKeys(); refreshObjectives(); }
}

function startCreator() {
  G.title.dispose(); G.title = null;
  G.state = 'creator';
  const initial = sanitizeAppearance({ ...DEFAULT_APPEARANCE, ...(PRESETS.hero || {}), name: 'Player' });
  audio.setMusic('menu');
  G.creator = openCreator({
    renderer,
    initial,
    onConfirm: (app) => {
      audio.sfx('confirm');
      const clean = sanitizeAppearance(app);
      fadeThen(() => {
        G.creator.dispose(); G.creator = null;
        G.avatar.setAppearance(clean);
        const s = newSave(clean);
        saveGame(s);
        beginExplore(s, false);
      });
    },
    onBack: () => {
      G.creator.dispose(); G.creator = null;
      enterTitle();
    },
  });
}

function beginExplore(save, resume) {
  G.save = save;
  ensureGachaSave(save);
  G.chain = createChain(save, { onChange: () => { if (G.save === save) { saveGame(save); updateWallet(); } } });
  G.perks = computePerks(save.equipped);
  // gear perk: bonus $RIALO on every confirmed faucet claim
  const bonusDone = new Set();
  G.chain.on('tx', (tx) => {
    if (tx.kind !== 'faucet' || tx.status !== 'confirmed' || bonusDone.has(tx.sig)) return;
    bonusDone.add(tx.sig);
    const bonus = G.perks.faucet;
    if (bonus > 0) G.chain.reward(bonus, 'gear bonus · faucet', { points: 0 }).then(() => G.hud.toast(`<b>+${bonus} $RIALO</b> · ${t({ en: 'gear faucet bonus', id: 'bonus faucet dari gear' })}`, 'info')).catch(() => {});
  });
  G.avatar.setAppearance(sanitizeAppearance(withEquipped(save.appearance)));
  updateWallet();
  if (resume && save.pos) G.player.place(save.pos.x, save.pos.z, save.pos.rotY || 0);
  else { const sp = G.city.spawn; G.player.place(sp.x, sp.z, sp.rotY); }
  G.state = 'explore';
  G.camMode = 'player';
  G.player.enabled = true;
  G.player.snapCamera();
  G.hud.show(true);
  refreshObjectives();
  audio.setMusic('explore');
  audio.setRain(1);
  G.hud.toast(`<b>SEMESTA CITY</b> · ${t({ en: `Welcome, ${save.appearance.name}! Head to Rialo HQ.`, id: `Selamat datang, ${save.appearance.name}! Pergi ke Rialo HQ.` })}`, 'info');
  G.hud.lockHint(true);
}

// ------------------------------------------------------------------ wallet / gacha
let markUrl = null;
function updateWallet() {
  if (!G.chain) { G.hud.setWallet(null); return; }
  G.hud.setWallet(G.chain.wallet.balance, (markUrl ||= rialoMarkDataURL(64, { margin: 0.08 })));
}

/** merge equipped gacha items into an appearance (never mutates the saved base) */
function withEquipped(app) {
  const eq = (G.save && G.save.equipped) || {};
  const out = { ...app };
  const hw = ITEM_BY_ID[eq.headwear], au = ITEM_BY_ID[eq.aura], um = ITEM_BY_ID[eq.umbrella];
  out.headwear = hw ? hw.value : 'none';
  out.aura = au ? au.value : 'none';
  if (um) { out.umbrellaStyle = um.value; if (um.color) out.umbrellaColor = um.color; } else out.umbrellaStyle = 'clear';
  return out;
}
function playerTitle() {
  const it = G.save && ITEM_BY_ID[(G.save.equipped || {}).title];
  return it ? it.value : '';
}

function openUI() {
  G.state = 'ui';
  G.player.enabled = false;
  input.exitLock();
  input.enabled = false;
  G.hud.prompt(null);
}
function closeUI() {
  if (G.state !== 'ui') return;
  G.overlay = null;
  input.enabled = true;
  G.state = 'explore';
  G.player.enabled = true;
  G.hud.lockHint(!input.locked);
  updateWallet();
}

const APP_HINT = {
  gacha: { en: 'The Rialo Gacha machine is marked on your minimap — go spin it!', id: 'Mesin Rialo Gacha ditandai di minimap — ayo spin!' },
  battle: { en: 'Dikzzy waits at the Robo-dori holo-table.', id: 'Dikzzy menunggu di holo-table Robo-dori.' },
  academy: { en: 'Eric Argent teaches Rialo in front of Rialo HQ.', id: 'Eric Argent mengajar Rialo di depan Rialo HQ.' },
};
function openWallet(view = 'account') {
  if (!G.chain) return;
  openUI();
  audio.sfx('confirm');
  G.overlay = openPlayground({
    chain: G.chain, lang: settings.lang, initialView: view,
    onClose: () => closeUI(),
    onOpenApp: (id) => { closeUI(); if (id === 'gacha') G.goal = 'gacha'; if (APP_HINT[id]) G.hud.toast(t(APP_HINT[id]), 'info'); },
  });
}
function openGachaUI() {
  if (!G.chain) return;
  openUI();
  audio.sfx('crank');
  G.crankSpin = 1.2;
  G.overlay = openGacha({
    chain: G.chain, save: G.save, lang: settings.lang,
    onEquip: () => {
      G.avatar.setAppearance(sanitizeAppearance(withEquipped(G.save.appearance)));
      G.perks = computePerks(G.save.equipped);
      saveGame(G.save);
      refreshObjectives();
    },
    onClose: () => { closeUI(); refreshObjectives(); if (G.goal === 'gacha') G.goal = null; },
    onNeedFunds: () => openWallet('account'),
  });
}

function persist(toast = false) {
  if (!G.save) return;
  G.save.pos = { x: G.player.pos.x, z: G.player.pos.z, rotY: G.player.facing };
  saveGame(G.save);
  if (toast) G.hud.toast(`✓ ${t(STR.saved)}`, 'info');
}

function refreshObjectives() {
  if (!G.save) return;
  const s = G.save;
  const spec = SPECIALISTS.filter((id) => s.badges.includes(NPCS[id].badge.id)).length;
  G.hud.setObjectives([
    { text: t(STR.q1), done: s.badges.includes('pioneer') || !!s.heard.guide },
    { text: `${t(STR.q2)} (${spec}/3)`, done: spec === 3 },
    { text: t(STR.q3), done: s.badges.includes('explorer') },
    { text: t(STR.q4), done: s.wins > 0 },
    { text: t(STR.q5), done: !!(s.gacha && s.gacha.pulls > 0) },
  ], BADGES.map((b) => ({ icon: b.icon, name: t(b.name), got: s.badges.includes(b.id) })),
  equippedPerkSummary(s.equipped, settings.lang));
}

function award(id) {
  if (G.save.badges.includes(id)) return;
  G.save.badges.push(id);
  const b = BADGES.find((x) => x.id === id);
  audio.sfx('badge');
  G.hud.toast(`<span style="font-size:20px">${b.icon}</span><span>${t(STR.badgeGot)}: <b>${t(b.name)}</b></span>`);
  G.player.emote = 'cheer';
  if (G.chain) {
    const base = id === 'champion' ? 2 : id === 'explorer' ? 3 : 1;
    const amt = Math.round(base * (1 + (G.perks ? G.perks.reward : 0)) * 100) / 100;
    G.chain.reward(amt, `badge · ${t(b.name)}`).then(() => G.hud.toast(`<b>+${amt} $RIALO</b> · ${t({ en: 'reward sent to your wallet', id: 'hadiah masuk ke dompetmu' })}`, 'info')).catch(() => {});
  }
  refreshObjectives();
  persist();
}

function fadeThen(fn, hold = 350) {
  const f = document.getElementById('fader') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fader' });
  f.classList.add('on');
  setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), hold); }, 520);
}

// ------------------------------------------------------------------ interaction
function nearestInteraction() {
  const p = G.player.pos;
  let best = null, bd = 1e9;
  for (const [id, npc] of Object.entries(G.npcs)) {
    const d = Math.hypot(npc.root.position.x - p.x, npc.root.position.z - p.z);
    if (d < 2.3 && d < bd) { bd = d; best = { kind: 'npc', id, label: `${t(STR.talk)} ${NPCS[id].name}` }; }
  }
  if (G.spider) {
    const sp = G.spider.position;
    const d = Math.hypot(sp.x - p.x, sp.z - p.z);
    if (d < 1.9 && d < bd) { bd = d; best = { kind: 'spider', id: 'spider', label: t(SPIDER.prompt) }; }
  }
  for (const it of G.city.interactables || []) {
    const d = Math.hypot(it.x - p.x, it.z - p.z);
    if (d < (it.radius || 1.6) && d < bd) { bd = d; best = { kind: 'item', id: it.id, label: it.label }; }
  }
  return best;
}

function speakerOf(id) {
  const d = NPCS[id];
  return { name: d.name, role: t(d.role), color: d.color };
}

/** Two-shot for dialogue. Searches camera spots around the pair (both sides, several angles/distances, a high
 *  fallback) and keeps the first one that is not inside a wall AND whose view of the NPC's face is not covered
 *  by the player's (big chibi) head + hair. */
const _seg = new THREE.Vector3(), _sp = new THREE.Vector3();
// name tags hide behind solid walls only (counters, glass and low props collide but don't block sight)
const OCCLUDERS = new Set(['konbini', 'backshelf', 'apt', 'arcade-end', 'bldg', 'cafe', 'house', 'hq', 'shop', 'shops', 'shrine', 'bound']);
let occBoxes = null;
function tagBlocked(p) {
  if (!occBoxes) occBoxes = G.collision.boxes.filter((b) => OCCLUDERS.has(b.tag) || (!b.tag && b.maxY >= 10));
  return G.collision.segmentBlocked(camera.position, p, occBoxes);
}
function distToSegment(p, a, b) {
  _seg.subVectors(b, a); const L2 = _seg.lengthSq() || 1;
  const t = THREE.MathUtils.clamp(_sp.subVectors(p, a).dot(_seg) / L2, 0, 1);
  return _sp.copy(a).addScaledVector(_seg, t).distanceTo(p);
}
function dialogCamera(npc, { snap = false } = {}) {
  const a = G.player.pos, b = npc.root.position;
  let dx = b.x - a.x, dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const npcHead = (npc.avatar && npc.avatar.headWorldPos) ? npc.avatar.headWorldPos(new THREE.Vector3()) : new THREE.Vector3(b.x, b.y + 1.1, b.z);
  const pHead = G.avatar.headWorldPos(new THREE.Vector3());
  const eyeY = (npcHead.y + pHead.y) / 2;
  const fx = a.x + (b.x - a.x) * 0.58, fz = a.z + (b.z - a.z) * 0.58;   // focus, biased to the NPC
  const focus = new THREE.Vector3(fx, eyeY - 0.1, fz);
  const wallFree = (c) => {
    for (let i = 1; i <= 10; i++) {
      const k = i / 10;
      if (G.collision.pointBlocked(fx + (c.x - fx) * k, fz + (c.z - fz) * k, eyeY + (c.y - eyeY) * k)) return false;
    }
    return true;
  };
  const HEAD_CLEAR = 0.42;            // head + hair radius of the player's chibi avatar
  const tries = [];
  // angle from the "behind the player" axis: 60deg = over the shoulder but well out to the side, 105deg = side-on
  for (const dist of [2.4, 2.9, 1.8]) for (const ang of [62, 78, 95, 110]) for (const side of [1, -1]) tries.push({ dist, ang, side, up: 0.08 });
  for (const side of [1, -1]) tries.push({ dist: 2.2, ang: 40, side, up: 0.85 });   // high fallback looking down past the head
  let pos = null;
  for (const c of tries) {
    const r = c.ang * Math.PI / 180;
    const bx = -dx * Math.cos(r) + (-dz * c.side) * Math.sin(r), bz = -dz * Math.cos(r) + (dx * c.side) * Math.sin(r);
    const cam = new THREE.Vector3(fx + bx * c.dist, eyeY + c.up, fz + bz * c.dist);
    if (!wallFree(cam)) continue;
    if (distToSegment(pHead, cam, npcHead) < HEAD_CLEAR) continue;
    pos = cam; break;
  }
  if (!pos) pos = new THREE.Vector3(fx - dx * 2.0, eyeY + 1.0, fz - dz * 2.0);
  G.player.noUmbrella = true; // umbrella canopy would cover the two-shot
  setRig(pos, focus, snap, 4, 0.9);
}

async function talk(id) {
  const npc = G.npcs[id], def = NPCS[id];
  G.state = 'dialog';
  G.player.enabled = false;
  G.hud.prompt(null);
  input.exitLock();
  npc.faceTowards(G.player.pos);
  const dx = npc.root.position.x - G.player.pos.x, dz = npc.root.position.z - G.player.pos.z;
  G.player.facing = Math.atan2(dx, dz);
  G.player.lookAt = npc.avatar.headWorldPos(new THREE.Vector3());
  dialogCamera(npc);
  const sp = speakerOf(id);
  const name = G.save.appearance.name;
  const heard = (G.save.heard[id] ||= []);
  const say = async (line) => { npc.setTalking(true); await G.dialog.say(sp, t(line, { name })); npc.setTalking(false); };
  let action = null;

  npc.emote('wave');
  for (const line of def.greet) await say(line);

  for (;;) {
    const opts = def.topics.map((tp) => ({ label: t(tp.label), note: heard.includes(tp.id) ? '✓' : '', tp }));
    if (id === 'guide') opts.push({ label: `★ ${t(STR.quizOffer)}`, quiz: true, note: G.save.badges.includes('explorer') ? '✓' : '' });
    opts.push({ label: t(STR.allTopics), bye: true });
    const i = await G.dialog.choose(sp, null, opts);
    const o = opts[i];
    if (!o || o.bye) break;
    if (o.quiz) { await runQuiz(npc, sp); continue; }
    for (const line of o.tp.lines) await say(line);
    if (!heard.includes(o.tp.id)) heard.push(o.tp.id);
    if (o.tp.action === 'battle') { action = 'battle'; break; }
    if (def.badge && def.topics.every((tp) => heard.includes(tp.id))) award(def.badge.id);
    if (id === 'guide') refreshObjectives();
  }
  G.dialog.close();
  npc.setTalking(false);
  G.player.lookAt = null;
  persist();
  refreshObjectives();
  if (action === 'battle') { beginBattle(); return; }
  endDialog();
}

function endDialog() {
  G.player.noUmbrella = false;
  G.state = 'explore';
  G.player.enabled = true;
  // glide back behind the player from wherever the dialogue camera is
  if (G.camMode === 'rig') {
    G.player.yaw = Math.atan2(camera.position.x - G.player.pos.x, camera.position.z - G.player.pos.z);
    G.player.blendFrom(camera.position, G.rig.look, 0.8);
  }
  G.camMode = 'player';
  G.hud.lockHint(!input.locked);
}

async function runQuiz(npc, sp) {
  const n = SPECIALISTS.filter((id) => G.save.badges.includes(NPCS[id].badge.id)).length;
  if (n < 3) { npc.setTalking(true); await G.dialog.say(sp, t(STR.quizLocked, { n })); npc.setTalking(false); return; }
  const go = await G.dialog.choose(sp, t(STR.quizIntro), [{ label: t(STR.ready) }, { label: t(STR.notYet) }]);
  if (go !== 0) return;
  const qs = pickQuiz(5);
  let score = 0;
  for (let k = 0; k < qs.length; k++) {
    const q = qs[k];
    G.dialog.setHeader(`${t(STR.question)} ${k + 1}/5`);
    const i = await G.dialog.choose(sp, t(q.q), q.a.map((a) => ({ label: t(a) })));
    if (i < 0) { G.dialog.setHeader(null); return; }
    const ok = i === q.c;
    if (ok) score++;
    G.dialog.flash(i, ok ? 'right' : 'wrong');
    if (!ok) G.dialog.flash(q.c, 'right');
    audio.sfx(ok ? 'chime' : 'cancel');
    await sleep(900);
  }
  G.dialog.setHeader(null);
  G.save.quizBest = Math.max(G.save.quizBest || 0, score);
  npc.setTalking(true);
  if (score >= 4) {
    npc.emote('cheer');
    await G.dialog.say(sp, t(STR.quizPass, { s: score }));
    award('explorer');
    if (!G.save.badges.includes('pioneer')) award('pioneer');
    openCertificate({ name: G.save.appearance.name, score });
  } else {
    await G.dialog.say(sp, t(STR.quizFail, { s: score }));
  }
  npc.setTalking(false);
}

/** walk the player (eased, timer-driven so it never stalls in a background tab) to a spot that puts the cat at
 *  player-local (side, ahead) — e.g. right under the patting hand — and face along the approach direction */
function approachCat(cat, ahead = 0.5, side = 0, dur = 0.5) {
  return new Promise((res) => {
    const a = G.player.pos.clone(), c = cat.position;
    const f = Math.atan2(c.x - a.x, c.z - a.z);
    const fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f);   // forward, player-local +x
    const to = new THREE.Vector3(c.x - fx * ahead - lx * side, a.y, c.z - fz * ahead - lz * side);
    const t0 = performance.now();
    const iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
      const e = k * k * (3 - 2 * k);
      G.player.pos.x = a.x + (to.x - a.x) * e; G.player.pos.z = a.z + (to.z - a.z) * e;
      G.player.facing = f;
      if (k >= 1) { clearInterval(iv); res(); }
    }, 16);
  });
}
/** close-up of player + cat from the front-right (the patting hand's side), a little high so the twin tails
 *  and the big chibi head don't cover the hands (low: she bends over the cat, so a high camera only sees her crown); the side is chosen once per visit (wall-free) so it doesn't flip */
let catSide = 1;
function frameCat(cat, { tween = 0.85, pick = false, track = false, snap = false } = {}) {
  const c = cat.position, a = G.player.pos;
  let dx = c.x - a.x, dz = c.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const rx = -dz, rz = dx;                               // player's right-hand side
  const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
  const wide = 1 + Math.max(0, l - 0.8) * 0.6;           // pull back when Spider runs off to play
  const ang = 0.95, dist = 1.6 * wide;                   // ~55deg off the player's forward
  const at = (side) => new THREE.Vector3(
    mx + (dx * Math.cos(ang) + rx * side * Math.sin(ang)) * dist, 0.68 + (wide - 1) * 0.5,
    mz + (dz * Math.cos(ang) + rz * side * Math.sin(ang)) * dist);
  if (pick) {
    const free = (p) => { for (let i = 1; i <= 8; i++) { const k = i / 8; if (G.collision.pointBlocked(mx + (p.x - mx) * k, mz + (p.z - mz) * k, 0.6)) return false; } return true; };
    catSide = free(at(1)) ? 1 : free(at(-1)) ? -1 : 1;
  }
  const look = new THREE.Vector3(mx, 0.5, mz);
  if (snap) setRig(at(catSide), look, true);
  else if (track) setRig(at(catSide), look, false, 2.2, 0);
  else setRig(at(catSide), look, false, 4, tween);
}
// what the PLAYER does for each cat action (avatar crouch emotes in anims.js), where the cat must be relative
// to the player (ahead/side, player-local m) and how long to watch it
const CAT_ACT = {
  pet: { emote: 'pat', ms: 3300, ahead: PAT_HAND.z + 0.17, side: PAT_HAND.x },   // cat head (0.17 m ahead of its root) under the hand
  feed: { emote: 'feed', ahead: 0.55, side: 0 },   // bowl spot (0.24 in front of Spider) ~0.1 m past the lowered hands
  play: { emote: 'play', ahead: 0.7, side: 0 },
};
const emoteT = () => (G.avatar.anim.emote ? G.avatar.anim.emoteT : Infinity);
async function catAction(cat, kind) {
  const a = CAT_ACT[kind];
  if (!a) { cat.interact(kind); return; }
  G.dialog.close();                       // let the moment play without a text box over it
  await approachCat(cat, a.ahead, a.side, 0.35);
  frameCat(cat, { tween: 0.6 });
  G.player.lookAt = new THREE.Vector3(cat.position.x, 0.25, cat.position.z);
  G.avatar.playEmote(a.emote);
  G.avatar.anim.emoteSide = -1;           // right hand (PAT_HAND is measured for it)
  if (kind === 'pet') {
    cat.interact('pet');                  // Spider's head bobs in step with the hand (spider.js 'petted')
    audio.sfx('purr');
    await sleep(a.ms);
    return;
  }
  if (kind === 'feed') {
    // the bowl is in both hands while they lower it, then it's set down in front of Spider's face
    const hl = new THREE.Vector3(), hr = new THREE.Vector3(), at = new THREE.Vector3();
    await onFrame(() => {
      G.avatar.handWorldPos(1, hl); G.avatar.handWorldPos(-1, hr);
      at.addVectors(hl, hr).multiplyScalar(0.5); at.y -= 0.035;
      cat.carry('bowl', at);
      return emoteT() >= 1.2;
    });
    cat.interact('feed', { from: at });
    audio.sfx('purr');
    let et = 0;                           // stay for the whole meal so the bowl is gone before the next choice
    await onFrame((dt) => { et += dt; return (et > 1 && cat.state !== 'eat') || et > 6; });
    return;
  }
  // play: the yarn ball rides in the right hand, is tossed past Spider, he pounces on it twice and trots back
  const hand = new THREE.Vector3(), from = new THREE.Vector3(), pos = new THREE.Vector3();
  const c = cat.position, p = G.player.pos;
  let dx = c.x - p.x, dz = c.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const landAt = (sd) => new THREE.Vector3(c.x + dx * 0.6 - dz * 0.4 * sd, 0, c.z + dz * 0.6 + dx * 0.4 * sd);
  const clear = (q) => !G.collision.pointBlocked(q.x, q.z, 0.2) && !G.collision.pointBlocked((q.x + c.x) / 2, (q.z + c.z) / 2, 0.2);
  const land = [landAt(catSide), landAt(-catSide), landAt(0)].find(clear) || landAt(0);
  land.y = c.y;
  await onFrame(() => {
    G.avatar.handWorldPos(-1, hand);
    cat.carry('toy', pos.copy(hand).setY(hand.y - 0.03));
    return emoteT() >= TOSS_AT;
  });
  from.copy(pos);
  audio.sfx('blip');
  let ft = 0;
  await onFrame((dt) => {
    ft += dt;
    const k = Math.min(1, ft / 0.5);
    pos.lerpVectors(from, land, k);
    pos.y = from.y + (land.y - from.y) * k + Math.sin(Math.PI * k) * 0.42;
    cat.carry('toy', pos);
    return k >= 1;
  });
  cat.interact('play', { toyAt: land });
  audio.sfx('meow', { pitch: 1.1 });
  let wt = 0;
  await onFrame((dt) => {
    wt += dt;
    G.player.lookAt.set(cat.position.x, 0.25, cat.position.z);
    frameCat(cat, { track: true });
    return (wt > 1 && cat.state === 'sit') || wt > 11;
  });
}

async function petSpider() {
  const cat = G.spider;
  G.state = 'dialog';
  G.player.enabled = false;
  G.hud.prompt(null);
  input.exitLock();
  const c = cat.position;
  G.player.lookAt = new THREE.Vector3(c.x, 0.3, c.z);
  cat.hold(true);                         // stays sat with us until the chat ends
  G.player.noUmbrella = true;             // both hands free (the umbrella hand would block the pat)
  frameCat(cat, { pick: true, snap: true });   // cut, don't swing the camera through the player's head
  await approachCat(cat, CAT_ACT.pet.ahead, CAT_ACT.pet.side);
  const sp = { name: SPIDER.name, role: t(SPIDER.role), color: SPIDER.color };
  audio.sfx('meow');
  await catAction(cat, 'pet');
  await G.dialog.say(sp, t(SPIDER.intro[Math.floor(Math.random() * SPIDER.intro.length)]));
  for (;;) {
    const acts = SPIDER.actions.filter((x) => (x.id === 'follow' ? !cat.isFollowing : x.id === 'stay' ? cat.isFollowing : true));
    const opts = acts.map((x) => ({ label: t(x.label) }));
    opts.push({ label: t(STR.bye) });
    const i = await G.dialog.choose(sp, null, opts);
    const act = acts[i];
    if (!act) break;
    if (CAT_ACT[act.id]) await catAction(cat, act.id);
    else { cat.hold(false); cat.interact(act.id); audio.sfx('meow', { pitch: 1.1 }); }
    await G.dialog.say(sp, t(act.reply));
    if (act.id === 'follow' || act.id === 'stay') break;
  }
  cat.hold(false);
  G.dialog.close();
  G.player.lookAt = null;
  if (G.save) { G.save.catPets = (G.save.catPets || 0) + 1; persist(); }
  endDialog();
}

async function interactItem(id) {
  if (id === 'gacha') { openGachaUI(); return; }
  if (id === 'playground') { openWallet('account'); return; }
  const map = { 'hq-door': STR.hqDoor, vending: STR.vending, notice: STR.notice, atm: STR.atm };
  const text = map[id];
  if (!text) return;
  G.state = 'dialog';
  G.player.enabled = false;
  G.hud.prompt(null);
  input.exitLock();
  audio.sfx(id === 'vending' ? 'door' : 'blip');
  await G.dialog.say(null, t(text));
  G.dialog.close();
  endDialog();
}

// ------------------------------------------------------------------ battle
function beginBattle() {
  G.state = 'transition';
  audio.sfx('warp');
  fadeThen(() => {
    const ht = G.city.holoTable;
    const rival = G.npcs.rival;
    // pilots stand at the arena rim facing in
    const ry = ht.rotY || 0;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    G.player.place(ht.x - fx * 7.2, ht.z - fz * 7.2, ry);
    G.preBattleRival = { x: rival.root.position.x, z: rival.root.position.z, ry: rival.root.rotation.y };
    rival.root.position.set(ht.x + fx * 7.2, 0, ht.z + fz * 7.2);
    rival.root.rotation.y = ry + Math.PI;
    G.hud.show(false);
    G.city.setBattleMode && G.city.setBattleMode(true);
    G.state = 'battle';
    G.camMode = 'battle';
    input.requestLock();
    G.battle = startBattle({
      scene, camera, renderer, collision: G.collision, audio, input,
      center: { x: ht.x, y: G.city.heightAt ? G.city.heightAt(ht.x, ht.z) + 0.005 : 0, z: ht.z, rotY: ry },
      playerName: G.save.appearance.name, rivalName: NPCS.rival.name,
      playerRobot: 'ray', rivalRobot: 'fang', difficulty: 1 + Math.min(G.save.wins, 3) * 0.25,
      playerMods: battleMods(G.perks || computePerks(G.save.equipped)),
      onEnd: (result) => endBattle(result),
    });
    const gear = equippedPerkSummary(G.save.equipped, settings.lang)
      .filter((g) => g.lines.some((l) => /battle|robot|senjata|weapon|damage|regen|HP|perisai|shield/i.test(l)));
    if (gear.length) G.hud.toast(`<b>GEAR</b> · ${gear.map((g) => `${g.icon} ${g.lines.join(', ')}`).join(' · ')}`, 'info');
  });
}

function endBattle(result) {
  if (G.state !== 'battle') return;
  G.state = 'transition';
  fadeThen(async () => {
    G.battle.dispose(); G.battle = null;
    G.city.setBattleMode && G.city.setBattleMode(false);
    const r = G.preBattleRival, rival = G.npcs.rival;
    rival.root.position.set(r.x, 0, r.z); rival.root.rotation.y = r.ry;
    // stand in front of Raka
    const px = r.x + Math.sin(r.ry) * 1.7, pz = r.z + Math.cos(r.ry) * 1.7;
    G.player.place(px, pz, r.ry + Math.PI);
    G.collision.resolve(G.player.pos, 0.32);
    if (result === 'win') { G.save.wins++; } else { G.save.losses++; }
    audio.setMusic('explore');
    G.hud.show(true);
    G.state = 'dialog';
    G.player.enabled = false;
    input.exitLock();
    dialogCamera(rival, { snap: true });
    await sleep(500);
    rival.setTalking(true);
    rival.emote(result === 'win' ? 'think' : 'cheer');
    const lines = result === 'win' ? NPCS.rival.winLines : NPCS.rival.loseLines;
    for (const l of lines) await G.dialog.say(speakerOf('rival'), t(l, { name: G.save.appearance.name }));
    rival.setTalking(false);
    G.dialog.close();
    if (result === 'win') award('champion');
    persist();
    refreshObjectives();
    endDialog();
  });
}

// ------------------------------------------------------------------ HUD menu (☰)
/** open a modal from the in-game menu: the world pauses (player frozen) until it closes */
function withPause(open) {
  if (G.state !== 'explore') return;
  G.state = 'paused';
  G.player.enabled = false;
  input.exitLock();
  open(() => { if (G.state === 'paused') { G.state = 'explore'; G.player.enabled = true; } });
}
function menuAction(id) {
  if (G.state !== 'explore') return;
  audio.sfx('confirm');
  switch (id) {
    case 'wallet': openWallet('account'); break;
    case 'help': withPause((back) => openHelp({ onClose: back })); break;
    case 'settings': withPause((back) => openSettings({ onChange: onSettingsChange, onClose: back })); break;
    case 'about': withPause((back) => openAboutRialo({ onClose: back })); break;
    case 'credits': withPause((back) => openCredits({ onClose: back })); break;
    case 'save': persist(true); break;
    case 'quit': persist(); G.hud.show(false); G.save = null; fadeThen(() => enterTitle()); break;
  }
}
function toggleSound() {
  G.muted = !G.muted;
  audio.setVolumes({ master: G.muted ? 0 : settings.master, music: settings.music, sfx: settings.sfx });
  G.hud.setSound(!G.muted);
}

// ------------------------------------------------------------------ pause
function pause() {
  if (G.state !== 'explore') return;
  G.state = 'paused';
  G.player.enabled = false;
  input.exitLock();
  openPause({
    onResume: () => { G.state = 'explore'; G.player.enabled = true; G.hud.lockHint(true); },
    onSave: () => persist(true),
    onQuit: () => { persist(); G.hud.show(false); G.save = null; fadeThen(() => enterTitle()); },
    onSettingsChange,
  });
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.state === 'explore' && G.hud?.menuOpen) { G.hud.closeMenu(); return; }
  if (e.code === 'Escape' && G.state === 'explore' && !input.locked) pause();
  if (e.code === 'KeyP' && G.state === 'explore') { e.preventDefault(); openWallet('account'); }
  if (e.code === 'KeyH' && G.state === 'explore') { settings.showKeys = !settings.showKeys; saveSettings(); G.hud.renderKeys(); }
});
canvas.addEventListener('mousedown', () => {
  audio.unlock();
  if (G.state === 'explore' || G.state === 'battle') input.requestLock();
});
document.addEventListener('pointerlockchange', () => { if (G.hud && G.state === 'explore') G.hud.lockHint(!input.locked); });
addEventListener('beforeunload', () => { if (G.save && G.state !== 'title') persist(); });

// ------------------------------------------------------------------ loop
let last = performance.now();
const tagPos = new THREE.Vector3();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
}
function frame(dt) {
  G.time += dt;
  if (G.touch) G.touch.setMode(G.state === 'explore' ? 'explore' : G.state === 'battle' ? 'battle' : 'off');
  const time = G.time;

  // world
  if (G.player) {
    if (G.city.setPlayerPos) G.city.setPlayerPos(G.player.pos);
    G.city.update(dt, time, camera);
  }

  if (G.state === 'creator' && G.creator) {
    G.creator.update(dt, time);
    G.creator.render(time, (s, c) => R.renderScene(s, c, time));
    input.endFrame();
    return;
  }

  switch (G.state) {
    case 'title': {
      // slow handheld drift behind the hero
      G.avatar.update(dt, { speed: 0, grounded: true, vy: 0, raining: true });
      const p = G.player.pos, f = G.player.facing, fx = Math.sin(f), fz = Math.cos(f);
      const sway = Math.sin(time * 0.25) * 0.5;
      G.rig.tpos.set(p.x - fx * 3.0 + fz * (0.8 + sway), 1.27 + Math.sin(time * 0.31) * 0.07, p.z - fz * 3.0 - fx * (0.8 + sway));
      updateRig(dt);
      break;
    }
    case 'explore': {
      if (input.looking) {
        // apply sensitivity / invert settings to the raw deltas
        input.mouse.dx *= settings.sens;
        input.mouse.dy *= settings.sens * (settings.invertY ? -1 : 1);
      }
      const pk = G.perks;
      G.player.speedMul = pk ? 1 + pk.move + (G.player.underRoof() ? 0 : pk.rainMove) : 1;
      G.player.update(dt);
      const it = nearestInteraction();
      G.hud.prompt(it ? it.label : null);
      if (it && input.pressed('KeyE')) {
        if (it.kind === 'npc') talk(it.id); else if (it.kind === 'spider') petSpider(); else interactItem(it.id);
      }
      audio.setRain(G.player.underRoof() ? 0.45 : 1);
      break;
    }
    case 'dialog':
    case 'ui':
    case 'paused':
    case 'transition':
      G.player.update(dt);
      if (G.camMode === 'rig') updateRig(dt);
      break;
    case 'battle':
      G.avatar.update(dt, { speed: 0, grounded: true, vy: 0, raining: !G.player.underRoof() });
      if (G.battle) G.battle.update(dt, time);
      break;
  }

  for (const npc of Object.values(G.npcs)) npc.update(dt, time, G.player.pos);
  if (G.spider) G.spider.update(dt, time, G.player.pos);
  for (const h of [...frameHooks]) h(dt);

  // HUD extras
  if (G.state === 'explore' || G.state === 'dialog') {
    const tags = [];
    for (const [id, npc] of Object.entries(G.npcs)) {
      npc.avatar.headWorldPos(tagPos);
      tagPos.y += 0.42;
      const def = NPCS[id];
      const heard = G.save?.heard[id] || [];
      const bang = def.topics.some((tp) => !heard.includes(tp.id));
      tags.push({ id, name: def.name, sub: t(def.role), pos: tagPos.clone(), bang, occ: tagBlocked(tagPos) });
    }
    if (G.spider) {
      G.spider.headWorldPos(tagPos);
      tagPos.y += 0.32;
      tags.push({ id: 'spider', name: '🐾 Spider', sub: G.spider.isFollowing ? t({ en: 'following you', id: 'mengikutimu' }) : '', pos: tagPos.clone(), bang: false, occ: tagBlocked(tagPos) });
    }
    G.hud.updateTags(G.state === 'explore' ? tags : [], camera);
    const markers = Object.entries(G.npcs).map(([id, n]) => ({ x: n.root.position.x, z: n.root.position.z, color: NPCS[id].color, size: 1.6 }));
    if (G.city.hqSpot) markers.push({ x: G.city.hqSpot.x, z: G.city.hqSpot.z, color: '#e8e3d5', size: 0.1, label: 'RIALO HQ' });
    const gm = G.city.gachaMachine?.spot;
    if (gm) markers.push({ x: gm.x, z: gm.z, color: G.goal === 'gacha' ? '#ffcf4a' : '#ff5fa2', size: G.goal === 'gacha' ? 2.4 : 1.4, label: 'GACHA' });
    const pg = G.city.playground?.spot;
    if (pg) markers.push({ x: pg.x, z: pg.z, color: '#a8e0d6', size: 1.4, label: 'WALLET' });
    if (G.spider) markers.push({ x: G.spider.position.x, z: G.spider.position.z, color: '#c9e85a', size: 1.1 });
    G.hud.updateMap(G.player.pos, G.player.yaw, markers);
    G.clock += dt / 20;
    const hh = Math.floor(G.clock / 60) % 24, mm = Math.floor(G.clock % 60);
    G.hud.setClock(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, !G.player.underRoof());
    G.hud.setMeta(`${G.save?.appearance.name || ''}${playerTitle() ? ` · 「${playerTitle()}」` : ''}`);
  } else if (G.hud) G.hud.updateTags([], camera);

  // gacha crank spin + chain slot clock
  const gmc = G.city && G.city.gachaMachine;
  if (gmc && G.crankSpin > 0) { G.crankSpin -= dt; gmc.crank.rotation.z += dt * 7; }
  if (G.chain) G.chain.update(dt);

  // shadow camera follows the action
  if (G.moon && G.player) {
    const p = G.player.pos;
    G.moon.target.position.set(p.x, 0, p.z);
    G.moon.position.set(p.x - 18, 30, p.z + 12);
  }

  R.render(time);
  input.endFrame();
}

boot().catch((e) => {
  console.error(e);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;inset:20px;color:#f88;background:#000c;padding:20px;z-index:999;white-space:pre-wrap';
  d.textContent = `Semesta City failed to start:\n${e.stack || e}`;
  document.body.appendChild(d);
});

// debug handles (dev server only)
if (import.meta.env.DEV) {
  window.__semesta = G;
  window.__R = R;
  window.__step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); };
  window.__battle = () => beginBattle();
  import('./characters/anims.js').then((m) => { window.__PAT = m.PAT; window.__FEED = m.FEED; });
  import('./characters/avatar.js').then((m) => { window.__UMB = m.UMB; });
  // render frames and upload the canvas to .shots/<name>.png (see vite.config.js)
  window.__shot = async (name = 'shot', n = 2) => {
    window.__step(n);
    const url = canvas.toDataURL('image/png');
    await fetch(`/__shot?name=${name}`, { method: 'POST', body: url });
    return name;
  };
}
