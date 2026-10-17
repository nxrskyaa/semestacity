// Rig (THREE.Group joints) + body proportions + skin meshes.
// Proportions match the Blender GLB cast (chibi Roblox-R15 doll, see docs/CHARACTERS.md): head ≈ 35% of
// height (hair included), short legs, broad shoulders, chunky limbs and big mitten hands.
import * as THREE from 'three';
import { loft, limb, ellipsoid, xf } from './geom.js';

/** head-local -> rig scale (the head mesh is authored ~0.21 tall, so 2.34 => ~0.49 m crown-to-chin: chibi) */
export const HEAD_SCALE = 2.34;
/** every character (procedural + GLB) is drawn at this size: chibi dolls ~1.35 m tall in a real-scale city */
export const CHAR_SCALE = 0.82;
/** head-local offset of the head centre above the head joint */
export const HEADC_Y = 0.104;

/** proportions in unscaled rig units (the scale group applies height) */
export function bodyDims(app) {
  const fem = app.body === 'female' || app.body === 'fem';
  const b = app.build || 1;
  const d = {
    fem, build: b,
    legX: fem ? 0.082 : 0.09, legY: -0.035,
    thigh: fem ? 0.245 : 0.25, shin: fem ? 0.24 : 0.245, ankleH: (fem ? 0.046 : 0.05) * 1.32,
    footK: 1.32, handK: 1.18,          // chunky doll shoes + mitten hands (the foot/hand joints are scaled)
    spineY: 0.08, chestY: 0.15, neckY: fem ? 0.19 : 0.194, headY: fem ? 0.04 : 0.044,
    shX: (fem ? 0.152 : 0.172) * (0.85 + 0.15 * b), shY: fem ? 0.146 : 0.15,
    upper: fem ? 0.19 : 0.2, fore: fem ? 0.17 : 0.18,
    limbK: (fem ? 1.22 : 1.36) * (0.8 + 0.2 * b),
    // torso girth vs the old slim profile tables (width / depth)
    girthX: fem ? 1.24 : 1.3, girthZ: fem ? 1.28 : 1.34,
    headScale: fem ? HEAD_SCALE * 1.02 : HEAD_SCALE,
    scale: (app.height || 1) * (fem ? 0.98 : 1.0) * CHAR_SCALE,
  };
  d.hipsY = -d.legY + d.thigh + d.shin + d.ankleH;
  /** eye height above the feet (rig units, before d.scale) — look-at and camera framing */
  d.eyeY = d.hipsY + d.spineY + d.chestY + d.neckY + d.headY + (HEADC_Y + 0.006) * d.headScale;
  return d;
}

const J = (name, parent, x = 0, y = 0, z = 0, order = 'XYZ') => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.rotation.order = order;
  if (parent) parent.add(g);
  return g;
};

/** build the joint hierarchy. Returns rig object with named joints + rest data */
export function buildRig(d) {
  const root = new THREE.Group(); root.name = 'avatar';
  const scaleG = J('scale', root);
  scaleG.scale.setScalar(d.scale);
  const hips = J('hips', scaleG, 0, d.hipsY, 0, 'YXZ');
  const spine = J('spine', hips, 0, d.spineY, 0, 'YXZ');
  const chest = J('chest', spine, 0, d.chestY, 0, 'YXZ');
  const neck = J('neck', chest, 0, d.neckY, -0.006, 'YXZ');
  const head = J('head', neck, 0, d.headY, 0.004, 'YXZ');
  const headC = J('headC', head, 0, HEADC_Y * d.headScale, 0.012);
  headC.scale.setScalar(d.headScale);
  const arm = (s) => {
    const k = d.limbK;
    const upper = J(s > 0 ? 'upperArmL' : 'upperArmR', chest, s * d.shX, d.shY, -0.012, 'ZXY');
    const fore = J(s > 0 ? 'foreArmL' : 'foreArmR', upper, 0, -d.upper, 0, 'ZXY');
    const hand = J(s > 0 ? 'handL' : 'handR', fore, 0, -d.fore, 0, 'ZXY');
    const fingers = J('fingers', hand, 0, -0.046 * k, 0.002, 'ZXY');
    const grip = J('grip', hand, -s * 0.004, -0.052 * k, 0.01);
    hand.scale.setScalar(d.handK || 1);
    grip.scale.setScalar(1 / (d.handK || 1));   // held props keep their real size
    return { upper, fore, hand, fingers, grip, side: s };
  };
  const leg = (s) => {
    const up = J(s > 0 ? 'upLegL' : 'upLegR', hips, s * d.legX, d.legY, 0, 'ZXY');
    const low = J(s > 0 ? 'legL' : 'legR', up, 0, -d.thigh, 0, 'XYZ');
    const foot = J(s > 0 ? 'footL' : 'footR', low, 0, -d.shin, 0, 'XZY');
    foot.scale.setScalar(d.footK || 1);
    return { up, low, foot, side: s };
  };
  return { root, scaleG, hips, spine, chest, neck, head, headC, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1), d };
}

// ---- torso profile (chest-local y) used by skin + garments: [y, rx, rz, zOffset] ----
const MASC_CHEST = [
  [-0.15, 0.108, 0.076, 0.0], [-0.08, 0.111, 0.078, 0.004], [0.0, 0.122, 0.083, 0.008], [0.07, 0.134, 0.086, 0.008],
  [0.12, 0.14, 0.082, 0.0], [0.16, 0.134, 0.073, -0.008], [0.19, 0.096, 0.058, -0.008], [0.212, 0.042, 0.038, -0.006],
];
const FEM_CHEST = [
  [-0.15, 0.093, 0.07, 0.0], [-0.08, 0.088, 0.067, 0.004], [0.0, 0.1, 0.074, 0.01], [0.05, 0.107, 0.08, 0.014],
  [0.1, 0.114, 0.076, 0.007], [0.145, 0.118, 0.067, -0.006], [0.178, 0.087, 0.055, -0.008], [0.2, 0.038, 0.035, -0.006],
];
const MASC_PELVIS = [
  [-0.115, 0.048, 0.043, 0], [-0.09, 0.1, 0.072, 0], [-0.04, 0.118, 0.081, -0.004], [0.02, 0.116, 0.079, 0], [0.08, 0.109, 0.076, 0.002], [0.12, 0.107, 0.076, 0.003],
];
const FEM_PELVIS = [
  [-0.11, 0.048, 0.043, 0], [-0.085, 0.104, 0.074, -0.002], [-0.035, 0.13, 0.086, -0.008], [0.02, 0.12, 0.081, -0.004], [0.08, 0.094, 0.07, 0.002], [0.12, 0.09, 0.068, 0.003],
];

/** torso profile in chest-local coords from crotch to neck; returns fn(y) -> {rx, rz, z} */
export function torsoProfile(d) {
  const off = -(d.spineY + d.chestY);
  const pel = (d.fem ? FEM_PELVIS : MASC_PELVIS).map(([y, rx, rz, z]) => [y + off, rx, rz, z]);
  const ch = d.fem ? FEM_CHEST : MASC_CHEST;
  const rows = [...pel.filter((r) => r[0] < ch[0][0] - 0.01), ...ch];
  const b = d.build, gx = d.girthX || 1, gz = d.girthZ || 1;
  const f = (y) => {
    if (y <= rows[0][0]) return { rx: rows[0][1] * b * gx, rz: rows[0][2] * b * gz, z: rows[0][3] };
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], c = rows[i + 1];
      if (y <= c[0]) {
        const t = (y - a[0]) / (c[0] - a[0]);
        const s = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
        return { rx: (a[1] + (c[1] - a[1]) * s) * b * gx, rz: (a[2] + (c[2] - a[2]) * s) * b * gz, z: a[3] + (c[3] - a[3]) * s };
      }
    }
    const l = rows[rows.length - 1];
    return { rx: l[1] * b * gx, rz: l[2] * b * gz, z: l[3] };
  };
  f.top = ch[ch.length - 1][0];
  f.bottom = rows[0][0];
  f.waist = -0.11;
  f.hipOff = off;
  return f;
}

/** rings sampled from the profile with inflation. ys ascending. infl(y)->[dx,dz] or number */
export function profileRings(P, ys, infl = 0, extra = null) {
  return ys.map((y, i) => {
    const p = P(y);
    const inf = typeof infl === 'function' ? infl(y, i) : Array.isArray(infl) ? infl : [infl, infl];
    const r = { y, rx: p.rx + inf[0], rz: p.rz + inf[1], z: p.z + (inf[2] || 0) };
    if (extra) Object.assign(r, extra(y, i, r));
    return r;
  });
}

/** neck radius (rig units) */
export const neckRadius = (d) => (d.fem ? 0.026 : 0.031) * (0.9 + 0.1 * d.build) * (d.girthX || 1) * 1.15;

/** skin body parts (add(jointKey, geo, kind, opts)) */
export function buildSkin(rig, d, add, cover) {
  const k = d.limbK;
  const P = torsoProfile(d);
  const ys = [];
  for (let y = P.bottom + 0.004; y < P.top; y += 0.04) ys.push(y);
  ys.push(P.top - 0.012, P.top);
  const rings = profileRings(P, ys, -0.002);
  rings[0].cap = 0.004;
  if (!cover.closedTorso) add('chest', loft(rings, 18), 'skin', { outline: cover.torso ? 0 : 0.0035 });
  // neck: slim doll neck, flares into the trapezius
  const nr = neckRadius(d);
  add('neck', loft([
    { y: -0.012, rx: nr * 1.5, rz: nr * 1.25 }, { y: 0.012, rx: nr * 1.05, rz: nr }, { y: 0.05, rx: nr, rz: nr * 0.98 }, { y: 0.1, rx: nr * 0.96, rz: nr * 0.96 },
  ], 14, { capTop: false }).translate(0, 0, 0.002), 'skin', { outline: 0.0028 });
  for (const A of [rig.armL, rig.armR]) {
    const key = A.side > 0 ? 'L' : 'R';
    if (!cover.upperArm) add('upper' + key, limb(d.upper, 0.04 * k, 0.031 * k, { bulge: 0.003 * k, bulgeAt: 0.3, segs: 12 }), 'skin', { outline: 0.0034 });
    if (!cover.foreArm) add('fore' + key, limb(d.fore, 0.031 * k, 0.024 * k, { bulge: 0.003 * k, bulgeAt: 0.25, segs: 12, rz: 0.9 }), 'skin', { outline: 0.0032 });
    buildHand(A, d, add, key);
  }
  for (const Lg of [rig.legL, rig.legR]) {
    const key = Lg.side > 0 ? 'L' : 'R';
    if (!cover.thigh) add('upLeg' + key, limb(d.thigh, 0.066 * k, 0.043 * k, { bulge: 0.006 * k, bulgeAt: 0.2, segs: 12 }), 'skin', { outline: 0.0034 });
    if (!cover.shin) add('leg' + key, limb(d.shin, 0.044 * k, 0.027 * k, { bulge: 0.009 * k, bulgeAt: 0.22, segs: 12, z0: -0.004, z1: 0 }), 'skin', { outline: 0.0034 });
  }
}

/** cute rounded mitten hand: palm + thumb on the hand joint, one rounded finger lobe on the finger joint */
function buildHand(A, d, add, key) {
  const k = d.limbK * (d.fem ? 1.0 : 1.08);
  const s = A.side;
  const palm = loft([
    { y: -0.05 * k, rx: 0.0145 * k, rz: 0.028 * k, z: 0.002, n: 2.4 },
    { y: -0.03 * k, rx: 0.0165 * k, rz: 0.031 * k, z: 0.002, n: 2.4 },
    { y: -0.008 * k, rx: 0.0155 * k, rz: 0.027 * k, z: 0.0, n: 2.4 },
    { y: 0.006, rx: 0.014 * k, rz: 0.02 * k, z: 0.0, cap: 0.004 },
  ], 14);
  palm.translate(s * 0.002, 0, 0);
  add('hand' + key, palm, 'skin', { outline: 0.0022 });
  const th = limb(0.03 * k, 0.0098 * k, 0.0085 * k, { segs: 10, rings: 3, capRings: 3 });
  xf(th, { p: [-s * 0.005, -0.012 * k, 0.022 * k], r: [-0.7, 0, s * 0.3] });
  add('hand' + key, th, 'skin', { outline: 0.0018 });
  const mit = limb(0.03 * k, 0.0145 * k, 0.0125 * k, { segs: 10, rings: 3, capRings: 3, rz: 1.95 });
  mit.translate(0, 0.004, -0.002);
  add('fingers' + key, mit, 'skin', { outline: 0.0022 });
}
