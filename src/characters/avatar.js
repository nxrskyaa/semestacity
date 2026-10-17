// Avatar = rig + baked meshes (one merged mesh per joint & material, one merged outline per joint)
// + face atlas + hair + clothes + umbrella prop + procedural Animator.
import * as THREE from 'three';
import { sanitizeAppearance } from './appearance.js';
import { buildRig, bodyDims, buildSkin, HEADC_Y, neckRadius } from './body.js';
import { headGeometry, faceDecalGeometry, makeFaceTexture, makeTattooTexture, FaceAnimator, HEAD } from './face.js';
import { buildHair } from './hair.js';
import { buildClothes, coverage, hasHat } from './clothes.js';
import { buildHeadwear, isHood } from './headwear.js';
import { createAura } from './aura.js';
import { charMat, prep, merge, hullGeo, outlineMat, ellipsoid, weld, OUTLINE_COLOR } from './geom.js';
import { createUmbrella, createPhone, createBroom, createRag } from './props.js';
import { Animator } from './anims.js';
import { toonMat } from '../gfx/toon.js';

export { PRESETS, PRESET_IDS, OPTIONS, DEFAULT_APPEARANCE, GENDER_DEFAULTS, hairOptionsFor, randomAppearance, sanitizeAppearance } from './appearance.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const HOOK_YAW = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI * 0.5);
const _back = new THREE.Vector3();

const SKIRT_HEADER = /* glsl */`uniform vec3 uKneeL; uniform vec3 uKneeR; uniform float uSkTop; uniform float uSkBot;`;
const SKIRT_BODY = /* glsl */`{
  float h = clamp((uSkTop - transformed.y) / (uSkTop - uSkBot), 0.0, 1.0);
  vec2 n = normalize(transformed.xz + vec2(1e-5));
  float wl = clamp(0.5 + n.x * 1.4, 0.0, 1.0), wr = clamp(0.5 - n.x * 1.4, 0.0, 1.0);
  float pl = max(0.0, dot(n, uKneeL.xz)) * wl, pr = max(0.0, dot(n, uKneeR.xz)) * wr;
  float push = (pl + pr) * pow(h, 1.4) * 0.6;
  transformed.xz += n * push;
  transformed.y += push * 0.4;
}`;

function jointMap(rig) {
  return {
    hips: rig.hips, spine: rig.spine, chest: rig.chest, neck: rig.neck, head: rig.head, headC: rig.headC,
    upperL: rig.armL.upper, foreL: rig.armL.fore, handL: rig.armL.hand, fingersL: rig.armL.fingers,
    upperR: rig.armR.upper, foreR: rig.armR.fore, handR: rig.armR.hand, fingersR: rig.armR.fingers,
    upLegL: rig.legL.up, legL: rig.legL.low, footL: rig.legL.foot,
    upLegR: rig.legR.up, legR: rig.legR.low, footR: rig.legR.foot,
  };
}

export function createAvatar(appearance) {
  let app = sanitizeAppearance(appearance);
  const root = new THREE.Group();
  root.name = 'avatar';
  let rig = null, anim = null, joints = null, face = null, hair = null;
  let built = [];       // meshes to dispose
  let ownedMats = [];   // unique materials to dispose
  let ownedTex = [];
  let skirtU = null;
  let triangles = 0;
  let umbEnabled = true;
  let umbOpen = 0;
  const props = { umbrella: null, phone: null, broom: null };
  const umbMount = new THREE.Group();
  const sway = { tip: new THREE.Vector3(), vel: new THREE.Vector3(), init: false, prevHead: new THREE.Vector3() };
  let raining = true;
  let idleMode = 'stand';
  let aura = null, headwear = null;

  function build() {
    const d = bodyDims(app);
    const prevAnim = anim;
    if (rig) { root.remove(rig.scaleG); }
    rig = buildRig(d);
    root.add(rig.scaleG);
    joints = jointMap(rig);
    anim = new Animator(rig);
    if (prevAnim) {
      anim.onFootstep = prevAnim.onFootstep; anim.t = prevAnim.t; anim.cycle = prevAnim.cycle; anim.mode = prevAnim.mode;
      anim.modeW = prevAnim.modeW; anim.umbW = prevAnim.umbW; anim.umbOn = prevAnim.umbOn; anim.attn = prevAnim.attn;
    } else anim.mode = idleMode;
    api.anim = anim;
    api.rig = rig;
    triangles = 0;

    const buckets = new Map();
    const add = (key, geo, mat, opts = {}) => {
      if (!joints[key]) { console.warn('no joint', key); return; }
      const m = mat === 'skin' ? charMat(app.skin, 'skin') : mat;
      let b = buckets.get(key);
      if (!b) { b = { mats: new Map(), outlines: new Map() }; buckets.set(key, b); }
      const g = prep(geo.getAttribute('uv') && !geo.userData.keepUV ? weld(geo) : geo);
      if (!b.mats.has(m)) b.mats.set(m, { geos: [], shadow: opts.shadow !== false });
      b.mats.get(m).geos.push(g);
      // head-local parts are scaled up by headScale: keep their ink line about as thick as the body's
      const ot = (opts.outline ?? 0.0035) * (key === 'headC' ? 1.25 / d.headScale : 1);
      if (ot > 0) {
        const om = opts.outlineMat || outlineMat;
        if (!b.outlines.has(om)) b.outlines.set(om, []);
        // optional lower-res stand-in for the hull (same surface, fewer triangles)
        b.outlines.get(om).push(hullGeo(opts.hullGeo ? prep(opts.hullGeo) : g, ot));
      }
    };

    // skirt deformer materials (per avatar)
    skirtU = { uKneeL: { value: new THREE.Vector3() }, uKneeR: { value: new THREE.Vector3() }, uSkTop: { value: 0.11 }, uSkBot: { value: -0.22 } };
    const deformify = (mat, key) => {
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, skirtU);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${SKIRT_HEADER}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${SKIRT_BODY}`);
      };
      mat.customProgramCacheKey = () => key;
      ownedMats.push(mat);
      return mat;
    };
    const skirtMats = new Map();
    const deform = {
      skirtMat: (color) => {
        if (skirtMats.has(color)) return skirtMats.get(color);
        const m = toonMat(color, { unique: true });
        const ref = charMat(color);
        m.gradientMap = ref.gradientMap; m.emissive.copy(ref.emissive);
        skirtMats.set(color, deformify(m, 'skirt-deform'));
        return m;
      },
      skirtOutline: deformify(new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }), 'skirt-deform-outline'),
    };

    // ---- head
    const headGeo = headGeometry(36, 28, d.fem ? 0.34 : 0.44);
    add('headC', headGeo.clone(), 'skin', { outline: 0.003, hullGeo: headGeometry(28, 20, d.fem ? 0.34 : 0.44) });
    for (const s of [-1, 1]) {
      const ear = ellipsoid(0.011, 0.02, 0.008, 10, 8);
      ear.rotateY(s * 0.5); ear.rotateZ(s * -0.12);
      ear.translate(s * 0.087, HEAD.eyeY - 0.004, -0.012);
      add('headC', ear, 'skin', { outline: 0.002 });
    }
    // face decal
    const faceTex = makeFaceTexture(app);
    ownedTex.push(faceTex);
    const faceMat = toonMat('#ffffff', { unique: true, map: faceTex, transparent: true });
    faceMat.gradientMap = charMat(app.skin, 'skin').gradientMap;
    faceMat.emissiveMap = faceTex;
    faceMat.emissive = new THREE.Color(0.34, 0.34, 0.36);
    faceMat.depthWrite = false;
    faceMat.polygonOffset = true; faceMat.polygonOffsetFactor = -2; faceMat.polygonOffsetUnits = -2;
    ownedMats.push(faceMat);
    const faceMesh = new THREE.Mesh(faceDecalGeometry(headGeo), faceMat);
    faceMesh.name = 'face';
    faceMesh.renderOrder = 1;
    rig.headC.add(faceMesh);
    built.push(faceMesh);
    face = new FaceAnimator(faceTex);
    triangles += faceMesh.geometry.index.count / 3;

    // ---- neck tattoo (painted decal wrapped around the character's left side of the neck)
    if (app.neckTattoo === 'dragon') {
      const tt = makeTattooTexture();
      ownedTex.push(tt);
      const tm = toonMat('#ffffff', { unique: true, map: tt, transparent: true });
      tm.gradientMap = charMat(app.skin, 'skin').gradientMap;
      tm.depthWrite = false; tm.polygonOffset = true; tm.polygonOffsetFactor = -2; tm.polygonOffsetUnits = -2;
      ownedMats.push(tm);
      const nr = neckRadius(rig.d);
      const tg = new THREE.CylinderGeometry(nr * 1.07, nr * 1.35, 0.075, 16, 1, true, 0.05, 2.3);
      tg.translate(0, 0.035, 0.002);
      const tmesh = new THREE.Mesh(tg, tm);
      tmesh.name = 'tattoo'; tmesh.renderOrder = 1;
      rig.neck.add(tmesh);
      built.push(tmesh);
    }

    // ---- headwear (gacha)
    const hood = isHood(app.headwear);
    headwear = buildHeadwear(app.headwear, add, { hairColor: app.hairColor });
    for (const e of headwear.extras) { rig.headC.add(e); built.push(e); }
    for (const o of headwear.owned) (o.isTexture ? ownedTex : ownedMats).push(o);

    // ---- hair
    const hat = hasHat(app);
    const capHead = headGeometry(30, 22);
    hair = buildHair(app.hairStyle, app.hairColor, capHead, { hat, hood, streak: app.hairStreak, outlineT: 0.0026 * 1.25 / rig.d.headScale });
    capHead.dispose();
    rig.headC.add(hair.mesh);
    for (const e of hair.extras) { rig.headC.add(e); built.push(e); }
    built.push(hair.mesh, hair.outline);
    ownedMats.push(...hair.materials);
    triangles += hair.tris * 2;
    // pivot of the counter-rotation: neck joint in headC space
    const hs = rig.d.headScale;
    hair.uniforms.uPivot.value.set(0, -(HEADC_Y * hs + rig.d.headY) / hs, -0.016 / hs);
    sway.init = false;

    // ---- body + clothes
    const cover = coverage(app);
    buildSkin(rig, rig.d, add, cover);
    buildClothes(app, rig.d, add, { deform, headGeo, hood });
    headGeo.dispose();

    // ---- bake buckets
    for (const [key, b] of buckets) {
      const j = joints[key];
      for (const [mat, { geos, shadow }] of b.mats) {
        const g = merge(geos);
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = shadow && !mat.transparent;
        mesh.receiveShadow = false;
        if (mat.customProgramCacheKey?.() === 'skirt-deform') mesh.frustumCulled = false;
        j.add(mesh);
        built.push(mesh);
        triangles += g.index.count / 3;
      }
      for (const [om, geos] of b.outlines) {
        const g = merge(geos);
        const o = new THREE.Mesh(g, om);
        o.name = 'outline';
        o.raycast = () => {};
        o.castShadow = false;
        if (om !== outlineMat) o.frustumCulled = false;
        j.add(o);
        built.push(o);
        triangles += g.index.count / 3;
      }
    }

    // ---- umbrella mount (re-parent to new rig)
    if (props.umbrella) { props.umbrella.removeFromParent(); disposeProp(props.umbrella); props.umbrella = null; }
    if (app.umbrella) props.umbrella = createUmbrella(app.umbrellaColor, app.umbrellaStyle);
    umbMount.clear();
    if (props.umbrella) umbMount.add(props.umbrella);
    rig.armR.grip.add(umbMount);
    umbMount.visible = umbOpen > 0.02;
    attachIdleProps();
    // ---- aura
    if (aura) { aura.dispose(); aura = null; }
    aura = createAura(app.aura);
    if (aura) root.add(aura.root);
  }

  function disposeProp(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !o.material.userData.shared && o.material !== outlineMat) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (!(m.isMeshToonMaterial && !m.map)) m.dispose();
      }
    });
  }

  function attachIdleProps() {
    for (const k of ['phone', 'broom', 'rag']) if (props[k]) { props[k].removeFromParent(); }
    if (idleMode === 'counter') {
      if (!props.rag) props.rag = createRag();
      props.rag.position.set(0, -0.004, 0.006);
      rig.armR.grip.add(props.rag);
    }
    if (idleMode === 'phone') {
      if (!props.phone) props.phone = createPhone();
      props.phone.position.set(-0.012, -0.008, 0.012);
      props.phone.rotation.set(-0.3, -1.2, 0.2);
      rig.armL.grip.add(props.phone);
    }
    if (idleMode === 'sweep') {
      if (!props.broom) props.broom = createBroom();
      props.broom.position.set(0, 0, 0);
      props.broom.rotation.set(0.4, 0, 0.3);
      rig.armR.grip.add(props.broom);
    }
  }

  function clearBuilt() {
    for (const o of built) {
      o.removeFromParent();
      if (o.geometry) o.geometry.dispose();
    }
    built = [];
    for (const m of ownedMats) m.dispose();
    ownedMats = [];
    for (const t of ownedTex) t.dispose();
    ownedTex = [];
  }

  const lookLocal = new THREE.Vector3();
  const invRoot = new THREE.Matrix4();

  const api = {
    root,
    rig: null,
    anim: null,
    get appearance() { return app; },
    get triangles() { return triangles; },
    set onFootstep(fn) { anim.onFootstep = fn; },
    get onFootstep() { return anim.onFootstep; },
    setAppearance(a) {
      app = sanitizeAppearance(a);
      clearBuilt();
      build();
    },
    /** allow / forbid holding the umbrella (e.g. false under a roof). Appearance.umbrella must also be true. */
    setUmbrella(on) { umbEnabled = !!on; },
    /** NPC idle variant: 'stand' | 'phone' | 'lean' | 'sweep' | 'counter' */
    setIdleMode(mode) {
      idleMode = mode || 'stand';
      anim.mode = idleMode;
      attachIdleProps();
    },
    playEmote(name) { anim.playEmote(name); },
    /** NPC attention: relaxes idle variants (phone lowered, broom still) while true */
    setAttention(on) { anim.attn = !!on; },
    headWorldPos(target = new THREE.Vector3()) {
      return rig.headC.getWorldPosition(target);
    },
    /** grip point of a hand (side +1 left, -1 right) for props the player hands over */
    handWorldPos(side = -1, target = new THREE.Vector3()) {
      return (side > 0 ? rig.armL : rig.armR).grip.getWorldPosition(target);
    },
    update(dt, state = {}) {
      dt = Math.min(dt || 0, 0.1);
      raining = state.raining !== false;
      const wantUmb = app.umbrella && umbEnabled && raining && idleMode !== 'sweep' && idleMode !== 'counter';
      anim.umbOn = wantUmb;
      umbOpen = THREE.MathUtils.damp(umbOpen, wantUmb ? 1 : 0, wantUmb ? 4 : 6, dt);
      // look target into avatar-local space relative to the head
      let ll = null;
      if (state.lookAt) {
        root.updateMatrixWorld();
        invRoot.copy(root.matrixWorld).invert();
        lookLocal.copy(state.lookAt).applyMatrix4(invRoot);
        lookLocal.y -= rig.d.eyeY * rig.d.scale;
        lookLocal.z -= 0.03;
        ll = lookLocal;
      }
      anim.update(dt, state, ll);
      face.update(dt, { talking: !!state.talking, happy: anim.face.happy, eyesClosed: anim.face.eyesClosed });
      root.updateMatrixWorld(true);
      updateHairSway(dt);
      updateSkirt();
      updateUmbrella();
      if (props.phone && props.phone.parent) props.phone.userData.screen.material.color.setScalar(2.0 + 0.2 * Math.sin(anim.t * 3));
      if (headwear) headwear.update(anim.t);
      if (aura) aura.update(dt, anim.t);
    },
    dispose() {
      clearBuilt();
      if (props.umbrella) disposeProp(props.umbrella);
      if (props.phone) disposeProp(props.phone);
      if (props.broom) disposeProp(props.broom);
      if (props.rag) disposeProp(props.rag);
      if (aura) aura.dispose();
      root.removeFromParent();
    },
  };

  function updateHairSway(dt) {
    if (!hair) return;
    const U = hair.uniforms;
    const hc = rig.headC;
    hc.getWorldPosition(_v);
    rig.chest.getWorldQuaternion(_q);
    const L = 0.35 * rig.d.scale;
    const anchor = _v2.set(0, -L, 0).applyQuaternion(_q).add(_v);
    if (!sway.init || dt <= 0) { sway.tip.copy(anchor); sway.vel.set(0, 0, 0); sway.init = true; }
    const K = 70, D = 9;
    const ax = (anchor.x - sway.tip.x) * K - sway.vel.x * D;
    const ay = (anchor.y - sway.tip.y) * K - sway.vel.y * D;
    const az = (anchor.z - sway.tip.z) * K - sway.vel.z * D;
    sway.vel.x += ax * dt; sway.vel.y += ay * dt; sway.vel.z += az * dt;
    sway.tip.addScaledVector(sway.vel, dt);
    const off = _v.copy(sway.tip).sub(anchor);
    if (off.length() > 0.25) off.setLength(0.25);
    // idle breeze
    const t = anim.t;
    off.x += 0.004 * Math.sin(t * 1.7); off.z += 0.004 * Math.sin(t * 1.1 + 1);
    hc.getWorldQuaternion(_q2);
    const ws = hc.getWorldScale(_v2).x;
    off.applyQuaternion(_q2.invert()).multiplyScalar(hair.swayK * 0.55 / ws);
    U.uSway.value.copy(off);
    // counter-rotate long hair against head turns relative to the chest
    hc.getWorldQuaternion(_q2);
    const rel = _q.invert().multiply(_q2); // chest^-1 * head
    rel.invert();
    _m.makeRotationFromQuaternion(rel);
    U.uCounter.value.setFromMatrix4(_m);
  }

  function updateSkirt() {
    if (!skirtU) return;
    for (const [Lg, u] of [[rig.legL, skirtU.uKneeL], [rig.legR, skirtU.uKneeR]]) {
      _v.set(0, -rig.d.thigh, 0).applyEuler(Lg.up.rotation);
      u.value.set(_v.x, 0, _v.z); // knee offset from rest (hips space); only the horizontal part matters
    }
  }

  function updateUmbrella() {
    const u = props.umbrella;
    if (!u) return;
    umbMount.visible = umbOpen > 0.02;
    if (!umbMount.visible) return;
    const k = umbOpen;
    u.scale.set(0.15 + 0.85 * k, 0.6 + 0.4 * k, 0.15 + 0.85 * k);
    u.userData.canopyMat.opacity = (u.userData.opaque ? 1 : 0.28) * Math.min(1, k * 1.5);
    if (u.userData.underMat) u.userData.underMat.opacity = Math.min(1, k * 1.5);
    // aim the shaft from the hand toward a point above the head, upright in world
    rig.armR.grip.updateWorldMatrix(true, false);
    const gp = rig.armR.grip.getWorldPosition(_v);
    const hp = rig.headC.getWorldPosition(_v2);
    root.getWorldQuaternion(_q);
    // pass beside the (big) head on the right side, slightly behind it
    const back = _back.set(-0.13 * rig.d.scale, 0, -0.05).applyQuaternion(_q);
    const dir = hp.add(back).addScaledVector(UP, 1.0 * rig.d.scale).sub(gp).normalize();
    dir.lerp(UP, 0.35).normalize();
    _q2.setFromUnitVectors(UP, dir).multiply(_q);
    _q2.multiply(HOOK_YAW);
    rig.armR.grip.getWorldQuaternion(_q).invert();
    umbMount.quaternion.copy(_q).multiply(_q2);
  }

  build();
  return api;
}
