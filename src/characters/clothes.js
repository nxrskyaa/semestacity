// Garments, shoes and accessories. Each piece is added to a rig joint via add(jointKey, geo, mat, opts).
import * as THREE from 'three';
import { loft, limb, ellipsoid, ribbonTube, xf, charMat, darken, mix, weld } from './geom.js';
import { torsoProfile, profileRings, neckRadius } from './body.js';
import { headShape, HEAD } from './face.js';
import { SHELL } from './hair.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WHITE = '#f3f2ee';

/** which skin parts each garment hides */
export function coverage(app) {
  const longSleeve = ['hoodie', 'bearhoodie', 'jacket', 'blazer', 'sweater', 'coat', 'onesie'].includes(app.top);
  const fullLeg = ['pants', 'joggers', 'cargo'].includes(app.bottom);
  return {
    torso: app.top !== 'tank',
    // closed neck + full-length top over full-length bottoms: the skin torso is never visible
    closedTorso: ['hoodie', 'bearhoodie', 'sweater', 'onesie', 'jacket'].includes(app.top) && ['pants', 'joggers', 'cargo'].includes(app.bottom),
    upperArm: longSleeve,
    foreArm: longSleeve,
    thigh: fullLeg,
    shin: fullLeg || app.shoes === 'warmers',
  };
}

/** torso shell whose top edge height varies with angle (necklines). ytop(th), th from +Z toward +X */
function torsoShell(P, yb, ytop, infl, { segs = 24, n = 8 } = {}) {
  const pos = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const h = k / n;
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const y = yb + (ytop(th) - yb) * h;
      const p = P(y);
      const ix = typeof infl === 'function' ? infl(y) : infl;
      pos.push(Math.sin(th) * (p.rx + ix), y, p.z + Math.cos(th) * (p.rz + ix));
    }
  }
  for (let k = 0; k < n; k++) for (let j = 0; j < segs; j++) {
    const j1 = (j + 1) % segs;
    const a = k * segs + j, b = k * segs + j1, c = (k + 1) * segs + j1, d = (k + 1) * segs + j;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** closed edge curve along a torsoShell top edge */
function shellEdge(P, ytop, infl, n = 32, lift = 0.002) {
  const pts = [];
  for (let j = 0; j < n; j++) {
    const th = (j / n) * Math.PI * 2;
    const y = ytop(th), p = P(y);
    const ix = (typeof infl === 'function' ? infl(y) : infl) + lift;
    pts.push(V(Math.sin(th) * (p.rx + ix), y, p.z + Math.cos(th) * (p.rz + ix)));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}
/** small ribbon bow (two loops + knot + two tails) facing +Z at origin */
export function bowGeos(size = 1) {
  const out = [];
  for (const s of [-1, 1]) {
    const loop = ellipsoid(0.012 * size, 0.0075 * size, 0.004 * size, 10, 6);
    xf(loop, { p: [s * 0.011 * size, 0.001 * size, 0], r: [0, 0, s * 0.25] });
    out.push(loop);
    const tail = ribbonTube([V(s * 0.002 * size, -0.002 * size, 0.001), V(s * 0.006 * size, -0.012 * size, 0.0015), V(s * 0.009 * size, -0.02 * size, 0.001)], { width: 0.004 * size, thick: 0.0018 * size, segs: 4, sides: 4, profile: () => [1, 1], closedTip: false, outward: (p, o) => o.set(0, 0, 1) });
    out.push(tail);
  }
  const knot = ellipsoid(0.0045 * size, 0.0045 * size, 0.004 * size, 8, 6);
  knot.translate(0, 0, 0.002 * size);
  out.push(knot);
  return out;
}

/** point on the front of a profile ring at x (chest-local) */
function frontZ(P, x, y, infl = 0) {
  const p = P(y);
  const rx = p.rx + infl, rz = p.rz + infl;
  const t = Math.min(0.999, Math.abs(x) / rx);
  return p.z + rz * Math.sqrt(1 - t * t);
}

/** a soft "pillow" patch lying on the torso front (pockets, plackets, aprons) */
function frontPatch(P, { x0, x1, y0, y1, infl, h = 0.006, nx = 8, ny = 6, round = 0.3, back = false }) {
  const pos = [], idx = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * v;
      const e = Math.min(u, 1 - u, v, 1 - v) * 2;
      const bump = Math.pow(Math.min(1, e / round), 0.6);
      let z = frontZ(P, x, y, infl) + 0.0015 + h * bump;
      if (back) z = -z;
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1;
      if (back) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** ring band around the torso at y */
function band(P, y0, y1, infl, segs = 18) {
  const r = profileRings(P, [y0, (y0 + y1) / 2, y1], infl);
  return loft(r, segs, { capTop: false, capBottom: false });
}

function sleeveSet(add, d, mat, { r0, r1, fr0, fr1, cuff = null, cuffMat = null, short = false, shortLen = 0.12, trimMat = null }) {
  const k = d.limbK;
  for (const key of ['L', 'R']) {
    if (short) {
      add('upper' + key, limb(shortLen, r0 * k, r1 * k, { segs: 12, rings: 4, botCap: false }), mat, { outline: 0.004 });
      if (trimMat) add('upper' + key, limb(0.014, r1 * k + 0.002, r1 * k + 0.002, { segs: 12, rings: 2, topCap: false, botCap: false }).translate(0, -shortLen + 0.012, 0), trimMat, { outline: 0.003 });
      continue;
    }
    add('upper' + key, limb(d.upper, r0 * k, r1 * k, { segs: 12, rings: 6, bulge: 0.003 }), mat, { outline: 0.004 });
    add('fore' + key, limb(d.fore - 0.03, fr0 * k, fr1 * k, { segs: 12, rings: 5, botCap: false }), mat, { outline: 0.004 });
    if (cuff) add('fore' + key, limb(0.032, cuff * k, cuff * k * 0.96, { segs: 12, rings: 3, topCap: false }).translate(0, -d.fore + 0.042, 0), cuffMat || mat, { outline: 0.003 });
  }
}

// ======================= TOPS =======================
const TOPS = {
  hoodie(add, d, app, P, ctx = {}) {
    const m = charMat(app.topColor), dark = charMat(darken(app.topColor, 0.86));
    const ys = [-0.3, -0.27, -0.22, -0.14, -0.06, 0.02, 0.08, 0.125, 0.16, 0.188, 0.208];
    const rings = profileRings(P, ys, (y) => {
      if (y < -0.25) return [0.024, 0.024];
      if (y > 0.18) return [0.026, 0.026];
      if (y > 0.1) return [0.044, 0.032];
      return [0.036, 0.034];
    });
    rings[rings.length - 1].rx = 0.064; rings[rings.length - 1].rz = 0.056; rings[rings.length - 1].z = -0.004;
    rings[0].cap = 0.0;
    add('chest', loft(rings, 18), m, { outline: 0.0045 });
    add('chest', band(P, -0.318, -0.282, [0.03, 0.03]), dark, { outline: 0.003 });
    // hood: rolled collar around the back of the neck + hood bulk on the upper back
    const hood = [];
    for (let i = 0; i <= 8; i++) {
      const a = -2.35 + (i / 8) * 4.7; // around the back
      hood.push(V(Math.sin(a) * 0.088, 0.205 + 0.018 * Math.cos(a * 0.5) - (Math.abs(a) > 1.9 ? 0.01 : 0), Math.cos(a) * -0.072 - 0.012));
    }
    add('chest', ribbonTube(hood, { width: 0.03, thick: 0.03, segs: 12, sides: 8, closedTip: true, rootCap: true, profile: (s) => { const e = Math.sin(Math.PI * (0.08 + 0.84 * s)); return [0.6 + 0.4 * e, 0.6 + 0.4 * e]; }, outward: (p, o) => o.set(p.x, 0, p.z).normalize() }), m, { outline: 0.004 });
    if (!ctx.hood) {
      const hb = ellipsoid(0.1, 0.09, 0.045, 16, 12);
      xf(hb, { p: [0, 0.145, -frontZ(P, 0, 0.13, 0.03) + 0.022], r: [0.28, 0, 0] });
      add('chest', hb, m, { outline: 0.004 });
    }
    // drawstrings
    const strM = charMat(app.topColor2 || WHITE);
    for (const s of (ctx.noStrings ? [] : [-1, 1])) {
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        const y = 0.185 - i * 0.03, x = s * (0.028 + i * 0.002);
        pts.push(V(x, y, frontZ(P, x, y, 0.036) + 0.004));
      }
      add('chest', ribbonTube(pts, { width: 0.0035, thick: 0.0035, segs: 6, sides: 5, profile: () => [1, 1], closedTip: false }), strM, { outline: 0.0018 });
      const ag = limb(0.016, 0.0045, 0.0045, { segs: 6, rings: 2, capRings: 2 });
      const e = pts[pts.length - 1];
      ag.translate(e.x, e.y, e.z);
      add('chest', ag, strM, { outline: 0.0018 });
    }
    // kangaroo pocket
    if (!ctx.noPocket) add('chest', frontPatch(P, { x0: -0.085, x1: 0.085, y0: -0.25, y1: -0.13, infl: 0.036, h: 0.007, round: 0.25 }), dark, { outline: 0 });
    sleeveSet(add, d, m, { r0: 0.058, r1: 0.055, fr0: 0.055, fr1: 0.048, cuff: 0.036, cuffMat: dark });
  },
  tshirt(add, d, app, P) {
    const m = charMat(app.topColor), trim = charMat(app.topColor2 || WHITE);
    const ys = [-0.25, -0.2, -0.12, -0.04, 0.04, 0.1, 0.14, 0.17, 0.195, 0.21];
    const rings = profileRings(P, ys, (y) => (y > 0.16 ? [0.01, 0.01] : [0.014, 0.014]));
    rings[rings.length - 1].rx = 0.052; rings[rings.length - 1].rz = 0.046;
    add('chest', loft(rings, 18), m, { outline: 0.004 });
    const col = new THREE.TorusGeometry(0.044, 0.0055, 6, 22);
    xf(col, { p: [0, 0.196, 0.0], r: [Math.PI / 2 + 0.38, 0, 0], s: [1.08, 0.92, 1] });
    add('chest', col, trim, { outline: 0.0025 });
    sleeveSet(add, d, m, { r0: 0.05, r1: 0.049, short: true, shortLen: 0.12, trimMat: app.topColor2 && app.topColor2 !== app.topColor ? trim : null });
  },
  jacket(add, d, app, P) {
    const m = charMat(app.topColor), dark = charMat(darken(app.topColor, 0.8)), tee = charMat(app.topColor2 || WHITE);
    const ys = [-0.25, -0.22, -0.16, -0.08, 0.0, 0.07, 0.12, 0.155, 0.185, 0.205];
    const rings = profileRings(P, ys, (y) => (y < -0.21 ? [0.026, 0.026] : y > 0.18 ? [0.03, 0.03] : [0.036, 0.036]));
    rings[rings.length - 1].rx = 0.066; rings[rings.length - 1].rz = 0.058;
    add('chest', loft(rings, 18), m, { outline: 0.0045 });
    add('chest', band(P, -0.265, -0.225, [0.026, 0.026]), dark, { outline: 0.003 });
    // open front: inner tee strip + zipper edges
    add('chest', frontPatch(P, { x0: -0.034, x1: 0.034, y0: -0.225, y1: 0.165, infl: 0.036, h: 0.001, round: 0.06 }), tee, { outline: 0 });
    for (const s of [-1, 1]) add('chest', frontPatch(P, { x0: s * 0.034 - 0.0045, x1: s * 0.034 + 0.0045, y0: -0.23, y1: 0.17, infl: 0.036, h: 0.003, nx: 2, ny: 8, round: 0.5 }), dark, { outline: 0 });
    // ribbed collar
    const col = new THREE.TorusGeometry(0.06, 0.012, 8, 24);
    xf(col, { p: [0, 0.198, -0.004], r: [Math.PI / 2 + 0.3, 0, 0], s: [1.05, 0.95, 1] });
    add('chest', col, dark, { outline: 0.003 });
    sleeveSet(add, d, m, { r0: 0.064, r1: 0.056, fr0: 0.056, fr1: 0.049, cuff: 0.036, cuffMat: dark });
  },
  blazer(add, d, app, P, ctx = {}, opt = {}) {
    const m = charMat(app.topColor), trimC = opt.coat ? darken(app.topColor, 0.78) : (app.topColor2 || darken(app.topColor, 0.6));
    const trim = charMat(trimC), shirt = charMat(opt.coat ? app.topColor2 : WHITE);
    const ys = [-0.3, -0.24, -0.16, -0.08, 0.0, 0.07, 0.12, 0.155, 0.185, 0.205];
    const rings = profileRings(P, ys, (y) => (y < -0.26 ? [0.03, 0.03] : y > 0.18 ? [0.018, 0.018] : [0.022, 0.022]));
    rings[rings.length - 1].rx = 0.054; rings[rings.length - 1].rz = 0.048;
    add('chest', loft(rings, 18), m, { outline: 0.0045 });
    // V neckline: shirt + tie
    const vTop = 0.192, vBot = 0.035;
    const vHalf = (y) => THREE.MathUtils.lerp(0.003, 0.06, Math.pow(Math.max(0, (y - vBot) / (vTop - vBot)), 0.85));
    // inner shirt (slightly grey-blue so it reads against light blazers)
    const g = frontPatch(P, { x0: -1, x1: 1, y0: vBot, y1: vTop, infl: 0.022, h: 0.0005, nx: 6, ny: 8, round: 0.2 });
    const gp = g.getAttribute('position');
    for (let i = 0; i < gp.count; i++) {
      const y = gp.getY(i), x = gp.getX(i) * vHalf(y);
      gp.setX(i, x); gp.setZ(i, frontZ(P, x, y, 0.022) + 0.002);
    }
    g.computeVertexNormals();
    add('chest', g, opt.coat ? shirt : charMat('#dfe4ee'), { outline: 0 });
    if (opt.coat) {
      // open collar: skin V at the throat, shirt buttons below
      const sv = frontPatch(P, { x0: -1, x1: 1, y0: 0.15, y1: vTop + 0.004, infl: 0.023, h: 0.0004, nx: 4, ny: 4, round: 0.2 });
      const sp = sv.getAttribute('position');
      for (let i = 0; i < sp.count; i++) { const y = sp.getY(i), x = sp.getX(i) * THREE.MathUtils.lerp(0.002, 0.03, (y - 0.15) / (vTop + 0.004 - 0.15)); sp.setX(i, x); sp.setZ(i, frontZ(P, x, y, 0.023) + 0.0026); }
      sv.computeVertexNormals();
      add('chest', sv, 'skin', { outline: 0 });
      for (const y of [0.13, 0.09, 0.05]) { const b = ellipsoid(0.004, 0.004, 0.002, 6, 4); b.translate(0, y, frontZ(P, 0, y, 0.022) + 0.003); add('chest', b, charMat(darken(app.topColor2, 0.6)), { outline: 0 }); }
    } else {
      // tie, tucked in at the button point
      const tie = [];
      for (let i = 0; i <= 5; i++) { const y = 0.19 - i * 0.03; tie.push(V(0, y, frontZ(P, 0, y, 0.022) + 0.0045)); }
      add('chest', ribbonTube(tie, { width: 0.012, thick: 0.0025, segs: 8, sides: 6, profile: (u) => [u < 0.12 ? 0.6 : 0.8 + u * 0.45, 1], closedTip: false, outward: (p, o) => o.set(0, 0, 1) }), trim, { outline: 0.0012 });
    }
    // lapels: wide at the collar, tapering to the button point
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const y = THREE.MathUtils.lerp(vBot - 0.01, 0.205, i / 6);
        const x = s * (vHalf(y) + 0.012 + 0.012 * (i / 6));
        pts.push(V(x, y, frontZ(P, x, y, 0.022) + 0.0035));
      }
      add('chest', ribbonTube(pts, { width: 0.018, thick: 0.0035, segs: 8, sides: 6, profile: (u) => [0.3 + 0.85 * Math.pow(u, 0.7), 1], closedTip: false, outward: (p, o) => o.set(p.x * 1.5, 0, 1).normalize() }), trim, { outline: 0.0018 });
      // shirt collar points
      const cw = opt.coat ? 1.6 : 1;
      const cx = opt.coat ? 0.012 : 0;
      const cp = [V(s * (0.038 + cx * 0.3), 0.21, frontZ(P, s * 0.036, 0.205, 0.02) + 0.004), V(s * (0.026 + cx), 0.19, frontZ(P, s * (0.022 + cx), 0.19, 0.022) + 0.007), V(s * (0.016 + cx * 1.6), 0.162, frontZ(P, s * (0.01 + cx * 1.6), 0.165, 0.022) + 0.007)];
      add('chest', ribbonTube(cp, { width: 0.012 * cw, thick: 0.0022, segs: 5, sides: 5, profile: (u) => [1 - 0.6 * u, 1], closedTip: true, outward: (p, o) => o.set(p.x * 2, 0, 1).normalize() }), shirt, { outline: 0.0014 });
    }
    // buttons + hem trim
    for (const y of [0.0, -0.08]) {
      const b = ellipsoid(0.0065, 0.0065, 0.003, 8, 6);
      b.translate(0.012, y, frontZ(P, 0.012, y, 0.022) + 0.002);
      add('chest', b, trim, { outline: 0 });
    }
    add('chest', band(P, -0.31, -0.29, [0.031, 0.031]), trim, { outline: 0.0025 });
    sleeveSet(add, d, m, { r0: 0.054, r1: 0.046, fr0: 0.046, fr1: 0.04, cuff: 0.04, cuffMat: opt.coat ? shirt : trim });
  },
  coat(add, d, app, P, ctx) { TOPS.blazer(add, d, app, P, ctx, { coat: true }); },
  bearhoodie(add, d, app, P, ctx = {}) {
    TOPS.hoodie(add, d, app, P, { ...ctx, noPocket: true });
    // bear-head patch on the chest
    const fur = charMat(mix(app.topColor, '#ffffff', 0.12)), snout = charMat(app.topColor2 || '#c9a27a'), ink = charMat('#1a1214'), inner = charMat(darken(app.topColor, 0.6));
    const y0 = -0.17, z0 = frontZ(P, 0, y0, 0.036) + 0.004;
    const head = ellipsoid(0.042, 0.036, 0.008, 18, 10); head.translate(0, y0, z0);
    add('chest', head, fur, { outline: 0.0018 });
    for (const s of [-1, 1]) {
      const e = ellipsoid(0.015, 0.015, 0.006, 12, 8); e.translate(s * 0.034, y0 + 0.03, z0 - 0.002); add('chest', e, fur, { outline: 0.0016 });
      const ei = ellipsoid(0.009, 0.009, 0.004, 10, 6); ei.translate(s * 0.034, y0 + 0.03, z0 + 0.003); add('chest', ei, inner, { outline: 0 });
      const eye = ellipsoid(0.0045, 0.0055, 0.002, 8, 6); eye.translate(s * 0.016, y0 + 0.008, z0 + 0.0075); add('chest', eye, ink, { outline: 0 });
    }
    const sn = ellipsoid(0.019, 0.014, 0.006, 14, 8); sn.translate(0, y0 - 0.012, z0 + 0.006); add('chest', sn, snout, { outline: 0.0012 });
    const no = ellipsoid(0.007, 0.005, 0.003, 8, 6); no.translate(0, y0 - 0.006, z0 + 0.011); add('chest', no, ink, { outline: 0 });
  },
  onesie(add, d, app, P, ctx = {}) {
    TOPS.hoodie(add, d, app, P, { ...ctx, noPocket: true, noStrings: true });
    const btn = charMat(app.topColor2 || '#f2c440');
    for (const y of [0.11, 0.03, -0.05, -0.13, -0.21]) {
      const b = ellipsoid(0.0085, 0.0085, 0.004, 12, 8);
      b.translate(0, y, frontZ(P, 0, y, 0.036) + 0.004);
      add('chest', b, btn, { outline: 0.0012 });
    }
  },
  puffcrop(add, d, app, P) {
    const m = charMat(app.topColor), lace = charMat(app.topColor2 || '#efe2c4');
    const yb = -0.125;
    const ytop = (th) => { const f = Math.max(0, Math.cos(th)); return THREE.MathUtils.lerp(0.178, 0.128, Math.pow(f, 1.6)) - 0.012 * Math.pow(Math.max(0, Math.cos(th * 2.2)), 8) * f; };
    const infl = (y) => (y > 0.1 ? 0.008 : 0.01);
    add('chest', torsoShell(P, yb, ytop, infl), m, { outline: 0.004 });
    add('chest', band(P, yb - 0.004, yb + 0.012, [0.012, 0.012]), m, { outline: 0.003 });
    // cream lace along the neckline (scalloped)
    const edge = shellEdge(P, ytop, infl, 40, 0.002);
    add('chest', ribbonTube(edge, { width: 0.0075, thick: 0.0028, segs: 80, sides: 4, closedTip: false, profile: (u) => [0.8 + 0.35 * Math.abs(Math.sin(u * Math.PI * 40)), 1], outward: (p, o) => o.set(0, 1, 0) }), lace, { outline: 0.0012 });
    // little bow at the centre of the neckline
    const yb2 = ytop(0) - 0.006, zb = frontZ(P, 0, yb2, 0.01) + 0.006;
    for (const g of bowGeos(0.75)) { g.translate(0, yb2, zb); add('chest', g, lace, { outline: 0.001 }); }
    // ruched centre seam
    const seam = [];
    for (let i = 0; i <= 5; i++) { const y = yb + 0.01 + (yb2 - yb - 0.02) * (i / 5); seam.push(V(0, y, frontZ(P, 0, y, 0.01) + 0.0018)); }
    add('chest', ribbonTube(seam, { width: 0.0025, thick: 0.0015, segs: 6, sides: 4, closedTip: false, profile: () => [1, 1] }), charMat(darken(app.topColor, 0.7)), { outline: 0 });
    // puff sleeves + lace cuffs
    const k = d.limbK;
    for (const key of ['L', 'R']) {
      add('upper' + key, loft([
        { y: -0.1 * k, rx: 0.046 * k, rz: 0.046 * k }, { y: -0.085 * k, rx: 0.056 * k, rz: 0.054 * k }, { y: -0.05 * k, rx: 0.062 * k, rz: 0.058 * k },
        { y: -0.015, rx: 0.06 * k, rz: 0.056 * k }, { y: 0.015, rx: 0.05 * k, rz: 0.048 * k }, { y: 0.034, rx: 0.03 * k, rz: 0.03 * k },
      ], 16, { capBottom: false }), m, { outline: 0.0035 });
      add('upper' + key, limb(0.012, 0.046 * k, 0.045 * k, { segs: 14, rings: 2, topCap: false, botCap: false }).translate(0, -0.096 * k, 0), lace, { outline: 0.002 });
    }
  },
  sweater(add, d, app, P) {
    const m = charMat(app.topColor), dark = charMat(darken(app.topColor, 0.82)), stripe = charMat(app.topColor2 || WHITE);
    const ys = [-0.27, -0.24, -0.18, -0.1, -0.02, 0.05, 0.1, 0.14, 0.17, 0.195, 0.21];
    const rings = profileRings(P, ys, (y) => (y < -0.23 ? [0.016, 0.016] : y > 0.18 ? [0.016, 0.016] : [0.022, 0.022]));
    rings[rings.length - 1].rx = 0.05; rings[rings.length - 1].rz = 0.046;
    add('chest', loft(rings, 18), m, { outline: 0.0045 });
    add('chest', band(P, -0.285, -0.245, [0.016, 0.016]), dark, { outline: 0.003 });
    add('chest', band(P, 0.035, 0.065, [0.024, 0.024]), stripe, { outline: 0 });
    const col = new THREE.TorusGeometry(0.046, 0.011, 8, 22);
    xf(col, { p: [0, 0.2, 0.0], r: [Math.PI / 2 + 0.3, 0, 0], s: [1.08, 0.94, 1] });
    add('chest', col, dark, { outline: 0.003 });
    sleeveSet(add, d, m, { r0: 0.055, r1: 0.048, fr0: 0.048, fr1: 0.042, cuff: 0.036, cuffMat: dark });
  },
  tank(add, d, app, P) {
    const m = charMat(app.topColor);
    const ys = [-0.24, -0.18, -0.1, -0.02, 0.05, 0.1, 0.13];
    const rings = profileRings(P, ys, 0.009);
    rings[rings.length - 1].cap = -0.01;
    add('chest', loft(rings, 18), m, { outline: 0.004 });
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI; // front -> over shoulder -> back
        const x = s * (d.fem ? 0.068 : 0.078);
        const yTop = 0.2;
        const y = 0.12 + Math.sin(a) * (yTop - 0.12);
        const p = P(y);
        const t = Math.min(0.99, Math.abs(x) / (p.rx + 0.006));
        const zr = (p.rz + 0.006) * Math.sqrt(1 - t * t);
        pts.push(V(x, y, p.z + Math.cos(a) * (zr + 0.002)));
      }
      add('chest', ribbonTube(pts, { width: 0.012, thick: 0.003, segs: 10, sides: 6, profile: () => [1, 1], closedTip: false, outward: (p, o) => o.set(0, 1, p.z * 6).normalize() }), m, { outline: 0.0018 });
    }
  },
};

// ======================= BOTTOMS =======================
function pelvisGarment(add, d, P, mat, infl = 0.012, topY = 0.11) {
  const off = P.hipOff; // chest-local = hips-local + off
  const ys = [-0.112, -0.09, -0.05, 0.0, 0.05, 0.09, topY];
  const rings = ys.map((y) => { const p = P(y + off); return { y, rx: p.rx + infl, rz: p.rz + infl, z: p.z }; });
  rings[0].cap = 0.01;
  add('hips', loft(rings, 16), mat, { outline: 0.004 });
  // waistband
  const wb = ys.slice(-2).map((y) => { const p = P(y + off); return { y, rx: p.rx + infl + 0.003, rz: p.rz + infl + 0.003, z: p.z }; });
  return wb;
}

const BOTTOMS = {
  pants(add, d, app, P, opt = {}) {
    const m = charMat(app.bottomColor);
    pelvisGarment(add, d, P, m);
    const k = d.limbK;
    for (const key of ['L', 'R']) {
      add('upLeg' + key, limb(d.thigh, (opt.t0 || 0.07) * k, (opt.t1 || 0.056) * k, { segs: 13, rings: 6, bulge: 0.003 }), m, { outline: 0.0045 });
      add('leg' + key, limb(d.shin - 0.012, (opt.s0 || 0.058) * k, (opt.s1 || 0.052) * k, { segs: 13, rings: 6, botCap: !opt.cuff }), m, { outline: 0.0045 });
      if (opt.cuff) add('leg' + key, limb(0.035, opt.cuff * k, opt.cuff * k, { segs: 12, rings: 2, topCap: false }).translate(0, -d.shin + 0.04, 0), charMat(darken(app.bottomColor, 0.8)), { outline: 0.003 });
      if (opt.pockets) {
        const s = key === 'L' ? 1 : -1;
        const pk = loft([
          { y: -0.2, rx: 0.016, rz: 0.04, n: 4 }, { y: -0.12, rx: 0.02, rz: 0.044, n: 4 }, { y: -0.06, rx: 0.016, rz: 0.04, n: 4 },
        ], 12);
        pk.translate(s * 0.07 * k, 0, 0);
        add('upLeg' + key, pk, charMat(darken(app.bottomColor, 0.88)), { outline: 0.0025 });
      }
    }
  },
  joggers(add, d, app, P) {
    BOTTOMS.pants(add, d, app, P, { t0: 0.072, t1: 0.056, s0: 0.056, s1: 0.04, cuff: 0.038 });
    for (const s of [-1, 1]) {
      const st = limb(0.07, 0.0028, 0.0028, { segs: 5, rings: 3, capRings: 2 });
      const p = P(0.09 + P.hipOff);
      st.translate(s * 0.018, 0.1, p.z + p.rz + 0.014);
      add('hips', st, charMat(WHITE), { outline: 0.0015 });
    }
  },
  cargo(add, d, app, P) {
    BOTTOMS.pants(add, d, app, P, { t0: 0.074, t1: 0.062, s0: 0.062, s1: 0.056, pockets: true });
  },
  shorts(add, d, app, P) {
    const m = charMat(app.bottomColor);
    pelvisGarment(add, d, P, m);
    const k = d.limbK;
    for (const key of ['L', 'R']) add('upLeg' + key, limb(d.fem ? 0.15 : 0.19, 0.073 * k, 0.07 * k, { segs: 13, rings: 4, botCap: false }), m, { outline: 0.004 });
  },
  miniskirt(add, d, app, P, deform) {
    BOTTOMS.skirt(add, d, app, P, deform, { len: -0.16, N: 22, flare: 1.25 });
    // studded belt + silver chain looping at the side
    const off = P.hipOff;
    const belt = charMat('#2a2a30'), silver = charMat('#d8dce4', 'shiny');
    const bw = profileRings((y) => P(y + off), [0.085, 0.098, 0.11], [0.02, 0.02]);
    add('hips', loft(bw, 24, { capTop: false, capBottom: false }), belt, { outline: 0.002 });
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * Math.PI * 2, p = P(0.097 + off);
      const st = ellipsoid(0.004, 0.004, 0.003, 5, 3);
      st.translate(Math.sin(th) * (p.rx + 0.023), 0.097, p.z + Math.cos(th) * (p.rz + 0.023));
      add('hips', st, silver, { outline: 0 });
    }
    const pa = P(0.09 + off);
    const a0 = 0.5, a1 = 2.2;
    const curve = new THREE.CatmullRomCurve3([0, 0.25, 0.5, 0.75, 1].map((u) => {
      const th = a0 + (a1 - a0) * u;
      return V(Math.sin(th) * (pa.rx + 0.03 + 0.015 * Math.sin(Math.PI * u)), 0.09 - 0.09 * Math.sin(Math.PI * u), pa.z + Math.cos(th) * (pa.rz + 0.03 + 0.015 * Math.sin(Math.PI * u)));
    }));
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, P0 = curve.getPointAt(u), T = curve.getTangentAt(u);
      const ln = new THREE.TorusGeometry(0.0062, 0.0018, 3, 7);
      ln.scale(1.35, 1, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), T);
      if (i % 2) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
      ln.applyQuaternion(q); ln.translate(P0.x, P0.y, P0.z);
      add('hips', ln, silver, { outline: 0 });
    }
  },
  skirt(add, d, app, P, deform, opt = {}) {
    const m = deform.skirtMat(app.bottomColor);
    pelvisGarment(add, d, P, charMat(darken(app.bottomColor, 0.95)), 0.006, 0.11);
    const off = P.hipOff;
    const N = opt.N || 18;
    const ys = opt.len ? [0.11, 0.06, 0.0, -0.06, -0.11, opt.len] : [0.11, 0.06, 0.0, -0.06, -0.12, -0.17, d.fem ? -0.205 : -0.22];
    const yTop = ys[0], yBot = ys[ys.length - 1];
    const rings = ys.slice().reverse().map((y) => {
      const p = P(Math.max(y, -0.04) + off);
      const h = (yTop - y) / (yTop - yBot);
      const flare = (h * h * 0.06 + h * 0.03) * (opt.flare || 1);
      return {
        y, rx: p.rx + 0.012 + flare, rz: p.rz + 0.012 + flare * 0.95, z: p.z,
        f: (th) => { const tri = Math.abs(((th / (Math.PI * 2)) * N) % 1 - 0.5) * 2; return 1 + (tri - 0.5) * 0.07 * Math.min(1, h * 2.5); },
      };
    });
    const g = loft(rings, N * 2, { capTop: false, capBottom: false });
    add('hips', g, m, { outline: 0.0035, outlineMat: deform.skirtOutline });
    // inside face so the underside isn't see-through
    const gi = g.clone();
    const ix = gi.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; }
    gi.computeVertexNormals();
    add('hips', gi, deform.skirtMat(darken(app.bottomColor, 0.6)), { outline: 0 });
  },
};

// ======================= SHOES =======================
function shoeLoft(rows, segs = 14, n = 2.5) {
  // rows: [z, halfW, halfH, centerY] along +Z (heel -> toe)
  const rings = rows.map(([z, w, h, cy]) => ({ y: z, rx: w, rz: h, z: -cy, n }));
  const g = loft(rings, segs);
  g.rotateX(Math.PI / 2); // +Y(loft axis) -> +Z ; ring z -> -y
  return g;
}

const SHOES = {
  sneakers(add, d, app) {
    const a = d.ankleH, k = d.fem ? 0.92 : 1;
    const up = charMat(app.shoesColor), sole = charMat(app.shoesColor === '#f1f1ee' ? '#d9d6cf' : WHITE), dark = charMat(darken(app.shoesColor, 0.55));
    for (const key of ['L', 'R']) {
      // sole: flat-bottomed squircle slab
      add('foot' + key, shoeLoft([
        [-0.058 * k, 0.03 * k, 0.012, -a + 0.012], [-0.045 * k, 0.04 * k, 0.014, -a + 0.013], [0.02 * k, 0.045 * k, 0.014, -a + 0.012],
        [0.1 * k, 0.047 * k, 0.013, -a + 0.012], [0.15 * k, 0.04 * k, 0.012, -a + 0.013], [0.178 * k, 0.022 * k, 0.01, -a + 0.016],
      ], 14, 4), sole, { outline: 0.0035 });
      // upper
      add('foot' + key, shoeLoft([
        [-0.052 * k, 0.026 * k, 0.026, -a + 0.045], [-0.04 * k, 0.038 * k, 0.04, -a + 0.05], [0.0, 0.042 * k, 0.046, -a + 0.05],
        [0.06 * k, 0.044 * k, 0.034, -a + 0.04], [0.12 * k, 0.042 * k, 0.026, -a + 0.034], [0.158 * k, 0.03 * k, 0.019, -a + 0.032], [0.172 * k, 0.012 * k, 0.01, -a + 0.032],
      ], 16, 2.2), up, { outline: 0.0035 });
      // collar / tongue
      const col = limb(0.028, 0.034 * k, 0.038 * k, { segs: 12, rings: 2, rz: 1.15, topCap: false });
      col.translate(0, -a + 0.1, -0.004);
      add('foot' + key, col, dark, { outline: 0.003 });
      // lace strip
      const laces = [];
      for (let i = 0; i <= 4; i++) { const z = 0.01 + i * 0.022; laces.push(V(0, -a + 0.082 - i * 0.009, z * k + 0.01)); }
      add('foot' + key, ribbonTube(laces, { width: 0.016 * k, thick: 0.004, segs: 6, sides: 6, profile: () => [1, 1], closedTip: false, outward: () => {} }), dark, { outline: 0 });
    }
  },
  boots(add, d, app) {
    const a = d.ankleH, k = d.fem ? 0.92 : 1;
    const up = charMat(app.shoesColor), sole = charMat(darken(app.shoesColor, 0.45));
    for (const key of ['L', 'R']) {
      add('foot' + key, shoeLoft([
        [-0.06 * k, 0.032 * k, 0.013, -a + 0.013], [-0.045 * k, 0.042 * k, 0.015, -a + 0.014], [0.02 * k, 0.046 * k, 0.015, -a + 0.013],
        [0.1 * k, 0.048 * k, 0.014, -a + 0.013], [0.15 * k, 0.042 * k, 0.013, -a + 0.014], [0.178 * k, 0.024 * k, 0.011, -a + 0.016],
      ], 14, 4), sole, { outline: 0.0035 });
      add('foot' + key, shoeLoft([
        [-0.054 * k, 0.03 * k, 0.03, -a + 0.05], [-0.04 * k, 0.04 * k, 0.045, -a + 0.055], [0.0, 0.043 * k, 0.05, -a + 0.055],
        [0.06 * k, 0.045 * k, 0.034, -a + 0.042], [0.12 * k, 0.043 * k, 0.027, -a + 0.035], [0.16 * k, 0.031 * k, 0.02, -a + 0.033], [0.174 * k, 0.012 * k, 0.012, -a + 0.033],
      ], 16, 2.2), up, { outline: 0.0035 });
      // shaft up the shin
      add('leg' + key, limb(0.15, 0.05 * d.limbK, 0.046 * d.limbK, { segs: 13, rings: 3, botCap: false }).translate(0, -d.shin + 0.15, -0.002), up, { outline: 0.004 });
      add('leg' + key, limb(0.016, 0.053 * d.limbK, 0.053 * d.limbK, { segs: 13, rings: 2, topCap: false, botCap: false }).translate(0, -d.shin + 0.155, -0.002), sole, { outline: 0.003 });
    }
  },
  warmers(add, d, app) {
    // chunky ribbed slouchy leg warmers from above the knee down over the foot
    const m = charMat(app.shoesColor), k = d.limbK, a = d.ankleH;
    const rib = (th) => 1 + 0.045 * Math.cos(th * 12);
    for (const key of ['L', 'R']) {
      const top = [];
      for (let i = 0; i <= 3; i++) { const t = i / 3; top.push({ y: -d.thigh + 0.13 - 0.13 * t, rx: (0.052 + 0.004 * Math.sin(Math.PI * t)) * k, rz: (0.052 + 0.004 * Math.sin(Math.PI * t)) * k, f: rib }); }
      top.reverse();
      add('upLeg' + key, loft(top, 24, { capTop: false, capBottom: false }), m, { outline: 0.0035 });
      add('upLeg' + key, limb(0.014, 0.056 * k, 0.056 * k, { segs: 24, rings: 2, topCap: false, botCap: false }).translate(0, -d.thigh + 0.137, 0), m, { outline: 0.003 });
      const sh = [];
      const nR = 9;
      for (let i = 0; i <= nR; i++) {
        const t = i / nR;
        const slouch = 0.012 * Math.max(0, Math.sin(t * Math.PI * 3.5)) * t + 0.016 * Math.pow(t, 3);
        sh.push({ y: 0.04 - (d.shin + 0.035) * t, rx: (0.05 - 0.008 * Math.sin(Math.PI * t * 0.8) + slouch) * k, rz: (0.05 - 0.008 * Math.sin(Math.PI * t * 0.8) + slouch) * k, z: -0.002, f: rib });
      }
      sh.reverse();
      add('leg' + key, loft(sh, 24, { capTop: false, capBottom: true }), m, { outline: 0.0038 });
      add('foot' + key, shoeLoft([
        [-0.05 * k, 0.03 * k, 0.03, -a + 0.035], [-0.035 * k, 0.04 * k, 0.04, -a + 0.04], [0.02 * k, 0.043 * k, 0.04, -a + 0.04],
        [0.08 * k, 0.042 * k, 0.03, -a + 0.032], [0.13 * k, 0.034 * k, 0.022, -a + 0.026], [0.152 * k, 0.014 * k, 0.012, -a + 0.026],
      ], 16, 2.2), charMat(darken(app.shoesColor, 0.75)), { outline: 0.0035 });
    }
  },
  loafers(add, d, app) {
    const a = d.ankleH, k = d.fem ? 0.9 : 0.98;
    const up = charMat(app.shoesColor, 'shiny'), sole = charMat(darken(app.shoesColor, 0.5)), sock = charMat(d.fem ? '#1c1c22' : '#2a2a30');
    for (const key of ['L', 'R']) {
      add('foot' + key, shoeLoft([
        [-0.055 * k, 0.03 * k, 0.008, -a + 0.008], [0.02 * k, 0.042 * k, 0.009, -a + 0.008], [0.12 * k, 0.042 * k, 0.008, -a + 0.008], [0.172 * k, 0.02 * k, 0.007, -a + 0.01],
      ], 14, 4), sole, { outline: 0.003 });
      add('foot' + key, shoeLoft([
        [-0.05 * k, 0.027 * k, 0.022, -a + 0.035], [-0.035 * k, 0.037 * k, 0.03, -a + 0.04], [0.02 * k, 0.04 * k, 0.03, -a + 0.04],
        [0.08 * k, 0.041 * k, 0.026, -a + 0.035], [0.14 * k, 0.036 * k, 0.019, -a + 0.027], [0.168 * k, 0.018 * k, 0.012, -a + 0.025],
      ], 16, 2.2), up, { outline: 0.0035 });
      // sock / ankle
      add('foot' + key, limb(0.06, 0.03 * d.limbK, 0.034 * d.limbK, { segs: 12, rings: 2, topCap: false }).translate(0, 0.03, -0.004), sock, { outline: 0.003 });
    }
  },
};

// ======================= ACCESSORIES =======================
/** z of the head surface at head-local (x,y) front */
const _sv = new THREE.Vector3();
function headFrontZ(x, y) {
  let best = 0, bestD = 1e9;
  for (let i = 0; i <= 60; i++) {
    for (let j = 0; j <= 30; j++) {
      const th = (i / 60) * Math.PI - Math.PI / 2, ph = (j / 30) * Math.PI - Math.PI / 2;
      headShape(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph), _sv);
      const dd = (_sv.x - x) ** 2 + (_sv.y - y) ** 2;
      if (dd < bestD) { bestD = dd; best = _sv.z; }
    }
  }
  return best;
}
const _fz = new Map();
const faceZ = (x, y) => { const k = `${x.toFixed(3)},${y.toFixed(3)}`; if (!_fz.has(k)) _fz.set(k, headFrontZ(x, y)); return _fz.get(k); };

export function domeCap(k, yCut, frontCut, segs = 28) {
  // ellipsoidal dome over the hair shell, trimmed below yCut (front raised by frontCut)
  const rings = [];
  const n = 9;
  const RZ = (SHELL.RZF + SHELL.RZB) / 2;
  for (let i = 0; i <= n; i++) {
    const el = (i / n) * (Math.PI / 2);
    const y = SHELL.C.y + Math.sin(el) * SHELL.RY * k;
    rings.push({ y, rx: Math.cos(el) * SHELL.RX * k + 0.0005, rz: Math.cos(el) * RZ * k + 0.0005, z: SHELL.C.z });
  }
  const bottom = { y: yCut, rx: SHELL.RX * k * 1.01, rz: RZ * k * 1.01, z: SHELL.C.z };
  const g = loft([bottom, ...rings.filter((r) => r.y > yCut + 0.004)], segs, { capBottom: false });
  // tilt: raise the front of the brim line
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i);
    if (y < 0.06) p.setY(i, y + Math.max(0, z) * frontCut);
  }
  g.computeVertexNormals();
  return g;
}

const ACCS = {
  glasses(add, app, color) {
    const fm = charMat(color || '#1a1a20');
    const lens = charMat('#bfe6ff', 'cloth', { transparent: true, opacity: 0.22 });
    const y = HEAD.eyeY + 0.001;
    for (const s of [-1, 1]) {
      const x = s * HEAD.eyeX;
      const z = faceZ(x, y) + 0.011;
      const ring = new THREE.TorusGeometry(0.021, 0.0016, 6, 28);
      xf(ring, { p: [x, y, z], r: [0, s * 0.16, 0], s: [1.12, 0.9, 1] });
      add('headC', ring, fm, { outline: 0.001 });
      const l = new THREE.CircleGeometry(0.021, 20);
      xf(l, { p: [x, y, z - 0.0005], r: [0, s * 0.16, 0], s: [1.12, 0.9, 1] });
      add('headC', l, lens, { outline: 0, shadow: false });
      const arm = ribbonTube([V(s * 0.06, y + 0.003, z - 0.006), V(s * 0.085, y + 0.006, z - 0.04), V(s * 0.092, y + 0.004, -0.02)], { width: 0.0018, thick: 0.0018, segs: 5, sides: 4, profile: () => [1, 1], closedTip: false });
      add('headC', arm, fm, { outline: 0 });
    }
    const br = ribbonTube([V(-0.015, y + 0.004, faceZ(0, y) + 0.012), V(0, y + 0.007, faceZ(0, y) + 0.014), V(0.015, y + 0.004, faceZ(0, y) + 0.012)], { width: 0.0018, thick: 0.0018, segs: 4, sides: 4, profile: () => [1, 1], closedTip: false });
    add('headC', br, fm, { outline: 0 });
  },
  cap(add, app, color) {
    const m = charMat(color), w = charMat(mix(color, '#ffffff', 0.85));
    capGeos(add, m, w);
  },
  beanie(add, app, color) {
    const m = charMat(color), dark = charMat(darken(color, 0.8));
    add('headC', domeCap(1.1, 0.0, 0.25), m, { outline: 0.004 });
    const cuff = loft([
      { y: -0.006, rx: 0.112, rz: 0.116, z: -0.004 }, { y: 0.012, rx: 0.116, rz: 0.12, z: -0.004 }, { y: 0.03, rx: 0.113, rz: 0.117, z: -0.004 },
    ], 28, { capTop: false, capBottom: false });
    const p = cuff.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.max(0, p.getZ(i)) * 0.27);
    cuff.computeVertexNormals();
    add('headC', cuff, dark, { outline: 0.003 });
  },
  headphones(add, app, color) {
    const m = charMat(color), dark = charMat('#22232b');
    const band = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI; band.push(V(Math.sin(a) * 0.116, 0.0 + Math.cos(a) * 0.13, -0.012)); }
    add('headC', ribbonTube(band, { width: 0.014, thick: 0.006, segs: 12, sides: 6, profile: () => [1, 1], closedTip: false, outward: (p, o) => o.set(p.x, p.y, 0).normalize() }), m, { outline: 0.0025 });
    for (const s of [-1, 1]) {
      const cup = new THREE.CylinderGeometry(0.034, 0.034, 0.024, 18);
      xf(cup, { p: [s * 0.104, -0.012, -0.012], r: [0, 0, Math.PI / 2] });
      add('headC', weld(cup), m, { outline: 0.003 });
      const pad = new THREE.TorusGeometry(0.026, 0.009, 8, 18);
      xf(pad, { p: [s * 0.09, -0.012, -0.012], r: [0, Math.PI / 2, 0] });
      add('headC', pad, dark, { outline: 0.002 });
      const glow = new THREE.RingGeometry(0.012, 0.017, 18);
      xf(glow, { p: [s * 0.117, -0.012, -0.012], r: [0, s * Math.PI / 2, 0] });
      add('headC', glow, charMat('#5ee7ff', 'flat', { emissive: '#5ee7ff', emissiveIntensity: 1.1 }), { outline: 0, shadow: false });
    }
  },
  mask(add, app, color, headGeo) {
    const m = charMat(color || WHITE);
    const p = headGeo.getAttribute('position'), n = headGeo.getAttribute('normal');
    const idx = headGeo.index.array;
    const keep = (i) => p.getZ(i) > -0.01 && p.getY(i) < -0.05 && p.getY(i) > -0.13;
    const map = new Map(), pos = [], out = [];
    const get = (i) => {
      let k = map.get(i); if (k !== undefined) return k;
      k = pos.length / 3; map.set(i, k);
      const lift = 0.004 + 0.004 * Math.max(0, p.getZ(i) / 0.09);
      pos.push(p.getX(i) + n.getX(i) * lift, p.getY(i) + n.getY(i) * lift, p.getZ(i) + n.getZ(i) * lift + 0.003);
      return k;
    };
    for (let t = 0; t < idx.length; t += 3) if (keep(idx[t]) && keep(idx[t + 1]) && keep(idx[t + 2])) out.push(get(idx[t]), get(idx[t + 1]), get(idx[t + 2]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(out); g.computeVertexNormals();
    add('headC', g, m, { outline: 0 });
  },
  scarf(add, app, color, _h, d, P) {
    const m = charMat(color), dark = charMat(darken(color, 0.8));
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push(V(Math.sin(a) * 0.066, 0.2 + Math.cos(a) * 0.012, Math.cos(a) * 0.058 - 0.004));
    }
    pts.push(pts[1].clone());
    add('chest', ribbonTube(new THREE.CatmullRomCurve3(pts.slice(0, 12), true), { width: 0.024, thick: 0.02, segs: 24, sides: 8, profile: () => [1, 1], closedTip: false, outward: (p, o) => o.set(p.x, 0, p.z).normalize() }), m, { outline: 0.004 });
    const tail = [V(0.045, 0.2, 0.05), V(0.06, 0.13, frontZ(P, 0.06, 0.13, 0.04) + 0.012), V(0.065, 0.03, frontZ(P, 0.065, 0.03, 0.04) + 0.01)];
    add('chest', ribbonTube(tail, { width: 0.024, thick: 0.006, segs: 8, sides: 6, profile: (s) => [1 + 0.1 * s, 1], closedTip: false, outward: () => {} }), dark, { outline: 0.003 });
  },
  apron(add, app, color, _h, d, P) {
    const m = charMat(color), dark = charMat(darken(color, 0.75));
    add('chest', frontPatch(P, { x0: -0.11, x1: 0.11, y0: -0.2, y1: 0.12, infl: 0.042, h: 0.004, nx: 8, ny: 8, round: 0.15 }), m, { outline: 0 });
    // lower skirt part on hips
    const off = P.hipOff;
    const g = frontPatch((y) => P(y + off), { x0: -0.13, x1: 0.13, y0: -0.24, y1: 0.12 + 0.23 - 0.25, infl: 0.05, h: 0.004, nx: 8, ny: 8, round: 0.15 });
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.04) p.setZ(i, p.getZ(i) + (-0.04 - y) * 0.18); }
    g.computeVertexNormals();
    add('hips', g, m, { outline: 0 });
    // neck strap + waist tie
    const strap = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI; strap.push(V(Math.sin(a) * 0.07, 0.17 + Math.cos(a) * 0.04, frontZ(P, Math.sin(a) * 0.07, 0.17, 0.03) * 0.3 + Math.cos(a) * -0.05)); }
    add('chest', ribbonTube(strap, { width: 0.007, thick: 0.003, segs: 8, sides: 4, profile: () => [1, 1], closedTip: false }), dark, { outline: 0 });
    add('chest', band(P, -0.175, -0.16, [0.044, 0.044]), dark, { outline: 0 });
    const pk = frontPatch(P, { x0: -0.07, x1: 0.07, y0: -0.13, y1: -0.06, infl: 0.047, h: 0.003, nx: 4, ny: 3, round: 0.3 });
    add('chest', pk, dark, { outline: 0 });
  },
  choker(add, app, color, _h, d) {
    const nr = neckRadius(d) + 0.0035;
    const m = charMat(color);
    add('neck', limb(0.012, nr, nr, { segs: 20, rings: 2, topCap: false, botCap: false }).translate(0, 0.05, 0.002), m, { outline: 0.0014 });
    for (const g of bowGeos(0.9)) { g.translate(0, 0.04, nr + 0.004); add('neck', g, m, { outline: 0.001 }); }
  },
  headband(add, app, color) {
    add('headC', headBandGeo(1.06, 0.019, 0.016, 0.06), charMat(color), { outline: 0.0025 });
  },
};
ACCS.none = () => {};

/** forehead band ring around the hair shell (front low, back high) */
export function headBandGeo(k = 1.08, h = 0.02, yFront = 0.028, yBack = 0.07) {
  const pos = [], idx = [];
  const segs = 36;
  const RZ = (th) => (Math.cos(th) > 0 ? SHELL.RZF : SHELL.RZB);
  for (let r = 0; r < 4; r++) {
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const yc = THREE.MathUtils.lerp(yBack, yFront, (1 + Math.cos(th)) / 2);
      const t = r / 3;
      const y = yc - h / 2 + h * t;
      const bulge = 1 + 0.03 * Math.sin(Math.PI * t);
      const el = Math.asin(Math.min(0.95, Math.max(-0.95, (y - SHELL.C.y) / (SHELL.RY * k))));
      const ce = Math.cos(el) * k * bulge;
      pos.push(Math.sin(th) * SHELL.RX * ce, y, SHELL.C.z + Math.cos(th) * RZ(th) * ce);
    }
  }
  for (let r = 0; r < 3; r++) for (let j = 0; j < segs; j++) {
    const j1 = (j + 1) % segs;
    const a = r * segs + j, b = r * segs + j1, c = (r + 1) * segs + j1, d = (r + 1) * segs + j;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** baseball cap dome + brim (+ button); optional front logo disc material */
export function capGeos(add, m, logoMat = null) {
  add('headC', xf(domeCap(1.08, 0.03, 0.2), { s: [1, 0.88, 1], p: [0, 0.004, 0] }), m, { outline: 0.004 });
  const brim = new THREE.CylinderGeometry(0.088, 0.094, 0.007, 22, 1, false, -Math.PI * 0.5, Math.PI);
  xf(brim, { p: [0, 0.04, 0.035], r: [0.2, 0, 0], s: [1.05, 1, 1.25] });
  add('headC', weld(brim), m, { outline: 0.003 });
  const bt = ellipsoid(0.009, 0.005, 0.009, 8, 6); bt.translate(0, SHELL.C.y + SHELL.RY * 1.08 * 0.88 + 0.004, SHELL.C.z);
  add('headC', bt, m, { outline: 0.002 });
  if (logoMat) {
    const logo = new THREE.CircleGeometry(0.016, 16);
    xf(logo, { p: [0, 0.088, 0.096], r: [-0.5, 0, 0] });
    add('headC', logo, logoMat, { outline: 0 });
  }
}

/** build all garments for an appearance */
export function buildClothes(app, d, add, ctx) {
  const P = torsoProfile(d);
  (TOPS[app.top] || TOPS.hoodie)(add, d, app, P, ctx);
  (BOTTOMS[app.bottom] || BOTTOMS.pants)(add, d, app, P, ctx.deform);
  (SHOES[app.shoes] || SHOES.sneakers)(add, d, app);
  const accs = [[app.accessory, app.accessoryColor], [app.accessory2, app.accessory2Color], [app.accessory3, app.accessory3Color]];
  const seen = new Set();
  const HOODLESS = ['cap', 'beanie', 'headphones', 'headband'];
  for (const [a, c] of accs) {
    if (!a || a === 'none' || seen.has(a)) continue;
    if (ctx.hood && HOODLESS.includes(a)) continue;
    if (app.headwear && app.headwear !== 'none' && (a === 'cap' || a === 'beanie')) continue;
    seen.add(a);
    (ACCS[a] || ACCS.none)(add, app, c, ctx.headGeo, d, P);
  }
}

export function hasHat(app) {
  if (app.headwear === 'rialocap') return { k: 1.08, yCut: 0.03, ky: 0.88 };
  if (app.headwear && app.headwear !== 'none') return false;
  const a = [app.accessory, app.accessory2, app.accessory3];
  if (a.includes('beanie')) return { k: 1.1, yCut: 0.0 };
  if (a.includes('cap')) return { k: 1.08, yCut: 0.03, ky: 0.88 };
  return false;
}
