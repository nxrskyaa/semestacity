// GLB characters (modelled in Blender, see docs/CHARACTERS.md) behind the same API as createAvatar().
// The procedural rig from body.js is kept as an invisible animation driver: the Animator poses it exactly as for
// the procedural avatars, and every frame its joint rotations are re-targeted onto the GLB skeleton
// (world-space deltas from the rest pose, so the two rigs' bone axes never have to match).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { sanitizeAppearance } from './appearance.js';
import { buildRig, bodyDims, CHAR_SCALE } from './body.js';
import { Animator } from './anims.js';
import { toonGradient } from '../gfx/toon.js';
import { OUTLINE_COLOR } from './geom.js';
import { createPhone, createBroom, createRag } from './props.js';

export const MODEL_IDS = ['littlechip', 'eric', 'dikzzy', 'baster', 'ade', 'koushik', 'rollins', 'nxr'];

// per-model tuning: armDrop = how far the A-pose arms are brought toward the driver rig's hanging arms (0..1),
// outline = ink thickness (m)
const CFG = {
  default: { armDrop: 0.45, outline: 0.0045 },
  dikzzy: { armDrop: 0.25 },
  baster: { armDrop: 0.3 },
  nxr: { armDrop: 0.15 },
};

const cache = new Map();

// inverted-hull ink only up close; further away the post-FX depth outline is enough
const OUTLINE_DIST = 16;
let viewCam = null;
/** camera used to fade out per-character outlines with distance (call once with the main camera) */
export function setCharacterCamera(cam) { viewCam = cam; }

/** Load every character GLB once (call during boot). Missing files are skipped (procedural fallback). */
/** onProgress(frac 0..1) — by downloaded bytes when the server sends sizes, else by file count */
export async function preloadCharacterModels(onProgress) {
  const loader = new GLTFLoader();
  const got = new Map(), tot = new Map();
  let done = 0;
  const report = () => {
    let a = 0, b = 0;
    for (const id of MODEL_IDS) { a += got.get(id) || 0; b += tot.get(id) || 0; }
    const byFiles = done / MODEL_IDS.length;
    onProgress?.(b > 0 && tot.size === MODEL_IDS.length ? Math.max(byFiles, a / b) : byFiles);
  };
  await Promise.all(MODEL_IDS.map((id) => new Promise((resolve) => {
    loader.load(`/models/${id}.glb`, (gltf) => {
      cache.set(id, gltf); done++; got.set(id, tot.get(id) || 0); report(); resolve();
    }, (e) => {
      if (e.lengthComputable) { tot.set(id, e.total); got.set(id, e.loaded); report(); }
    }, (err) => {
      console.warn(`[glbAvatar] ${id}.glb not loaded`, err); done++; report(); resolve();
    });
  })));
  return cache;
}

export function hasModel(id) { return !!id && cache.has(id); }

// ---------------------------------------------------------------- materials
const outlineHeader = /* glsl */`uniform float uOutline;`;
function outlineMaterial(thick) {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: thick };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${outlineHeader}`)
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize(objectNormal) * uOutline;');
  };
  m.customProgramCacheKey = () => `glb-outline-${thick}`;
  return m;
}

function toToon(std) {
  const m = new THREE.MeshToonMaterial({
    color: std.color ? std.color.clone() : 0xffffff,
    map: std.map || null,
    normalMap: std.normalMap || null,
    gradientMap: toonGradient(),
    transparent: std.transparent,
    alphaTest: std.alphaTest,
    side: std.side,
  });
  if (std.normalMap) m.normalScale.copy(std.normalScale);
  // lift the darkest toon band a little so faces stay readable in the night city
  m.emissive = new THREE.Color(0.1, 0.1, 0.12);
  if (std.map) m.emissiveMap = std.map;
  m.name = std.name;
  return m;
}

// ---------------------------------------------------------------- retarget map (driver joint -> GLB bone)
const PAIRS = [
  // [driver path, bone name, mode, child driver path (aim)]
  ['hips', 'hips', 'delta'],
  ['spine', 'spine', 'delta'],
  ['chest', 'chest', 'delta'],
  ['neck', 'neck', 'delta'],
  ['head', 'head', 'delta'],
  ['armL.upper', 'upperArm_L', 'aim', 'armL.fore', 'L'],
  ['armL.fore', 'lowerArm_L', 'aim', 'armL.hand', 'L'],
  ['armL.hand', 'hand_L', 'delta', null, 'L'],
  ['armR.upper', 'upperArm_R', 'aim', 'armR.fore', 'R'],
  ['armR.fore', 'lowerArm_R', 'aim', 'armR.hand', 'R'],
  ['armR.hand', 'hand_R', 'delta', null, 'R'],
  ['legL.up', 'upperLeg_L', 'aim', 'legL.low'],
  ['legL.low', 'lowerLeg_L', 'aim', 'legL.foot'],
  ['legL.foot', 'foot_L', 'delta'],
  ['legR.up', 'upperLeg_R', 'aim', 'legR.low'],
  ['legR.low', 'lowerLeg_R', 'aim', 'legR.foot'],
  ['legR.foot', 'foot_R', 'delta'],
];
const get = (rig, path) => path.split('.').reduce((o, k) => o[k], rig);

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** rotation of o relative to root (root's world rotation removed) */
const _qw = new THREE.Quaternion();
function relQ(o, rootInv, out) { o.getWorldQuaternion(_qw); return out.copy(rootInv).multiply(_qw); }
function relP(o, rootM, out) { return o.getWorldPosition(out).applyMatrix4(rootM); }

export function createGLBAvatar(modelId, appearance) {
  const gltf = cache.get(modelId);
  if (!gltf) throw new Error(`model ${modelId} not preloaded`);
  const cfg = { ...CFG.default, ...(CFG[modelId] || {}) };
  const app = sanitizeAppearance(appearance);
  const root = new THREE.Group();
  root.name = `glb-${modelId}`;

  // ---- invisible driver rig + animator (same as the procedural avatars)
  const rig = buildRig(bodyDims(app));
  root.add(rig.scaleG);
  const anim = new Animator(rig);
  let idleMode = 'stand';
  anim.mode = idleMode;

  // ---- model
  const model = SkeletonUtils.clone(gltf.scene);
  model.scale.setScalar(CHAR_SCALE);
  root.add(model);
  const bones = {};
  const ownedMats = [];
  const olMat = outlineMaterial(cfg.outline);
  ownedMats.push(olMat);
  let triangles = 0;
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) meshes.push(o);
  });
  // skinned bounds don't follow the pose: use one fixed, generous sphere around the standing character
  // (keeps frustum + shadow-camera culling working; a disabled cull cost ~40% fps with 8 NPCs)
  const bounds = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.2);
  const outlines = [];
  for (const o of meshes) {
    o.material = toToon(o.material);
    ownedMats.push(o.material);
    o.castShadow = true;
    o.receiveShadow = false;
    o.boundingSphere = bounds.clone();
    triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (o.isSkinnedMesh) {
      const ol = new THREE.SkinnedMesh(o.geometry, olMat);
      ol.name = 'outline';
      ol.bind(o.skeleton, o.bindMatrix);
      ol.boundingSphere = bounds.clone();
      ol.castShadow = false;
      ol.raycast = () => {};
      o.parent.add(ol);
      outlines.push(ol);
    }
  }

  // ---- rest data (captured with root at the origin, unrotated)
  root.updateMatrixWorld(true);
  const ident = new THREE.Quaternion();
  const identM = new THREE.Matrix4();
  const pairs = [];
  for (const [jp, bn, mode, childPath, side] of PAIRS) {
    const bone = bones[bn];
    if (!bone) continue;
    const j = get(rig, jp);
    const p = { j, bone, mode, side, child: childPath ? get(rig, childPath) : null };
    p.restJ = relQ(j, ident, new THREE.Quaternion());
    p.restB = relQ(bone, ident, new THREE.Quaternion());
    if (mode === 'aim') {
      p.restJdir = relP(p.child, identM, new THREE.Vector3()).sub(relP(j, identM, _v)).normalize();
    }
    pairs.push(p);
  }
  // arm "drop": bring the A-pose rest toward the driver's hanging arm, same rotation for the whole arm chain
  const drop = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
  for (const s of ['L', 'R']) {
    const up = bones[`upperArm_${s}`], lo = bones[`lowerArm_${s}`];
    const pj = pairs.find((p) => p.bone === up);
    if (!up || !lo || !pj) continue;
    const bdir = relP(lo, identM, new THREE.Vector3()).sub(relP(up, identM, _v)).normalize();
    _q.setFromUnitVectors(bdir, pj.restJdir);
    drop[s].slerp(_q, cfg.armDrop);
  }
  for (const p of pairs) if (p.side) p.restB.premultiply(drop[p.side]);
  const hipsP = pairs.find((p) => p.bone === bones.hips);
  const hipsRestB = bones.hips ? relP(bones.hips, identM, new THREE.Vector3()) : null;
  const hipsRestJ = relP(rig.hips, identM, new THREE.Vector3());
  const hipsK = hipsRestB ? hipsRestB.y / Math.max(0.1, hipsRestJ.y) : 1;
  // head point for name tags / camera: middle of the head above the head bone
  const headBone = bones.head;
  const topY = new THREE.Box3().setFromObject(model).max.y;
  const headPoint = new THREE.Vector3();
  if (headBone) {
    const hy = relP(headBone, identM, _v).y;
    headPoint.copy(headBone.worldToLocal(_v2.set(0, (hy + topY) / 2, 0)));
  }
  // twin-tail bones (Littlechip): gentle idle sway on top of their rest
  const tails = ['tail1_L', 'tail1_R', 'tail2_L', 'tail2_R'].map((n) => bones[n]).filter(Boolean).map((b) => ({ b, rest: b.quaternion.clone() }));

  // ---- idle props (phone / broom / rag) ride on the GLB hands, oriented like the driver's grip
  const props = {};
  const mounts = { L: new THREE.Group(), R: new THREE.Group() };
  root.add(mounts.L, mounts.R);
  function attachIdleProps() {
    for (const k of Object.keys(props)) props[k].removeFromParent();
    if (idleMode === 'phone') {
      props.phone = props.phone || createPhone();
      props.phone.position.set(-0.012, -0.008, 0.012); props.phone.rotation.set(-0.3, -1.2, 0.2);
      mounts.L.add(props.phone);
    } else if (idleMode === 'sweep') {
      props.broom = props.broom || createBroom();
      props.broom.position.set(0, 0, 0); props.broom.rotation.set(0.4, 0, 0.3);
      mounts.R.add(props.broom);
    } else if (idleMode === 'counter') {
      props.rag = props.rag || createRag();
      props.rag.position.set(0, -0.004, 0.006);
      mounts.R.add(props.rag);
    }
  }

  const rootInv = new THREE.Quaternion();
  const rootMInv = new THREE.Matrix4();
  const lookLocal = new THREE.Vector3();

  function retarget() {
    root.updateMatrixWorld(true);
    rootInv.copy(root.getWorldQuaternion(_qr)).invert();
    rootMInv.copy(root.matrixWorld).invert();
    for (const p of pairs) {
      const jq = relQ(p.j, rootInv, _q);
      let target;
      if (p.mode === 'aim') {
        const d = relP(p.child, rootMInv, _v).sub(relP(p.j, rootMInv, _v2)).normalize();
        target = _q.setFromUnitVectors(p.restJdir, d).multiply(p.restB);
      } else {
        target = jq.multiply(_qi.copy(p.restJ).invert()).multiply(p.restB);
      }
      const parent = p.bone.parent;
      parent.updateWorldMatrix(true, false);
      relQ(parent, rootInv, _q2);
      p.bone.quaternion.copy(_q2.invert().multiply(target));
      p.bone.updateMatrixWorld(true);
    }
    // hips bob / sway (scaled to the model's hip height)
    if (hipsP && hipsRestB) {
      const dj = relP(rig.hips, rootMInv, _v).sub(hipsRestJ).multiplyScalar(hipsK);
      _v2.copy(hipsRestB).add(dj).applyMatrix4(root.matrixWorld);
      const parent = bones.hips.parent;
      parent.updateWorldMatrix(true, false);
      bones.hips.position.copy(parent.worldToLocal(_v2));
    }
    // prop mounts: GLB hand position + driver grip offset, driver grip orientation
    for (const s of ['L', 'R']) {
      const hb = bones[`hand_${s}`];
      const arm = s === 'L' ? rig.armL : rig.armR;
      if (!hb || !mounts[s].children.length) continue;
      hb.updateWorldMatrix(true, false);
      const gp = arm.grip.getWorldPosition(_v).sub(arm.hand.getWorldPosition(_v2));
      _v3.set(0, 0, 0).applyMatrix4(hb.matrixWorld).add(gp).applyMatrix4(rootMInv);
      mounts[s].position.copy(_v3);
      mounts[s].quaternion.copy(relQ(arm.grip, rootInv, _q));
    }
  }

  const api = {
    root,
    rig,
    anim,
    model: modelId,
    get appearance() { return app; },
    get triangles() { return triangles; },
    set onFootstep(fn) { anim.onFootstep = fn; },
    get onFootstep() { return anim.onFootstep; },
    setAppearance() {},              // GLB characters have a fixed look
    setUmbrella() {},
    setIdleMode(mode) { idleMode = mode || 'stand'; anim.mode = idleMode; attachIdleProps(); },
    playEmote(name) { anim.playEmote(name); },
    setAttention(on) { anim.attn = !!on; },
    headWorldPos(target = new THREE.Vector3()) {
      if (!headBone) return rig.headC.getWorldPosition(target);
      headBone.updateWorldMatrix(true, false);
      return target.copy(headPoint).applyMatrix4(headBone.matrixWorld);
    },
    update(dt, state = {}) {
      dt = Math.min(dt || 0, 0.1);
      anim.umbOn = false;
      let ll = null;
      if (state.lookAt) {
        root.updateMatrixWorld();
        lookLocal.copy(state.lookAt).applyMatrix4(_m.copy(root.matrixWorld).invert());
        lookLocal.y -= rig.d.eyeY * rig.d.scale;
        lookLocal.z -= 0.03;
        ll = lookLocal;
      }
      anim.update(dt, state, ll);
      retarget();
      if (viewCam) {
        const near = root.getWorldPosition(_v).distanceTo(viewCam.position) < OUTLINE_DIST;
        for (const ol of outlines) ol.visible = near;
      }
      const t = anim.t;
      for (let i = 0; i < tails.length; i++) {
        const { b, rest } = tails[i];
        const s = b.name.endsWith('_L') ? 1 : -1;
        const k = b.name.startsWith('tail2') ? 0.6 : 1;
        _q.setFromEuler(new THREE.Euler(0.06 * Math.sin(t * 1.7 + i) * k, 0, s * 0.05 * Math.sin(t * 1.3 + 0.5 * i) * k));
        b.quaternion.copy(rest).multiply(_q);
      }
      if (props.phone && props.phone.parent) props.phone.userData.screen.material.color.setScalar(2.0 + 0.2 * Math.sin(t * 3));
    },
    dispose() {
      for (const m of ownedMats) m.dispose();
      root.removeFromParent();
    },
  };
  attachIdleProps();
  return api;
}
