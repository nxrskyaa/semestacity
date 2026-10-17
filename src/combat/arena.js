// Holographic octagon arena: tron grid floor, energy wall, holo cube obstacles,
// plus the arena's own simple collision (octagon boundary + cube AABBs).
// Everything lives in ARENA-LOCAL space (the arena root is placed at the
// holo-table centre / rotY by battle.js); robots and projectiles are children.
import * as THREE from 'three';

export const ARENA_R = 5.6;                                // circumradius (corner) — ~11 m across
export const ARENA_A = ARENA_R * Math.cos(Math.PI / 8);    // apothem (flat edge distance)
export const WALL_H = 1.35;
export const FLOOR_Y = 0.035;                              // hover a hair above the street
const S2 = Math.SQRT1_2;
const NORMALS = [[1, 0], [S2, S2], [0, 1], [-S2, S2]];     // octagon face normals (± each)

export const HOLO_CYAN = new THREE.Color('#5ee7ff');

/** octagon "radius" measured to flat edges (piecewise linear) */
export function octDist(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  return Math.max(ax, az, (ax + az) * S2);
}

// cube layout (local): x, z, half-x, half-z, height
const CUBES = [
  [0.0, 0.0, 0.48, 0.48, 0.72],
  [-2.45, 0.55, 0.62, 0.62, 1.1],
  [2.45, -0.55, 0.62, 0.62, 1.1],
  [-2.7, -2.8, 0.5, 0.5, 1.55],
  [2.7, 2.8, 0.5, 0.5, 1.55],
];

// ---------------------------------------------------------------- shaders
const FLOOR_VS = /* glsl */`
varying vec2 vP;
void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const FLOOR_FS = /* glsl */`
uniform float uTime; uniform float uReveal; uniform float uA; uniform vec3 uColor; uniform float uFlash;
varying vec2 vP;
float octD(vec2 p){ p = abs(p); return max(max(p.x,p.y),(p.x+p.y)*0.70710678); }
float lineAA(float coord, float w){ float fw = fwidth(coord); float d = abs(fract(coord - 0.5) - 0.5); return 1.0 - smoothstep(w*fw, (w+1.2)*fw, d); }
void main(){
  float d = octD(vP);
  float r = length(vP);
  // minor + major grid
  vec2 gc = vP / 0.5;
  float minor = max(lineAA(gc.x, 0.25), lineAA(gc.y, 0.25));
  vec2 gm = vP / 2.0;
  float major = max(lineAA(gm.x, 0.6), lineAA(gm.y, 0.6));
  // concentric rings slowly flowing outward
  float rc = r / 1.3 - uTime * 0.12;
  float rings = lineAA(rc, 0.5) * smoothstep(0.4, 1.4, r);
  // central emblem ring
  float emb = (1.0 - smoothstep(0.0, 0.035, abs(r - 0.95))) + (1.0 - smoothstep(0.0, 0.02, abs(r - 1.12))) * 0.6;
  // edge glow & inner edge line
  float edge = smoothstep(uA - 0.9, uA, d);
  float edgeLine = 1.0 - smoothstep(0.0, 0.04, abs(d - (uA - 0.32)));
  // radar sweep
  float ang = atan(vP.y, vP.x) / 6.2831853 + 0.5;
  float sw = fract(ang - uTime * 0.11);
  float sweep = pow(sw, 10.0) * smoothstep(uA, 0.5, r);
  // scanline shimmer
  float scan = 0.82 + 0.18 * sin(vP.y * 26.0 - uTime * 5.0) * sin(vP.x * 3.0 + uTime * 1.3);
  float lum = minor * 0.085 + major * 0.24 + rings * 0.11 + emb * 0.4 + edge * edge * 0.55 + edgeLine * 0.5 + sweep * 0.16 + 0.012;
  lum *= scan;
  lum *= 1.0 + uFlash;
  // build-up reveal from the centre with a bright front
  float R = uReveal * (uA * 1.5);
  float shown = 1.0 - smoothstep(R - 0.25, R, r);
  float front = exp(-abs(r - R) * 5.0) * (1.0 - step(0.999, uReveal)) * step(0.001, uReveal);
  vec3 col = uColor * (lum * shown + front * 1.6);
  if (d > uA) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

const WALL_VS = /* glsl */`
varying vec2 vUv; varying vec3 vL; varying float vDepth;
void main(){ vUv = uv; vL = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;

const WALL_FS = /* glsl */`
uniform float uTime; uniform float uReveal; uniform vec3 uColor; uniform vec4 uHits[4]; uniform float uH;
varying vec2 vUv; varying vec3 vL; varying float vDepth;
void main(){
  float v = vUv.y;
  if (v > uReveal) discard;
  float base = pow(1.0 - v, 2.2) * 0.3 + smoothstep(0.9, 1.0, v) * 0.32;
  float b = fract(v * 2.2 - uTime * 0.55);
  float bands = smoothstep(0.0, 0.04, b) * (1.0 - smoothstep(0.04, 0.22, b)) * 0.22;
  float cols = 1.0 - smoothstep(0.0, 0.012, abs(fract(vUv.x * 64.0) - 0.5) - 0.47);
  float rows = 1.0 - smoothstep(0.0, 0.03, abs(fract(v * 9.0) - 0.5) - 0.44);
  float grid = max(cols, rows) * 0.07;
  float shimmer = 0.85 + 0.15 * sin(vUv.x * 300.0 + uTime * 3.0 + v * 20.0);
  float rip = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = uTime - uHits[i].w;
    if (age >= 0.0 && age < 1.2) {
      float dd = distance(vL, uHits[i].xyz);
      float ring = exp(-pow((dd - age * 2.4) * 7.0, 2.0)) + exp(-dd * 6.0) * 0.8;
      rip += ring * exp(-age * 3.5) * 1.6;
    }
  }
  float front = (1.0 - smoothstep(0.0, 0.05, abs(v - uReveal))) * step(uReveal, 0.999) * 1.5;
  float lum = (base + bands + grid) * shimmer + rip + front;
  lum *= smoothstep(0.6, 3.2, vDepth); // fade the wall right in front of the camera
  gl_FragColor = vec4(uColor * lum, 1.0);
}`;

const CUBE_VS = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vY;
uniform float uH;
void main(){
  vUv = uv; vY = (position.y / uH) + 0.5;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vV = -mv.xyz; vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const CUBE_FS = /* glsl */`
uniform float uTime; uniform float uReveal; uniform vec3 uColor; uniform float uFlash;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vY;
void main(){
  if (vY > uReveal) discard;
  vec3 n = normalize(vN); vec3 vv = normalize(vV);
  float fres = pow(1.0 - abs(dot(n, vv)), 2.0);
  vec2 e2 = min(vUv, 1.0 - vUv);
  float e = min(e2.x, e2.y);
  float fw = fwidth(e);
  float edge = 1.0 - smoothstep(fw * 1.0, fw * 2.6, e);
  float glow = exp(-e * 22.0) * 0.45;
  float b = fract(vY * 3.0 - uTime * 0.4);
  float scan = smoothstep(0.0, 0.05, b) * (1.0 - smoothstep(0.05, 0.3, b)) * 0.12;
  float lines = (0.5 + 0.5 * sin(vY * 140.0 - uTime * 6.0)) * 0.035;
  float front = (1.0 - smoothstep(0.0, 0.04, abs(vY - uReveal))) * step(uReveal, 0.999) * 2.5;
  float lum = 0.03 + fres * 0.26 + edge * 1.0 + glow * 0.7 + scan + lines + front;
  lum *= 1.0 + uFlash * 2.0;
  lum *= smoothstep(0.35, 1.6, length(vV)); // don't fog the screen when the camera grazes a cube
  gl_FragColor = vec4(uColor * lum, 1.0);
}`;

// --------------------------------------------------------------- builder
export function createArena() {
  const root = new THREE.Group();
  root.name = 'holo-arena';
  const geos = [], mats = [];
  const track = (g, m) => { if (g) geos.push(g); if (m) mats.push(m); };

  const cyan = HOLO_CYAN.clone();

  // dark translucent base so the grid reads (street still shows through)
  const floorGeo = new THREE.CircleGeometry(ARENA_R, 8, Math.PI / 8);
  floorGeo.rotateX(-Math.PI / 2);
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x03101c, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  const base = new THREE.Mesh(floorGeo, baseMat);
  base.position.y = FLOOR_Y - 0.005;
  base.renderOrder = 1;
  root.add(base);
  track(floorGeo, baseMat);

  const floorU = { uTime: { value: 0 }, uReveal: { value: 0 }, uA: { value: ARENA_A }, uColor: { value: cyan }, uFlash: { value: 0 } };
  const floorMat = new THREE.ShaderMaterial({
    uniforms: floorU, vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = FLOOR_Y;
  floor.renderOrder = 2;
  root.add(floor);
  track(null, floorMat);

  // energy wall
  const wallGeo = new THREE.CylinderGeometry(ARENA_R, ARENA_R, WALL_H, 8, 1, true, Math.PI / 8);
  wallGeo.translate(0, WALL_H / 2 + FLOOR_Y, 0);
  const hits = [0, 1, 2, 3].map(() => new THREE.Vector4(0, -10, 0, -99));
  const wallU = { uTime: { value: 0 }, uReveal: { value: 0 }, uColor: { value: cyan }, uHits: { value: hits }, uH: { value: WALL_H } };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: wallU, vertexShader: WALL_VS, fragmentShader: WALL_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.renderOrder = 3;
  root.add(wall);
  track(wallGeo, wallMat);
  let hitIdx = 0;

  // bright octagon rims + corner posts (bloom)
  const rimMat = new THREE.MeshBasicMaterial({ color: cyan.clone().multiplyScalar(2.6), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  track(null, rimMat);
  const rimGeo = new THREE.TorusGeometry(ARENA_R, 0.022, 5, 8);
  rimGeo.rotateZ(Math.PI / 8); rimGeo.rotateX(-Math.PI / 2);
  track(rimGeo);
  const rimBottom = new THREE.Mesh(rimGeo, rimMat); rimBottom.position.y = FLOOR_Y + 0.01;
  const rimTop = new THREE.Mesh(rimGeo, rimMat); rimTop.position.y = FLOOR_Y + WALL_H;
  root.add(rimBottom, rimTop);
  const postGeo = new THREE.CylinderGeometry(0.035, 0.035, WALL_H + 0.12, 6);
  postGeo.translate(0, (WALL_H + 0.12) / 2 + FLOOR_Y, 0);
  track(postGeo);
  const posts = new THREE.InstancedMesh(postGeo, rimMat, 8);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + i * Math.PI / 4;
    m4.makeTranslation(Math.cos(a) * ARENA_R, 0, Math.sin(a) * ARENA_R);
    posts.setMatrixAt(i, m4);
  }
  root.add(posts);

  // holo cubes
  const cubes = [];
  for (const [x, z, hx, hz, h] of CUBES) {
    const g = new THREE.BoxGeometry(hx * 2, h, hz * 2);
    const u = { uTime: { value: 0 }, uReveal: { value: 0 }, uColor: { value: cyan }, uH: { value: h }, uFlash: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, vertexShader: CUBE_VS, fragmentShader: CUBE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, FLOOR_Y + h / 2, z);
    mesh.renderOrder = 4;
    root.add(mesh);
    track(g, m);
    cubes.push({ x, z, hx, hz, h, top: FLOOR_Y + h, mesh, u, flash: 0,
      minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
  }

  let build = 0;
  function setBuild(t) {
    build = t;
    const f = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    floorU.uReveal.value = f(0.0, 0.55);
    wallU.uReveal.value = f(0.3, 0.75);
    const rimOn = f(0.3, 0.45);
    rimMat.opacity = rimOn;
    rimTop.visible = wallU.uReveal.value > 0.98;
    posts.scale.y = Math.max(0.001, f(0.3, 0.75));
    cubes.forEach((c, i) => { c.u.uReveal.value = f(0.5 + i * 0.07, 0.75 + i * 0.07); });
    base.material.opacity = 0.6 * f(0.0, 0.5);
  }
  setBuild(0);

  // ---------------------------------------------------------- collision
  /** push a circle (local x,z) out of cubes & wall. feetY = bottom of the robot. */
  function resolveCircle(pos, r) {
    const feet = pos.y;
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      if (feet >= c.top - 0.06) continue;
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + dx / d * r; pos.z = cz + dz / d * r;
      } else {
        // centre inside the box: push along minimum penetration axis
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pb = pos.z - c.minZ, pf = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pb, pf);
        if (m === pl) pos.x = c.minX - r; else if (m === pr) pos.x = c.maxX + r;
        else if (m === pb) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
      }
    }
    const lim = ARENA_A - r - 0.04;
    for (let k = 0; k < 4; k++) {
      const nx = NORMALS[k][0], nz = NORMALS[k][1];
      const d = pos.x * nx + pos.z * nz;
      if (d > lim) { pos.x -= nx * (d - lim); pos.z -= nz * (d - lim); }
      else if (d < -lim) { pos.x -= nx * (d + lim); pos.z -= nz * (d + lim); }
    }
  }

  /** highest walkable surface under a circle whose feet are at feetY */
  function groundAt(x, z, r, feetY) {
    let g = FLOOR_Y;
    const rr = r * 0.55;
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      if (feetY < c.top - 0.12) continue;
      if (x + rr < c.minX || x - rr > c.maxX || z + rr < c.minZ || z - rr > c.maxZ) continue;
      if (c.top > g) g = c.top;
    }
    return g;
  }

  /** segment vs cubes, wall & floor. Returns t in [0,1] of first hit or -1; out.kind = 'cube'|'wall'|'floor' */
  function segmentHit(p0, p1, out) {
    let best = 2, kind = null, cube = null;
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      const t = slab(p0.x, p0.y, p0.z, dx, dy, dz, c.minX, FLOOR_Y, c.minZ, c.maxX, c.top, c.maxZ);
      if (t >= 0 && t < best) { best = t; kind = 'cube'; cube = c; }
    }
    const d1 = octDist(p1.x, p1.z);
    if (d1 > ARENA_A) {
      const d0 = octDist(p0.x, p0.z);
      const t = d1 > d0 ? Math.max(0, (ARENA_A - d0) / (d1 - d0)) : 0;
      if (t < best) { best = t; kind = 'wall'; cube = null; }
    }
    if (p1.y < FLOOR_Y) {
      const t = p0.y > FLOOR_Y ? (p0.y - FLOOR_Y) / (p0.y - p1.y) : 0;
      if (t < best) { best = t; kind = 'floor'; cube = null; }
    }
    if (best > 1) return -1;
    if (out) { out.kind = kind; out.cube = cube; }
    return best;
  }

  /** true if nothing blocks the straight line a->b (cubes only) */
  function lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      const t = slab(a.x, a.y, a.z, dx, dy, dz, c.minX, FLOOR_Y, c.minZ, c.maxX, c.top, c.maxZ);
      if (t >= 0 && t <= 1) return false;
    }
    return true;
  }

  function wallHit(p) {
    const h = hits[hitIdx]; hitIdx = (hitIdx + 1) % 4;
    h.set(p.x, p.y, p.z, floorU.uTime.value);
  }
  function cubeHit(c) { if (c) c.flash = 1; }
  function flash(v) { floorU.uFlash.value = Math.max(floorU.uFlash.value, v); }

  function update(dt, time) {
    floorU.uTime.value = time; wallU.uTime.value = time;
    floorU.uFlash.value = Math.max(0, floorU.uFlash.value - dt * 3);
    for (const c of cubes) {
      c.u.uTime.value = time;
      c.flash = Math.max(0, c.flash - dt * 4);
      c.u.uFlash.value = c.flash;
    }
    rimMat.color.copy(cyan).multiplyScalar(2.3 + Math.sin(time * 3) * 0.3);
  }

  function dispose() {
    root.removeFromParent();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    posts.dispose();
  }

  return {
    root, cubes, setBuild, get build() { return build; },
    resolveCircle, groundAt, segmentHit, lineOfSight, wallHit, cubeHit, flash, update, dispose,
  };
}

// segment (origin o, delta d) vs AABB; returns entry t in [0,1] or -1
function slab(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0, tmax = 1;
  // x
  if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) return -1; }
  else {
    let t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) return -1; }
  else {
    let t1 = (minY - oy) / dy, t2 = (maxY - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) return -1; }
  else {
    let t1 = (minZ - oz) / dz, t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1;
  }
  return tmin;
}
