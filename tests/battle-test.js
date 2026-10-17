// Standalone harness for the holo battle (src/combat/battle.js).
// URL params: ?auto=1 start without clicking · ?autoplay=1 player is AI-driven · ?diff=1.0 rival difficulty
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { input } from '../src/core/input.js';
import { audio } from '../src/core/audio.js';
import { startBattle } from '../src/combat/battle.js';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
input.attach(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1226);
scene.fog = new THREE.FogExp2(0x1d2a4f, 0.022);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
camera.position.set(4, 1.7, -12);
camera.lookAt(0, 1.2, 0);

// fake wet street
{
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#2a2f3b' : '#232733';
    g.fillRect(x * 64, y * 64, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 12);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x39405a, roughness: 0.6 });
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 1.6) });
  const neon2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3) });
  for (const [x, z, w, h, d] of [[-10, 4, 4, 6, 5], [10, -3, 5, 8, 4], [-8, -11, 6, 4, 3], [9, 10, 4, 5, 6], [0, 15, 12, 7, 2]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
    b.position.set(x, h / 2, z); b.castShadow = b.receiveShadow = true; scene.add(b);
    const n = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.12, 0.05), Math.abs(x) % 2 ? neon : neon2);
    n.position.set(x, h * 0.7, z - Math.sign(z || 1) * (d / 2 + 0.03)); scene.add(n);
  }
}

const moon = new THREE.DirectionalLight(0xb8c8ff, 1.1);
moon.position.set(-12, 22, -8);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
scene.add(moon);
scene.add(new THREE.HemisphereLight(0x5a6aa0, 0x1a1a24, 0.55));

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------------ battle lifecycle
const overlay = document.getElementById('overlay');
const ovMsg = document.getElementById('ov-msg');
const dbg = document.getElementById('dbg');
let battle = null;
let state = 'idle';

function begin() {
  if (battle) { battle.dispose(); battle = null; }
  overlay.classList.add('hidden');
  input.requestLock();
  battle = startBattle({
    scene, camera, renderer, collision: null, audio, input,
    center: { x: 0, z: 0, rotY: 0 }, playerName: 'Player', rivalName: 'Raka',
    playerRobot: 'ray', rivalRobot: 'fang', difficulty: parseFloat(params.get('diff') || '1'),
    onEnd: (r) => {
      state = 'ended';
      console.log('[battle] result', r, 'time', battle && battle.debug.fightTime.toFixed(1));
      window.__lastResult = r;
      battle.dispose(); battle = null;
      input.exitLock();
      ovMsg.textContent = (r === 'win' ? 'YOU WON' : 'YOU LOST') + ' — CLICK TO RESTART';
      overlay.classList.remove('hidden');
    },
  });
  if (params.get('autoplay')) battle.debug.autoPlay(true, parseFloat(params.get('autoplay')) || 1);
  window.__battle = battle.debug;
  window.__battleObj = battle;
  state = 'battle';
}
overlay.addEventListener('click', begin);
renderer.domElement.addEventListener('click', () => { if (state === 'battle') input.requestLock(); });
if (params.get('auto')) begin();
window.__begin = begin;

const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
const manual = !!params.get('manual');
function frame() {
  if (manual) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (battle) battle.update(dt, t);
  composer.render(dt);
  input.endFrame();
  frames++; fpsT += dt;
  if (fpsT > 0.5) {
    const b = window.__battle;
    dbg.textContent = `${Math.round(frames / fpsT)} fps · calls ${renderer.info.render.calls}` + (b ? ` · ${b.phase} ${b.fightTime.toFixed(1)}s · hp ${b.hp.join('/')}` : '');
    frames = 0; fpsT = 0;
  }
}
frame();

// manual stepping for headless/hidden-tab testing: __advance(seconds, dt)
let simClock = 0;
window.__advance = (sec = 1, step = 1 / 60) => {
  const n = Math.round(sec / step);
  for (let i = 0; i < n; i++) {
    simClock += step;
    if (battle) battle.update(step, simClock);
    input.endFrame();
  }
  composer.render(step);
  return window.__battle ? { phase: window.__battle.phase, hp: window.__battle.hp, t: window.__battle.fightTime } : null;
};
