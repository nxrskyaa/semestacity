// Gacha headwear (appearance.headwear, ids from src/data/cosmetics.js HEADWEAR_IDS).
// Static parts go through add('headC', geo, mat, opts) so they are merged/outlined with the head;
// textured / glowing / animated parts are returned as extra meshes parented to headC.
import * as THREE from 'three';
import { ellipsoid, ribbonTube, xf, charMat, darken, mix, weld, hullGeo, outlineMat } from './geom.js';
import { SHELL, shell } from './hair.js';
import { domeCap, capGeos, headBandGeo } from './clothes.js';
import { makeRialoTexture, RIALO_CREAM, RIALO_INK } from '../gfx/rialoLogo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { C, RX, RY, RZF } = SHELL;

/** does this headwear hide the hair (hood) ? */
export const isHood = (id) => id === 'bearhood_brown' || id === 'bearhood_white';

const HOOD_COLORS = {
  bearhood_brown: { fur: '#8a5236', inner: '#5a3220', ear: '#5a3220', snout: '#c9a27a', lining: '#6e3f28' },
  bearhood_white: { fur: '#f4f2ec', inner: '#e8c49a', ear: '#e8c49a', snout: '#f7f6f1', lining: '#d9d4c8' },
};

// hood shell (head-local): ellipsoid around the hair, open at the face, draping down to the shoulders
const HO = { c: V(0, 0.004, -0.014), a: 0.132, b: 0.142, bl: 0.18, cf: 0.13, cb: 0.138 };
function hoodPoint(x, y, z, k = 1) {
  return V(HO.c.x + x * HO.a * k * (y < 0 ? 1 - 0.12 * -y : 1), HO.c.y + y * (y > 0 ? HO.b : HO.bl) * k, HO.c.z + z * (z > 0 ? HO.cf : HO.cb) * k);
}
// face opening in unit-direction space
const OPEN = { cy: -0.16, rx: 0.74, ry: 0.62 };
const isOpen = (x, y, z) => z > 0.15 && (x / OPEN.rx) ** 2 + ((y - OPEN.cy) / OPEN.ry) ** 2 < 1;

function hoodShell(k, flip, ws = 30, hs = 22) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.getAttribute('position');
  const dir = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    dir.push([x, y, z]);
    const q = hoodPoint(x, y, z, k);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  const idx = g.index.array, out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    // drop the face opening and the bottom cap (under the chin / inside the collar)
    if (tri.some((v) => isOpen(...dir[v]))) continue;
    if (tri.every((v) => dir[v][1] < -0.9)) continue;
    out.push(...(flip ? [tri[0], tri[2], tri[1]] : tri));
  }
  g.setIndex(out);
  g.deleteAttribute('uv');
  return weld(g);
}

function bearHood(add, id) {
  const col = HOOD_COLORS[id];
  const fur = charMat(col.fur), lining = charMat(col.lining), inner = charMat(col.inner), ink = charMat('#141216'), snout = charMat(col.snout);
  add('headC', hoodShell(1, false), fur, { outline: 0.003 });
  add('headC', hoodShell(0.93, true, 20, 14), lining, { outline: 0 });
  // rolled rim around the face opening
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const x = OPEN.rx * Math.sin(t) * 0.99, y = OPEN.cy + OPEN.ry * Math.cos(t) * 0.99;
    const z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y));
    pts.push(hoodPoint(x, y, z, 0.975));
  }
  add('headC', ribbonTube(new THREE.CatmullRomCurve3(pts, true), { width: 0.0075, thick: 0.0075, segs: 60, sides: 6, closedTip: false, profile: () => [1, 1], outward: (P, O) => O.copy(P).sub(HO.c).normalize() }), fur, { outline: 0.0025 });
  // round ears with inner discs
  for (const s of [-1, 1]) {
    const d = V(s * 0.66, 0.72, -0.05).normalize();
    const base = hoodPoint(d.x, d.y, d.z, 1);
    const ear = ellipsoid(0.04, 0.04, 0.02, 12, 8);
    xf(ear, { p: [base.x + s * 0.008, base.y + 0.018, base.z], r: [0, 0, -s * 0.6] });
    add('headC', ear, fur, { outline: 0.003 });
    const ie = ellipsoid(0.025, 0.025, 0.008, 10, 6);
    xf(ie, { p: [base.x + s * 0.006, base.y + 0.018, base.z + 0.014], r: [0, 0, -s * 0.6] });
    add('headC', ie, inner, { outline: 0 });
  }
  // bear face on the top-front of the hood
  const fp = (x, y, z, out = 0) => { const d = V(x, y, z).normalize(); const q = hoodPoint(d.x, d.y, d.z, 1); return q.addScaledVector(d, out); };
  const sn = fp(0, 0.64, 0.77, 0.006);
  const snG = ellipsoid(0.036, 0.026, 0.026, 14, 9);
  xf(snG, { p: [sn.x, sn.y, sn.z], r: [-0.55, 0, 0] });
  add('headC', snG, snout, { outline: 0.0026 });
  const no = ellipsoid(0.013, 0.009, 0.009, 12, 8);
  const np = fp(0, 0.7, 0.72, 0.028);
  xf(no, { p: [np.x, np.y, np.z], r: [-0.5, 0, 0] });
  add('headC', no, ink, { outline: 0 });
  const mp = fp(0, 0.58, 0.81, 0.03);
  add('headC', ribbonTube([V(-0.009, mp.y - 0.004, mp.z - 0.002), V(0, mp.y + 0.002, mp.z + 0.001), V(0.009, mp.y - 0.004, mp.z - 0.002)], { width: 0.0018, thick: 0.0018, segs: 6, sides: 4, closedTip: false, profile: () => [1, 1] }), ink, { outline: 0 });
  add('headC', ribbonTube([V(0, mp.y + 0.002, mp.z + 0.001), V(0, mp.y + 0.012, mp.z + 0.004)], { width: 0.0018, thick: 0.0018, segs: 3, sides: 4, closedTip: false, profile: () => [1, 1] }), ink, { outline: 0 });
  for (const s of [-1, 1]) {
    const ep = fp(s * 0.36, 0.76, 0.54, 0.002);
    const e = ellipsoid(0.0085, 0.0095, 0.005, 10, 8);
    xf(e, { p: [ep.x, ep.y, ep.z], r: [-0.8, s * 0.3, 0] });
    add('headC', e, ink, { outline: 0 });
  }
}

function catEars(add, hairColor) {
  const out = charMat(darken(hairColor, 0.9)), pink = charMat('#f4a6b8');
  for (const s of [-1, 1]) {
    const b = shell(s * 0.7, 0.95, 1.08);
    const ear = new THREE.ConeGeometry(0.034, 0.062, 14, 3);
    ear.scale(1, 1, 0.45);
    xf(ear, { p: [b.x, b.y + 0.022, b.z], r: [-0.15, s * 0.4, -s * 0.32] });
    add('headC', weld(ear), out, { outline: 0.0025 });
    const ie = new THREE.ConeGeometry(0.021, 0.042, 10, 2);
    ie.scale(1, 1, 0.3);
    xf(ie, { p: [b.x + Math.sin(s * 0.4) * 0.008, b.y + 0.018, b.z + 0.009], r: [-0.15, s * 0.4, -s * 0.32] });
    add('headC', weld(ie), pink, { outline: 0 });
  }
}

function bunnyEars(add) {
  const wh = charMat('#f6f4f2'), pink = charMat('#f4a6b8'), band = charMat('#f0ecea');
  add('headC', headbandArc(1.1), band, { outline: 0.0018 });
  for (const s of [-1, 1]) {
    const b = shell(s * 0.4, 1.2, 1.08);
    const bend = s > 0 ? 0.6 : 0.05;
    const pts = [b.clone(), b.clone().add(V(s * 0.02, 0.07, -0.005)), b.clone().add(V(s * (0.03 + bend * 0.02), 0.13 - bend * 0.03, 0.01 + bend * 0.05))];
    add('headC', ribbonTube(pts, { width: 0.022, thick: 0.009, segs: 10, sides: 7, profile: (u) => [0.7 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.1)), 1], outward: (P, O) => O.set(0, 0, 1) }), wh, { outline: 0.0022 });
    const ip = pts.map((p) => p.clone().add(V(0, 0, 0.006)));
    add('headC', ribbonTube(ip, { width: 0.012, thick: 0.004, segs: 10, sides: 5, profile: (u) => [0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.1)), 1], outward: (P, O) => O.set(0, 0, 1) }), pink, { outline: 0 });
  }
}

/** thin hair-band arc over the top of the head (ear to ear) */
function headbandArc(k = 1.08) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const a = -1.35 + (i / 12) * 2.7; pts.push(V(Math.sin(a) * RX * k, C.y + Math.cos(a) * RY * k, 0.012)); }
  return ribbonTube(pts, { width: 0.008, thick: 0.004, segs: 16, sides: 5, closedTip: false, profile: () => [1, 1], outward: (P, O) => O.copy(P).sub(C).normalize() });
}

function flowerCrown(add) {
  const cols = ['#ffb3d1', '#fff4f6', '#ffd38a', '#c8b6e8'];
  const leaf = charMat('#5aa86a');
  for (let i = 0; i < 9; i++) {
    const az = (i / 9) * Math.PI * 2;
    const c = shell(az, 0.6, 1.17);
    const n = c.clone().sub(C).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
    const pm = charMat(cols[i % cols.length]);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      const g = ellipsoid(0.0105, 0.007, 0.0035, 6, 4);
      g.rotateZ(a); g.translate(Math.cos(a) * 0.009, Math.sin(a) * 0.009, 0);
      g.applyQuaternion(q); g.translate(c.x, c.y, c.z);
      add('headC', g, pm, { outline: 0 });
    }
    const ctr = ellipsoid(0.005, 0.005, 0.004, 6, 4); ctr.translate(0, 0, 0.003); ctr.applyQuaternion(q); ctr.translate(c.x, c.y, c.z);
    add('headC', ctr, charMat('#f2c440'), { outline: 0 });
    const l = shell(az + 0.35, 0.58, 1.15);
    const lg = ellipsoid(0.012, 0.0055, 0.003, 6, 4);
    lg.rotateZ(0.6); lg.applyQuaternion(q); lg.translate(l.x, l.y, l.z);
    add('headC', lg, leaf, { outline: 0.001 });
  }
}

function fighterBand(add) {
  const wh = charMat('#f3f1ec'), red = charMat('#d02a2e');
  add('headC', headBandGeo(1.13, 0.022, 0.03, 0.07), wh, { outline: 0.0025 });
  const f = shell(0, 0.24, 1.15);
  const disc = new THREE.CylinderGeometry(0.012, 0.012, 0.003, 18);
  xf(disc, { p: [f.x, f.y + 0.004, f.z + 0.003], r: [Math.PI / 2 - 0.2, 0, 0] });
  add('headC', weld(disc), red, { outline: 0 });
  // knot + tails at the back
  const b = shell(Math.PI, 0.55, 1.08);
  for (const s of [-1, 1]) {
    add('headC', ribbonTube([b.clone(), b.clone().add(V(s * 0.03, -0.04, -0.03)), b.clone().add(V(s * 0.045, -0.1, -0.05))], { width: 0.012, thick: 0.003, segs: 8, sides: 5, closedTip: false, profile: (u) => [1 - 0.3 * u, 1] }), wh, { outline: 0.0015 });
  }
}

function devilHorns(add) {
  const red = charMat('#c8202a'), tip = charMat('#4a0e14');
  for (const s of [-1, 1]) {
    const b = shell(s * 0.55, 1.05, 1.03);
    const pts = [b.clone(), b.clone().add(V(s * 0.01, 0.03, 0.004)), b.clone().add(V(s * 0.026, 0.05, -0.002)), b.clone().add(V(s * 0.04, 0.058, -0.012))];
    add('headC', ribbonTube(pts, { width: 0.013, thick: 0.013, segs: 9, sides: 8, profile: (u) => [Math.pow(1 - u, 0.9), Math.pow(1 - u, 0.9)], rootCap: true }), red, { outline: 0.002 });
    const t = ellipsoid(0.003, 0.003, 0.003, 6, 4); t.translate(pts[3].x, pts[3].y, pts[3].z);
    add('headC', t, tip, { outline: 0 });
  }
}

function goldCrown(add) {
  const gold = charMat('#e8b83a', 'cloth', { emissive: '#5a3a08', emissiveIntensity: 0.6 });
  const yb = C.y + RY * 0.92, r = 0.068, h = 0.026, pts = 5;
  const pos = [], idx = [];
  const segs = 40;
  for (let j = 0; j < segs; j++) {
    const a = (j / segs) * Math.PI * 2;
    const spike = Math.pow(Math.abs(Math.cos((a * pts) / 2)), 6);
    for (const [yy, rr] of [[0, r], [h + spike * 0.024, r * 1.12]]) pos.push(Math.sin(a) * rr, yb + yy, Math.cos(a) * rr - 0.01);
  }
  for (let j = 0; j < segs; j++) {
    const j1 = (j + 1) % segs, a = j * 2, b = j1 * 2;
    idx.push(a, b, b + 1, a, b + 1, a + 1); // outside
    idx.push(a, a + 1, b + 1, a, b + 1, b); // inside (double-sided)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.rotateZ(0.12);
  add('headC', g, gold, { outline: 0 });
  const gems = ['#d0283a', '#3a7ad8', '#2fae6a', '#d0283a', '#9b59d0'];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const ge = ellipsoid(0.0055, 0.0055, 0.0035, 8, 6);
    ge.translate(Math.sin(a) * r * 1.07, yb + 0.012, Math.cos(a) * r * 1.07 - 0.01);
    ge.rotateZ(0.12);
    add('headC', ge, charMat(gems[i]), { outline: 0 });
    const ball = ellipsoid(0.005, 0.005, 0.005, 8, 6);
    ball.translate(Math.sin(a) * r * 1.12, yb + h + 0.026, Math.cos(a) * r * 1.12 - 0.01);
    ball.rotateZ(0.12);
    add('headC', ball, gold, { outline: 0 });
  }
}

function rialoCap(add, owned) {
  const ink = charMat(RIALO_INK);
  capGeos(add, ink, null);
  // the official mark printed on the front panel: a slice of the dome with planar UVs (never stretched)
  const dome = xf(domeCap(1.08, 0.03, 0.2), { s: [1, 0.88, 1], p: [0, 0.004, 0] });
  const p = dome.getAttribute('position'), n = dome.getAttribute('normal');
  const yc = 0.075, hs = 0.03;
  const map = new Map(), pos = [], uv = [], out = [];
  const idx = dome.index.array;
  const keep = (i) => p.getZ(i) > 0.02 && Math.abs(p.getX(i)) < hs * 2 && Math.abs(p.getY(i) - yc) < hs * 2;
  const get = (i) => {
    if (map.has(i)) return map.get(i);
    const k = pos.length / 3; map.set(i, k);
    pos.push(p.getX(i) + n.getX(i) * 0.0012, p.getY(i) + n.getY(i) * 0.0012, p.getZ(i) + n.getZ(i) * 0.0012);
    uv.push(p.getX(i) / (2 * hs) + 0.5, (p.getY(i) - yc) / (2 * hs) + 0.5);
    return k;
  };
  for (let t = 0; t < idx.length; t += 3) if (keep(idx[t]) || keep(idx[t + 1]) || keep(idx[t + 2])) out.push(get(idx[t]), get(idx[t + 1]), get(idx[t + 2]));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(out);
  g.computeVertexNormals();
  dome.dispose();
  const tex = makeRialoTexture(256, 256, { bg: null, fg: RIALO_CREAM, margin: 0.06 });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.color.setScalar(0.95);
  owned.push(tex, mat);
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'rialo-mark';
  mesh.renderOrder = 2;
  return mesh;
}

function halo(owned) {
  const g = new THREE.TorusGeometry(0.072, 0.0075, 10, 48);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe08a').multiplyScalar(2.2), toneMapped: true });
  owned.push(mat);
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = Math.PI / 2 - 0.25;
  m.position.set(0, C.y + RY * 1.32 + 0.02, -0.012);
  m.name = 'halo';
  m.castShadow = false;
  return m;
}

/**
 * Build headwear. Returns { extras: Mesh[] (parent to headC), owned: disposables, update(t) }.
 */
export function buildHeadwear(id, add, { hairColor = '#333' } = {}) {
  const extras = [], owned = [];
  let update = () => {};
  switch (id) {
    case 'catears': catEars(add, hairColor); break;
    case 'bunnyears': bunnyEars(add); break;
    case 'flowercrown': flowerCrown(add); break;
    case 'headband': fighterBand(add); break;
    case 'devilhorns': devilHorns(add); break;
    case 'crown': goldCrown(add); break;
    case 'bearhood_brown': case 'bearhood_white': bearHood(add, id); break;
    case 'rialocap': extras.push(rialoCap(add, owned)); break;
    case 'halo': {
      const h = halo(owned); extras.push(h);
      const y0 = h.position.y;
      update = (t) => { h.position.y = y0 + 0.006 * Math.sin(t * 2.1); h.rotation.z = t * 0.6; };
      break;
    }
    default: break;
  }
  return { extras, owned, update };
}
export { mix, hullGeo, outlineMat };
