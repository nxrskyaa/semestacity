// Procedural geometry + material helpers for the anime character system.
// Everything is smooth-shaded (indexed, welded seams) so toon shading reads clean.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat } from '../gfx/toon.js';

export const OUTLINE_COLOR = 0x14121c;
export const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });

const _v = new THREE.Vector3();

/**
 * Loft along +Y through elliptical (super-elliptical) rings.
 * ring: { y, rx, rz, x=0, z=0, n=2 (superellipse exponent), f?(theta)->radius multiplier }
 * Rings must be ordered by increasing y. Theta measured from +Z toward +X.
 */
export function loft(rings, segs = 16, { capTop = true, capBottom = true, uv = false } = {}) {
  const pos = [], idx = [], uvs = [];
  const R = rings.length;
  for (let k = 0; k < R; k++) {
    const r = rings[k];
    const n = r.n || 2;
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      let s = Math.sin(th), c = Math.cos(th);
      if (n !== 2) { s = Math.sign(s) * Math.pow(Math.abs(s), 2 / n); c = Math.sign(c) * Math.pow(Math.abs(c), 2 / n); }
      const m = r.f ? r.f(th, k) : 1;
      pos.push((r.x || 0) + s * r.rx * m, r.y, (r.z || 0) + c * r.rz * m);
      if (uv) uvs.push(j / segs, k / (R - 1));
    }
  }
  for (let k = 0; k < R - 1; k++) {
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      const a = k * segs + j, b = k * segs + j1, c = (k + 1) * segs + j1, d = (k + 1) * segs + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  if (capBottom) {
    const r = rings[0];
    const ci = pos.length / 3;
    pos.push(r.x || 0, r.y - (r.cap || 0), r.z || 0);
    if (uv) uvs.push(0.5, 0);
    for (let j = 0; j < segs; j++) idx.push(ci, (j + 1) % segs, j);
  }
  if (capTop) {
    const r = rings[R - 1];
    const ci = pos.length / 3;
    pos.push(r.x || 0, r.y + (r.cap || 0), r.z || 0);
    if (uv) uvs.push(0.5, 1);
    const base = (R - 1) * segs;
    for (let j = 0; j < segs; j++) idx.push(ci, base + j, base + (j + 1) % segs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** rounded tapered limb hanging from y=0 down to y=-len (caps overshoot by radius). */
export function limb(len, r0, r1, { segs = 12, rings = 7, rz = 1, bulge = 0, bulgeAt = 0.35, capRings = 3, topCap = true, botCap = true, z0 = 0, z1 = 0 } = {}) {
  const out = [];
  if (botCap) {
    for (let i = 0; i < capRings; i++) {
      const a = (i / capRings) * Math.PI / 2; // 0 = tip
      out.push({ y: -len - r1 * Math.cos(a), rx: r1 * Math.sin(a) + 0.0005, rz: r1 * Math.sin(a) * rz + 0.0005, z: z1 });
    }
  }
  for (let i = rings - 1; i >= 0; i--) {
    const t = i / (rings - 1); // 0 top .. 1 bottom
    const bl = bulge * Math.exp(-((t - bulgeAt) ** 2) / 0.06);
    const r = THREE.MathUtils.lerp(r0, r1, t) + bl;
    out.push({ y: -len * t, rx: r, rz: r * rz, z: THREE.MathUtils.lerp(z0, z1, t) });
  }
  if (topCap) {
    for (let i = capRings - 1; i >= 0; i--) {
      const a = (i / capRings) * Math.PI / 2;
      out.push({ y: r0 * Math.cos(a), rx: r0 * Math.sin(a) + 0.0005, rz: r0 * Math.sin(a) * rz + 0.0005, z: z0 });
    }
  }
  return loft(out, segs);
}

/** ellipsoid (smooth) */
export function ellipsoid(rx, ry, rz, ws = 16, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return weld(g);
}

/** remove seams so computeVertexNormals is smooth everywhere */
export function weld(g, tol = 1e-5) {
  const pos = g.getAttribute('position');
  const map = new Map();
  const remap = new Uint32Array(pos.count);
  const np = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) / tol)},${Math.round(pos.getY(i) / tol)},${Math.round(pos.getZ(i) / tol)}`;
    let id = map.get(key);
    if (id === undefined) { id = np.length / 3; map.set(key, id); np.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    remap[i] = id;
  }
  const oldIdx = g.index ? g.index.array : [...Array(pos.count).keys()];
  const idx = [];
  for (let i = 0; i < oldIdx.length; i += 3) {
    const a = remap[oldIdx[i]], b = remap[oldIdx[i + 1]], c = remap[oldIdx[i + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

/** tube along a curve with elliptical, tapering cross-section. profile(s)->[wScale,tScale]. Normal frame uses `up` hint fn. */
export function ribbonTube(points, { width = 0.02, thick = 0.01, segs = 8, sides = 6, profile = null, outward = null, closedTip = true, rootCap = false } = {}) {
  const curve = points instanceof THREE.Curve ? points : new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [], idx = [], ot = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), O = new THREE.Vector3();
  const nRings = closedTip ? segs : segs + 1;
  for (let i = 0; i < nRings; i++) {
    const s = i / segs;
    curve.getPointAt(Math.min(s, 1), P);
    curve.getTangentAt(Math.min(s, 0.999), T);
    if (outward) outward(P, O, s); else O.set(0, 1, 0);
    N.copy(O).addScaledVector(T, -O.dot(T));
    if (N.lengthSq() < 1e-8) N.set(0, 0, 1).addScaledVector(T, -T.z);
    N.normalize();
    B.crossVectors(T, N).normalize();
    const pr = profile ? profile(s) : [1 - s, 1 - s];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const cw = Math.cos(a) * width * pr[0], ct = Math.sin(a) * thick * pr[1];
      pos.push(P.x + B.x * cw + N.x * ct, P.y + B.y * cw + N.y * ct, P.z + B.z * cw + N.z * ct);
      ot.push(Math.max(0.25, Math.min(1, pr[0] * 1.6)));
    }
  }
  for (let i = 0; i < nRings - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const j1 = (j + 1) % sides;
      const a = i * sides + j, b = i * sides + j1, c = (i + 1) * sides + j1, d = (i + 1) * sides + j;
      idx.push(a, d, c, a, c, b);
    }
  }
  if (closedTip) {
    curve.getPointAt(1, P);
    const ti = pos.length / 3;
    pos.push(P.x, P.y, P.z); ot.push(0.25);
    const base = (nRings - 1) * sides;
    for (let j = 0; j < sides; j++) idx.push(base + j, ti, base + (j + 1) % sides);
  }
  if (rootCap) {
    curve.getPointAt(0, P);
    const ci = pos.length / 3;
    pos.push(P.x, P.y, P.z); ot.push(1);
    for (let j = 0; j < sides; j++) idx.push(ci, j, (j + 1) % sides);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('othick', new THREE.Float32BufferAttribute(ot, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** apply matrix to a geometry clone */
export function xf(g, { p = null, r = null, s = null, order = 'XYZ' } = {}) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (r) q.setFromEuler(new THREE.Euler(r[0], r[1], r[2], order));
  m.compose(p ? new THREE.Vector3(...p) : new THREE.Vector3(), q, s ? new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])) : new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/** normalize attribute sets so mergeGeometries works (position, normal, othick) */
export function prep(g, othick = 1) {
  if (g.index === null) g = weld(g);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'othick') g.deleteAttribute(k);
  if (!g.getAttribute('othick')) {
    const n = g.getAttribute('position').count;
    g.setAttribute('othick', new THREE.Float32BufferAttribute(new Float32Array(n).fill(othick), 1));
  }
  g.morphAttributes = {};
  return g;
}

export function merge(geos) {
  if (geos.length === 1) return geos[0];
  const m = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return m;
}

/** inverted-hull outline geometry: push vertices along normals (scaled by `othick`) */
export function hullGeo(g, t) {
  const o = new THREE.BufferGeometry();
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), w = g.getAttribute('othick');
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = (w ? w.getX(i) : 1) * t;
    arr[i * 3] = p.getX(i) + n.getX(i) * k;
    arr[i * 3 + 1] = p.getY(i) + n.getY(i) * k;
    arr[i * 3 + 2] = p.getZ(i) + n.getZ(i) * k;
  }
  o.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  o.setAttribute('normal', n.clone());
  if (w) o.setAttribute('othick', w.clone());
  o.setIndex(g.index.clone());
  return o;
}

// ---------- materials ----------
let _skinGrad = null;
/** softer 3-step ramp for skin so faces never go muddy at night */
export function skinGradient() {
  if (_skinGrad) return _skinGrad;
  // soft porcelain ramp (linear filtered) so faces read smooth instead of banded
  const v = [150, 178, 212, 238, 250, 255];
  const data = new Uint8Array(v.length * 4);
  v.forEach((x, i) => data.set([x, x, x, 255], i * 4));
  _skinGrad = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
  _skinGrad.minFilter = _skinGrad.magFilter = THREE.LinearFilter;
  _skinGrad.needsUpdate = true;
  return _skinGrad;
}
let _clothGrad = null;
export function clothGradient() {
  if (_clothGrad) return _clothGrad;
  const data = new Uint8Array([105, 105, 105, 255, 175, 175, 175, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  _clothGrad = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  _clothGrad.minFilter = _clothGrad.magFilter = THREE.NearestFilter;
  _clothGrad.needsUpdate = true;
  return _clothGrad;
}

const _mcache = new Map();
/** shared (never disposed) toon material for characters. kind: 'skin'|'cloth'|'hair'|'shiny' */
export function charMat(color, kind = 'cloth', extra = {}) {
  const key = `${kind}|${color}|${extra.emissive || ''}|${extra.emissiveIntensity || ''}|${extra.opacity || ''}`;
  let m = _mcache.get(key);
  if (m) return m;
  m = toonMat(color, { unique: true, emissive: extra.emissive ?? 0x000000, emissiveIntensity: extra.emissiveIntensity ?? 1, transparent: !!extra.transparent, opacity: extra.opacity ?? 1, side: extra.side ?? THREE.FrontSide });
  if (kind === 'skin') {
    m.gradientMap = skinGradient();
    const c = new THREE.Color(color);
    m.emissive = c.clone().multiplyScalar(0.1).add(new THREE.Color(0.05, 0.016, 0.0));
  } else if (kind === 'cloth' || kind === 'hair') {
    m.gradientMap = clothGradient();
    if (!extra.emissive) m.emissive = new THREE.Color(color).multiplyScalar(0.05);
  }
  if (extra.transparent) m.depthWrite = false;
  m.userData.shared = true;
  _mcache.set(key, m);
  return m;
}

/**
 * Inject a vertex deformation into a material (and give it its own uniforms).
 * header: GLSL uniform/function decls; body: GLSL operating on `transformed` (object space).
 */
export function deformMaterial(mat, uniforms, header, body, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${header}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function darken(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}
export function mix(a, b, t) {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t);
  return '#' + c.getHexString();
}
export { _v };

/** normal-extruded outline mesh for a standalone prop mesh (replaces uniform-scale hulls that drift off-centre) */
export function hullMesh(mesh, t = 0.003) {
  let g = mesh.geometry;
  if (!g.index || !g.getAttribute('normal')) g = weld(g.clone());
  const o = new THREE.Mesh(hullGeo(g, t), outlineMat);
  o.name = 'outline';
  o.raycast = () => {};
  o.castShadow = false;
  mesh.add(o);
  return o;
}
