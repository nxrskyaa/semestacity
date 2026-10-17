// Avatar test harness: lineup of all PRESETS under night lighting through the real post chain,
// animation buttons, close-up camera, and a button that opens the character creator.
import * as THREE from 'three';
import { createRenderer } from '../src/core/renderer.js';
import { createAvatar } from '../src/characters/avatar.js';
import { PRESETS, PRESET_IDS, randomAppearance } from '../src/characters/appearance.js';
import { createNPC } from '../src/characters/npc.js';

const canvas = document.getElementById('c');
const R = createRenderer(canvas);
const { scene, camera, renderer } = R;

// lights: moon + fill + neon rims (≈ what the city gives the characters)
scene.add(new THREE.HemisphereLight(0x6f86c8, 0x1a1f33, 0.85));
const moon = new THREE.DirectionalLight(0xbfd0ff, 1.5);
moon.position.set(-4, 9, 6);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 6, bottom: -4, near: 0.5, far: 30 });
moon.shadow.bias = -0.0004;
scene.add(moon);
const rimC = new THREE.PointLight(0x5ee7ff, 14, 14, 1.6); rimC.position.set(-5, 2.6, -2.5); scene.add(rimC);
const rimM = new THREE.PointLight(0xff4fa8, 12, 14, 1.6); rimM.position.set(5, 2.4, -2.5); scene.add(rimM);
const warm = new THREE.PointLight(0xffc98a, 6, 10, 1.8); warm.position.set(0, 3.2, 4); scene.add(warm);

const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x141c33, roughness: 0.22, metalness: 0.1 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(28, 28, 0x2b3c6b, 0x1d2950);
grid.position.y = 0.002;
scene.add(grid);

// cast
const ids = PRESET_IDS;
const avatars = [];
const SP = 1.05;
ids.forEach((id, i) => {
  const a = createAvatar(PRESETS[id]);
  a.root.position.set((i - (ids.length - 1) / 2) * SP, 0, 0);
  a.root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  scene.add(a.root);
  a.id = id;
  let steps = 0;
  a.onFootstep = () => { steps++; a.steps = steps; };
  avatars.push(a);
});

const state = { anim: 'idle', raining: true, umbrella: true, lookCam: false, turntable: false, walkAround: false };
let focus = -1; // -1 = lineup
let camYaw = 0, camPitch = 0.12, camDist = 7.5, camTarget = new THREE.Vector3(0, 0.95, 0);

const bar = document.getElementById('bar');
const btns = {};
function button(label, fn, key) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => fn(b);
  bar.appendChild(b);
  if (key) btns[key] = b;
  return b;
}
const ANIMS = ['idle', 'walk', 'run', 'talk', 'jump'];
for (const an of ANIMS) button(an, () => { state.anim = an; for (const k of ANIMS) btns[k].classList.toggle('on', k === an); jumpT = 0; }, an);
btns.idle.classList.add('on');
for (const e of ['wave', 'nod', 'think', 'cheer']) button(e, () => { for (const a of avatars) a.playEmote(e); });
button('umbrella', (b) => { state.umbrella = !state.umbrella; b.classList.toggle('on', state.umbrella); for (const a of avatars) a.setUmbrella(state.umbrella); }).classList.add('on');
button('look@cam', (b) => { state.lookCam = !state.lookCam; b.classList.toggle('on', state.lookCam); });
button('turntable', (b) => { state.turntable = !state.turntable; b.classList.toggle('on', state.turntable); });
button('random', () => { avatars.forEach((a, i) => a.setAppearance(randomAppearance(1000 + i + ((Math.random() * 1e6) | 0)))); });
button('presets', () => { avatars.forEach((a) => a.setAppearance(PRESETS[a.id])); });
const sel = document.createElement('select');
sel.innerHTML = `<option value="-1">lineup</option>` + ids.map((id, i) => `<option value="${i}">${id} (${PRESETS[id].name})</option>`).join('');
sel.onchange = () => { setFocus(+sel.value, 'body'); };
bar.appendChild(sel);
button('face', () => setFocus(focus < 0 ? 0 : focus, 'face'));
button('body', () => setFocus(focus < 0 ? 0 : focus, 'body'));
button('creator', () => openCreatorTest());
button('faces', (b) => { state.faces = !state.faces; b.classList.toggle('on', state.faces); }, 'faces');

function setFocus(i, mode = 'body') {
  focus = i;
  sel.value = String(i);
  if (i < 0) { camTarget.set(0, 0.95, 0); camDist = 7.5; camPitch = 0.12; return; }
  const a = avatars[i];
  if (mode === 'face') { const h = a.headWorldPos(new THREE.Vector3()); camTarget.copy(h); camDist = 0.75; camPitch = 0.05; }
  else { camTarget.set(a.root.position.x, 0.9, 0); camDist = 2.9; camPitch = 0.1; }
}

// mouse orbit
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  camYaw -= (e.clientX - drag.x) * 0.006; camPitch = Math.max(-0.4, Math.min(1.2, camPitch + (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => { camDist = Math.max(0.4, Math.min(14, camDist * (1 + Math.sign(e.deltaY) * 0.1))); });

let jumpT = 0, jy = 0, jvy = 0, grounded = true;
let creator = null;
async function openCreatorTest() {
  const { openCreator } = await import('../src/ui/creator.js');
  bar.style.display = 'none';
  creator = openCreator({
    renderer,
    initial: avatars[0].appearance,
    onConfirm: (app) => { console.log('confirm', app); avatars[0].setAppearance(app); closeCreator(); },
    onBack: () => closeCreator(),
  });
}
function closeCreator() { if (creator) { creator.dispose(); creator = null; } bar.style.display = ''; }

const info = document.getElementById('info');
const clock = new THREE.Clock();
let fps = 60, time = 0;
let paused = false;
function step(dt) {
  time += dt;
  if (creator) { creator.update(dt, time); return; }
  // jump loop
  if (state.anim === 'jump') {
    jumpT -= dt;
    if (grounded && jumpT <= 0) { jvy = 6.4; grounded = false; }
    if (!grounded) { jvy -= 22 * dt; jy += jvy * dt; if (jy <= 0) { jy = 0; grounded = true; jumpT = 0.9; } }
  } else { jy = 0; grounded = true; }
  const speed = state.anim === 'walk' ? 1.9 : state.anim === 'run' ? 5.2 : 0;
  avatars.forEach((a) => {
    a.root.position.y = jy;
    if (state.turntable) a.root.rotation.y += dt * 0.6; else if (!state.walkAround) a.root.rotation.y = a.fixedYaw || 0;
    a.update(dt, {
      speed, grounded, vy: jvy, talking: state.anim === 'talk', emote: null,
      lookAt: state.lookCam ? camera.position : null, raining: state.raining,
    });
  });
}
// close-up portrait grid of every preset (direct render, no post chain)
const faceCam = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
const _h = new THREE.Vector3(), _f = new THREE.Vector3();
function drawFaces() {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const n = avatars.length, cols = Math.ceil(Math.sqrt(n * size.x / size.y)), rows = Math.ceil(n / cols);
  const cw = Math.floor(size.x / cols), ch = Math.floor(size.y / rows);
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x0b1122, 1);
  renderer.clear();
  avatars.forEach((a, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = c * cw, y = size.y - (r + 1) * ch;
    renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch);
    a.headWorldPos(_h);
    a.root.getWorldDirection(_f);
    faceCam.aspect = cw / ch;
    faceCam.position.copy(_h).addScaledVector(_f, state.faceDist || 1.5).add(new THREE.Vector3(0, 0.02, 0));
    faceCam.position.x += (state.faceYaw || 0);
    faceCam.lookAt(_h.x, _h.y - (state.faceDrop ?? 0.06), _h.z);
    faceCam.updateProjectionMatrix();
    renderer.render(scene, faceCam);
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, size.x, size.y);
}
function draw() {
  if (creator) { creator.render(); return; }
  if (state.faces) { drawFaces(); return; }
  const cp = Math.cos(camPitch);
  camera.position.set(camTarget.x + Math.sin(camYaw) * cp * camDist, camTarget.y + Math.sin(camPitch) * camDist, camTarget.z + Math.cos(camYaw) * cp * camDist);
  camera.lookAt(camTarget);
  R.render(time);
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
  if (paused) return;
  step(dt); draw();
  info.textContent = creator ? `creator fps ${fps.toFixed(0)}` : `fps ${fps.toFixed(0)}  calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\n` + avatars.map((a) => `${a.id.padEnd(9)} ${a.triangles | 0}`).join('\n');
}
frame();
/** deterministic capture: advance `secs` in fixed steps, render, POST png to the local saver (dev only) */
window.snap = async (name, { secs = 0, fps: f = 60, w = 0, h = 0 } = {}) => {
  paused = true;
  if (w) { renderer.setSize(w, h, false); R.composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const n = Math.round(secs * f);
  for (let i = 0; i < n; i++) step(1 / f);
  draw();
  const url = renderer.domElement.toDataURL('image/png');
  const res = await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: url }).then((x) => x.text()).catch((e) => 'ERR ' + e);
  paused = false;
  if (w) R.resize();
  return res;
};

window.T = { setAnim: (n) => btns[n].click(), THREE, avatars, camera, scene, renderer, state, setFocus, R, createNPC, setCam: (yaw, pitch, dist, x, y, z) => { camYaw = yaw; camPitch = pitch; camDist = dist; if (x !== undefined) camTarget.set(x, y, z); } };

// URL params for scripted inspection: ?focus=0&mode=face&anim=walk&yaw=0.5&pitch=0.1&dist=2&emote=wave&rand=1
{
  const q = new URLSearchParams(location.search);
  if (q.has('anim')) btns[q.get('anim')]?.click();
  if (q.has('focus')) setFocus(+q.get('focus'), q.get('mode') || 'body');
  if (q.has('yaw')) camYaw = +q.get('yaw');
  if (q.has('pitch')) camPitch = +q.get('pitch');
  if (q.has('dist')) camDist = +q.get('dist');
  if (q.has('ty')) camTarget.y = +q.get('ty');
  if (q.has('emote')) setTimeout(() => avatars.forEach((a) => a.playEmote(q.get('emote'))), +(q.get('edelay') || 300));
  if (q.has('turn')) avatars.forEach((a) => { a.fixedYaw = +q.get('turn'); });
  if (q.has('noumb')) { state.umbrella = false; avatars.forEach((a) => a.setUmbrella(false)); }
  if (q.has('creator')) setTimeout(openCreatorTest, 100);
  if (q.has('only')) { const keep = q.get('only').split(',').map(Number); avatars.forEach((a, i) => { a.root.visible = keep.includes(i); }); if (keep.length === 1) { const a = avatars[keep[0]]; a.root.position.x = 0; camTarget.x = 0; } }
  window.__nan = () => { const out = []; for (const a of avatars) a.root.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position.array; let n = 0; for (let i = 0; i < p.length; i++) if (isNaN(p[i])) n++; if (n) out.push(a.id + ':' + o.parent.name + '/' + o.name + ' ' + o.material.type + ' nan=' + n); } }); return out; };
}

/** per-avatar close face shots through the real post chain: snapFaces('ch_v2') -> .shots/ch_v2_<id>.png */
window.snapFaces = async (prefix, { dist = 0.85, w = 520, h = 560, pitch = 0.04, yaw = 0 } = {}) => {
  state.faces = false;
  const out = [];
  for (let i = 0; i < avatars.length; i++) {
    avatars.forEach((a, j) => { a.root.visible = j === i; });
    setFocus(i, 'face'); camDist = dist; camPitch = pitch; camYaw = yaw; camTarget.y -= 0.03;
    out.push(await snap(`${prefix}_${avatars[i].id}`, { secs: i === 0 ? 0.8 : 0.05, w, h }));
  }
  avatars.forEach((a) => { a.root.visible = true; });
  return out;
};
/** triangle breakdown by mesh for one avatar */
window.triBreakdown = (i) => {
  const rows = [];
  avatars[i].root.traverse((o) => { if (o.isMesh && o.geometry.index) rows.push([o.parent.name + '/' + o.name + ':' + o.material.type, o.geometry.index.count / 3]); });
  return rows.sort((a, b) => b[1] - a[1]).slice(0, 14);
};
/** full-body shots: snapBodies('ch_v3', {yaw}) */
window.snapBodies = async (prefix, { yaw = 0, w = 420, h = 760, dist = 2.6 } = {}) => {
  state.faces = false;
  const out = [];
  for (let i = 0; i < avatars.length; i++) {
    avatars.forEach((a, j) => { a.root.visible = j === i; });
    setFocus(i, 'body'); camDist = dist; camYaw = yaw; camPitch = 0.08; camTarget.y = 0.86;
    out.push(await snap(`${prefix}_${avatars[i].id}`, { secs: i === 0 ? 0.8 : 0.05, w, h }));
  }
  avatars.forEach((a) => { a.root.visible = true; });
  return out;
};
/** showcase the gacha cosmetics on the lineup avatars: applyCosmetics(); presets() restores */
window.applyCosmetics = () => {
  const hw = ['catears', 'bunnyears', 'flowercrown', 'headband', 'halo', 'devilhorns', 'crown', 'rialocap', 'bearhood_white'];
  const au = ['sparkle', 'hearts', 'rialoRing', 'none', 'none', 'none', 'rialoRing', 'none', 'none'];
  const um = ['clear', 'neon', 'starry', 'rialo', 'clear', 'neon', 'starry', 'rialo', 'clear'];
  avatars.forEach((a, i) => a.setAppearance({ ...PRESETS[a.id], headwear: hw[i], aura: au[i], umbrella: true, umbrellaStyle: um[i], umbrellaColor: um[i] === 'starry' ? '#3a3d8f' : um[i] === 'neon' ? '#5ee7ff' : '#dff3ff' }));
};
