// Standalone harness for the city world: renderer + bloom + fly / walk camera.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Collision } from '../src/core/collision.js';
import { buildCity, buildEnvScene } from '../src/world/city.js';

const hud = document.getElementById('hud');

async function fontsReady() {
  if (!document.fonts) return;
  const faces = ['500 32px "Noto Sans JP"', '700 32px "Noto Sans JP"', '900 32px "Noto Sans JP"', '600 32px "Inter"', '700 32px "Inter"'];
  await Promise.race([
    Promise.all(faces.map((f) => document.fonts.load(f, 'あア漢字Ab').catch(() => null))).then(() => document.fonts.ready),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
}

await fontsReady();

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2a4f);
scene.fog = new THREE.FogExp2(0x1d2a4f, 0.022);

const moon = new THREE.DirectionalLight(0x8fa6ff, 0.6);
moon.position.set(-30, 60, 25);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 160 });
moon.shadow.bias = -0.0005;
moon.target.position.set(-8, 0, -6);
scene.add(moon, moon.target);
scene.add(new THREE.HemisphereLight(0x5566aa, 0x111122, 0.5));

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(buildEnvScene(), 0.035);
scene.environment = envRT.texture;

const collision = new Collision();
const t0 = performance.now();
const city = buildCity(scene, { collision, renderer, quality: 'high' });
const buildMs = performance.now() - t0;
window.city = city;
window.collision = collision;
window.renderer = renderer;
window.moon = moon;

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
window.camera = camera;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.85);
composer.addPass(bloom);
window.bloom = bloom;
window.composer = composer;
window.scene = scene;
composer.addPass(new OutputPass());

// player placeholder capsule
const player = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 4, 10), new THREE.MeshStandardMaterial({ color: 0xff5a3a, roughness: 0.5 }));
player.castShadow = true;
const ppos = new THREE.Vector3(city.spawn.x, 0, city.spawn.z);
let pyaw = city.spawn.rotY;
scene.add(player);

// ---------------------------------------------------------------- camera
let yaw = city.spawn.rotY + Math.PI, pitch = 0.12;
const views = {
  spawn: () => { const s = city.spawn; camera.position.set(s.x - Math.sin(s.rotY) * 4.2, 2.3, s.z - Math.cos(s.rotY) * 4.2); yaw = s.rotY + Math.PI; pitch = 0.1; },
  arcade: () => { camera.position.set(-14.5, 2.2, -1); yaw = Math.PI / 2; pitch = 0.02; },
  konbini: () => { camera.position.set(9.0, 1.7, -11.2); yaw = -Math.PI / 2 + 0.3; pitch = -0.05; },
  hq: () => { camera.position.set(0, 3.5, -16); yaw = 0; pitch = 0.42; },
  plaza: () => { camera.position.set(9, 2.2, -21.5); yaw = 0.55; pitch = 0.05; },
  over: () => { camera.position.set(30, 38, 30); yaw = Math.PI * 0.25; pitch = -0.72; },
  back: () => { camera.position.set(0.5, 2.0, -6); yaw = Math.PI; pitch = 0.03; },
};
window.setView = (n) => { walk = false; views[n](); window.renderNow(); };
window.renderNow = () => { camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld(); city.update(0.016, time, camera); composer.render(); };
window.look = (x, y, z, yw, p) => { walk = false; camera.position.set(x, y, z); yaw = yw; pitch = p; window.renderNow(); };
// yaw convention here: camera looks along (-sin(yaw), ?, -cos(yaw))
views.spawn();

/** render one frame at w x h and POST it to the dev server (.shots/<name>.png) */
window.shot = async (name, w = 1280, h = 720) => {
  const pw = innerWidth, ph = innerHeight, pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  composer.setPixelRatio?.(1);
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.info.autoReset = false; renderer.info.reset();
  window.renderNow();
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setPixelRatio(pr);
  renderer.setSize(pw, ph);
  composer.setPixelRatio?.(pr);
  composer.setSize(pw, ph);
  camera.aspect = pw / ph; camera.updateProjectionMatrix();
  await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  return { calls, tris };
};
/** camera at (x,y,z) looking at (tx,ty,tz) */
window.lookAt = (x, y, z, tx, ty, tz) => {
  const dx = tx - x, dy = ty - y, dz = tz - z;
  window.look(x, y, z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
};
/** debug overlay: draw the pet path loop + home as bright lines */
window.showPetPath = (on = true) => {
  if (window._petLine) { scene.remove(window._petLine); window._petLine = null; }
  if (!on || !city.petPath) return;
  const g = new THREE.Group();
  const pts = city.petPath.map((p) => new THREE.Vector3(p.x, 0.6, p.z));
  pts.push(pts[0].clone());
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff2bd6, fog: false, depthTest: false })));
  for (const p of city.petPath) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe000, fog: false, depthTest: false }));
    m.position.set(p.x, 0.6, p.z); g.add(m);
  }
  if (city.petHome) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0x00ff66, fog: false, depthTest: false }));
    m.position.set(city.petHome.x, 0.6, city.petHome.z); g.add(m);
  }
  g.traverse((o) => { o.renderOrder = 999; });
  scene.add(g);
  window._petLine = g;
};
/** check every pet-path segment against all colliders with a clearance */
window.checkPetPath = (clear = 0.3, step = 0.1) => {
  const bad = [];
  const P = city.petPath || [];
  const hit = (x, z) => {
    for (const b of collision.boxes) if (b.minY <= 0.3 && x > b.minX - clear && x < b.maxX + clear && z > b.minZ - clear && z < b.maxZ + clear) return b.tag || 'box';
    for (const c of collision.circles) if (c.minY <= 0.3 && Math.hypot(x - c.x, z - c.z) < c.r + clear) return c.tag || 'circle';
    for (const [dx, dz] of [[0, 0], [clear, 0], [-clear, 0], [0, clear], [0, -clear]]) if (collision.pointBlocked(x + dx, z + dz, 0.3)) return 'pointBlocked';
    return null;
  };
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      const t = hit(x, z);
      if (t) { bad.push({ seg: i, x: +x.toFixed(2), z: +z.toFixed(2), tag: t }); break; }
    }
  }
  const home = city.petHome && hit(city.petHome.x, city.petHome.z);
  return { points: P.length, bad, home };
};

let walk = false;
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyF') { walk = !walk; if (walk) { ppos.set(camera.position.x, 0, camera.position.z); } }
  if (e.code === 'KeyB') { battle = !battle; city.setBattleMode(battle); }
  const map = { Digit1: 'spawn', Digit2: 'arcade', Digit3: 'konbini', Digit4: 'hq', Digit5: 'plaza', Digit6: 'over', Digit7: 'back' };
  if (map[e.code]) window.setView(map[e.code]);
});
addEventListener('keyup', (e) => keys.delete(e.code));
let drag = false;
renderer.domElement.addEventListener('pointerdown', () => { drag = true; });
addEventListener('pointerup', () => { drag = false; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw -= e.movementX * 0.004;
  pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.004));
});
let battle = false;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fps = 0, time = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  const sp = (keys.has('ShiftLeft') ? 18 : 6) * dt;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(-fwd.z, 0, fwd.x);
  if (walk) {
    const mv = new THREE.Vector3();
    if (keys.has('KeyW')) mv.add(fwd);
    if (keys.has('KeyS')) mv.sub(fwd);
    if (keys.has('KeyD')) mv.add(right);
    if (keys.has('KeyA')) mv.sub(right);
    if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(4 * dt * (keys.has('ShiftLeft') ? 2 : 1)); ppos.add(mv); pyaw = Math.atan2(mv.x, mv.z); }
    collision.resolve(ppos, 0.32, 0);
    ppos.y = city.heightAt ? city.heightAt(ppos.x, ppos.z) : 0;
    camera.position.set(ppos.x + Math.sin(yaw) * 4 * Math.cos(pitch), ppos.y + 1.6 - Math.sin(pitch) * 4, ppos.z + Math.cos(yaw) * 4 * Math.cos(pitch));
  } else {
    if (keys.has('KeyW')) camera.position.addScaledVector(new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), sp);
    if (keys.has('KeyS')) camera.position.addScaledVector(new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), -sp);
    if (keys.has('KeyD')) camera.position.addScaledVector(right, sp);
    if (keys.has('KeyA')) camera.position.addScaledVector(right, -sp);
    if (keys.has('KeyE')) camera.position.y += sp;
    if (keys.has('KeyQ')) camera.position.y -= sp;
  }
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  player.position.set(ppos.x, ppos.y + 0.82, ppos.z);
  player.rotation.y = pyaw;
  city.setPlayerPos(ppos);
  city.update(dt, time, camera);
  renderer.info.autoReset = false;
  renderer.info.reset();
  composer.render();
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  const inf = renderer.info;
  hud.textContent = `fps ${fps.toFixed(0)}  calls ${inf.render.calls}  tris ${(inf.render.triangles / 1000).toFixed(0)}k\n` +
    `geo ${inf.memory.geometries} tex ${inf.memory.textures}  build ${buildMs.toFixed(0)}ms\n` +
    `cam ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}  ${walk ? 'WALK' : 'FLY'}${battle ? ' BATTLE' : ''}`;
  window.stats = { fps, calls: inf.render.calls, tris: inf.render.triangles };
  requestAnimationFrame(frame);
}
frame();
