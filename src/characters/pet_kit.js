// Shared helpers for the special characters (NXR mascot + Spider the cat).
// Self-contained on purpose (only depends on three + src/gfx/toon.js + src/core/util.js) so the
// rest of src/characters can be rewritten without touching these models.
import * as THREE from 'three';
import { toonGradient } from '../gfx/toon.js';
import { makeCanvas, canvasTex } from '../core/util.js';

export const INK = 0x14121c; // same outline colour as the avatar system

// ---------------------------------------------------------------- geometry
/** merge coincident vertices so computeVertexNormals is smooth across seams (drops uv) */
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
  g.dispose();
  return out;
}

/**
 * Smooth blob: unit sphere whose surface point for direction d is fn(d) -> Vector3 (writes into out).
 * Returned geometry is welded (smooth normals, no seams).
 */
export function blob(fn, ws = 32, hs = 24) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.getAttribute('position');
  const d = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    fn(d, o);
    p.setXYZ(i, o.x, o.y, o.z);
  }
  return weld(g);
}

export function ellipsoid(rx, ry, rz, ws = 20, hs = 14) {
  return blob((d, o) => o.set(d.x * rx, d.y * ry, d.z * rz), ws, hs);
}

/** solid of revolution around Y from [r, y] pairs (top-to-bottom or bottom-to-top), with uv v from y */
export function lathe(points, segs = 28, { zScale = 1, uvY = null } = {}) {
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(pts, segs);
  const p = g.getAttribute('position');
  if (uvY) {
    const uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) - uvY[0]) / (uvY[1] - uvY[0]));
  }
  if (zScale !== 1) { g.scale(1, 1, zScale); g.computeVertexNormals(); }
  return g;
}

/** rounded tapered capsule hanging from y=0 to y=-len (radius r0 at top, r1 at bottom) */
export function capsule(len, r0, r1, segs = 14, axis = 'y') {
  const pts = [];
  const N = 4;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI / 2; pts.push([r0 * Math.sin(a), r0 * Math.cos(a)]); }
  for (let i = 1; i < N; i++) { const t = i / N; pts.push([THREE.MathUtils.lerp(r0, r1, t), -len * t]); }
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI / 2; pts.push([r1 * Math.cos(a), -len - r1 * Math.sin(a)]); }
  // lathe wants increasing order along the profile; ours goes top->bottom, so flip to keep normals outward
  pts.reverse();
  let g = lathe(pts, segs);
  g = weld(g);
  if (axis === 'z') g.rotateX(Math.PI / 2); // hangs toward -z
  return g;
}

/** sweep a rectangle-ish (elliptic) section along points; returns smooth geometry with uv (u along, v around) */
export function tube(points, radius = 0.01, sides = 8, segs = 24, taper = null) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], uv = [], idx = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    curve.getPointAt(s, P);
    const r = radius * (taper ? taper(s) : 1);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const N = frames.normals[i], B = frames.binormals[i];
      pos.push(P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r);
      uv.push(s, j / sides);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- outline (inverted hull)
const _inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
_inkMat.userData.shared = true;
export function inkMaterial() { return _inkMat; }

/** inverted hull pushed along position-averaged normals (works on non-indexed / hard-edged geometry too) */
export function hullGeometry(g, t) {
  const p = g.getAttribute('position');
  let n = g.getAttribute('normal');
  if (!n) { g.computeVertexNormals(); n = g.getAttribute('normal'); }
  const acc = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const a = acc.get(k) || [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    acc.set(k, a);
  }
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    arr[i * 3] = p.getX(i) + (a[0] / l) * t;
    arr[i * 3 + 1] = p.getY(i) + (a[1] / l) * t;
    arr[i * 3 + 2] = p.getZ(i) + (a[2] / l) * t;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (g.index) o.setIndex(g.index.clone());
  return o;
}

/** mesh + its outline hull child. t = outline thickness in the geometry's units (0 = none). */
export function inked(geo, mat, t = 0.01, name = '') {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  if (t > 0) {
    const h = new THREE.Mesh(hullGeometry(geo, t), _inkMat);
    h.name = 'outline';
    h.raycast = () => {};
    h.castShadow = false;
    m.add(h);
  }
  return m;
}

// ---------------------------------------------------------------- materials
/**
 * Toon material with a fresnel rim + soft top sheen (lets dark fur read at night).
 * rim/sheen are colours (hex) scaled by strength.
 */
export function furMat(color, { rim = 0x8fa4ff, rimStrength = 0.35, rimPower = 2.6, sheen = 0x6f7fb8, sheenStrength = 0.0, map = null, emissive = 0x000000, gradient = null } = {}) {
  const m = new THREE.MeshToonMaterial({ color, map, gradientMap: gradient || toonGradient(), emissive });
  const u = {
    uRim: { value: new THREE.Color(rim).multiplyScalar(rimStrength) },
    uRimPow: { value: rimPower },
    uSheen: { value: new THREE.Color(sheen).multiplyScalar(sheenStrength) },
  };
  m.userData.rimUniforms = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimPow; uniform vec3 uSheen;')
      .replace('#include <opaque_fragment>', `
        {
          vec3 vd = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), uRimPow);
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float top = smoothstep(0.45, 0.95, dot(normal, upV));
          outgoingLight += uRim * fr + uSheen * top * (0.4 + 0.6 * fr);
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'petfur';
  return m;
}

/** plain toon material (fresh instance, owned by the caller) */
export function flatMat(color, { map = null, emissive = 0x000000, emissiveIntensity = 1, transparent = false, side = THREE.FrontSide, gradient = null } = {}) {
  return new THREE.MeshToonMaterial({ color, map, gradientMap: gradient || toonGradient(), emissive, emissiveIntensity, transparent, side });
}

let _softGrad = null;
/** softer 3-step ramp (bright fur / cloth never goes muddy at night) */
export function softGradient() {
  if (_softGrad) return _softGrad;
  const data = new Uint8Array([120, 120, 120, 255, 195, 195, 195, 255, 255, 255, 255, 255]);
  _softGrad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  _softGrad.minFilter = _softGrad.magFilter = THREE.NearestFilter;
  _softGrad.needsUpdate = true;
  return _softGrad;
}

// ---------------------------------------------------------------- hearts (floating ♥ sprites)
let _heartTex = null;
function heartTexture() {
  if (_heartTex) return _heartTex;
  const [c, x] = makeCanvas(128, 128);
  const path = () => {
    x.beginPath();
    x.moveTo(64, 108);
    x.bezierCurveTo(12, 74, 10, 38, 34, 26);
    x.bezierCurveTo(50, 18, 62, 28, 64, 40);
    x.bezierCurveTo(66, 28, 78, 18, 94, 26);
    x.bezierCurveTo(118, 38, 116, 74, 64, 108);
    x.closePath();
  };
  x.lineJoin = 'round';
  path(); x.lineWidth = 14; x.strokeStyle = '#2a0f1e'; x.stroke();
  const gr = x.createLinearGradient(0, 20, 0, 108);
  gr.addColorStop(0, '#ff8fbf'); gr.addColorStop(1, '#ff3d7f');
  path(); x.fillStyle = gr; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.beginPath(); x.ellipse(40, 44, 9, 6, -0.6, 0, Math.PI * 2); x.fill();
  _heartTex = canvasTex(c);
  return _heartTex;
}

/** pool of floating hearts. hearts.spawn(worldPos) ; hearts.update(dt) */
export function createHearts(parentScene, count = 10) {
  const group = new THREE.Group();
  group.name = 'hearts';
  const items = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false, fog: false, color: 0xffffff });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    s.renderOrder = 5;
    group.add(s);
    items.push({ s, life: 0, max: 1, vx: 0, vz: 0, ph: 0 });
  }
  if (parentScene) parentScene.add(group);
  let k = 0;
  return {
    group,
    spawn(p, size = 0.09) {
      const it = items[k++ % items.length];
      it.s.position.set(p.x + (Math.random() - 0.5) * 0.12, p.y, p.z + (Math.random() - 0.5) * 0.12);
      it.life = 0; it.max = 1.3 + Math.random() * 0.5;
      it.vx = (Math.random() - 0.5) * 0.12; it.vz = (Math.random() - 0.5) * 0.12; it.ph = Math.random() * 6;
      it.size = size * (0.8 + Math.random() * 0.4);
      it.s.visible = true;
    },
    update(dt) {
      for (const it of items) {
        if (!it.s.visible) continue;
        it.life += dt;
        const t = it.life / it.max;
        if (t >= 1) { it.s.visible = false; continue; }
        it.s.position.y += dt * 0.32;
        it.s.position.x += (it.vx + Math.sin(it.life * 5 + it.ph) * 0.06) * dt;
        it.s.position.z += it.vz * dt;
        const pop = Math.min(1, t * 6);
        it.s.scale.setScalar(it.size * (0.4 + 0.6 * pop) * (1 + 0.08 * Math.sin(it.life * 12)));
        it.s.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const it of items) it.s.material.dispose();
    },
  };
}

/** dispose geometries/materials (skips shared ink + shared toon cache) */
export function disposePet(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (m === _inkMat || m.userData.shared) continue;
        for (const k in m) if (m[k] && m[k].isTexture && m[k] !== _heartTex) m[k].dispose();
        m.dispose();
      }
    }
  });
}
