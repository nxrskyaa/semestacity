// Static-geometry batching + small geometry helpers shared by the world modules.
// Everything static is pushed into a Batch keyed by material and merged into
// one mesh per material at the end (keeps draw calls low).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** build a Matrix4 from a {x,y,z,rx,ry,rz,sx,sy,sz} transform */
export function trs({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}, out = new THREE.Matrix4()) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}

function normalize(geo) {
  for (const k of Object.keys(geo.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.clearGroups();
  return geo;
}

export class Batch {
  constructor() { this.map = new Map(); }

  /** add a geometry (cloned) with a transform object or Matrix4 */
  add(mat, geo, t = null, { cast = true, receive = true } = {}) {
    const g = normalize(geo.clone());
    if (t) g.applyMatrix4(t.isMatrix4 ? t : trs(t, _m));
    const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    let e = this.map.get(key);
    if (!e) { e = { mat, geos: [], cast, receive }; this.map.set(key, e); }
    e.geos.push(g);
    return this;
  }

  /** box with its BOTTOM at y0. uv: meters per texture repeat (number|[u,v]) */
  box(mat, x, y0, z, w, h, d, { ry = 0, rx = 0, rz = 0, uv = null, cast = true, receive = true } = {}) {
    const g = boxGeo(w, h, d, uv);
    this.add(mat, g, { x, y: y0 + h / 2, z, rx, ry, rz }, { cast, receive });
    g.dispose();
    return this;
  }

  /** vertical plane facing +Z (before ry), centred at x,y,z */
  plane(mat, x, y, z, w, h, { ry = 0, rx = 0, uv = null, cast = false, receive = true, flipU = false } = {}) {
    const g = planeGeo(w, h, uv, flipU);
    this.add(mat, g, { x, y, z, rx, ry }, { cast, receive });
    g.dispose();
    return this;
  }

  /** horizontal plane facing up at height y */
  floor(mat, minX, minZ, maxX, maxZ, y, { uv = null, receive = true } = {}) {
    const w = maxX - minX, d = maxZ - minZ;
    const g = planeGeo(w, d, uv);
    // world-anchored UVs (u = x/su, v = -z/sv) so neighbouring floors line up
    if (uv) {
      const [su, sv] = Array.isArray(uv) ? uv : [uv, uv];
      const a = g.attributes.uv, p = g.attributes.position;
      const cx = minX + w / 2, cz = minZ + d / 2;
      for (let i = 0; i < a.count; i++) a.setXY(i, (p.getX(i) + cx) / su, (p.getY(i) - cz) / sv);
    }
    this.add(mat, g, { x: minX + w / 2, y, z: minZ + d / 2, rx: -Math.PI / 2 }, { cast: false, receive });
    g.dispose();
    return this;
  }

  cyl(mat, x, y0, z, rTop, rBot, h, seg = 8, { rx = 0, rz = 0, ry = 0, cast = true, open = false } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
    this.add(mat, g, { x, y: y0 + h / 2, z, rx, ry, rz }, { cast });
    g.dispose();
    return this;
  }

  /** merge everything into meshes under parent; returns the meshes */
  flush(parent) {
    const out = [];
    for (const e of this.map.values()) {
      if (!e.geos.length) continue;
      const merged = mergeGeometries(e.geos, false);
      for (const g of e.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, e.mat);
      mesh.castShadow = e.cast;
      mesh.receiveShadow = e.receive;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

export function boxGeo(w, h, d, uv = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uv) {
    const [su, sv] = Array.isArray(uv) ? uv : [uv, uv];
    const a = g.attributes.uv;
    const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const [fu, fv] = sizes[f];
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        a.setXY(k, a.getX(k) * fu / su, a.getY(k) * fv / sv);
      }
    }
  }
  return g;
}

export function planeGeo(w, h, uv = null, flipU = false) {
  const g = new THREE.PlaneGeometry(w, h);
  const a = g.attributes.uv;
  if (uv) {
    const [su, sv] = Array.isArray(uv) ? uv : [uv, uv];
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * w / su, a.getY(i) * h / sv);
  }
  if (flipU) for (let i = 0; i < a.count; i++) a.setX(i, 1 - a.getX(i));
  return g;
}

/** triangle in the XY plane (gable end), base centred at origin, facing +Z */
export function triGeo(w, h, uv = null) {
  const g = new THREE.BufferGeometry();
  const su = uv ? (Array.isArray(uv) ? uv[0] : uv) : w;
  const sv = uv ? (Array.isArray(uv) ? uv[1] : uv) : h;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / su, 0, w / 2 / su, h / sv], 2));
  g.setIndex([0, 1, 2]);
  return g;
}

/**
 * Gable roof (ridge along local X) centred at x,z with eaves at height y.
 * Adds two sloped slabs (roof material) and two gable triangles (wall material).
 */
export function gableRoof(batch, roofMat, wallMat, x, y, z, w, d, rise, { ry = 0, over = 0.45, uv = 1.2 } = {}) {
  const run = d / 2 + over;
  const ang = Math.atan2(rise, d / 2);
  const len = run / Math.cos(ang);
  const rot = new THREE.Matrix4().makeRotationY(ry);
  const cy = y + rise - Math.tan(ang) * run / 2 + 0.07 / Math.cos(ang);
  for (const s of [1, -1]) {
    const g = boxGeo(w + over * 2, 0.14, len, uv);
    g.applyMatrix4(trs({ y: cy, z: s * run / 2, rx: s * ang }));
    g.applyMatrix4(rot).translate(x, 0, z);
    batch.add(roofMat, g);
    g.dispose();
  }
  if (wallMat) {
    for (const s of [1, -1]) {
      const t = triGeo(d, rise, uv);
      t.applyMatrix4(new THREE.Matrix4().makeRotationY(s * Math.PI / 2));
      t.translate(s * w / 2, y, 0).applyMatrix4(rot).translate(x, 0, z);
      batch.add(wallMat, t);
      t.dispose();
    }
  }
}

/** catenary-ish sagging cable as a thin tube between two points */
export function cableGeo(a, b, sag = 0.6, radius = 0.018, seg = 14) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, seg, radius, 3, false);
}

/** rectangle helper: collision box from center/size with optional 90° rotation */
export function rectCollider(collision, cx, cz, w, d, ry = 0, opts) {
  const r = Math.abs(Math.sin(ry)) > 0.7;
  return collision.addRect(cx, cz, r ? d : w, r ? w : d, opts);
}
