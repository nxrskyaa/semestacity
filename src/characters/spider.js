// Spider — the black cat pet that roams Semesta City.
// Chibi-but-believable black cat (~0.35 m at the shoulder): glossy dark toon fur with a blue rim/sheen
// (reads at night), big yellow-green shader eyes (dilating pupils, highlights, blinks, happy ^^ eyes,
// faint glow), pink nose + "w" mouth, whiskers, pink-lined ears, an 11-segment procedural tail and
// IK legs with a diagonal-pair walk cycle.
//
// createSpider({ path, home, groundAt, collision }) -> Spider
// Spider = { root, position, state, isFollowing, mood, onSound, update(dt,time,playerPos),
//            interact('pet'|'feed'|'play'|'follow'|'stay'), headWorldPos(v), dispose() }
// onSound(name, opts) is called with 'meow' | 'purr' (opts: { volume, pitch }).
import * as THREE from 'three';
import { angleDelta, dampAngle, damp, clamp, lerp, rng, TAU } from '../core/util.js';
import { PAT, EMOTES } from './anims.js';
import { blob, ellipsoid, lathe, capsule, tube, inked, furMat, flatMat, createHearts, disposePet, weld } from './pet_kit.js';

// ---------------------------------------------------------------- reconstruction data
export const SPIDER_SPEC = {
  colors: {
    fur: '#1a1a20', rim: 0x8094ff, sheen: 0x8c9cd6, innerEar: '#b06684', nose: '#ee9fb0', mouth: '#d98a9c',
    mouthIn: '#5c1f2e', tongue: '#f48ea4', whisker: '#e9ebf4',
    irisOuter: '#ffe51f', irisInner: '#8fe03c', ring: '#2a9cd6', pupil: '#07131a',
  },
  // all in metres; root faces +Z; body group origin = hip centre
  stand: { bodyH: 0.225, hipZ: -0.13 },
  shoulder: [0.05, 0.0, 0.26], hip: [0.056, 0.012, 0.0],
  front: { L1: 0.105, L2: 0.105, r: [0.043, 0.03, 0.03, 0.024] },
  hind: { L1: 0.1, L2: 0.09, L3: 0.055, r: [0.056, 0.034, 0.031, 0.024, 0.022] },
  pawFront: [0.05, 0.135], pawHind: [0.058, -0.125],
  neck: [0, 0.045, 0.27], headOff: [0, 0.075, 0.042],
  head: { rx: 0.098, ry: 0.082, rz: 0.088, scale: 1.13 },
  tail: { n: 11, len: 0.028, r0: 0.027, r1: 0.011, anchor: [0, 0.05, -0.05] },
  outline: 0.0065,
};
const S = SPIDER_SPEC;
const NOTICE = 3.0;
const X = new THREE.Vector3(1, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// ---------------------------------------------------------------- eye shader
const EYE_VS = /* glsl */`
varying vec3 vP;
#include <common>
#include <fog_pars_vertex>
void main() {
  vP = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const EYE_FS = /* glsl */`
uniform vec3 uIrisA; uniform vec3 uIrisB; uniform vec3 uRing; uniform vec3 uPupilCol; uniform vec3 uLidCol; uniform vec3 uLineCol;
uniform float uPupil; uniform float uLid; uniform float uHappy; uniform float uGlow; uniform vec2 uLook; uniform float uSide;
varying vec3 vP;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 q = vP.xy;
  vec2 c = q - uLook;
  float r = length(c);
  // iris: green centre -> bright yellow rim, thin dark limbal ring
  vec3 col = mix(uIrisB, uIrisA, smoothstep(0.12, 0.72, r));
  col = mix(col, uIrisA * 0.32, smoothstep(0.84, 0.97, r));
  // radial fibres
  float ang = atan(c.y, c.x);
  col *= 0.93 + 0.07 * sin(ang * 22.0 + r * 9.0);
  // pupil: vertical slit (calm) -> round (happy/excited), teal glow ring around it
  float pw = mix(0.13, 0.46, uPupil);
  float ph = mix(0.66, 0.52, uPupil);
  float pd = length(vec2(c.x / pw, c.y / ph));
  col = mix(col, uRing, (1.0 - smoothstep(1.0, 2.1, pd)) * 0.92);
  col = mix(col, uPupilCol, 1.0 - smoothstep(0.92, 1.02, pd));
  // catch-lights (fixed in eye space; big upper-left + small lower-right)
  vec2 h1p = vec2(-0.30 * uSide - 0.05, 0.36);
  float h1 = 1.0 - smoothstep(0.15, 0.2, length((q - h1p) * vec2(1.0, 1.15)));
  float h2 = 1.0 - smoothstep(0.055, 0.085, length(q - vec2(0.28 * uSide, -0.30)));
  col *= uGlow;
  col = mix(col, vec3(1.25), max(h1, h2 * 0.9));
  // roundness: darker toward the lens edge
  col *= mix(0.5, 1.0, smoothstep(0.0, 0.55, vP.z));
  // eyelid (fur) from the top, slightly curved
  float lidY = 1.05 - 2.15 * uLid + mix(0.12, -0.32, uHappy) * q.x * q.x;
  float lid = smoothstep(lidY - 0.035, lidY + 0.035, q.y);
  vec3 outc = mix(col, uLidCol, lid);
  // fully closed: draw a soft lash line; happy -> arched ^ ^
  float closed = smoothstep(0.72, 0.95, uLid);
  float arcY = mix(-0.08 - 0.12 * q.x * q.x, 0.18 - 0.6 * q.x * q.x, uHappy);
  float line = (1.0 - smoothstep(0.045, 0.1, abs(q.y - arcY))) * (1.0 - smoothstep(0.62, 0.8, abs(q.x)));
  outc = mix(outc, uLineCol, line * closed);
  gl_FragColor = vec4(outc, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function eyeMaterial(side) {
  const C = S.colors;
  return new THREE.ShaderMaterial({
    vertexShader: EYE_VS, fragmentShader: EYE_FS, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uIrisA: { value: new THREE.Color(C.irisOuter) }, uIrisB: { value: new THREE.Color(C.irisInner) },
      uRing: { value: new THREE.Color(C.ring) }, uPupilCol: { value: new THREE.Color(C.pupil) },
      uLidCol: { value: new THREE.Color('#15151d') }, uLineCol: { value: new THREE.Color('#9aa4c8') },
      uPupil: { value: 0.3 }, uLid: { value: 0 }, uHappy: { value: 0 }, uGlow: { value: 1.0 },
      uLook: { value: new THREE.Vector2() }, uSide: { value: side },
    }]),
  });
}

// ---------------------------------------------------------------- build
function buildSpider() {
  const C = S.colors;
  const OL = S.outline;
  const fur = furMat(C.fur, { rim: C.rim, rimStrength: 0.34, rimPower: 2.8, sheen: C.sheen, sheenStrength: 0.13 });
  const mats = {
    fur,
    inner: furMat(C.innerEar, { rim: 0xffb0d0, rimStrength: 0.15, sheenStrength: 0 }),
    nose: flatMat(C.nose, { emissive: 0x3a1018 }),
    mouth: new THREE.MeshBasicMaterial({ color: C.mouth }),
    mouthIn: new THREE.MeshBasicMaterial({ color: C.mouthIn }),
    tongue: flatMat(C.tongue, { emissive: 0x401018 }),
    whisker: new THREE.MeshBasicMaterial({ color: C.whisker, transparent: true, opacity: 0.85 }),
  };
  const root = new THREE.Group(); root.name = 'Spider';
  const body = new THREE.Group(); body.name = 'body';
  root.add(body);

  // torso: bean with a fuller chest
  const torsoGeo = blob((d, o) => {
    const chest = 1 + 0.07 * d.z;
    const belly = d.y < 0 ? 1.04 : 1;
    o.set(d.x * 0.084 * chest, d.y * 0.095 * chest * belly, d.z * 0.205);
  }, 28, 18);
  torsoGeo.translate(0, 0, 0.13);
  const torsoG = new THREE.Group(); torsoG.name = 'torso-group';
  torsoG.add(inked(torsoGeo, fur, OL, 'torso'));
  body.add(torsoG);

  // anchors on the body (read back through body.matrix)
  const anchors = {
    sh: [new THREE.Vector3(S.shoulder[0], S.shoulder[1], S.shoulder[2]), new THREE.Vector3(-S.shoulder[0], S.shoulder[1], S.shoulder[2])],
    hp: [new THREE.Vector3(S.hip[0], S.hip[1], S.hip[2]), new THREE.Vector3(-S.hip[0], S.hip[1], S.hip[2])],
  };

  // legs (segments live in root space, posed by IK every frame)
  function seg(len, r0, r1, name) {
    const g = new THREE.Group(); g.name = name;
    g.add(inked(capsule(len, r0, r1, 10), fur, OL, name));
    root.add(g);
    return g;
  }
  const legs = [];
  for (const [i, sx] of [[0, 1], [1, -1]]) {
    const F = S.front;
    legs.push({
      kind: 'front', sx, side: i, L1: F.L1, L2: F.L2, bend: 1,
      upper: seg(F.L1, F.r[0], F.r[1], 'front-upper'), lower: seg(F.L2, F.r[2], F.r[3], 'front-lower'),
      paw: null, foot: new THREE.Vector3(), phaseOff: i === 0 ? 0 : 0.5,
    });
  }
  for (const [i, sx] of [[0, 1], [1, -1]]) {
    const Hh = S.hind;
    legs.push({
      kind: 'hind', sx, side: i, L1: Hh.L1, L2: Hh.L2, L3: Hh.L3, bend: -1,
      upper: seg(Hh.L1, Hh.r[0], Hh.r[1], 'hind-thigh'), lower: seg(Hh.L2, Hh.r[2], Hh.r[3], 'hind-shin'),
      meta: seg(Hh.L3, Hh.r[3], Hh.r[4], 'hind-meta'),
      paw: null, foot: new THREE.Vector3(), phaseOff: i === 0 ? 0.5 : 0, // diagonal pairs: LF+RH, RF+LH
    });
  }
  for (const L of legs) {
    const p = inked(ellipsoid(0.029, 0.018, L.kind === 'front' ? 0.035 : 0.037, 14, 10), fur, OL, 'paw');
    root.add(p);
    L.paw = p;
  }

  // neck + head
  const neck = new THREE.Group(); neck.name = 'neck';
  neck.position.set(...S.neck);
  body.add(neck);
  const neckMesh = inked(capsule(0.08, 0.058, 0.06, 14), fur, 0, 'neck-fur');
  neckMesh.quaternion.setFromUnitVectors(DOWN, new THREE.Vector3(...S.headOff).normalize()); // capsule runs toward the head
  neck.add(neckMesh);
  const head = new THREE.Group(); head.name = 'head';
  head.rotation.order = 'YXZ';
  head.position.set(...S.headOff);
  head.scale.setScalar(S.head.scale);
  neck.add(head);
  const Hd = S.head;
  const headGeo = blob((d, o) => {
    // round skull, fluffy cheek ruffs on the lower sides, slightly flat face
    const cheek = Math.exp(-((d.y + 0.35) ** 2) / 0.05) * Math.max(0, Math.abs(d.x) - 0.35) * 0.38;
    const tuft = cheek > 0.02 ? 0.04 * Math.max(0, Math.cos(Math.atan2(d.y, Math.abs(d.x)) * 9)) * Math.min(1, cheek * 8) : 0;
    const wx = 1 + cheek + tuft;
    const flat = d.z > 0.6 ? 1 - (d.z - 0.6) * 0.18 : 1;
    o.set(d.x * Hd.rx * wx, d.y * Hd.ry * (1 + tuft * 0.5) * (d.y < 0 ? 0.94 : 1), d.z * Hd.rz * flat);
  }, 36, 26);
  head.add(inked(headGeo, fur, OL, 'head'));
  // muzzle (whisker pads) + chin
  for (const sx of [1, -1]) {
    const pad = inked(ellipsoid(0.022, 0.018, 0.02, 14, 10), fur, OL * 0.6, 'whisker-pad');
    pad.position.set(sx * 0.016, -0.03, 0.074);
    head.add(pad);
  }
  const chin = inked(ellipsoid(0.016, 0.011, 0.014, 12, 8), fur, OL * 0.5, 'chin');
  chin.position.set(0, -0.05, 0.068);
  head.add(chin);

  // eyes
  const eyes = [];
  for (const sx of [1, -1]) {
    const m = eyeMaterial(sx);
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), m);
    e.name = 'eye';
    e.scale.set(0.03, 0.031, 0.017);
    e.position.set(sx * 0.043, 0.013, 0.069);
    e.rotation.set(-0.06, sx * 0.17, 0);
    head.add(e);
    eyes.push(e);
  }

  // nose, mouth, tongue
  const nose = new THREE.Mesh(ellipsoid(0.0115, 0.008, 0.0085, 14, 10), mats.nose);
  nose.geometry.translate(0, 0, 0);
  nose.name = 'nose';
  nose.position.set(0, -0.012, 0.094);
  nose.scale.set(1, 1, 1);
  head.add(nose);
  const mouthLine = new THREE.Mesh(new THREE.BufferGeometry(), mats.mouth);
  {
    const z = 0.0905;
    const w = tube([new THREE.Vector3(-0.017, -0.036, z - 0.006), new THREE.Vector3(-0.009, -0.043, z - 0.001), new THREE.Vector3(0, -0.036, z + 0.002), new THREE.Vector3(0.009, -0.043, z - 0.001), new THREE.Vector3(0.017, -0.036, z - 0.006)], 0.0016, 6, 24);
    const ph = tube([new THREE.Vector3(0, -0.019, z + 0.004), new THREE.Vector3(0, -0.028, z + 0.004), new THREE.Vector3(0, -0.036, z + 0.003)], 0.0015, 6, 6);
    mouthLine.geometry.dispose();
    mouthLine.geometry = mergeTwo(w, ph);
  }
  mouthLine.name = 'mouth';
  head.add(mouthLine);
  const mouthOpen = new THREE.Mesh(ellipsoid(0.016, 0.013, 0.008, 14, 10), mats.mouthIn);
  mouthOpen.name = 'mouth-open';
  mouthOpen.position.set(0, -0.047, 0.083);
  mouthOpen.scale.set(1, 0.01, 1);
  head.add(mouthOpen);
  const tongue = new THREE.Mesh(ellipsoid(0.009, 0.0045, 0.013, 12, 8), mats.tongue);
  tongue.name = 'tongue';
  tongue.position.set(0, -0.05, 0.08);
  tongue.visible = false;
  head.add(tongue);

  // whiskers (3 per side)
  const wg = [];
  for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
    const y0 = -0.026 - k * 0.006;
    const pts = [new THREE.Vector3(sx * 0.03, y0, 0.084), new THREE.Vector3(sx * 0.075, y0 + 0.004 - k * 0.008, 0.08 - k * 0.004), new THREE.Vector3(sx * 0.125, y0 - 0.006 - k * 0.02, 0.062 - k * 0.01)];
    wg.push(tube(pts, 0.0011, 4, 10, (s) => 1 - s * 0.6));
  }
  const whiskers = new THREE.Mesh(mergeMany(wg), mats.whisker);
  whiskers.name = 'whiskers';
  head.add(whiskers);

  // ears: rounded triangular cones with pink insides, pivot at the base
  const ears = [];
  for (const sx of [1, -1]) {
    const ep = new THREE.Group(); ep.name = 'ear';
    ep.position.set(sx * 0.054, 0.056, -0.008);
    const og = new THREE.ConeGeometry(0.037, 0.088, 14, 3);
    og.translate(0, 0.044, 0);
    roundTip(og, 0.088);
    og.scale(1, 1, 0.5);
    const outer = inked(weld(og), fur, OL, 'ear');
    ep.add(outer);
    const ig = new THREE.ConeGeometry(0.026, 0.068, 12, 2);
    ig.translate(0, 0.034, 0);
    ig.scale(1, 1, 0.32);
    const inner = new THREE.Mesh(ig, mats.inner);
    inner.name = 'ear-inner';
    inner.position.set(0, 0.006, 0.011);
    ep.add(inner);
    ep.rotation.set(-0.12, sx * 0.22, -sx * 0.32);
    ep.userData.sx = sx;
    head.add(ep);
    ears.push(ep);
  }

  // tail chain
  const T = S.tail;
  const tail = [];
  let parent = body;
  for (let i = 0; i < T.n; i++) {
    const g = new THREE.Group(); g.name = `tail-${i}`;
    if (i === 0) g.position.set(...T.anchor); else g.position.set(0, 0, -T.len);
    const r0 = lerp(T.r0, T.r1, i / T.n), r1 = lerp(T.r0, T.r1, (i + 1) / T.n);
    const m = inked(capsule(T.len, r0, i === T.n - 1 ? r1 * 0.9 : r1, 8, 'z'), fur, OL * 0.9, 'tail');
    g.add(m);
    parent.add(g);
    parent = g;
    tail.push(g);
  }

  root.traverse((o) => { if (o.isMesh && o.name !== 'outline') { o.castShadow = o.material === fur; o.receiveShadow = false; } });
  return { root, body, torsoG, anchors, legs, neck, head, eyes, ears, tail, mouthOpen, tongue, whiskers, mats };
}

function mergeTwo(a, b) { return mergeMany([a, b]); }
function mergeMany(list) {
  let n = 0, ni = 0;
  for (const g of list) { n += g.getAttribute('position').count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const g of list) {
    pos.set(g.getAttribute('position').array, o * 3);
    nor.set(g.getAttribute('normal').array, o * 3);
    for (const i of g.index.array) idx.push(i + o);
    o += g.getAttribute('position').count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(idx);
  void ni;
  return out;
}
function roundTip(g, h) {
  // pull the tip ring inward so the ear tip is soft instead of needle sharp
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / h;
    if (t > 0.6) { const k = 1 + (t - 0.6) * 0.9; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    if (t > 0.98) p.setY(i, y - 0.006);
  }
  g.computeVertexNormals();
}

// ---------------------------------------------------------------- props: food bowl + yarn toy
function buildBowl() {
  const g = new THREE.Group(); g.name = 'cat-bowl';
  const bowl = inked(lathe([[0.001, 0.0], [0.05, 0.0], [0.062, 0.012], [0.07, 0.035], [0.064, 0.038], [0.052, 0.012], [0.001, 0.008]], 28), flatMat('#ff6fae'), 0.005, 'bowl');
  g.add(bowl);
  const food = inked(ellipsoid(0.05, 0.022, 0.05, 16, 8), flatMat('#a8642e'), 0.003, 'food');
  food.position.y = 0.022;
  g.add(food);
  g.userData.food = food;
  // a few kibble bumps
  const kg = ellipsoid(0.008, 0.006, 0.008, 6, 4);
  const km = flatMat('#7a4320');
  const r = rng(4);
  for (let i = 0; i < 9; i++) {
    const k = new THREE.Mesh(kg, km);
    const a = r() * TAU, d = r() * 0.035;
    k.position.set(Math.cos(a) * d, 0.035 + r() * 0.006, Math.sin(a) * d);
    food.add(k);
  }
  g.visible = false;
  return g;
}
function buildToy() {
  const g = new THREE.Group(); g.name = 'cat-toy';
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ff5fa2'; x.fillRect(0, 0, 128, 64);
  x.strokeStyle = '#ffd1e6'; x.lineWidth = 3;
  for (let i = -8; i < 20; i++) { x.beginPath(); x.moveTo(i * 9, 0); x.lineTo(i * 9 + 40, 64); x.stroke(); }
  for (let i = -8; i < 20; i++) { x.beginPath(); x.moveTo(i * 11, 64); x.lineTo(i * 11 + 30, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const ball = inked(new THREE.SphereGeometry(0.03, 18, 12), flatMat('#ffffff', { map: t, emissive: 0x401020 }), 0.004, 'yarn');
  ball.position.y = 0.03;
  g.add(ball);
  const strand = new THREE.Mesh(tube([new THREE.Vector3(0.02, 0.02, -0.01), new THREE.Vector3(0.05, 0.004, -0.04), new THREE.Vector3(0.09, 0.003, -0.03), new THREE.Vector3(0.12, 0.003, -0.06)], 0.0025, 5, 16), flatMat('#ff5fa2'));
  g.add(strand);
  g.userData.ball = ball;
  g.visible = false;
  return g;
}

// ---------------------------------------------------------------- actor
export function createSpider({ path = [], home = null, groundAt = null, collision = null } = {}) {
  const R = buildSpider();
  const { root, body, torsoG, anchors, legs, neck, head, eyes, ears, tail, mouthOpen, tongue } = R;
  const gy = (x, z) => (groundAt ? groundAt(x, z) : 0);
  const pts = (path || []).map((p) => ({ x: p.x, z: p.z }));
  const homeP = home ? { x: home.x, z: home.z } : (pts[0] ? { ...pts[0] } : { x: 0, z: 0 });
  const start = pts[0] || homeP;
  root.position.set(start.x, gy(start.x, start.z), start.z);
  if (pts[1]) root.rotation.y = Math.atan2(pts[1].x - start.x, pts[1].z - start.z);

  const hearts = createHearts(null, 10);
  const bowl = buildBowl();
  const toy = buildToy();
  const props = new THREE.Group(); props.name = 'spider-props';
  props.add(hearts.group, bowl, toy);

  const rand = Math.random;
  // pose parameters (current P, target T)
  const DEF = {
    bodyH: S.stand.bodyH, pitch: 0, roll: 0, sway: 0,
    headYaw: 0, headPitch: 0, headRoll: 0,
    earUp: 0, earBack: 0, tailLift: 0.35, tailCurl: -0.08, tailSide: 0, tailHook: 0, wag: 0.12, wagF: 1.3,
    lid: 0, happy: 0, pupil: 0.3, mouth: 0, tongue: 0,
    sit: 0, loaf: 0, reach: 0, crouch: 0, paw: 0, frontPawZ: 0,
  };
  const P = { ...DEF };
  let T = { ...DEF };
  const RATE = { lid: 14, mouth: 10, tongue: 12, headYaw: 5, headPitch: 5, headRoll: 5, paw: 6, bodyH: 5, pitch: 5 };

  const cat = {
    root, position: root.position, state: 'walk', isFollowing: false, mood: 0.5, onSound: null,
    props,
    get tri() { return countTris(root); },
    /** opts: feed { from } = where the bowl comes from (the player's hands); play { toyAt } = where the thrown toy landed */
    interact(kind, opts) { return interact(kind, opts || {}); },
    /** show the bowl / toy at a world position while the player carries or throws it (null hides it) */
    carry(kind, pos) {
      const o = kind === 'bowl' ? bowl : toy;
      if (!pos) { o.visible = false; return; }
      ensureProps();
      if (kind === 'bowl') { bowl.userData.food.visible = true; bowl.userData.food.scale.set(1, 1, 1); bowl.rotation.y = root.rotation.y; }
      o.visible = true; o.scale.setScalar(1); o.position.copy(pos);
    },
    /** where the bowl goes down (in front of the cat's face) */
    bowlSpot(v = new THREE.Vector3()) { forwardPoint(0.24, v); v.y = gy(v.x, v.z); return v; },
    /** keep the cat sitting with the player (during an interaction): finished actions return to 'sit' instead of wandering */
    hold(on) {
      cat.held = !!on;
      if (on && (st.name === 'walk' || st.name === 'follow' || st.name === 'sit')) go('sit', 0);
      else if (!on && st.name === 'sit' && !st.dur) resume();
    },
    headWorldPos(v = new THREE.Vector3()) { return head.localToWorld(v.set(0, 0.0, 0)); },
    update, dispose,
    /** debug/testing: force a behaviour state (e.g. 'sit', 'groom', 'loaf', 'stretch', 'yawn') */
    _force(name, dur = 5) { go(name, dur, name === 'spin' ? { dir: 1 } : name === 'rub' ? { a: 0, dir: 1 } : {}); },
  };

  // ---- runtime state
  let st = { name: 'walk', t: 0, dur: 0, d: {} };
  let wp = 0;                   // current waypoint index
  let speed = 0, gait = 0;      // m/s, gait phase 0..1
  let tired = 0.15 + rand() * 0.3;
  let nextActivity = 5 + rand() * 6;
  let nextMeow = 12 + rand() * 25;
  let noticeCooldown = 0;
  let blinkT = 2 + rand() * 3, blink = 0;
  let lastPlayer = null, playerSpeed = 0, playerStill = 0;
  const pp = new THREE.Vector3();
  let purrT = 0, heartT = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), d = new THREE.Vector3(), u = new THREE.Vector3(), knee = new THREE.Vector3(), q = new THREE.Quaternion();
  const joint = new THREE.Vector3(), target = new THREE.Vector3(), hock = new THREE.Vector3();

  function sound(name, opts) { if (cat.onSound) try { cat.onSound(name, opts || {}); } catch (e) { /* ignore */ } }
  function go(name, dur = 0, data = {}) { st = { name, t: 0, dur, d: data }; cat.state = name; }
  function nearestWaypoint() {
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const dd = (pts[i].x - root.position.x) ** 2 + (pts[i].z - root.position.z) ** 2; if (dd < bd) { bd = dd; best = i; } }
    return best;
  }
  function resume() {
    if (cat.held) { go('sit', 0); return; }
    if (cat.isFollowing) { go('follow'); return; }
    wp = nearestWaypoint();
    go('walk');
    nextActivity = 6 + rand() * 8;
  }
  function addMood(k) { cat.mood = clamp(cat.mood + k, 0, 1); }
  function ensureProps() { if (!props.parent && root.parent) root.parent.add(props); }
  function spawnHeart(n = 1) {
    ensureProps();
    for (let i = 0; i < n; i++) { cat.headWorldPos(tmp); tmp.y += 0.1; hearts.spawn(tmp, 0.08); }
  }
  function forwardPoint(dist, out) {
    const yaw = root.rotation.y;
    return out.set(root.position.x + Math.sin(yaw) * dist, root.position.y, root.position.z + Math.cos(yaw) * dist);
  }

  // ---- interactions
  function interact(kind, opts = {}) {
    addMood(0.02);
    switch (kind) {
      case 'pet':
        go(st.name === 'loaf' ? 'loaf-pet' : 'petted', 4.2);
        sound('purr', { volume: 0.9 });
        purrT = 0; heartT = 0;
        addMood(0.15);
        break;
      case 'feed': {
        ensureProps();
        forwardPoint(0.24, tmp);
        bowl.position.set(tmp.x, gy(tmp.x, tmp.z), tmp.z);
        bowl.rotation.y = root.rotation.y;
        bowl.visible = true; bowl.scale.setScalar(opts.from ? 1 : 0.01);
        bowl.userData.food.scale.set(1, 1, 1);
        bowl.userData.food.visible = true;
        go('eat', 4.6, { from: opts.from ? opts.from.clone() : null, to: bowl.position.clone() });
        sound('meow', { pitch: 1.15 });
        addMood(0.2);
        break;
      }
      case 'play':
        if (opts.toyAt || rand() < 0.6) {
          ensureProps();
          if (opts.toyAt) tmp.copy(opts.toyAt); else forwardPoint(0.55, tmp);
          toy.position.set(tmp.x, gy(tmp.x, tmp.z), tmp.z);
          toy.visible = true;
          go('play', 9, { phase: 'crouch', pt: 0, pounces: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
        } else {
          go('spin', 3.0, { dir: rand() < 0.5 ? 1 : -1 });
        }
        addMood(0.1);
        break;
      case 'follow':
        cat.isFollowing = true;
        go('follow');
        sound('meow', { pitch: 1.25, volume: 0.7 });
        break;
      case 'stay':
        cat.isFollowing = false;
        go('sit', 2.5);
        break;
      default: return cat.state;
    }
    return cat.state;
  }

  // ---- locomotion helper: steer toward (x,z) at speed; returns distance
  function steer(tx, tz, want, dt, arrive = 0.25, turnRate = 3.2) {
    const p = root.position;
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < arrive) return { dist, want: 0 };
    const yaw = Math.atan2(dx, dz);
    const err = angleDelta(root.rotation.y, yaw);
    root.rotation.y = dampAngle(root.rotation.y, yaw, turnRate, dt);
    let w = want * clamp(1 - Math.abs(err) / 1.7, 0.18, 1);
    w = Math.min(w, Math.max(0.12, dist * 1.6));
    return { dist, want: w };
  }

  function lookAtPlayer(Tt, strength = 1) {
    if (!lastPlayer) return;
    const p = root.position;
    const yawTo = Math.atan2(pp.x - p.x, pp.z - p.z);
    const rel = angleDelta(root.rotation.y, yawTo);
    const dist = Math.hypot(pp.x - p.x, pp.z - p.z);
    Tt.headYaw = clamp(rel, -1.15, 1.15) * strength;
    Tt.headPitch = clamp(-Math.atan2(1.25, Math.max(0.3, dist)) * 0.75, -0.75, 0.1) * strength + Tt.headPitch * (1 - strength);
    return rel;
  }

  // ---- per-frame state logic: sets T (pose targets) + returns desired speed
  function think(dt, time) {
    T = { ...DEF };
    st.t += dt;
    const p = root.position;
    const dist = lastPlayer ? Math.hypot(pp.x - p.x, pp.z - p.z) : Infinity;
    const near = dist < NOTICE;
    let want = 0;
    const calm = ['walk', 'sit', 'look', 'sniff', 'groom', 'stretch', 'yawn'].includes(st.name);

    // happy cats keep their pupils a bit wider
    T.pupil = 0.25 + cat.mood * 0.2;

    // player notices (not while following / busy / sleeping)
    noticeCooldown -= dt;
    if (calm && near && noticeCooldown <= 0 && !cat.isFollowing) {
      go('notice', 1.7);
      if (rand() < 0.6) sound('meow', { pitch: 1.1 + rand() * 0.2 });
    }

    switch (st.name) {
      case 'walk': {
        if (pts.length) {
          const tgt = pts[wp % pts.length];
          const r = steer(tgt.x, tgt.z, 0.36, dt, 0.3, 2.4);
          if (r.dist < 0.3) wp = (wp + 1) % pts.length;
          want = r.want || 0.3;
        } else {
          // no path: amble around home
          const a = time * 0.15;
          const r = steer(homeP.x + Math.sin(a) * 1.5, homeP.z + Math.cos(a) * 1.5, 0.32, dt, 0.2);
          want = r.want;
        }
        T.tailLift = 0.55 + cat.mood * 0.4; T.tailCurl = -0.11; T.tailHook = 0.45 + cat.mood * 0.4; T.wag = 0.16; T.wagF = 1.2;
        T.headPitch = 0.08 + Math.sin(time * 0.7) * 0.05;
        T.headYaw = Math.sin(time * 0.45) * 0.25;
        if (near) lookAtPlayer(T, 0.7);
        nextActivity -= dt;
        if (tired > 1 && st.t > 2) { go('goHome'); break; }
        if (nextActivity <= 0) {
          const r = rand();
          if (r < 0.24) go('sit', 4 + rand() * 4);
          else if (r < 0.42) go('groom', 5.2);
          else if (r < 0.6) go('look', 3.5 + rand() * 2);
          else if (r < 0.76) go('sniff', 2.8 + rand());
          else if (r < 0.88) go('stretch', 3.2);
          else go('yawn', 2.6);
          nextActivity = 7 + rand() * 9;
        }
        break;
      }
      case 'sit': {
        T.sit = 1; T.bodyH = 0.06; T.pitch = -0.95;
        T.tailLift = -0.25; T.tailCurl = 0.0; T.tailSide = 0.2; T.wag = 0.06; T.wagF = 0.7;
        T.headPitch = 0.05;
        T.headYaw = Math.sin(st.t * 0.6) * 0.4;
        if (near || cat.isFollowing) lookAtPlayer(T, 1);
        if (cat.held && lastPlayer) root.rotation.y = dampAngle(root.rotation.y, Math.atan2(pp.x - p.x, pp.z - p.z), 3, dt);
        if (st.t > 1.5 && st.t % 4 < 0.9 && cat.mood > 0.45) { T.lid = 0.6; T.happy = 0.7; } // slow blink (cat affection)
        if (st.dur && st.t > st.dur) resume();
        break;
      }
      case 'groom': {
        T.sit = 1; T.bodyH = 0.06; T.pitch = -0.95;
        T.tailLift = -0.25; T.tailSide = 0.2; T.wag = 0.05;
        const k = st.t / st.dur;
        T.paw = sstep(0.05, 0.2, k) * (1 - sstep(0.88, 1, k));
        if (k < 0.55) {
          // lick the paw
          T.headPitch = 0.42; T.headYaw = -0.25; T.headRoll = 0.15;
          T.tongue = Math.sin(st.t * 11) > 0 ? 1 : 0.2; T.mouth = 0.25; T.lid = 0.55;
        } else {
          // wipe the paw over the face / ear
          const w = Math.sin((k - 0.55) * 22);
          T.headPitch = 0.15; T.headYaw = -0.35; T.headRoll = 0.35 + w * 0.08;
          T.frontPawZ = w * 0.02; T.lid = 0.85; T.earBack = 0.4;
        }
        if (st.t > st.dur) resume();
        break;
      }
      case 'look': {
        const k = st.t / st.dur;
        T.headYaw = Math.sin(k * TAU) * 0.9;
        T.headPitch = -0.12;
        T.earUp = 0.7;
        T.tailLift = 0.5; T.tailHook = 0.3; T.wag = 0.1;
        if (st.t > st.dur) resume();
        break;
      }
      case 'sniff': {
        T.headPitch = 0.75; T.headYaw = Math.sin(st.t * 3) * 0.15;
        T.headRoll = Math.sin(st.t * 23) * 0.03;
        T.bodyH = 0.22; T.pitch = 0.08;
        T.tailLift = 0.4; T.wag = 0.2;
        want = 0.06;
        if (st.t > st.dur) resume();
        break;
      }
      case 'stretch': {
        const k = st.t / st.dur;
        const s = sstep(0.05, 0.3, k) * (1 - sstep(0.75, 0.95, k));
        T.reach = s; T.pitch = 0.42 * s; T.bodyH = lerp(0.225, 0.205, s);
        T.tailLift = 0.35 + 0.9 * s; T.tailHook = 0.4 * s; T.wag = 0.04;
        T.headPitch = -0.25 * s; T.lid = 0.7 * s; T.earBack = 0.4 * s;
        T.mouth = k > 0.45 && k < 0.75 ? 1 : 0;
        if (st.t > st.dur) resume();
        break;
      }
      case 'yawn': {
        const k = st.t / st.dur;
        const s = sstep(0.1, 0.35, k) * (1 - sstep(0.7, 0.92, k));
        T.mouth = s * 1.15; T.lid = 0.85 * s; T.headPitch = -0.35 * s; T.earBack = 0.5 * s;
        T.tongue = s > 0.6 ? 0.4 : 0;
        if (st.t > st.dur) resume();
        break;
      }
      case 'notice': {
        T.earUp = 1; T.pupil = 0.75; T.tailLift = 1.3; T.tailHook = 1; T.wag = 0.05; T.wagF = 2.5;
        lookAtPlayer(T, 1);
        if (st.t > st.dur) {
          noticeCooldown = 22 + rand() * 15;
          if (near && rand() < 0.45 + cat.mood * 0.4) go('approach', 8);
          else resume();
        }
        break;
      }
      case 'approach': {
        T.earUp = 0.8; T.tailLift = 1.35; T.tailHook = 1; T.wag = 0.08; T.wagF = 3;
        if (!lastPlayer) { resume(); break; }
        const r = steer(pp.x, pp.z, 0.85, dt, 0.42, 4);
        want = r.want;
        lookAtPlayer(T, 0.6);
        if (r.dist < 0.45) { go('rub', 4.5, { a: Math.atan2(p.x - pp.x, p.z - pp.z), dir: rand() < 0.5 ? 1 : -1 }); sound('purr', { volume: 0.6 }); }
        else if (st.t > st.dur || dist > 5) resume();
        break;
      }
      case 'rub': {
        // circle around the player's legs, leaning in, tail up and quivering
        if (!lastPlayer) { resume(); break; }
        st.d.a += st.d.dir * dt * 1.1;
        const rr = 0.3;
        const tx = pp.x + Math.sin(st.d.a) * rr, tz = pp.z + Math.cos(st.d.a) * rr;
        const r = steer(tx, tz, 0.4, dt, 0.03, 6);
        want = Math.max(0.12, r.want);
        T.roll = st.d.dir * 0.22; T.headRoll = st.d.dir * 0.35; T.headYaw = st.d.dir * 0.35; T.headPitch = -0.1;
        T.lid = 0.75; T.happy = 1; T.tailLift = 1.35; T.tailHook = 1.1; T.wag = 0.12; T.wagF = 6;
        heartT -= dt; if (heartT < 0) { spawnHeart(); heartT = 0.9; }
        if (st.t > st.dur) { noticeCooldown = 25; addMood(0.05); resume(); }
        break;
      }
      case 'petted':
      case 'loaf-pet': {
        const loafing = st.name === 'loaf-pet';
        if (loafing) { T.loaf = 1; T.bodyH = 0.085; T.headPitch = 0.05; }
        T.lid = 1; T.happy = 1; T.pupil = 0.8;
        // in step with the player's pat (anims.js 'pat'): head ducks + ears flatten when the hand lands, pushes up after it
        const ph = (st.t * PAT.rate) % 1;
        const lift = ph < 0.6 ? sstep(0, 0.6, ph) : 1 - sstep(0.6, 1, ph);
        const hand = st.t > 0.2 && st.t < EMOTES.pat - 0.3 ? 1 - lift : 0;
        T.headPitch = (loafing ? 0.05 : -0.42 + hand * 0.5) + (hand ? 0 : Math.sin(st.t * 3.2) * 0.08);
        T.headRoll = Math.sin(st.t * 2.4) * (hand ? 0.12 : 0.28);
        T.bodyH -= hand * 0.012;
        T.roll = loafing ? 0 : Math.sin(st.t * 2.4) * 0.07;
        T.earBack = 0.25 + hand * 0.6; T.tailLift = loafing ? -0.3 : 1.3; T.tailHook = loafing ? 0 : 1; T.tailSide = loafing ? 0.3 : 0;
        T.wag = 0.15; T.wagF = 5;
        if (!loafing && !hand) lookAtPlayer(T, 0.3);
        heartT -= dt; if (heartT < 0) { spawnHeart(); heartT = 0.45; }
        purrT += dt; if (purrT > 2.2) { purrT = 0; sound('purr', { volume: 0.8 }); }
        if (st.t > st.dur) { if (loafing) go('loaf', 8 + rand() * 8); else resume(); }
        break;
      }
      case 'eat': {
        const k = st.t;
        if (st.d.from) {
          // set down from the player's hands: short glide onto the floor in front of the face
          const g = sstep(0, 0.22, k);
          bowl.position.lerpVectors(st.d.from, st.d.to, g);
          bowl.position.y = lerp(st.d.from.y, st.d.to.y, g);
        } else bowl.scale.setScalar(Math.min(1, k * 4));
        if (k < 3.0) {
          // eating: head down into the bowl with little chomping bobs
          T.headPitch = 0.85 + Math.abs(Math.sin(k * 7)) * 0.12; T.bodyH = 0.215; T.pitch = 0.1;
          T.mouth = Math.sin(k * 14) > 0 ? 0.4 : 0; T.lid = 0.4;
          T.tailLift = 0.6; T.tailHook = 0.4; T.wag = 0.15;
          bowl.userData.food.scale.set(1, Math.max(0.05, 1 - k / 3.0), 1);
        } else {
          // done: lick lips
          bowl.userData.food.visible = false;
          T.headPitch = -0.1; T.tongue = Math.sin(k * 9) > -0.2 ? 1 : 0; T.mouth = 0.2; T.lid = 0.6; T.happy = 1;
          T.tailLift = 1.3; T.tailHook = 1;
          if (!st.d.hearted) { st.d.hearted = true; spawnHeart(3); sound('meow', { pitch: 1.2 }); }
        }
        if (k > st.dur - 0.6) bowl.scale.setScalar(Math.max(0.01, (st.dur - k) / 0.6));
        if (k > st.dur) { bowl.visible = false; resume(); }
        break;
      }
      case 'play': {
        const D = st.d;
        D.pt += dt;
        const tp = toy.position;
        T.earUp = 0.6; T.pupil = 1; T.tailHook = 0;
        if (D.phase === 'crouch') {
          const r = steer(tp.x, tp.z, 0.0, dt, 0.01, 5);
          void r;
          T.crouch = 1; T.bodyH = 0.16; T.pitch = 0.1; T.headPitch = 0.25; T.tailLift = 0.05; T.wag = 0.35; T.wagF = 7;
          T.sway = Math.sin(D.pt * 16) * 0.5; // butt wiggle
          if (D.pt > 1.1) {
            D.phase = 'jump'; D.pt = 0;
            D.from.copy(root.position);
            const dd = Math.hypot(tp.x - root.position.x, tp.z - root.position.z);
            const k = Math.max(0, dd - 0.17) / Math.max(dd, 1e-3);
            D.to.set(root.position.x + (tp.x - root.position.x) * k, 0, root.position.z + (tp.z - root.position.z) * k);
          }
        } else if (D.phase === 'jump') {
          const k = Math.min(1, D.pt / 0.42);
          root.position.x = lerp(D.from.x, D.to.x, k);
          root.position.z = lerp(D.from.z, D.to.z, k);
          D.hop = Math.sin(Math.PI * k) * 0.13;
          T.pitch = lerp(-0.35, 0.3, k); T.reach = 0.7; T.tailLift = 0.6; T.earUp = 1; T.headPitch = 0.1;
          if (k >= 1) { D.phase = 'bat'; D.pt = 0; D.hop = 0; }
        } else if (D.phase === 'bat') {
          T.paw = D.pt < 0.5 ? 1 : 0; T.headPitch = 0.45; T.crouch = 0.5; T.bodyH = 0.2;
          if (D.pt > 0.35 && !D.kicked) {
            D.kicked = true;
            const a = root.rotation.y + (rand() - 0.5) * 2.2;
            D.toyFrom = toy.position.clone();
            D.toyTo = new THREE.Vector3(tp.x + Math.sin(a) * 0.5, 0, tp.z + Math.cos(a) * 0.5);
            if (collision) { D.toyTo.y = 0.3; collision.resolve(D.toyTo, 0.08); }
            D.toyT = 0;
          }
          if (D.pt > 0.9) {
            D.pounces++; D.kicked = false;
            if (D.pounces >= 2) { D.phase = 'proud'; D.pt = 0; spawnHeart(2); sound('meow', { pitch: 1.3 }); }
            else { D.phase = 'crouch'; D.pt = 0; }
          }
        } else if (D.phase === 'proud') {
          T.sit = 1; T.bodyH = 0.06; T.pitch = -0.95; T.happy = 1; T.lid = D.pt > 0.4 && D.pt < 1.6 ? 1 : 0;
          T.tailLift = -0.2; T.tailSide = 0.25;
          if (D.pt > 1.4) { toy.visible = false; if (cat.held) go('come'); else resume(); }
        }
        if (D.toyFrom) {
          D.toyT += dt;
          const k = Math.min(1, D.toyT / 0.55);
          const e = 1 - (1 - k) * (1 - k);
          tp.x = lerp(D.toyFrom.x, D.toyTo.x, e); tp.z = lerp(D.toyFrom.z, D.toyTo.z, e);
          tp.y = gy(tp.x, tp.z) + Math.abs(Math.sin(k * Math.PI * 2)) * 0.06 * (1 - k);
          toy.userData.ball.rotation.x += dt * 14 * (1 - k);
          if (k >= 1) D.toyFrom = null;
        }
        if (st.t > 14) { toy.visible = false; resume(); }
        break;
      }
      case 'spin': {
        // chase own tail: spin in place
        root.rotation.y += st.d.dir * dt * 7.5 * sstep(0, 0.4, st.t) * (1 - sstep(2.4, 3, st.t));
        want = 0.0; st.d.fake = 0.5;
        T.headYaw = -st.d.dir * 1.0; T.headPitch = 0.2; T.tailSide = st.d.dir * 0.22; T.tailLift = 0.2; T.pupil = 1; T.earUp = 0.6;
        T.roll = -st.d.dir * 0.12;
        if (st.t > st.dur) { go('sit', 2.0); T.lid = 0.5; spawnHeart(1); }
        break;
      }
      case 'come': {
        // trot back to sit in front of the player after playing (only while held by an interaction)
        if (!lastPlayer) { go('sit', 0); break; }
        const keep = 0.62;
        const k = Math.max(0, dist - keep) / Math.max(dist, 1e-3);
        const r = steer(p.x + (pp.x - p.x) * k, p.z + (pp.z - p.z) * k, 0.75, dt, 0.06, 5);
        want = r.want;
        T.tailLift = 1.1; T.tailHook = 0.8; T.earUp = 0.5;
        lookAtPlayer(T, 0.4);
        if (r.dist < 0.08 || st.t > 6) go('sit', 0);
        break;
      }
      case 'follow': {
        if (!lastPlayer) { T.sit = 1; break; }
        const keep = 1.2;
        if (dist > keep + 0.35) {
          // aim for a point 1.2 m short of the player along the line from the cat
          const k = (dist - keep) / dist;
          const tx = p.x + (pp.x - p.x) * k, tz = p.z + (pp.z - p.z) * k;
          const sp = dist > 3 ? 1.6 : dist > 2 ? 0.95 : 0.5;
          const r = steer(tx, tz, sp, dt, 0.08, 4.5);
          want = r.want;
          st.d.sitT = 0;
          T.tailLift = 0.9; T.tailHook = 0.7; T.earUp = 0.4;
          lookAtPlayer(T, 0.35);
        } else {
          // close enough: face the player, sit when they stop
          const yawTo = Math.atan2(pp.x - p.x, pp.z - p.z);
          root.rotation.y = dampAngle(root.rotation.y, yawTo, 2.5, dt);
          st.d.sitT = (st.d.sitT || 0) + (playerStill > 0.6 ? dt : -dt);
          st.d.sitT = clamp(st.d.sitT, 0, 1);
          if (st.d.sitT > 0.3) { T.sit = 1; T.bodyH = 0.06; T.pitch = -0.95; T.tailLift = -0.25; T.tailSide = 0.2; }
          else { T.tailLift = 1.1; T.tailHook = 0.8; }
          lookAtPlayer(T, 1);
          if (cat.mood > 0.5 && st.t % 6 < 0.8) { T.lid = 0.6; T.happy = 0.7; }
        }
        break;
      }
      case 'goHome': {
        const r = steer(homeP.x, homeP.z, 0.34, dt, 0.15, 2.5);
        want = r.want;
        T.tailLift = 0.25; T.wag = 0.08; T.headPitch = 0.15; T.lid = 0.25;
        if (r.dist < 0.2) go('loaf', 25 + rand() * 15);
        break;
      }
      case 'loaf': {
        T.loaf = 1; T.bodyH = 0.085; T.pitch = 0; T.headPitch = 0.12; T.headYaw = 0.1;
        T.lid = st.t > 1.2 ? 1 : 0.6; T.happy = 0; T.earBack = 0.15;
        T.tailLift = -0.3; T.tailSide = 0.32; T.wag = 0.02; T.wagF = 0.5;
        tired = Math.max(0, tired - dt / 25);
        if (near && st.t > 3 && rand() < dt * 0.15) { T.lid = 0.4; lookAtPlayer(T, 0.5); }
        if (st.t > st.dur) { tired = 0; go('yawn', 2.6); }
        break;
      }
      default: resume();
    }
    return want;
  }

  // ---- leg IK (root space). bend +1: joint points backward (front elbow), -1: forward (hind knee)
  function solve(L, j, tgt, A, B, len1, len2) {
    d.subVectors(tgt, j);
    let dist = d.length();
    dist = clamp(dist, Math.abs(len1 - len2) + 1e-3, len1 + len2 - 1e-4);
    d.normalize();
    const cosA = clamp((len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist), -1, 1);
    q.setFromAxisAngle(X, L.bend * Math.acos(cosA));
    u.copy(d).applyQuaternion(q);
    knee.copy(j).addScaledVector(u, len1);
    A.position.copy(j); A.quaternion.setFromUnitVectors(DOWN, u);
    tmp2.subVectors(tgt, knee).normalize();
    B.position.copy(knee); B.quaternion.setFromUnitVectors(DOWN, tmp2);
    return tmp2;
  }

  function applyPose(dt, time, moveSpeed, hop) {
    // body
    const sitK = P.sit, loafK = P.loaf;
    const walkBob = moveSpeed > 0.02 ? Math.abs(Math.sin(gait * TAU)) * 0.008 * Math.min(1, moveSpeed * 3) : 0;
    const breathe = Math.sin(time * (loafK > 0.5 ? 1.6 : 2.4)) * 0.0025;
    body.position.set(Math.sin(gait * TAU) * 0.004 * Math.min(1, moveSpeed * 3), P.bodyH + walkBob + breathe + hop, S.stand.hipZ);
    body.rotation.set(P.pitch, P.sway * 0.12, P.roll + Math.sin(gait * TAU) * 0.03 * Math.min(1, moveSpeed * 3) + P.sway * 0.08, 'YXZ');
    body.scale.set(1 + breathe * 2, 1 + breathe * 3, 1);
    body.updateMatrix();
    // the spine shortens a little when sitting (keeps the front legs planted under an upright chest)
    const spine = 1 - 0.22 * P.sit;
    torsoG.scale.z = spine;
    neck.position.z = S.neck[2] * spine;

    // neck/head (counter the body pitch so the head stays level)
    neck.rotation.set(-P.pitch * 0.85 + P.headPitch * 0.35, P.headYaw * 0.3, 0);
    head.rotation.set(P.headPitch * 0.65, P.headYaw * 0.7, P.headRoll);

    // feet targets
    const stride = moveSpeed > 0.01;
    const duty = 0.62;
    const distPerCycle = Math.max(0.12, Math.min(0.32, 0.12 + moveSpeed * 0.2));
    for (const L of legs) {
      const front = L.kind === 'front';
      const base = front ? S.pawFront : S.pawHind;
      let fx = L.sx * base[0], fz = base[1], fy = 0;
      if (front) {
        fz = lerp(fz, 0.008, sitK); fx = lerp(fx, L.sx * 0.042, sitK);
        fz = lerp(fz, 0.19, loafK); fy = lerp(fy, 0.014, loafK);
        fz += P.reach * 0.17;
        fz += P.crouch * 0.03;
        if (L.side === 1) fz += P.frontPawZ;
      } else {
        fz = lerp(fz, -0.068, sitK); fx = lerp(fx, L.sx * 0.08, sitK);
        fz = lerp(fz, -0.08, loafK); fy = lerp(fy, 0.012, loafK);
        fz -= P.crouch * 0.02;
      }
      if (stride) {
        const ph = (gait + L.phaseOff) % 1;
        const strideLen = distPerCycle * duty;
        if (ph < duty) fz += strideLen * (0.5 - ph / duty);
        else {
          const s = (ph - duty) / (1 - duty);
          const e = s * s * (3 - 2 * s);
          fz += strideLen * (-0.5 + e);
          fy += Math.sin(Math.PI * s) * (0.03 + moveSpeed * 0.02);
        }
      }
      target.set(fx, fy + 0.016, fz);
      // grooming / batting paw (character's right front = side 1)
      if (front && L.side === 1 && P.paw > 0.001) {
        if (st.name === 'play') tmp.set(-0.03, 0.06, 0.32);
        else tmp.set(-0.015, 0.265, 0.085);
        target.lerp(tmp, P.paw);
      }
      L.foot.copy(target);
      if (front) {
        joint.copy(anchors.sh[L.side]); joint.z *= spine; joint.applyMatrix4(body.matrix);
        solve(L, joint, target, L.upper, L.lower, L.L1, L.L2);
        L.paw.position.copy(target);
        L.paw.rotation.set(P.paw > 0.3 && L.side === 1 ? -1.2 * P.paw : 0, 0, 0);
      } else {
        joint.copy(anchors.hp[L.side]).applyMatrix4(body.matrix);
        // hock sits behind+above the paw; flatter when sitting / loafing
        const fold = Math.max(sitK, loafK);
        hock.set(target.x, target.y + lerp(0.052, 0.012, fold), target.z + lerp(-0.026, -0.062, fold));
        solve(L, joint, hock, L.upper, L.lower, L.L1, L.L2);
        tmp.subVectors(target, hock).normalize();
        L.meta.position.copy(hock); L.meta.quaternion.setFromUnitVectors(DOWN, tmp);
        L.paw.position.copy(target);
        L.paw.rotation.set(0, 0, 0);
      }
    }

    // tail
    const n = tail.length;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const g = tail[i];
      const wave = Math.sin(time * P.wagF * TAU * 0.5 - i * 0.55) * P.wag * (0.3 + k);
      const hookW = sstep(0.45, 1, k);
      let rx = (i === 0 ? P.tailLift : 0) + P.tailCurl * (0.3 + k) + P.tailHook * hookW * 0.32;
      if (i === 0) rx += -P.pitch; // keep the tail's base angle independent of body pitch
      g.rotation.set(rx, P.tailSide * (0.4 + k) + wave, 0);
    }

    // ears
    for (const e of ears) {
      const sx = e.userData.sx;
      const tw = Math.sin(time * 1.3 + sx) * 0.02;
      e.rotation.set(-0.12 - P.earUp * 0.12 + P.earBack * 0.45, sx * (0.22 - P.earUp * 0.1 + P.earBack * 0.5), -sx * (0.32 - P.earUp * 0.12 + P.earBack * 0.35) + tw);
    }

    // eyes
    const lid = Math.max(P.lid, blink);
    for (const e of eyes) {
      const U = e.material.uniforms;
      U.uLid.value = lid; U.uHappy.value = P.happy; U.uPupil.value = P.pupil;
      U.uGlow.value = 1.0 + 0.12 * Math.sin(time * 1.7);
      U.uLook.value.set(clamp(P.headYaw * 0.1, -0.15, 0.15), clamp(-P.headPitch * 0.06, -0.1, 0.1));
    }
    mouthOpen.scale.y = Math.max(0.01, P.mouth);
    mouthOpen.visible = P.mouth > 0.04;
    mouthOpen.position.z = 0.083;
    tongue.visible = P.tongue > 0.05;
    tongue.position.set(0, -0.05 - P.mouth * 0.006, 0.079 + P.tongue * 0.016);
  }

  function update(dt, time, playerPos) {
    dt = Math.min(dt || 0, 0.1);
    time = time ?? 0;
    if (!props.parent && root.parent) root.parent.add(props);
    // player tracking
    if (playerPos) {
      if (lastPlayer) {
        const v = Math.hypot(playerPos.x - pp.x, playerPos.z - pp.z) / Math.max(dt, 1e-3);
        playerSpeed = damp(playerSpeed, v, 8, dt);
      }
      pp.copy(playerPos);
      lastPlayer = pp;
      playerStill = playerSpeed < 0.15 ? playerStill + dt : 0;
    }
    cat.mood = clamp(cat.mood - dt * 0.004, 0.15, 1);
    if (!['loaf', 'loaf-pet', 'goHome'].includes(st.name)) tired += dt / 140;

    let want = think(dt, time);
    // held by an interaction: keep facing the player while sitting, being petted or eating
    if (cat.held && lastPlayer && (st.name === 'petted' || st.name === 'eat' || st.name === 'sit')) {
      const p = root.position;
      root.rotation.y = dampAngle(root.rotation.y, Math.atan2(pp.x - p.x, pp.z - p.z), st.name === 'eat' ? 1.5 : 6, dt);
    }

    // locomotion
    speed = damp(speed, want, want > speed ? 3 : 6, dt);
    if (speed > 0.005) {
      const yaw = root.rotation.y;
      root.position.x += Math.sin(yaw) * speed * dt;
      root.position.z += Math.cos(yaw) * speed * dt;
      if (collision && st.name !== 'walk') { tmp.copy(root.position); tmp.y = root.position.y + 0.05; collision.resolve(tmp, 0.2, tmp.y); root.position.x = tmp.x; root.position.z = tmp.z; }
    }
    const gaitSpeed = Math.max(speed, st.d.fake || 0);
    const distPerCycle = Math.max(0.12, Math.min(0.32, 0.12 + gaitSpeed * 0.2));
    if (gaitSpeed > 0.01) gait = (gait + dt * gaitSpeed / distPerCycle) % 1;
    root.position.y = gy(root.position.x, root.position.z);

    // blinks
    blinkT -= dt;
    if (blinkT < 0) { blink = 1; blinkT = 2.5 + rand() * 4; }
    blink = Math.max(0, blink - dt * 7);

    // meows now and then (more when happy)
    nextMeow -= dt * (0.6 + cat.mood);
    if (nextMeow < 0) {
      nextMeow = 25 + rand() * 40;
      if (!['loaf', 'eat', 'loaf-pet'].includes(st.name)) { sound('meow', { pitch: 0.95 + rand() * 0.3, volume: 0.7 }); T.mouth = 0.7; P.mouth = 0.7; }
    }

    // damp the pose
    const quick = st.name === 'petted';   // follow the pat rhythm without lag
    for (const k in P) P[k] = damp(P[k], T[k], quick && (k === 'headPitch' || k === 'bodyH' || k === 'earBack') ? 18 : RATE[k] || 6, dt);
    applyPose(dt, time, gaitSpeed, st.name === 'play' ? (st.d.hop || 0) : 0);
    hearts.update(dt);
  }

  function dispose() {
    root.removeFromParent();
    props.removeFromParent();
    hearts.dispose();
    disposePet(root);
    disposePet(bowl);
    disposePet(toy);
  }

  // settle the first pose
  applyPose(0, 0, 0, 0);
  return cat;
}

function sstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function countTris(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh && o.visible) { const g = o.geometry; n += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } });
  return n;
}
