// Pooled battle FX: one additive particle system (sparks, thruster embers, debris cubes look),
// explosions (core sphere + shell + shockwave ring + sparks + ONE shared PointLight flash),
// muzzle flashes, hit sparks, generic rings, and a screen-shake accumulator.
// All objects are children of `parent` (the arena root, i.e. arena-local space). No per-frame allocations.
import * as THREE from 'three';

const P_VS = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale;
varying float vA; varying vec3 vC;
void main(){
  vA = aAlpha; vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const P_FS = /* glsl */`
varying float vA; varying vec3 vC;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, r));
  a = a * a * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC * a, 1.0);
}`;

export function createFX(parent) {
  const root = new THREE.Group();
  root.name = 'battle-fx';
  parent.add(root);
  const geos = [], mats = [];

  // ------------------------------------------------------------ particles
  const N = 1400;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), maxLife = new Float32Array(N);
  const size0 = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N);
  const col0 = new Float32Array(N * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 30);
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } }, vertexShader: P_VS, fragmentShader: P_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  root.add(points);
  geos.push(pGeo); mats.push(pMat);
  let pNext = 0, pAlive = 0;

  /** spawn one particle. color is THREE.Color (HDR ok). */
  function spark(x, y, z, vx, vy, vz, color, sz = 0.06, lf = 0.5, g = -9, dr = 2) {
    const i = pNext; pNext = (pNext + 1) % N;
    const i3 = i * 3;
    pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
    vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
    col0[i3] = color.r; col0[i3 + 1] = color.g; col0[i3 + 2] = color.b;
    life[i] = lf; maxLife[i] = lf; size0[i] = sz; grav[i] = g; drag[i] = dr;
    pAlive = N;
  }
  /** spherical burst */
  function burst(p, count, color, speed = 4, sz = 0.06, lf = 0.5, g = -9, up = 0.3) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.65);
      spark(p.x, p.y, p.z, s * Math.cos(th) * v, (u + up) * v, s * Math.sin(th) * v, color,
        sz * (0.6 + Math.random() * 0.8), lf * (0.5 + Math.random() * 0.7), g, 2.5);
    }
  }
  /** cone burst around direction d (unit vector) */
  function spray(p, d, count, color, speed = 5, spread = 0.6, sz = 0.05, lf = 0.35, g = -6) {
    for (let k = 0; k < count; k++) {
      const v = speed * (0.4 + Math.random() * 0.6);
      spark(p.x, p.y, p.z,
        (d.x + (Math.random() - 0.5) * spread * 2) * v,
        (d.y + (Math.random() - 0.5) * spread * 2) * v,
        (d.z + (Math.random() - 0.5) * spread * 2) * v,
        color, sz * (0.6 + Math.random() * 0.8), lf * (0.5 + Math.random() * 0.7), g, 3);
    }
  }

  function updateParticles(dt) {
    if (!pAlive) return;
    let any = 0;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      any++;
      life[i] -= dt;
      const i3 = i * 3;
      const f = Math.exp(-drag[i] * dt);
      vel[i3] *= f; vel[i3 + 2] *= f; vel[i3 + 1] = vel[i3 + 1] * f + grav[i] * dt;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.04) { pos[i3 + 1] = 0.04; vel[i3 + 1] *= -0.35; }
      const t = Math.max(0, life[i] / maxLife[i]);
      alpha[i] = t < 0.7 ? t / 0.7 : 1;
      size[i] = size0[i] * (0.4 + 0.6 * t);
      const heat = 0.55 + 0.45 * t;
      col[i3] = col0[i3] * heat; col[i3 + 1] = col0[i3 + 1] * heat * heat; col[i3 + 2] = col0[i3 + 2] * heat * heat;
    }
    if (!any) pAlive = 0;
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aColor.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
  }

  // ------------------------------------------------------------ explosions
  const sphereGeo = new THREE.IcosahedronGeometry(1, 2);
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  geos.push(sphereGeo, ringGeo);
  const EXPL = [];
  for (let i = 0; i < 8; i++) {
    const coreM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const shellM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.BackSide });
    const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    mats.push(coreM, shellM, ringM);
    const core = new THREE.Mesh(sphereGeo, coreM);
    const shell = new THREE.Mesh(sphereGeo, shellM);
    const ring = new THREE.Mesh(ringGeo, ringM);
    core.renderOrder = shell.renderOrder = ring.renderOrder = 11;
    core.visible = shell.visible = ring.visible = false;
    root.add(core, shell, ring);
    EXPL.push({ core, shell, ring, t: 1, dur: 0.6, scale: 1, color: new THREE.Color(), active: false });
  }
  let explNext = 0;

  // ONE pooled PointLight (always in scene; only intensity changes -> no shader recompiles)
  const light = new THREE.PointLight(0xffaa66, 0, 9, 2);
  light.position.set(0, -50, 0);
  root.add(light);
  let lightI = 0;
  const lightColor = new THREE.Color();

  const tmpC = new THREE.Color();
  const WHITE = new THREE.Color(3, 3, 3);
  /** big explosion. scale ~1 for bombs, 2.4 for KO */
  function explosion(p, scale = 1, color = null) {
    const e = EXPL[explNext]; explNext = (explNext + 1) % EXPL.length;
    e.active = true; e.t = 0; e.dur = 0.5 + scale * 0.18; e.scale = scale;
    e.color.copy(color || tmpC.setRGB(4, 1.6, 0.4));
    e.core.position.copy(p); e.shell.position.copy(p);
    e.ring.position.set(p.x, Math.max(0.06, Math.min(p.y, 0.06)), p.z);
    e.core.visible = e.shell.visible = e.ring.visible = true;
    burst(p, Math.round(40 * scale), e.color, 7 * Math.sqrt(scale), 0.09, 0.7, -8, 0.4);
    burst(p, Math.round(20 * scale), WHITE, 4 * Math.sqrt(scale), 0.06, 0.4, -4, 0.2);
    lightI = Math.max(lightI, 18 * scale);
    lightColor.copy(e.color).multiplyScalar(0.3);
    light.color.setRGB(Math.min(1, lightColor.r), Math.min(1, lightColor.g), Math.min(1, lightColor.b));
    light.position.set(p.x, p.y + 0.5, p.z);
    light.distance = 7 + scale * 4;
    shake(0.18 * scale);
  }
  function updateExplosions(dt) {
    for (const e of EXPL) {
      if (!e.active) continue;
      e.t += dt / e.dur;
      const t = e.t;
      if (t >= 1) { e.active = false; e.core.visible = e.shell.visible = e.ring.visible = false; continue; }
      const s = e.scale;
      const ec = 1 - Math.pow(1 - Math.min(1, t * 2.2), 3);
      e.core.scale.setScalar(s * (0.18 + ec * 0.5) * (1 - t * 0.5));
      e.core.material.color.copy(e.color).lerp(WHITE, Math.max(0, 1 - t * 6) * 0.5).multiplyScalar(Math.pow(1 - t, 2) * 0.8);
      e.core.material.opacity = 1;
      e.shell.scale.setScalar(s * (0.35 + ec * 1.2));
      e.shell.material.color.copy(e.color).multiplyScalar(0.28 * (1 - t) * (1 - t));
      e.ring.scale.setScalar(s * (0.3 + t * 2.4));
      e.ring.material.color.copy(e.color).multiplyScalar(0.9 * (1 - t));
    }
  }

  // ------------------------------------------------------------ flashes & rings
  const flashGeo = new THREE.SphereGeometry(1, 10, 8);
  geos.push(flashGeo);
  const FLASH = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    mats.push(m);
    const mesh = new THREE.Mesh(flashGeo, m);
    mesh.visible = false; mesh.renderOrder = 12;
    root.add(mesh);
    FLASH.push({ mesh, t: 1, dur: 0.08, size: 0.1, color: new THREE.Color(), active: false });
  }
  let flashNext = 0;
  function flash(p, color, sz = 0.1, dur = 0.08) {
    const f = FLASH[flashNext]; flashNext = (flashNext + 1) % FLASH.length;
    f.active = true; f.t = 0; f.dur = dur; f.size = sz; f.color.copy(color);
    f.mesh.position.copy(p); f.mesh.visible = true;
  }
  const RINGS = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    mats.push(m);
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.visible = false; mesh.renderOrder = 12;
    root.add(mesh);
    RINGS.push({ mesh, t: 1, dur: 0.4, r0: 0.2, r1: 1, color: new THREE.Color(), active: false });
  }
  let ringNext = 0;
  /** flat expanding ring (landing dust, dash, warp). normal: optional Vector3 to orient */
  function ring(p, color, r0 = 0.2, r1 = 1, dur = 0.4, normal = null) {
    const r = RINGS[ringNext]; ringNext = (ringNext + 1) % RINGS.length;
    r.active = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.color.copy(color).multiplyScalar(0.45);
    r.mesh.position.copy(p);
    if (normal) r.mesh.quaternion.setFromUnitVectors(UP, normal); else r.mesh.quaternion.identity();
    r.mesh.visible = true;
  }
  const UP = new THREE.Vector3(0, 1, 0);
  function updateFlashes(dt) {
    for (const f of FLASH) {
      if (!f.active) continue;
      f.t += dt / f.dur;
      if (f.t >= 1) { f.active = false; f.mesh.visible = false; continue; }
      f.mesh.scale.setScalar(f.size * (0.6 + f.t * 0.8));
      f.mesh.material.color.copy(f.color).multiplyScalar(1 - f.t);
    }
    for (const r of RINGS) {
      if (!r.active) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - r.t, 2);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.mesh.material.color.copy(r.color).multiplyScalar(1 - r.t);
    }
  }

  // ------------------------------------------------------------ helpers
  function muzzle(p, dir, color) {
    flash(p, color, 0.09, 0.07);
    flash(p, WHITE, 0.05, 0.05);
    spray(p, dir, 6, color, 5, 0.35, 0.04, 0.18, 0);
  }
  function hit(p, color, dir = null) {
    flash(p, WHITE, 0.16, 0.1);
    flash(p, color, 0.26, 0.14);
    if (dir) spray(p, dir, 16, color, 5, 0.8, 0.05, 0.35, -8);
    else burst(p, 16, color, 4, 0.05, 0.35, -8);
  }

  // ------------------------------------------------------------ shake
  let shakeAmt = 0;
  function shake(a) { shakeAmt = Math.min(0.5, Math.max(shakeAmt, a)); }

  function update(dt) {
    updateParticles(dt);
    updateExplosions(dt);
    updateFlashes(dt);
    lightI *= Math.exp(-dt * 7);
    if (lightI < 0.05) lightI = 0;
    light.intensity = lightI;
    shakeAmt *= Math.exp(-dt * 6);
    if (shakeAmt < 0.001) shakeAmt = 0;
  }
  function setPointScale(s) { pMat.uniforms.uScale.value = s; }

  function clear() {
    life.fill(0); alpha.fill(0); size.fill(0);
    for (const e of EXPL) { e.active = false; e.core.visible = e.shell.visible = e.ring.visible = false; }
    for (const f of FLASH) { f.active = false; f.mesh.visible = false; }
    for (const r of RINGS) { r.active = false; r.mesh.visible = false; }
  }

  function dispose() {
    root.removeFromParent();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    light.dispose && light.dispose();
  }

  return {
    root, spark, burst, spray, explosion, flash, ring, muzzle, hit, shake, update, clear, dispose, setPointScale,
    get shakeAmount() { return shakeAmt; },
  };
}
