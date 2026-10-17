// NXR — the creator's mascot: a chibi grey koala wearing a black "NXR" VR headset, a gold/black
// batik udeng (Balinese headband with a knot on top), a batik collar over a white shirt, a gold sash
// belt with knot and a black+gold batik sarong. ~1.1 m tall, thick ink outlines (sticker look).
// Interface mirrors createNPC(): { id, name, root, position, avatar:{headWorldPos}, update, faceTowards,
// setTalking, emote, dispose }.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { angleDelta, dampAngle, damp, clamp } from '../core/util.js';
import { blob, ellipsoid, lathe, capsule, inked, furMat, flatMat, softGradient, disposePet, weld } from './pet_kit.js';
import { batikGoldTex, batikBlackTex, batikSarongTex, batikCuffTex, beltTex, panelTex, visorTex, glintTex } from './pet_batik.js';

// ---------------------------------------------------------------- shape data
// public/brand/nxr.png 898x1042 px, 1 px ~ 1.06 mm at 1.10 m total height. Coordinates: metres,
// feet at y=0, facing +Z, the character's own left is +X.
export const NXR_SPEC = {
  height: 1.1,
  colors: {
    fur: '#cdd0dd', furRim: 0xb8c4ff, innerEar: '#f2aea6', nose: '#141416', mouth: '#1a1a1e',
    headset: '#38383e', strap: '#1c1c20', shirt: '#f3f3f6', gold: '#e0b043',
  },
  head: { y: 0.72, neckY: 0.5, rx: 0.3, ry: 0.228, rz: 0.22 },   // head centre / radii (cheek tufts add ~+0.05)
  ear: { pivot: [0.24, 0.085, -0.05], centre: [0.11, 0.035, 0], rx: 0.185, ry: 0.215, rz: 0.058, bumps: 9 },
  headset: { y: 0.025, z: 0.15, w: 0.52, h: 0.22, d: 0.18, r: 0.058 },
  udeng: { y0: 0.135, y1: 0.265 },
  torso: [[0.001, 0.28], [0.17, 0.285], [0.205, 0.31], [0.212, 0.37], [0.205, 0.43], [0.185, 0.47], [0.14, 0.51], [0.09, 0.535], [0.001, 0.545]],
  zScale: 0.86,
  shoulder: [0.235, 0.46, 0.0], armLen: 0.165,
  hip: [0.135, 0.205, 0.0],
  outline: 0.013,
};
const S = NXR_SPEC;
const NOTICE = 4.0;

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function interpProfile(prof, y) {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
  }
  return y < prof[0][1] ? prof[0][0] : prof[prof.length - 1][0];
}

function texturedEllipsoid(rx, ry, rz, ws = 18, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

// ---------------------------------------------------------------- build
function buildNXR() {
  const C = S.colors;
  const OL = S.outline;
  const mats = {
    fur: furMat(C.fur, { rim: C.furRim, rimStrength: 0.22, rimPower: 2.4, sheen: 0xffffff, sheenStrength: 0.04, gradient: softGradient() }),
    inner: flatMat(C.innerEar, { gradient: softGradient() }),
    dark: furMat(C.headset, { rim: 0x9fb0ff, rimStrength: 0.18, rimPower: 3, sheen: 0xffffff, sheenStrength: 0.06 }),
    strap: flatMat(C.strap),
    nose: furMat(C.nose, { rim: 0x8899cc, rimStrength: 0.25, rimPower: 2, sheen: 0xffffff, sheenStrength: 0.18 }),
    mouth: new THREE.MeshBasicMaterial({ color: C.mouth }),
    shirt: flatMat(C.shirt, { gradient: softGradient() }),
    udeng: flatMat('#ffffff', { map: batikGoldTex(3), gradient: softGradient() }),
    udengBand: flatMat('#ffffff', { map: batikBlackTex(21), gradient: softGradient() }),
    collar: flatMat('#ffffff', { map: batikGoldTex(8, { center: true }), gradient: softGradient() }),
    sarong: flatMat('#ffffff', { map: batikSarongTex(11), gradient: softGradient() }),
    cuff: flatMat('#ffffff', { map: batikCuffTex(5), gradient: softGradient() }),
    belt: flatMat('#ffffff', { map: beltTex(), gradient: softGradient() }),
    panel: flatMat('#ffffff', { map: panelTex(), gradient: softGradient() }),
    hl: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  const vt = visorTex();
  mats.visor = flatMat('#ffffff', { map: vt, emissive: 0xffffff, emissiveIntensity: 0.22 });
  mats.visor.emissiveMap = vt;

  const root = new THREE.Group();
  root.name = 'NXR';
  const body = new THREE.Group(); body.name = 'body';
  root.add(body);

  // ---------- legs + feet + batik ankle cuffs (pivot at the hip)
  const legs = [];
  for (const sx of [1, -1]) {
    const leg = new THREE.Group();
    leg.name = sx > 0 ? 'leg-l' : 'leg-r';
    leg.position.set(sx * S.hip[0], S.hip[1], S.hip[2]);
    leg.add(inked(capsule(0.13, 0.062, 0.06, 16), mats.fur, OL * 0.8, 'leg'));
    const cuff = inked(lathe([[0.067, -0.148], [0.072, -0.14], [0.073, -0.088], [0.068, -0.08]], 28, { uvY: [-0.148, -0.08] }), mats.cuff, OL * 0.6, 'cuff');
    leg.add(cuff);
    const foot = inked(ellipsoid(0.072, 0.045, 0.09, 20, 12), mats.fur, OL * 0.8, 'foot');
    foot.position.set(0, -0.162, 0.022);
    leg.add(foot);
    root.add(leg);
    legs.push(leg);
  }

  // ---------- sarong, belt + knot, front panel, shirt torso, collar
  const sarong = inked(lathe([[0.001, 0.165], [0.252, 0.165], [0.262, 0.178], [0.256, 0.22], [0.246, 0.265], [0.236, 0.285]], 32, { zScale: S.zScale, uvY: [0.165, 0.285] }), mats.sarong, OL, 'sarong');
  body.add(sarong);
  const belt = inked(lathe([[0.236, 0.26], [0.25, 0.27], [0.253, 0.3], [0.247, 0.327], [0.226, 0.337]], 32, { zScale: S.zScale, uvY: [0.26, 0.337] }), mats.belt, OL * 0.7, 'belt');
  body.add(belt);
  const knot = inked(new RoundedBoxGeometry(0.085, 0.082, 0.04, 2, 0.014), mats.belt, OL * 0.7, 'belt-knot');
  knot.position.set(0, 0.298, 0.253 * S.zScale + 0.008);
  body.add(knot);
  const panel = inked(new THREE.BoxGeometry(0.074, 0.15, 0.012), mats.panel, OL * 0.6, 'sarong-panel');
  panel.position.set(0, 0.185, 0.233);
  panel.rotation.x = -0.1;
  body.add(panel);
  const torso = inked(weld(lathe(S.torso, 32, { zScale: S.zScale })), mats.shirt, OL, 'torso');
  body.add(torso);
  body.add(buildCollar(mats.collar, OL));
  for (const sx of [1, -1]) {
    const b = inked(ellipsoid(0.012, 0.012, 0.008, 10, 8), mats.strap, 0.003, 'collar-button');
    const y = 0.44;
    b.position.set(sx * 0.085, y, Math.sqrt((interpProfile(S.torso, y) + 0.028) ** 2 - 0.085 ** 2) * S.zScale);
    body.add(b);
  }

  // ---------- arms (pivot at the shoulder; hangs along -Y)
  const arms = [];
  for (const sx of [1, -1]) {
    const arm = new THREE.Group();
    arm.name = sx > 0 ? 'arm-l' : 'arm-r';
    arm.position.set(sx * S.shoulder[0], S.shoulder[1], S.shoulder[2]);
    arm.add(inked(capsule(S.armLen, 0.05, 0.047, 14), mats.fur, OL * 0.8, 'arm'));
    const hand = inked(ellipsoid(0.056, 0.055, 0.054, 16, 12), mats.fur, OL * 0.8, 'hand');
    hand.position.set(0, -S.armLen - 0.02, 0);
    arm.add(hand);
    body.add(arm);
    arms.push(arm);
  }

  // ---------- head (pivot at the neck)
  const neck = new THREE.Group(); neck.name = 'neck';
  neck.position.set(0, S.head.neckY, 0);
  body.add(neck);
  const head = new THREE.Group(); head.name = 'head';
  head.position.set(0, S.head.y - S.head.neckY, 0);
  neck.add(head);
  const H = S.head;
  const headGeo = blob((d, o) => {
    // squircle in the lower half -> wide fluffy cheeks + flat chin; rounder, narrower crown
    const n = 2 + 1.3 * sstep(0.15, -0.55, d.y);
    const f = 1 / Math.pow(Math.abs(d.x) ** n + Math.abs(d.y) ** n + Math.abs(d.z) ** n, 1 / n);
    const x = d.x * f, y = d.y * f, z = d.z * f;
    const wx = 1 + 0.15 * Math.exp(-((d.y + 0.42) ** 2) / 0.07) - 0.3 * Math.max(0, d.y) ** 1.5;
    // scalloped fluffy cheek tufts on the lower sides
    const side = sstep(0.25, 0.8, Math.abs(d.x)) * sstep(0.35, -0.15, d.y) * sstep(-0.85, -0.2, d.z);
    const phi = Math.atan2(d.y, Math.abs(d.x));
    const sc = Math.sqrt(Math.abs(Math.cos(phi * 6.5 + 0.2)));
    const bump = 1 + side * (0.12 * sc - 0.04);
    o.set(x * H.rx * wx * bump, y * H.ry * bump, z * H.rz * bump * (1 - 0.1 * Math.max(0, -d.y)));
  }, 48, 34);
  const headMesh = inked(headGeo, mats.fur, OL, 'head');
  head.add(headMesh);
  // front surface depth of the head at height y (x = 0), for placing face features on the skin
  const ray = new THREE.Raycaster();
  const surfZ = (y, x = 0) => {
    ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(headMesh, false)[0];
    return hit ? hit.point.z : H.rz;
  };

  // ears: puffy cloud discs with pink inner ellipses
  const ears = [];
  for (const sx of [1, -1]) {
    const ep = new THREE.Group();
    ep.name = sx > 0 ? 'ear-l' : 'ear-r';
    ep.position.set(sx * S.ear.pivot[0], S.ear.pivot[1], S.ear.pivot[2]);
    const E = S.ear;
    const earGeo = blob((d, o) => {
      const th = Math.atan2(d.y, d.x);
      const sc = 0.9 + 0.1 * Math.sqrt(Math.abs(Math.cos(th * E.bumps / 2 + 0.3)));
      o.set(d.x * E.rx * sc, d.y * E.ry * sc, d.z * E.rz * (0.75 + 0.25 * sc));
    }, 40, 16);
    const ear = inked(earGeo, mats.fur, OL, 'ear');
    ear.position.set(sx * E.centre[0], E.centre[1], E.centre[2]);
    const inner = inked(ellipsoid(0.078, 0.1, 0.024, 20, 12), mats.inner, 0, 'inner-ear');
    inner.position.set(-sx * 0.012, -0.035, 0.044);
    ear.add(inner);
    ep.add(ear);
    ep.rotation.set(0, sx * 0.22, -sx * 0.08);
    head.add(ep);
    ears.push(ep);
  }

  // headset body + NXR faceplate + glint sweep
  const HS = S.headset;
  const set = new THREE.Group(); set.name = 'headset';
  set.position.set(0, HS.y, HS.z);
  head.add(set);
  set.add(inked(new RoundedBoxGeometry(HS.w, HS.h, HS.d, 4, HS.r), mats.dark, OL, 'headset-body'));
  const pw = HS.w - 0.06, ph = HS.h - 0.05, pr = 0.042;
  const shape = new THREE.Shape();
  shape.moveTo(-pw / 2 + pr, -ph / 2);
  shape.lineTo(pw / 2 - pr, -ph / 2); shape.quadraticCurveTo(pw / 2, -ph / 2, pw / 2, -ph / 2 + pr);
  shape.lineTo(pw / 2, ph / 2 - pr); shape.quadraticCurveTo(pw / 2, ph / 2, pw / 2 - pr, ph / 2);
  shape.lineTo(-pw / 2 + pr, ph / 2); shape.quadraticCurveTo(-pw / 2, ph / 2, -pw / 2, ph / 2 - pr);
  shape.lineTo(-pw / 2, -ph / 2 + pr); shape.quadraticCurveTo(-pw / 2, -ph / 2, -pw / 2 + pr, -ph / 2);
  const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 2, curveSegments: 8 });
  normUV(plateGeo, pw + 0.01, ph + 0.01);
  const plate = new THREE.Mesh(plateGeo, mats.visor);
  plate.name = 'visor-plate';
  plate.position.z = HS.d / 2 - 0.008;
  set.add(plate);
  const glGeo = new THREE.ShapeGeometry(shape, 8);
  normUV(glGeo, pw, ph);
  const gtex = glintTex();
  gtex.center.set(0.5, 0.5);
  gtex.rotation = -0.5;
  const glintMat = new THREE.MeshBasicMaterial({ map: gtex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glint = new THREE.Mesh(glGeo, glintMat);
  glint.name = 'visor-glint';
  glint.position.z = HS.d / 2 + 0.0075;
  glint.renderOrder = 3;
  set.add(glint);

  // straps: side strap around the back of the head, top strap up into the udeng
  const sideStrap = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.014, 6, 40, Math.PI), mats.strap);
  sideStrap.name = 'strap-side';
  sideStrap.rotation.x = -Math.PI / 2;
  sideStrap.scale.set(1, 0.75, 2.4); // ring lies in XZ (after rotation); tall flat band
  sideStrap.position.set(0, HS.y, 0.0);
  head.add(sideStrap);
  const topStrap = inked(new RoundedBoxGeometry(0.062, 0.09, 0.026, 2, 0.01), mats.strap, OL * 0.6, 'strap-top');
  topStrap.position.set(0, 0.135, 0.15);
  topStrap.rotation.x = -0.75;
  head.add(topStrap);

  // nose (black, peeking under the headset) + highlight, flat line mouth
  const nose = inked(ellipsoid(0.042, 0.032, 0.03, 18, 12), mats.nose, OL * 0.5, 'nose');
  nose.position.set(0, -0.09, surfZ(-0.09) + 0.004);
  head.add(nose);
  const nhl = new THREE.Mesh(ellipsoid(0.008, 0.005, 0.003, 8, 6), mats.hl);
  nhl.position.set(-0.012, -0.004, 0.03);
  nose.add(nhl);
  const mouth = new THREE.Mesh(capsule(0.085, 0.0075, 0.0075, 8), mats.mouth);
  mouth.geometry.rotateZ(Math.PI / 2);
  mouth.geometry.translate(0.0425, 0, 0);
  mouth.name = 'mouth';
  mouth.position.set(0, -0.15, surfZ(-0.15) - 0.002);
  mouth.rotation.x = -0.35;
  head.add(mouth);

  // udeng: batik cap on the crown + two side lobes + knot with petals on top
  const U = S.udeng;
  const ud = new THREE.Group(); ud.name = 'udeng';
  head.add(ud);
  const cap = inked(lathe([[0.215, U.y0], [0.219, U.y0 + 0.02], [0.2, U.y0 + 0.07], [0.15, U.y1 - 0.03], [0.09, U.y1 - 0.005], [0.001, U.y1]], 40, { zScale: 0.92, uvY: [U.y0, U.y1] }), mats.udengBand, OL, 'udeng-cap');
  cap.geometry.rotateY(Math.PI); // texture seam to the back
  ud.add(cap);
  for (const sx of [1, -1]) {
    const lobe = inked(texturedEllipsoid(0.085, 0.08, 0.105), mats.udeng, OL * 0.8, 'udeng-lobe');
    lobe.position.set(sx * 0.1, U.y1 + 0.0, -0.01);
    lobe.rotation.z = -sx * 0.5;
    ud.add(lobe);
  }
  const knotG = new THREE.Group(); knotG.name = 'udeng-knot';
  knotG.position.set(0, U.y1 + 0.0, 0.085);
  knotG.rotation.x = 0.25;
  ud.add(knotG);
  knotG.add(inked(texturedEllipsoid(0.044, 0.04, 0.038, 16, 12), mats.udengBand, OL * 0.6, 'knot'));
  const petals = [];
  for (const [ang, len] of [[-0.8, 0.105], [0, 0.085], [0.8, 0.105], [-1.85, 0.065], [1.85, 0.065]]) {
    const pg = texturedEllipsoid(0.03, len * 0.5, 0.013, 14, 10);
    pg.translate(0, len * 0.5, 0);
    const p = inked(pg, mats.udeng, OL * 0.5, 'petal');
    p.rotation.set(0.2, 0, ang);
    knotG.add(p);
    petals.push(p);
  }

  return { root, body, legs, arms, neck, head, ears, set, glint, glintMat, gtex, mouth, knotG, mats };
}

function normUV(g, w, h) {
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  uv.needsUpdate = true;
}

/** batik bib/collar draped over the shoulders with a V point at the front centre */
function buildCollar(mat, OL) {
  const NT = 72, NS = 8;
  const pos = [], uv = [], idx = [];
  const yTop = 0.512;
  for (let i = 0; i <= NT; i++) {
    const th = (i / NT) * Math.PI * 2;
    const ths = Math.atan2(Math.sin(th), Math.cos(th));
    const v = Math.max(0, 1 - Math.abs(ths) / 0.62);
    const back = Math.max(0, -Math.cos(th));
    const yB = 0.425 - 0.07 * v + 0.02 * back;
    for (let j = 0; j <= NS; j++) {
      const s = j / NS;
      const y = THREE.MathUtils.lerp(yTop, yB, s);
      const r = interpProfile(S.torso, y) + 0.01 + 0.014 * Math.sin(Math.PI * Math.min(1, s * 1.15));
      pos.push(Math.sin(th) * r, y, Math.cos(th) * r * S.zScale);
      uv.push(i / NT, 1 - s);
    }
  }
  for (let i = 0; i < NT; i++) for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j, b = (i + 1) * (NS + 1) + j;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face outward (front vertex should point +z)
  const n = g.getAttribute('normal');
  if (n.getZ(Math.floor(NS / 2)) < 0) {
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
    g.computeVertexNormals();
  }
  return inked(g, mat, OL * 0.8, 'collar');
}

// ---------------------------------------------------------------- actor
export function createNXR({ id = 'nxr', name = 'NXR', x = 0, y = null, z = 0, rotY = 0, groundAt = null } = {}) {
  const R = buildNXR();
  const { root, body, legs, arms, neck, head, ears, glint, glintMat, gtex, mouth, knotG } = R;
  const gy = (px, pz) => (groundAt ? groundAt(px, pz) : (y ?? 0));
  root.position.set(x, y ?? gy(x, z), z);
  root.rotation.y = rotY;
  const homeRot = rotY;

  let talking = false;
  let faceTarget = null;
  let bodyYaw = rotY;
  let noticed = false, noticeT = 0;
  let emote = null;         // { name, t, dur }
  let nextScan = 6 + Math.random() * 6;
  let nextWiggle = 2 + Math.random() * 3;
  let wiggle = { t: 99, side: 1 };
  let glintT = 99, glintCol = new THREE.Color(1, 1, 1), glintLen = 0.7;
  let headYaw = 0, headPitch = 0, headRoll = 0;
  let talkClock = 0;
  const tmp = new THREE.Vector3();
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), eul = new THREE.Euler();
  const DUR = { wave: 1.9, hop: 1.3, cheer: 1.3, nod: 1.1, scan: 2.8, think: 2.8, dance: 2.4 };

  function startGlint(color, len = 0.7) { glintT = 0; glintCol.set(color); glintLen = len; }
  function play(name) {
    const n = name === 'cheer' ? 'hop' : name === 'think' ? 'scan' : name;
    if (!DUR[n]) return;
    emote = { name: n, t: 0, dur: DUR[n], glints: 0 };
    if (n === 'scan') startGlint(0x5ee7ff, 1.1);
  }
  function setArm(arm, sx, rx, rz, w = 1) {
    // rest pose (slightly outward) blended toward rx/rz by w
    eul.set(0, 0, sx * 0.3); qA.setFromEuler(eul);
    eul.set(rx, 0, rz); qB.setFromEuler(eul);
    arm.quaternion.copy(qA).slerp(qB, w);
  }

  const npc = {
    id, name, root, position: root.position, kind: 'nxr',
    avatar: {
      root,
      /** point inside the upper head (core adds ~0.42 m for the name tag, which lands above the udeng) */
      headWorldPos(target = new THREE.Vector3()) { return head.localToWorld(target.set(0, 0.1, 0)); },
      setUmbrella() {},
      dispose() {},
    },
    faceTowards(v) { faceTarget = faceTarget || new THREE.Vector3(); faceTarget.copy(v); },
    setTalking(on) { talking = !!on; if (on) startGlint(0xffffff, 0.6); },
    emote(n) { play(n); },
    setUnderRoof() {},
    get emoteName() { return emote ? emote.name : null; },
    update(dt, time, playerPos) {
      dt = Math.min(dt || 0, 0.1);
      time = time ?? 0;
      const p = root.position;
      if (groundAt) p.y = groundAt(p.x, p.z);
      let dist = Infinity;
      if (playerPos) dist = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
      const near = dist < NOTICE;
      if (faceTarget && !talking && dist > NOTICE + 1) faceTarget = null;
      if (near !== noticed) { noticed = near; noticeT = 0; if (near && !emote && Math.random() < 0.5) play('wave'); }
      noticeT += dt;

      // ---- attention: head first, body when the angle is large or while talking
      let lookYaw = 0, lookPitch = 0;
      const tgt = faceTarget || (near ? playerPos : null);
      if (tgt) {
        const yawTo = Math.atan2(tgt.x - p.x, tgt.z - p.z);
        const off = angleDelta(root.rotation.y, yawTo);
        if (faceTarget || talking || (Math.abs(off) > Math.PI / 3 && noticeT > 0.5)) bodyYaw = yawTo;
        lookYaw = clamp(angleDelta(root.rotation.y, yawTo), -1.0, 1.0);
        const ty = faceTarget && faceTarget.y > 0.5 ? faceTarget.y : (tgt.y || 0) + 1.45;
        const hy = p.y + S.head.y;
        lookPitch = clamp(-Math.atan2(ty - hy, Math.max(0.5, dist)), -0.45, 0.3);
      } else if (noticeT > 2) bodyYaw = homeRot;
      root.rotation.y = dampAngle(root.rotation.y, bodyYaw, talking || faceTarget ? 5 : 2.6, dt);

      // ---- idle timers (auto VR scan + ear wiggles)
      if (!emote && !talking) {
        nextScan -= dt;
        if (nextScan < 0) { play('scan'); nextScan = 9 + Math.random() * 8; }
      }
      nextWiggle -= dt;
      if (nextWiggle < 0) { wiggle = { t: 0, side: Math.random() < 0.5 ? 1 : -1, both: Math.random() < 0.4 }; nextWiggle = 2.5 + Math.random() * 4; }
      wiggle.t += dt;

      // ---- base idle: breathing bob, arm sway
      const br = Math.sin(time * 2.1);
      let bodyY = 0.005 * br, squash = 1, hopY = 0;
      let armL = { rx: 0.06 * Math.sin(time * 1.3), rz: 0.2, w: 0 }, armR = { rx: 0.06 * Math.sin(time * 1.3 + 1), rz: -0.2, w: 0 };
      let addYaw = 0, addPitch = 0, addRoll = 0;
      let earFlop = 0;

      if (talking) {
        talkClock += dt;
        addRoll += Math.sin(talkClock * 1.7) * 0.09;
        addPitch += Math.sin(talkClock * 5.3) * 0.035;
        if (glintT > 1.6) startGlint(0xffffff, 0.6);
      } else talkClock = 0;

      // ---- emotes
      if (emote) {
        const e = emote; e.t += dt;
        const k = e.t / e.dur;
        const env = sstep(0, 0.15, k) * (1 - sstep(0.82, 1, k));
        if (e.name === 'wave') {
          armR = { rx: -0.65, rz: -2.5 + Math.sin(e.t * 11) * 0.32, w: env };
          addRoll += 0.12 * env; addYaw += 0;
        } else if (e.name === 'hop') {
          const ph = (e.t / (e.dur / 2)) % 1;
          const jump = e.t < e.dur ? Math.sin(Math.PI * ph) : 0;
          hopY = 0.16 * Math.max(0, jump) * env;
          squash = 1 + (jump < 0.25 ? -0.06 : 0.04) * env;
          armL = { rx: -0.1, rz: 2.5 - jump * 0.4, w: env };
          armR = { rx: -0.1, rz: -2.5 + jump * 0.4, w: env };
          earFlop = -jump * 0.25 * env;
          addPitch -= 0.1 * env;
        } else if (e.name === 'nod') {
          addPitch += Math.sin(e.t * 11) * 0.18 * env;
        } else if (e.name === 'scan') {
          // right hand to the side of the headset, head sweeps left->right, cyan glint sweeps
          armR = { rx: -1.2, rz: -2.1, w: env };
          addYaw += Math.sin(k * Math.PI * 2) * 0.45 * env;
          addRoll += -0.1 * env;
          if (e.glints < 2 && e.t > 0.5 + e.glints * 1.0) { startGlint(0x5ee7ff, 0.9); e.glints++; }
        } else if (e.name === 'dance') {
          bodyY += Math.abs(Math.sin(e.t * 7)) * 0.04 * env;
          addRoll += Math.sin(e.t * 7) * 0.15 * env;
          armL = { rx: 0, rz: 1.6 + Math.sin(e.t * 7) * 0.5, w: env };
          armR = { rx: 0, rz: -1.6 + Math.sin(e.t * 7) * 0.5, w: env };
        }
        if (e.t >= e.dur) emote = null;
      }

      // ---- apply body
      body.position.y = bodyY + hopY;
      body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      for (const l of legs) l.position.y = S.hip[1] + hopY * 0.9 + bodyY * 0.3;
      setArm(arms[0], 1, armL.rx, armL.rz, armL.w);
      setArm(arms[1], -1, armR.rx, armR.rz, armR.w);
      if (armL.w === 0) arms[0].rotation.x += armL.rx;
      if (armR.w === 0) arms[1].rotation.x += armR.rx;

      // ---- head
      headYaw = damp(headYaw, lookYaw * 0.85 + addYaw, 6, dt);
      headPitch = damp(headPitch, lookPitch + addPitch + 0.015 * br, 6, dt);
      headRoll = damp(headRoll, addRoll + (tgt ? 0.05 : 0), 5, dt);
      neck.rotation.set(headPitch * 0.4, headYaw * 0.35, headRoll * 0.3);
      head.rotation.set(headPitch * 0.6, headYaw * 0.65, headRoll * 0.7);

      // ---- ears: idle sway + wiggles + flop
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? 1 : -1;
        let w = Math.sin(time * 1.4 + i) * 0.03;
        if (wiggle.t < 0.7 && (wiggle.both || wiggle.side === sx)) w += Math.sin(wiggle.t * 34) * 0.22 * (1 - wiggle.t / 0.7);
        ears[i].rotation.z = -sx * 0.08 + w * sx + earFlop * sx;
        ears[i].rotation.x = (tgt ? -0.06 : 0) + Math.sin(time * 0.9 + i * 2) * 0.02;
      }
      knotG.rotation.z = Math.sin(time * 1.8) * 0.04 + headRoll * -0.3;

      // ---- mouth (talk flaps)
      const open = talking ? 0.5 + 0.5 * Math.abs(Math.sin(talkClock * 9.5) * Math.sin(talkClock * 3.1 + 1)) : 0;
      mouth.scale.set(talking ? 0.8 : 1, 1 + open * 2.6, 1);

      // ---- visor glint sweep
      if (glintT < glintLen) {
        glintT += dt;
        const k = glintT / glintLen;
        gtex.offset.x = THREE.MathUtils.lerp(-0.75, 0.75, k);
        glintMat.color.copy(glintCol);
        glintMat.opacity = Math.sin(Math.PI * clamp(k, 0, 1)) * (glintCol.r < 0.5 ? 1.0 : 0.65);
      } else { glintMat.opacity = 0; glintT += dt; }
      void tmp;
    },
    dispose() {
      root.removeFromParent();
      disposePet(root);
    },
  };
  return npc;
}
