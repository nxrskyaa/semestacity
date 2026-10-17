// Pets & mascot harness: NXR standing, Spider wandering a fake circular path on a dark wet floor
// under moonlight + rim lights (through the real post chain). WASD moves a fake player marker.
// Debug API on window.T (step/shot/view) so captures work even when the pane is throttled.
import * as THREE from 'three';
import { createRenderer } from '../src/core/renderer.js';
import { createNXR } from '../src/characters/nxr.js';
import { createSpider } from '../src/characters/spider.js';

const canvas = document.getElementById('c');
const R = createRenderer(canvas);
const { scene, camera } = R;

// ---- lights (≈ what the city gives characters)
scene.add(new THREE.HemisphereLight(0x6f86c8, 0x1a1f33, 0.85));
const moon = new THREE.DirectionalLight(0xbfd0ff, 1.5);
moon.position.set(-4, 9, 6);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 });
moon.shadow.bias = -0.0004;
scene.add(moon);
const rimC = new THREE.PointLight(0x5ee7ff, 14, 14, 1.6); rimC.position.set(-5, 2.6, -2.5); scene.add(rimC);
const rimM = new THREE.PointLight(0xff4fa8, 12, 14, 1.6); rimM.position.set(5, 2.4, -2.5); scene.add(rimM);
const warm = new THREE.PointLight(0xffc98a, 6, 10, 1.8); warm.position.set(0, 3.2, 4); scene.add(warm);

// ---- wet floor + path
const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x141c33, roughness: 0.18, metalness: 0.15 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(28, 28, 0x2b3c6b, 0x1d2950);
grid.position.y = 0.002;
scene.add(grid);

const path = [];
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const r = 3.2 + Math.sin(a * 3) * 0.35;
  path.push({ x: Math.sin(a) * r, z: Math.cos(a) * r });
}
const home = { x: 4.6, z: -1.2 };
{
  const g = new THREE.BufferGeometry().setFromPoints([...path, path[0]].map((p) => new THREE.Vector3(p.x, 0.01, p.z)));
  scene.add(new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x3b5aa8, dashSize: 0.15, gapSize: 0.1 })).computeLineDistances());
  const hm = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffc98a }));
  hm.rotation.x = -Math.PI / 2; hm.position.set(home.x, 0.01, home.z);
  scene.add(hm);
}
const groundAt = () => 0;

// ---- characters
const nxr = createNXR({ id: 'nxr', name: 'NXR', x: 0, z: 0, rotY: 0, groundAt });
scene.add(nxr.root);
const spider = createSpider({ path, home, groundAt, collision: null });
scene.add(spider.root);
const soundLog = [];
spider.onSound = (n, o) => { soundLog.unshift(`${n}${o && o.pitch ? ' x' + o.pitch.toFixed(2) : ''}`); soundLog.length = Math.min(soundLog.length, 5); };

// ---- player marker
const player = new THREE.Group();
const pm = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 4, 12), new THREE.MeshStandardMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.35, roughness: 0.4 }));
pm.position.y = 0.82;
player.add(pm);
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 12), new THREE.MeshBasicMaterial({ color: 0x5ee7ff }));
arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.05, 0.35);
player.add(arrow);
player.position.set(0, 0, 6);
player.rotation.y = Math.PI;
scene.add(player);
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));

// ---- UI
const bar = document.getElementById('bar');
const state = { talking: false, view: 'overview', paused: false };
function row(label) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<b>${label}</b>`; bar.appendChild(r); return r; }
function button(r, label, fn) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => fn(b); r.appendChild(b); return b; }
const rS = row('Spider');
for (const k of ['pet', 'feed', 'play', 'follow', 'stay']) button(rS, k, () => spider.interact(k));
const rN = row('NXR');
for (const k of ['wave', 'hop', 'nod', 'scan', 'dance']) button(rN, k, () => nxr.emote(k));
button(rN, 'talk', (b) => { state.talking = !state.talking; nxr.setTalking(state.talking); b.classList.toggle('on', state.talking); });
const rV = row('Camera');
for (const v of ['overview', 'nxr', 'nxrFace', 'spider', 'spiderFace', 'spiderSide', 'free']) button(rV, v, () => { state.view = v; });
button(rV, 'pause', (b) => { state.paused = !state.paused; b.classList.toggle('on', state.paused); });

// ---- camera views
let orbit = { yaw: 0.3, pitch: 0.35, dist: 6, target: new THREE.Vector3(0, 0.6, 0) };
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; state.view = 'free'; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  orbit.yaw -= (e.clientX - drag.x) * 0.006; orbit.pitch = Math.max(-0.2, Math.min(1.3, orbit.pitch + (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => { orbit.dist = Math.max(0.4, Math.min(20, orbit.dist * (1 + Math.sign(e.deltaY) * 0.1))); state.view = 'free'; });

const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const VIEWS = {
  overview: () => { camera.position.set(0, 4.2, 9.5); camera.lookAt(0, 0.4, 0); },
  nxr: () => { nxr.root.localToWorld(v3.set(0, 0.62, 2.6)); camera.position.copy(v3); camera.lookAt(nxr.root.localToWorld(v4.set(0, 0.56, 0))); },
  nxrFace: () => { nxr.root.localToWorld(v3.set(0.15, 0.85, 1.35)); camera.position.copy(v3); camera.lookAt(nxr.root.localToWorld(v4.set(0, 0.74, 0))); },
  nxrSide: () => { nxr.root.localToWorld(v3.set(2.2, 0.75, 1.3)); camera.position.copy(v3); camera.lookAt(nxr.root.localToWorld(v4.set(0, 0.56, 0))); },
  nxrBack: () => { nxr.root.localToWorld(v3.set(0.6, 0.9, -2.4)); camera.position.copy(v3); camera.lookAt(nxr.root.localToWorld(v4.set(0, 0.6, 0))); },
  spider: () => { spider.root.localToWorld(v3.set(0.55, 0.45, 1.25)); camera.position.copy(v3); camera.lookAt(spider.root.localToWorld(v4.set(0, 0.22, 0))); },
  spiderFace: () => { spider.headWorldPos(v4); spider.root.localToWorld(v3.set(0.06, 0.4, 0.75)); v3.y = v4.y + 0.03; camera.position.copy(v3); camera.lookAt(v4); },
  spiderSide: () => { spider.root.localToWorld(v3.set(1.3, 0.35, 0.05)); camera.position.copy(v3); camera.lookAt(spider.root.localToWorld(v4.set(0, 0.2, 0))); },
  spiderBack: () => { spider.root.localToWorld(v3.set(-0.5, 0.55, -1.1)); camera.position.copy(v3); camera.lookAt(spider.root.localToWorld(v4.set(0, 0.22, 0))); },
  free: () => {
    const o = orbit;
    camera.position.set(o.target.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, o.target.y + Math.sin(o.pitch) * o.dist, o.target.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
    camera.lookAt(o.target);
  },
};

// ---- sim
let simTime = 0;
const info = document.getElementById('info');
function tri(o) { let n = 0; o.traverse((m) => { if (m.isMesh && m.visible) { const g = m.geometry; n += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } }); return n; }
function step(dt) {
  // player marker (WASD relative to world)
  const mv = new THREE.Vector3((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), 0, (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0));
  if (mv.lengthSq() > 0) { mv.normalize(); player.position.addScaledVector(mv, dt * 2.4); player.rotation.y = Math.atan2(mv.x, mv.z); }
  simTime += dt;
  nxr.update(dt, simTime, player.position);
  spider.update(dt, simTime, player.position);
}
function render() {
  (VIEWS[state.view] || VIEWS.overview)();
  camera.updateMatrixWorld();
  R.render(simTime);
}
let last = performance.now(), fps = 60, infoT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  if (!state.paused) step(dt);
  render();
  infoT -= dt;
  if (infoT < 0) {
    infoT = 0.25;
    info.textContent = `spider: ${spider.state}  mood ${spider.mood.toFixed(2)}  follow ${spider.isFollowing}\n` +
      `nxr emote: ${nxr.emoteName || '-'}  talking ${state.talking}\n` +
      `sounds: ${soundLog.join(', ')}\n` +
      `tris: nxr ${tri(nxr.root) | 0}  spider ${tri(spider.root) | 0}  fps ${fps | 0}`;
  }
}
requestAnimationFrame(loop);

// ---- debug API
window.T = {
  THREE, R, scene, camera, nxr, spider, player, path, home, state, VIEWS, orbit, soundLog,
  get time() { return simTime; },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); render(); return { spider: spider.state, nxr: nxr.emoteName }; },
  view(v) { state.view = v; render(); },
  setPlayer(x, z) { player.position.set(x, 0, z); },
  tris() { return { nxr: tri(nxr.root), spider: tri(spider.root) }; },
  /** render one frame of `view` and POST it to /__shot?name= (lands in .shots/<name>.png) */
  async shot(name, view = null, size = null) {
    if (view) state.view = view;
    if (size) { R.renderer.setSize(size[0], size[1], false); R.composer.setSize(size[0], size[1]); camera.aspect = size[0] / size[1]; camera.updateProjectionMatrix(); }
    render();
    const url = canvas.toDataURL('image/png');
    if (size) R.resize();
    const r = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
    return r.ok ? name : 'fail';
  },
};
