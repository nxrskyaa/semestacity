// Procedural, articulated toon mecha for the holo battle.
//   'ray'  — RAY MK-III : white/blue/red heroic gundam-ish, gold V-fin, chest vents, rifle + shield.
//   'fang' — BLAZE FANG : orange/black hunched beast, horns, claws, wrist cannon, tail.
// Robot faces +Z, feet at y=0, ~1.1 m tall. animate(dt,time,state) drives a procedural pose
// (idle/run/air/dash/shoot/throw/stagger/down/getup/victory) blended with exponential damping.
import * as THREE from 'three';
import { toonMat, addOutline } from '../gfx/toon.js';
import { damp, clamp } from '../core/util.js';

export const ROBOT_INFO = {
  ray: { label: 'RAY MK-III', bullet: new THREE.Color(0.35, 2.6, 4.2), thrust: new THREE.Color(0.5, 1.8, 4.0), accent: '#5ee7ff' },
  fang: { label: 'BLAZE FANG', bullet: new THREE.Color(4.2, 1.2, 0.25), thrust: new THREE.Color(4.0, 1.3, 0.3), accent: '#ff8a3d' },
};

const JOINTS = ['body', 'waist', 'chest', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR', 't0', 't1', 't2', 't3'];

export function createRobot(kind = 'ray') {
  const info = ROBOT_INFO[kind] || ROBOT_INFO.ray;
  const root = new THREE.Group();
  root.name = `robot-${kind}`;
  const geos = [];
  const matCache = new Map();
  const bodyMats = [];   // toon mats (flash / blink)
  const allMats = [];    // everything that gets clipped while materializing
  const meshes = [];     // solid meshes (for ghost + shadows)
  const outlines = [];

  const mat = (color) => {
    if (matCache.has(color)) return matCache.get(color);
    const m = toonMat(color, { unique: true });
    m.userData.baseEm = new THREE.Color(color).multiplyScalar(0.13);
    matCache.set(color, m); bodyMats.push(m); allMats.push(m);
    return m;
  };
  const glow = (r, g, b, opts = {}) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), fog: false, ...opts });
    allMats.push(m);
    return m;
  };
  const G = (g) => { geos.push(g); return g; };
  const box = (w, h, d) => G(new THREE.BoxGeometry(w, h, d));
  const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const part = (parent, geo, m, x, y, z, { rx = 0, ry = 0, rz = 0, outline = 0.011 } = {}) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    if (outline && m.isMeshToonMaterial) outlines.push(addOutline(mesh, outline));
    return mesh;
  };

  const J = {};
  const body = grp(root);            // whole-body tilt (knockdown) — pivot at hips height handled via hips
  J.body = body;
  const hips = grp(body, 0, 0.52, 0);
  J.hips = hips;
  const waist = grp(hips, 0, 0.05, 0); J.waist = waist;
  const chest = grp(waist, 0, 0.07, 0); J.chest = chest;
  const head = grp(chest, 0, 0.2, 0); J.head = head;
  const shL = grp(chest, 0.19, 0.15, 0), shR = grp(chest, -0.19, 0.15, 0);
  J.shL = shL; J.shR = shR;
  const elL = grp(shL, 0, -0.17, 0), elR = grp(shR, 0, -0.17, 0);
  J.elL = elL; J.elR = elR;
  const hipL = grp(hips, 0.075, -0.03, 0), hipR = grp(hips, -0.075, -0.03, 0);
  J.hipL = hipL; J.hipR = hipR;
  const knL = grp(hipL, 0, -0.2, 0), knR = grp(hipR, 0, -0.2, 0);
  J.knL = knL; J.knR = knR;
  const anL = grp(knL, 0, -0.22, 0), anR = grp(knR, 0, -0.22, 0);
  J.anL = anL; J.anR = anR;

  const muzzle = new THREE.Object3D();
  const bombPort = new THREE.Object3D();
  const podPort = new THREE.Object3D();
  const center = grp(chest, 0, 0.08, 0);
  const thrusters = [];   // { flame, core }
  const eyes = [];
  const tail = [];
  let base = {};          // per-kind base pose offsets
  let flameMat, coreMat;

  const addThruster = (parent, x, y, z, rx, scale = 1) => {
    const n = grp(parent, x, y, z);
    n.rotation.x = rx;
    part(n, G(new THREE.CylinderGeometry(0.028 * scale, 0.04 * scale, 0.06 * scale, 8)), mat(0x3b3f4a), 0, -0.02 * scale, 0, { outline: 0.005 });
    // cone flipped so the tip points down (-Y) with its base at the nozzle exit
    const fg = G(new THREE.ConeGeometry(0.036 * scale, 0.26 * scale, 8, 1, true));
    fg.rotateX(Math.PI); fg.translate(0, -0.13 * scale, 0);
    const flame = new THREE.Mesh(fg, flameMat);
    flame.position.y = -0.05 * scale;
    flame.scale.setScalar(0.001);
    n.add(flame);
    const cg = G(new THREE.ConeGeometry(0.018 * scale, 0.14 * scale, 6, 1, true));
    cg.rotateX(Math.PI); cg.translate(0, -0.07 * scale, 0);
    const core = new THREE.Mesh(cg, coreMat);
    core.position.y = -0.05 * scale;
    core.scale.setScalar(0.001);
    n.add(core);
    thrusters.push({ node: n, flame, core });
  };

  flameMat = new THREE.MeshBasicMaterial({ color: info.thrust.clone(), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  allMats.push(flameMat, coreMat);

  if (kind === 'fang') buildFang(); else buildRay();

  // ---------------------------------------------------------------- RAY
  function buildRay() {
    const W = 0xf2f4f8, B = 0x2457d6, R = 0xd8303a, Y = 0xf3c53a, Gr = 0x59606e, D = 0x2d313b;
    // pelvis + skirt
    part(hips, box(0.2, 0.08, 0.13), mat(Gr), 0, 0, 0);
    part(hips, box(0.07, 0.065, 0.035), mat(R), 0, -0.01, 0.07);
    part(hips, box(0.075, 0.1, 0.02), mat(W), 0.055, -0.06, 0.075, { rx: -0.18 });
    part(hips, box(0.075, 0.1, 0.02), mat(W), -0.055, -0.06, 0.075, { rx: -0.18 });
    part(hips, box(0.02, 0.11, 0.1), mat(W), 0.115, -0.04, 0, { rz: 0.12 });
    part(hips, box(0.02, 0.11, 0.1), mat(W), -0.115, -0.04, 0, { rz: -0.12 });
    part(hips, box(0.14, 0.08, 0.02), mat(W), 0, -0.04, -0.07, { rx: 0.2 });
    // abdomen
    part(waist, box(0.13, 0.08, 0.1), mat(Gr), 0, 0.03, 0);
    part(waist, box(0.1, 0.05, 0.03), mat(R), 0, 0.04, 0.05);
    // chest
    part(chest, box(0.28, 0.16, 0.19), mat(B), 0, 0.09, 0);
    part(chest, box(0.2, 0.05, 0.17), mat(W), 0, 0.19, -0.005);
    part(chest, box(0.06, 0.06, 0.02), mat(R), 0, 0.065, 0.1);
    // vents (glowing yellow slats)
    const ventMat = mat(0x6b5310);
    for (const sx of [1, -1]) {
      part(chest, box(0.075, 0.05, 0.02), mat(Y), sx * 0.08, 0.125, 0.096, { rz: sx * -0.12 });
      for (let i = 0; i < 3; i++) part(chest, box(0.06, 0.006, 0.006), ventMat, sx * 0.08, 0.11 + i * 0.014, 0.107, { outline: 0, rz: sx * -0.12 });
    }
    // backpack + thrusters + saber hilts
    part(chest, box(0.18, 0.15, 0.08), mat(W), 0, 0.1, -0.13);
    part(chest, box(0.12, 0.05, 0.04), mat(Gr), 0, 0.16, -0.18);
    part(chest, G(new THREE.CylinderGeometry(0.013, 0.013, 0.09, 6)), mat(W), 0.05, 0.22, -0.15, { rz: 0.3 });
    part(chest, G(new THREE.CylinderGeometry(0.013, 0.013, 0.09, 6)), mat(W), -0.05, 0.22, -0.15, { rz: -0.3 });
    addThruster(chest, 0.055, 0.035, -0.17, 0.55);
    addThruster(chest, -0.055, 0.035, -0.17, 0.55);
    bombPort.position.set(0.09, 0.24, -0.08); chest.add(bombPort);
    podPort.position.set(0, 0.17, -0.2); chest.add(podPort);
    // head
    head.scale.setScalar(1.28);
    head.position.y = 0.19;
    part(head, box(0.1, 0.1, 0.11), mat(W), 0, 0.06, 0);
    part(head, box(0.065, 0.045, 0.02), mat(Gr), 0, 0.045, 0.058);
    part(head, box(0.03, 0.02, 0.02), mat(R), 0, 0.02, 0.064);
    const eyeMat = glow(0.8, 3.6, 2.6);
    eyes.push(part(head, box(0.072, 0.016, 0.012), eyeMat, 0, 0.074, 0.066, { outline: 0 }));
    part(head, box(0.022, 0.03, 0.02), mat(R), 0, 0.112, 0.06);
    part(head, box(0.11, 0.014, 0.012), mat(Y), 0.048, 0.135, 0.06, { rz: 0.62 });
    part(head, box(0.11, 0.014, 0.012), mat(Y), -0.048, 0.135, 0.06, { rz: -0.62 });
    part(head, box(0.02, 0.045, 0.05), mat(W), 0.058, 0.05, 0);
    part(head, box(0.02, 0.045, 0.05), mat(W), -0.058, 0.05, 0);
    part(head, box(0.05, 0.02, 0.08), mat(W), 0, 0.115, -0.015);
    // arms
    for (const [sh, el, sx] of [[shL, elL, 1], [shR, elR, -1]]) {
      part(sh, box(0.12, 0.11, 0.13), mat(W), sx * 0.025, 0.005, 0);
      part(sh, box(0.125, 0.03, 0.135), mat(B), sx * 0.025, -0.045, 0);
      part(sh, box(0.065, 0.13, 0.07), mat(Gr), 0, -0.1, 0);
      part(el, box(0.085, 0.15, 0.09), mat(W), 0, -0.07, 0);
      part(el, box(0.088, 0.03, 0.093), mat(R), 0, -0.13, 0);
      part(el, box(0.055, 0.05, 0.06), mat(D), 0, -0.165, 0);
    }
    // rifle on the right forearm (barrel along the forearm axis)
    const gun = grp(elR, 0, -0.17, 0.035);
    part(gun, box(0.045, 0.22, 0.06), mat(D), 0, -0.06, 0.02);
    part(gun, box(0.03, 0.07, 0.04), mat(Gr), 0, 0.02, 0.06);
    part(gun, G(new THREE.CylinderGeometry(0.012, 0.014, 0.14, 8)), mat(Gr), 0, -0.23, 0.025);
    part(gun, box(0.02, 0.05, 0.03), mat(Y), 0, -0.05, 0.06, { outline: 0.004 });
    muzzle.position.set(0, -0.31, 0.025); gun.add(muzzle);
    // shield on the left forearm (outer side)
    const sh = grp(elL, 0.07, -0.08, 0.02);
    part(sh, box(0.022, 0.26, 0.15), mat(R), 0, 0, 0);
    part(sh, box(0.025, 0.24, 0.022), mat(Y), 0.002, 0, 0, { outline: 0.004 });
    part(sh, box(0.025, 0.022, 0.13), mat(Y), 0.002, 0.04, 0, { outline: 0.004 });
    part(sh, box(0.018, 0.27, 0.16), mat(W), -0.006, 0.0, 0);
    // legs
    for (const [hp, kn, an] of [[hipL, knL, anL], [hipR, knR, anR]]) {
      part(hp, box(0.085, 0.19, 0.1), mat(W), 0, -0.1, 0);
      part(kn, box(0.1, 0.22, 0.12), mat(W), 0, -0.1, 0);
      part(kn, box(0.075, 0.07, 0.035), mat(B), 0, -0.005, 0.065);
      part(kn, box(0.07, 0.1, 0.03), mat(B), 0, -0.12, -0.065);
      part(an, box(0.09, 0.05, 0.15), mat(B), 0, -0.02, 0.025);
      part(an, box(0.105, 0.03, 0.2), mat(R), 0, -0.05, 0.03);
    }
    base = { waist: 0.04, head: 0, knee: 0.12, hip: -0.06, ankle: -0.05, sh: -0.2, el: -0.35, hunch: 0 };
  }

  // --------------------------------------------------------------- FANG
  function buildFang() {
    const O = 0xff7a1a, K = 0x1d1d24, Gr = 0x40414c, S = 0xc9ccd6, Y = 0xffc23a;
    const eyeMat = glow(4.5, 0.5, 0.25);
    const ivory = mat(0xece4d2);
    // pelvis
    part(hips, box(0.22, 0.09, 0.15), mat(K), 0, 0, 0);
    part(hips, box(0.06, 0.12, 0.13), mat(O), 0.12, -0.03, 0, { rz: 0.2 });
    part(hips, box(0.06, 0.12, 0.13), mat(O), -0.12, -0.03, 0, { rz: -0.2 });
    part(hips, box(0.09, 0.07, 0.03), mat(O), 0, -0.03, 0.08, { rx: -0.2 });
    // abdomen
    part(waist, box(0.15, 0.08, 0.11), mat(Gr), 0, 0.03, 0);
    // chest (hunched forward by base pose)
    part(chest, box(0.32, 0.18, 0.22), mat(O), 0, 0.09, 0);
    part(chest, box(0.2, 0.09, 0.03), mat(K), 0, 0.06, 0.11);
    for (let i = 0; i < 4; i++) {
      part(chest, G(new THREE.ConeGeometry(0.012, 0.04, 4)), ivory, -0.06 + i * 0.04, 0.09, 0.125, { rx: Math.PI, outline: 0.003 });
    }
    part(chest, box(0.24, 0.05, 0.2), mat(K), 0, 0.19, -0.01);
    // back: dorsal spikes + thrusters
    part(chest, box(0.2, 0.14, 0.08), mat(K), 0, 0.1, -0.14);
    for (let i = 0; i < 3; i++) {
      part(chest, G(new THREE.ConeGeometry(0.025, 0.1 - i * 0.015, 4)), mat(O), 0, 0.21 - i * 0.05, -0.17 - i * 0.012, { rx: -0.9, outline: 0.004 });
    }
    addThruster(chest, 0.065, 0.04, -0.18, 0.6, 1.1);
    addThruster(chest, -0.065, 0.04, -0.18, 0.6, 1.1);
    bombPort.position.set(-0.1, 0.24, -0.06); chest.add(bombPort);
    podPort.position.set(0, 0.16, -0.2); chest.add(podPort);
    // head: black skull, orange snout + brow, glowing eyes, swept horns
    head.position.set(0, 0.2, 0.13);
    head.scale.setScalar(1.22);
    part(head, box(0.13, 0.075, 0.15), mat(K), 0, 0.05, 0.0);
    part(head, box(0.14, 0.03, 0.085), mat(O), 0, 0.092, 0.045, { rx: 0.28 });
    part(head, box(0.095, 0.038, 0.09), mat(O), 0, 0.03, 0.1);
    part(head, box(0.085, 0.022, 0.085), mat(K), 0, -0.004, 0.085, { rx: 0.12 });
    for (let i = 0; i < 3; i++) part(head, G(new THREE.ConeGeometry(0.009, 0.028, 4)), ivory, -0.028 + i * 0.028, 0.008, 0.142, { rx: Math.PI, outline: 0 });
    for (const sx of [1, -1]) {
      eyes.push(part(head, box(0.042, 0.016, 0.01), eyeMat, sx * 0.034, 0.066, 0.078, { rz: sx * 0.32, outline: 0 }));
      part(head, G(new THREE.ConeGeometry(0.024, 0.2, 6)), ivory, sx * 0.06, 0.12, -0.04, { rx: -1.0, rz: sx * -0.4, outline: 0.004 });
      part(head, G(new THREE.ConeGeometry(0.014, 0.08, 5)), mat(O), sx * 0.07, 0.06, -0.06, { rx: -1.3, rz: sx * -0.7, outline: 0.003 });
    }
    // arms: heavy, clawed
    for (const [sh, el, sx] of [[shL, elL, 1], [shR, elR, -1]]) {
      sh.position.x = sx * 0.2;
      part(sh, box(0.14, 0.12, 0.15), mat(O), sx * 0.03, 0.01, 0);
      part(sh, G(new THREE.ConeGeometry(0.025, 0.11, 4)), mat(K), sx * 0.06, 0.09, 0, { rz: sx * -0.5, outline: 0.004 });
      part(sh, G(new THREE.ConeGeometry(0.02, 0.08, 4)), mat(K), sx * 0.08, 0.06, -0.05, { rz: sx * -0.9, outline: 0.004 });
      part(sh, box(0.07, 0.13, 0.08), mat(K), 0, -0.1, 0);
      part(el, box(0.1, 0.16, 0.11), mat(O), 0, -0.07, 0);
      part(el, box(0.104, 0.035, 0.114), mat(K), 0, -0.01, 0);
      part(el, box(0.07, 0.05, 0.07), mat(Gr), 0, -0.17, 0);
      for (let i = 0; i < 3; i++) {
        part(el, G(new THREE.ConeGeometry(0.011, 0.075, 4)), mat(S), (i - 1) * 0.025, -0.225, 0.025, { rx: Math.PI + 0.35, outline: 0.003 });
      }
    }
    // wrist cannon on the right forearm
    const can = grp(elR, -0.055, -0.08, 0.03);
    part(can, G(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 8)), mat(K), 0, -0.04, 0);
    part(can, G(new THREE.CylinderGeometry(0.031, 0.031, 0.03, 8)), mat(Y), 0, 0.03, 0, { outline: 0.003 });
    muzzle.position.set(0, -0.16, 0); can.add(muzzle);
    // digitigrade legs
    for (const [hp, kn, an] of [[hipL, knL, anL], [hipR, knR, anR]]) {
      part(hp, box(0.1, 0.2, 0.12), mat(O), 0, -0.1, 0);
      part(kn, box(0.085, 0.22, 0.1), mat(K), 0, -0.1, 0);
      part(kn, box(0.06, 0.06, 0.04), mat(O), 0, 0.0, 0.06);
      part(an, box(0.08, 0.1, 0.07), mat(O), 0, -0.04, 0);
      part(an, box(0.1, 0.035, 0.15), mat(K), 0, -0.095, 0.035);
      for (let i = 0; i < 3; i++) part(an, G(new THREE.ConeGeometry(0.012, 0.05, 4)), mat(S), (i - 1) * 0.03, -0.1, 0.12, { rx: Math.PI / 2, outline: 0 });
    }
    // tail (4 segments)
    let parent = hips;
    let z = -0.08;
    for (let i = 0; i < 4; i++) {
      const seg = grp(parent, 0, i === 0 ? 0.0 : 0, z);
      const len = 0.11 - i * 0.015, w = 0.07 - i * 0.012;
      part(seg, box(w, w, len), mat(i % 2 ? K : O), 0, 0, -len / 2);
      tail.push(seg);
      parent = seg; z = -len;
    }
    part(tail[3], G(new THREE.ConeGeometry(0.022, 0.08, 4)), mat(S), 0, 0, -0.1, { rx: -Math.PI / 2, outline: 0.003 });
    J.t0 = tail[0]; J.t1 = tail[1]; J.t2 = tail[2]; J.t3 = tail[3];
    base = { waist: 0.32, head: -0.3, knee: 0.75, hip: -0.42, ankle: -0.38, sh: -0.35, el: -0.5, hunch: 1 };
  }

  center.position.set(0, 0.06, 0.02);
  root.scale.setScalar(1);
  body.scale.setScalar(1.12);

  // calibrate hips so the lowest foot point sits on y=0 in the rest pose
  const T = {};
  for (const n of JOINTS) T[n] = [0, 0, 0];
  let hipsBaseY = 0.52;
  {
    restPose();
    applyImmediate();
    root.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    const tmp = new THREE.Box3();
    for (const an of [anL, anR]) an.traverse((o) => { if (o.isMesh && o.name !== 'outline') { tmp.setFromObject(o); bb.union(tmp); } });
    hipsBaseY = 0.52 - bb.min.y / 1.12;
    hips.position.y = hipsBaseY;
  }
  const height = 1.1;

  // ---------------------------------------------------------- animation
  let phase = 0, hipsY = hipsBaseY, bodyLift = 0;
  let flash = 0;
  let thrust = 0;
  function set(n, x, y, z) { const a = T[n]; a[0] = x; a[1] = y; a[2] = z; }
  function restPose() {
    for (const n of JOINTS) set(n, 0, 0, 0);
    set('waist', base.waist || 0, 0, 0);
    set('head', base.head || 0, 0, 0);
    set('shL', base.sh || 0, 0, 0.14); set('shR', base.sh || 0, 0, -0.14);
    set('elL', base.el || 0, 0, 0); set('elR', base.el || 0, 0, 0);
    set('hipL', base.hip || 0, 0, 0.04); set('hipR', base.hip || 0, 0, -0.04);
    set('knL', base.knee || 0, 0, 0); set('knR', base.knee || 0, 0, 0);
    set('anL', base.ankle || 0, 0, 0); set('anR', base.ankle || 0, 0, 0);
  }
  function applyImmediate() {
    for (const n of JOINTS) { const j = J[n]; if (!j) continue; const a = T[n]; j.rotation.set(a[0], a[1], a[2]); }
  }

  /**
   * s = { mode:'idle'|'run'|'air'|'dash'|'stagger'|'down'|'getup'|'victory'|'ko'|'intro',
   *       speed, runSpeed, vy, grounded, aim (0..1 gun-arm raise), aimPitch, recoil, throwT (0..1),
   *       lookYaw, lookPitch, moveSide (-1..1 strafe relative to facing), thrust (0..1) }
   */
  function animate(dt, time, s) {
    const k = s.mode === 'down' || s.mode === 'ko' ? 9 : s.mode === 'getup' ? 6 : 16;
    restPose();
    const hunch = base.hunch;
    let hy = hipsBaseY;
    let bx = 0, bz = 0, lift = 0;
    const w = clamp(s.speed / (s.runSpeed || 4.5), 0, 1.2);
    phase += dt * (3 + s.speed * 2.1);
    const sp = Math.sin(phase), cp = Math.cos(phase);

    switch (s.mode) {
      case 'run':
      case 'idle':
      case 'intro': {
        const br = Math.sin(time * 2.2) * 0.025;
        if (w > 0.05 && s.mode === 'run') {
          const kneeL = 0.25 + (0.5 + 0.5 * Math.sin(phase + 1.2)) * 1.05 * w;
          const kneeR = 0.25 + (0.5 + 0.5 * Math.sin(phase + Math.PI + 1.2)) * 1.05 * w;
          set('hipL', base.hip * 0.4 - sp * 0.8 * w, 0, 0.04);
          set('hipR', base.hip * 0.4 + sp * 0.8 * w, 0, -0.04);
          set('knL', kneeL + base.knee * 0.5, 0, 0);
          set('knR', kneeR + base.knee * 0.5, 0, 0);
          set('anL', -0.25 * w + base.ankle * 0.5, 0, 0); set('anR', -0.25 * w + base.ankle * 0.5, 0, 0);
          set('shL', base.sh + sp * 0.75 * w, 0, 0.18); set('shR', base.sh - sp * 0.75 * w, 0, -0.18);
          set('elL', -0.7 - 0.2 * w, 0, 0); set('elR', -0.7 - 0.2 * w, 0, 0);
          set('waist', base.waist + 0.28 * w, sp * 0.16 * w, -s.moveSide * 0.15);
          set('head', base.head - 0.2 * w, -sp * 0.1 * w, 0);
          hy -= Math.abs(cp) * 0.035 * w + 0.02 * w;
          bz = s.moveSide * 0.12 * w;
        } else {
          set('waist', base.waist + br, 0, 0);
          set('head', base.head - br * 0.5, 0, 0);
          set('shL', base.sh - br, 0, 0.16 + br); set('shR', base.sh - br, 0, -0.16 - br);
          hy -= 0.01 + br * 0.15;
        }
        break;
      }
      case 'air': {
        const rise = clamp(s.vy / 6, -1, 1);
        set('hipL', -0.75 - rise * 0.2, 0, 0.1); set('knL', 1.25, 0, 0); set('anL', -0.3, 0, 0);
        set('hipR', -0.15 + rise * 0.15, 0, -0.1); set('knR', 0.55, 0, 0); set('anR', -0.2, 0, 0);
        set('shL', -0.35, 0, 0.55 + rise * 0.15); set('shR', -0.35, 0, -0.55 - rise * 0.15);
        set('elL', -0.6, 0, 0); set('elR', -0.6, 0, 0);
        set('waist', base.waist + 0.12 - rise * 0.08, 0, 0);
        if (hunch) { set('t0', 0.4 * rise, 0, 0); }
        break;
      }
      case 'dash': {
        set('waist', base.waist + 0.55, 0, -s.moveSide * 0.25);
        set('head', base.head - 0.45, 0, 0);
        set('hipL', 0.45, 0, 0.12); set('knL', 0.9, 0, 0); set('anL', 0.4, 0, 0);
        set('hipR', 0.15, 0, -0.12); set('knR', 0.6, 0, 0); set('anR', 0.3, 0, 0);
        set('shL', 0.7, 0, 0.35); set('shR', 0.7, 0, -0.35);
        set('elL', -0.4, 0, 0); set('elR', -0.4, 0, 0);
        if (s.grounded) hy -= 0.06;
        bz = s.moveSide * 0.25;
        break;
      }
      case 'stagger': {
        set('waist', base.waist - 0.55, 0.15, 0);
        set('head', base.head - 0.45, 0, 0.15);
        set('shL', -0.9, 0, 0.75); set('shR', -0.9, 0, -0.75);
        set('elL', -0.3, 0, 0); set('elR', -0.3, 0, 0);
        set('hipL', base.hip - 0.25, 0, 0.1); set('knL', base.knee + 0.45, 0, 0);
        set('hipR', base.hip + 0.2, 0, -0.1); set('knR', base.knee + 0.2, 0, 0);
        hy -= 0.04;
        break;
      }
      case 'down':
      case 'ko': {
        bx = -Math.PI / 2;
        set('waist', 0.1, 0, 0); set('head', 0.3, 0.4, 0);
        set('shL', -0.4, 0, 1.1); set('shR', -0.6, 0, -1.0);
        set('elL', -0.6, 0, 0); set('elR', -0.3, 0, 0);
        set('hipL', -0.3, 0, 0.2); set('knL', 0.5, 0, 0);
        set('hipR', -0.1, 0, -0.15); set('knR', 0.2, 0, 0);
        lift = 0.1;
        break;
      }
      case 'getup': {
        set('waist', base.waist + 0.5, 0, 0);
        set('head', base.head - 0.4, 0, 0);
        set('hipL', -1.4, 0, 0.12); set('knL', 2.0, 0, 0); set('anL', -0.6, 0, 0);
        set('hipR', -0.5, 0, -0.12); set('knR', 1.2, 0, 0); set('anR', -0.6, 0, 0);
        set('shL', 0.3, 0, 0.4); set('shR', 0.3, 0, -0.4);
        hy = hipsBaseY - 0.2;
        break;
      }
      case 'victory': {
        const t = s.victoryT || 0;
        const bob = Math.sin(time * 3) * 0.02;
        if (kind === 'fang') {
          set('waist', -0.25, 0, 0); set('head', -0.65 + Math.sin(time * 9) * 0.04, 0, 0);
          set('shL', -1.3, 0, 1.15); set('shR', -1.3, 0, -1.15);
          set('elL', -0.9, 0, 0); set('elR', -0.9, 0, 0);
          set('hipL', -0.2, 0, 0.2); set('knL', 0.6, 0, 0);
          set('hipR', -0.2, 0, -0.2); set('knR', 0.6, 0, 0);
          set('t0', 0.6, 0, 0); set('t1', 0.3, Math.sin(time * 5) * 0.3, 0);
        } else {
          const up = t > 0.25 ? 1 : 0;
          set('waist', -0.08 + bob, 0.15, 0); set('head', -0.25, 0.1, 0);
          set('shR', -2.9 * up - 0.6 * (1 - up), 0, -0.25); set('elR', -0.15, 0, 0);
          set('shL', 0.1, 0, 0.6); set('elL', -1.7, 0, 0);
          set('hipL', -0.05, 0, 0.18); set('knL', 0.1, 0, 0);
          set('hipR', 0.05, 0, -0.18); set('knR', 0.1, 0, 0);
          set('anL', 0, 0, -0.15); set('anR', 0, 0, 0.15);
        }
        hy -= bob * 0.5;
        break;
      }
      default: break;
    }

    // gun arm aim (overrides right arm) / throw (overrides left arm)
    if (s.aim > 0.01 && s.mode !== 'down' && s.mode !== 'ko' && s.mode !== 'getup') {
      const a = s.aim;
      const tx = -Math.PI / 2 - (s.aimPitch || 0) - base.waist * (s.mode === 'run' ? 1 : 0.7) + (s.recoil || 0) * 0.35;
      T.shR[0] = T.shR[0] * (1 - a) + tx * a;
      T.shR[1] = T.shR[1] * (1 - a) + (s.aimYaw || 0) * a;
      T.shR[2] = T.shR[2] * (1 - a) + (-0.05) * a;
      T.elR[0] = T.elR[0] * (1 - a) + (-0.05 + (s.recoil || 0) * -0.25) * a;
      T.waist[1] = T.waist[1] * (1 - a) - 0.2 * a;
    }
    if (s.throwT > 0 && s.mode !== 'down' && s.mode !== 'ko') {
      const t = s.throwT; // 1 -> 0
      const wind = t > 0.6;
      T.shL[0] = wind ? -2.8 : -1.6; T.shL[2] = 0.25; T.elL[0] = wind ? -1.2 : -0.1;
      T.waist[1] += wind ? 0.25 : -0.15;
    }
    // look at target
    if (s.mode !== 'down' && s.mode !== 'ko' && s.mode !== 'victory') {
      T.head[1] += clamp(s.lookYaw || 0, -0.9, 0.9) * 0.6;
      T.head[0] += clamp(-(s.lookPitch || 0), -0.5, 0.5) * 0.5;
    }
    // tail sway
    if (tail.length) {
      const sw = Math.sin(time * 3.1) * 0.25, sw2 = Math.sin(time * 3.1 - 0.8) * 0.3;
      T.t0[0] += -0.25 - w * 0.25; T.t0[1] += sw * (1 - w * 0.5) + sp * 0.2 * w;
      T.t1[0] += 0.12; T.t1[1] += sw2;
      T.t2[0] += 0.1; T.t2[1] += Math.sin(time * 3.1 - 1.6) * 0.35;
      T.t3[0] += 0.08; T.t3[1] += Math.sin(time * 3.1 - 2.4) * 0.4;
    }

    T.body[0] = bx; T.body[2] = bz;
    for (let i = 0; i < JOINTS.length; i++) {
      const n = JOINTS[i];
      const j = J[n]; if (!j) continue;
      const a = T[n];
      const kk = n === 'body' ? (s.mode === 'getup' ? 5 : 8) : k;
      j.rotation.x = damp(j.rotation.x, a[0], kk, dt);
      j.rotation.y = damp(j.rotation.y, a[1], kk, dt);
      j.rotation.z = damp(j.rotation.z, a[2], kk, dt);
    }
    hipsY = damp(hipsY, hy, s.mode === 'down' || s.mode === 'ko' ? 7 : 14, dt);
    hips.position.y = hipsY;
    // when lying down the body group pivots at the feet; lift so the torso rests on the floor
    bodyLift = damp(bodyLift, lift, 8, dt);
    body.position.y = bodyLift;

    // thrusters
    thrust = damp(thrust, s.thrust || 0, 18, dt);
    const fl = thrust * (0.85 + Math.sin(time * 61) * 0.1 + Math.sin(time * 37) * 0.08);
    for (const th of thrusters) {
      const v = Math.max(0.001, fl);
      th.flame.scale.set(0.6 + v * 0.6, v * 1.3, 0.6 + v * 0.6);
      th.core.scale.set(0.6 + v * 0.5, v * 1.2, 0.6 + v * 0.5);
      th.flame.visible = th.core.visible = fl > 0.02;
    }

    // hit flash / invulnerability blink
    flash = Math.max(0, flash - dt * 7);
    let er = flash, eg = flash, eb = flash;
    if (s.invuln) {
      const b = (Math.sin(time * 30) > 0 ? 0.35 : 0.0);
      er += b * 0.2; eg += b * 0.8; eb += b;
    }
    for (let i = 0; i < bodyMats.length; i++) {
      const m = bodyMats[i], b = m.userData.baseEm;
      m.emissive.setRGB(b.r + er, b.g + eg, b.b + eb);
    }
  }

  function hitFlash(v = 1) { flash = Math.max(flash, v); }

  // ---------------------------------------------------- materialize FX
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const ghostPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 3.0), wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, clippingPlanes: [ghostPlane] });
  let ghosts = null;
  const scanRingGeo = G(new THREE.RingGeometry(0.28, 0.36, 32));
  scanRingGeo.rotateX(-Math.PI / 2);
  const scanRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.6, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
  scanRing.visible = false;
  root.add(scanRing);
  let materializing = false;

  /** t: 0..1 reveal from feet to head. baseWorldY: world y of the robot's feet. */
  function setMaterialize(t, baseWorldY) {
    if (!materializing) {
      materializing = true;
      for (const m of allMats) m.clippingPlanes = [clipPlane];
      for (const o of outlines) o.visible = false;
      ghosts = [];
      for (const mesh of meshes) {
        const g = new THREE.Mesh(mesh.geometry, ghostMat);
        g.raycast = () => {};
        mesh.add(g);
        ghosts.push(g);
      }
      scanRing.visible = true;
    }
    const h = baseWorldY + t * (height + 0.08) - 0.02;
    clipPlane.constant = h;
    ghostPlane.constant = -h;
    scanRing.position.y = t * (height + 0.08) - 0.02;
    scanRing.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.5);
    scanRingMat.opacity = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.7 + 0.1;
    ghostMat.opacity = 0.55 * (1 - t * 0.5);
  }
  function finishMaterialize() {
    if (!materializing) return;
    materializing = false;
    for (const m of allMats) m.clippingPlanes = null;
    for (const o of outlines) o.visible = true;
    if (ghosts) for (const g of ghosts) g.removeFromParent();
    ghosts = null;
    scanRing.visible = false;
  }
  function setVisible(v) { root.visible = v; }

  function dispose() {
    root.removeFromParent();
    for (const g of geos) g.dispose();
    for (const m of allMats) m.dispose();
    ghostMat.dispose(); scanRingMat.dispose();
  }

  return {
    kind, info, root, joints: J, muzzle, bombPort, podPort, center, height,
    animate, hitFlash, setMaterialize, finishMaterialize, setVisible, dispose,
    get thrust() { return thrust; }, thrusterNodes: thrusters.map((t) => t.node),
  };
}
