// Procedural anime hair: a scalp cap + clusters of chunky tapered ribbon locks that hug a head shell.
// Long parts sway via a vertex-shader spring (uniforms driven by avatar.js) and follow the body
// (counter-rotated against head turns) so they don't sweep through the shoulders.
// Styles are split by gender (see appearance.js OPTIONS.hairStyleMale / hairStyleFemale).
import * as THREE from 'three';
import { rng } from '../core/util.js';
import { ribbonTube, prep, merge, hullGeo, clothGradient, darken, OUTLINE_COLOR } from './geom.js';
import { toonMat } from '../gfx/toon.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** hair shell (head-local): sits ~1 cm over the skull from face.js */
export const SHELL = { C: V(0, 0.006, -0.004), RX: 0.1, RY: 0.112, RZF: 0.1, RZB: 0.107 };
const { C, RX, RY, RZF, RZB } = SHELL;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

/** point on the hair shell; az from +Z toward +X, el = elevation */
export function shell(az, el, k = 1) {
  const ce = Math.cos(el);
  const rz = RZB + (RZF - RZB) * Math.max(0, Math.cos(az));
  return V(C.x + k * RX * ce * Math.sin(az), C.y + k * RY * Math.sin(el), C.z + k * rz * ce * Math.cos(az));
}
/** point at height y on the shell surface (below the centre: a cylinder tucking toward the jaw) */
function at(az, y, k = 1) {
  if (y < C.y) {
    const f = 1 - 0.16 * sstep(-0.03, -0.12, y);
    const rz = RZB + (RZF - RZB) * Math.max(0, Math.cos(az));
    return V(C.x + k * RX * f * Math.sin(az), y, C.z + k * rz * f * Math.cos(az));
  }
  const s = Math.max(-0.999, Math.min(0.999, (y - C.y) / RY));
  return shell(az, Math.asin(s), k);
}

/** push p outside head shell / neck / shoulders by margin (in place) */
function clear(p, m, body) {
  const q = p.clone().sub(C);
  if (q.y >= 0) {
    const rz = q.z > 0 ? RZF : RZB;
    const k = Math.hypot(q.x / RX, q.y / RY, q.z / rz);
    const target = 1 + m / 0.1;
    if (k < target) q.multiplyScalar(target / k);
  } else {
    let rx, rzf, rzb;
    const y = q.y + C.y;
    if (y > -0.12 || !body) {
      const f = 1 - 0.16 * sstep(-0.03, -0.12, y);
      rx = RX * f; rzf = RZF * f; rzb = RZB * f;
    } else {
      const s = sstep(-0.12, -0.2, y);
      rx = lerp(0.07, 0.128, s); rzf = lerp(0.06, 0.08, s); rzb = lerp(0.065, 0.088, s);
    }
    const rz = q.z > 0 ? rzf : rzb;
    const k = Math.hypot(q.x / rx, q.z / rz);
    const target = 1 + m / 0.1;
    if (k < target && k > 1e-4) { q.x *= target / k; q.z *= target / k; }
  }
  return p.copy(q.add(C));
}

const outwardFn = (P, O) => {
  O.copy(P).sub(C);
  if (P.y < C.y) O.y *= 0.15;
  O.normalize();
};

const PROFILES = {
  leaf: (s) => { const a = Math.pow(1 - s, 0.8) * (1 + 0.35 * Math.sin(Math.PI * s)); return [a, a * 0.9]; },
  sharp: (s) => { const a = Math.pow(1 - s, 1.1) * (1 + 0.5 * Math.sin(Math.PI * s)); return [a, a * 0.85]; },
  flat: (s) => { const a = Math.pow(1 - s, 0.55) * (1 + 0.15 * Math.sin(Math.PI * s)); return [a, a * 0.8]; },
  blunt: (s) => { const a = s < 0.9 ? 1 + 0.1 * Math.sin(Math.PI * s) : 0.55 + 0.45 * Math.pow((1 - s) / 0.1, 0.4); return [a, a * 0.85]; },
  curl: (s) => { const a = (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, s * 1.25))) * Math.pow(1 - s, 0.45); return [a, a]; },
};

class HairBuilder {
  constructor(seed, body = true) { this.parts = []; this.r = rng(seed); this.body = body; }
  rand(a, b) { return a + (b - a) * this.r(); }
  /** strand from root to tip */
  strand(root, tip, { w = 0.028, t = 0.012, puff = 0.006, segs = 7, sides = 5, prof = 'leaf', mid = null, wave = 0, waveF = 2, lift = 0, part = 'misc', az = 0, curl = 0, ow = 1 } = {}) {
    const N = Math.max(7, segs), pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      let p;
      if (mid) { const a = root.clone().lerp(mid, u), b = mid.clone().lerp(tip, u); p = a.lerp(b, u); } else p = root.clone().lerp(tip, u);
      if (lift) p.y += lift * Math.sin(Math.PI * u);
      if (wave) {
        const o = p.clone().sub(C); o.y = 0; o.normalize();
        p.addScaledVector(o, wave * Math.sin(u * Math.PI * waveF) * Math.min(1, u * 2));
        if (curl) { const side = V(-o.z, 0, o.x); p.addScaledVector(side, curl * Math.cos(u * Math.PI * waveF) * Math.min(1, u * 2)); }
      }
      if (i > 0) clear(p, (0.004 + puff * Math.sin(Math.PI * Math.min(1, u * 1.2))) * (1 - 0.6 * u * u * u), this.body);
      pts.push(p);
    }
    const g = ribbonTube(pts, { width: w, thick: t, segs, sides, profile: PROFILES[prof] || PROFILES.leaf, outward: outwardFn });
    if (ow !== 1 && ow > 0) { const o = g.getAttribute('othick'); for (let i = 0; i < o.count; i++) o.setX(i, o.getX(i) * ow); }
    this.parts.push({ g, part, az, noOutline: ow === 0 });
    return g;
  }
  add(g, part = 'misc') { this.parts.push({ g: prep(g), part, az: 0 }); }
}

// ---------- reusable pieces ----------
function fringe(H, list, o = {}) {
  // list: [az, tipY, w?, tipAzOffset?, k?]
  for (const [az, ty, w = 0.032, dAz = 0, k = 1.0] of list) {
    const root = shell(az * (o.rootSpread ?? 0.55), o.rootEl ?? 1.0, 0.97);
    const tip = at(az + dAz, ty, (o.tipK ?? 1.06) * k);
    H.strand(root, tip, { w, t: o.t ?? 0.013, puff: o.puff ?? 0.009, prof: o.prof ?? 'sharp', segs: o.segs ?? 7, part: 'fringe', az, mid: o.mid ? o.mid(az, root, tip) : null });
  }
}
function crown(H, n, { el1 = 0.75, k = 1.0, w = 0.044, swirl = 0.4, from = 1.45, azOff = 0, skipFront = false, part = 'crown' } = {}) {
  for (let i = 0; i < n; i++) {
    const az = azOff + (i / n) * Math.PI * 2;
    if (skipFront && Math.cos(az) > 0.6) continue;
    H.strand(shell(az, from, 0.96), shell(az + swirl, el1, k), { w, t: 0.013, puff: 0.006, prof: 'flat', segs: 6, part, az });
  }
}
function backRow(H, n, { spread = 1.5, rootEl = 0.85, tipY = -0.08, k = 1.06, w = 0.036, puff = 0.01, flick = 0, prof = 'leaf', segs = 7, jitter = 0.01, wave = 0, waveF = 2, mid = null, t = 0.013, part = 'back' } = {}) {
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const az = Math.PI + f * spread;
    const root = shell(az, rootEl + H.rand(-0.1, 0.1), 0.96);
    const tip = at(az + f * flick, tipY + H.rand(-jitter, jitter), k);
    H.strand(root, tip, { w, t, puff, prof, segs, wave, waveF, mid: mid ? mid(az, f) : null, part, az });
  }
}
function sides(H, list, o = {}) {
  // list: [az(+ = left side), tipY, k, w, dAz]
  for (const [az, ty, k = 1.03, w = 0.028, dAz = 0] of list) {
    for (const s of [-1, 1]) {
      const root = shell(s * az * 0.85, o.rootEl ?? 0.85, 0.96);
      const tip = at(s * (az + dAz), ty, k);
      H.strand(root, tip, { w, t: o.t ?? 0.012, puff: o.puff ?? 0.007, prof: o.prof ?? 'sharp', segs: o.segs ?? 7, wave: o.wave ?? 0, part: 'side', az: s * az, mid: o.mid ? o.mid(s * az, root, tip) : null });
    }
  }
}
const bluntBangs = (H, ty = -0.004, n = 11, spread = 0.86, o = {}) => {
  const list = [];
  for (let i = 0; i < n; i++) { const f = (i / (n - 1)) * 2 - 1; list.push([f * spread, ty + Math.abs(f) * (o.curve ?? 0.006) + H.rand(-0.0015, 0.0015), o.w ?? 0.034, 0, 1]); }
  fringe(H, list, { prof: 'blunt', puff: o.puff ?? 0.011, tipK: o.tipK ?? 1.07, rootEl: o.rootEl ?? 0.92, rootSpread: 0.75, segs: 7 });
};
/** long straight curtain down the back to `tipY` */
function backSheet(H, n, tipY, { spread = 1.25, w = 0.046, wave = 0, waveF = 3, prof = 'leaf', segs = 12, rootEl = 1.15, out = 0.13 } = {}) {
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * 2 - 1;
    const az = Math.PI + f * spread;
    const root = shell(az, rootEl + H.rand(-0.08, 0.08), 0.96);
    const tip = V(Math.sin(az) * out * 1.15, tipY + H.rand(-0.025, 0.025) + Math.abs(f) * 0.05, -0.14 + Math.abs(f) * 0.05);
    H.strand(root, tip, { w, t: 0.014, puff: 0.012, prof, segs, mid: at(az, -0.05, 1.13), wave, waveF, part: 'back', az });
  }
}
function tieBand() { return new THREE.TorusGeometry(0.016, 0.006, 6, 14); }

// ---------- styles ----------
const STYLES = {
  // ======== male ========
  spiky(H, o) {
    fringe(H, [[-0.8, 0.006, 0.03, -0.08], [-0.54, 0.016, 0.032, -0.05], [-0.27, -0.004, 0.034], [0.02, 0.014, 0.032, 0.04],
      [0.28, -0.003, 0.034, 0.06], [0.54, 0.014, 0.032, 0.08], [0.8, 0.006, 0.03, 0.1]], { puff: 0.013, tipK: 1.1 });
    sides(H, [[1.28, -0.06, 1.08, 0.03, 0.12], [1.58, -0.04, 1.13, 0.034, 0.2], [1.05, -0.03, 1.1, 0.028, 0.06], [1.85, -0.025, 1.18, 0.036, 0.3]], { puff: 0.014 });
    backRow(H, 9, { spread: 1.55, rootEl: 0.95, tipY: -0.075, k: 1.17, w: 0.04, puff: 0.016, flick: 0.2, prof: 'sharp', jitter: 0.015 });
    backRow(H, 6, { spread: 1.1, rootEl: 0.4, tipY: -0.105, k: 1.04, w: 0.032, puff: 0.006, flick: 0.12, prof: 'sharp' });
    if (!o.hat) {
      crown(H, 7, { el1: 0.9, k: 1.06, w: 0.048, swirl: 0.35, from: 1.5 });
      const spikes = [[0.75, 0.62, 1.24], [1.35, 0.5, 1.28], [1.95, 0.45, 1.29], [2.5, 0.55, 1.3], [3.0, 0.5, 1.31], [3.5, 0.55, 1.3], [4.05, 0.45, 1.29], [4.65, 0.5, 1.28], [5.3, 0.62, 1.24], [2.75, 0.1, 1.27], [3.55, 0.08, 1.26]];
      for (const [az, el, k] of spikes) {
        H.strand(shell(az, 1.2, 0.95), shell(az + 0.12, el, k), { w: 0.048, t: 0.017, puff: 0.018, prof: 'sharp', segs: 7, mid: shell(az + 0.05, (1.2 + el) / 2 + 0.08, 1.1), part: 'crown', az });
      }
    }
  },
  messy(H, o) {
    // Baster: dark locks tumbling over the eyes, covers the ears, short back
    fringe(H, [[-0.78, -0.03, 0.032, -0.1], [-0.5, -0.024, 0.034, -0.14], [-0.24, -0.036, 0.034, 0.06], [0.0, -0.016, 0.032, 0.16],
      [0.22, -0.034, 0.034, 0.02], [0.46, -0.02, 0.032, 0.14], [0.72, -0.03, 0.032, 0.1]], { puff: 0.014, tipK: 1.08, rootEl: 1.12 });
    sides(H, [[1.25, -0.085, 1.05, 0.034, 0.1], [1.55, -0.07, 1.08, 0.036, 0.16], [1.0, -0.06, 1.08, 0.03, -0.05]], { puff: 0.014, prof: 'sharp' });
    backRow(H, 8, { spread: 1.5, rootEl: 0.9, tipY: -0.09, k: 1.1, w: 0.04, puff: 0.016, flick: 0.18, prof: 'sharp', jitter: 0.02 });
    backRow(H, 5, { spread: 1.0, rootEl: 0.35, tipY: -0.11, k: 1.03, w: 0.034, puff: 0.006, flick: 0.1, prof: 'sharp' });
    if (!o.hat) {
      crown(H, 8, { el1: 0.85, k: 1.09, w: 0.05, swirl: 0.5, from: 1.5 });
      for (const az of [0.6, 2.2, 3.6, 5.0]) H.strand(shell(az, 1.25, 0.95), shell(az + 0.3, 0.7, 1.2), { w: 0.04, t: 0.015, puff: 0.016, prof: 'sharp', segs: 6, part: 'crown', az });
    }
  },
  undercut(H, o) {
    if (!o.hat) {
      for (let i = 0; i < 11; i++) {
        const f = (i / 10) * 2 - 1;
        const root = shell(f * 0.85, 0.82, 0.96);
        const mid = V(f * 0.06 + 0.012, C.y + RY * 1.16, 0.035);
        const tip = shell(Math.PI - f * 0.95, 0.62 + 0.1 * (1 - Math.abs(f)), 1.06);
        H.strand(root, tip, { w: 0.044, t: 0.015, puff: 0.012, prof: 'leaf', segs: 9, mid, part: 'crown', az: f });
      }
      for (let i = 0; i < 6; i++) {
        const f = (i / 5) * 2 - 1;
        H.strand(shell(f * 0.5, 1.05, 0.98), shell(Math.PI - f * 0.7 + 0.3, 0.9, 1.12), { w: 0.044, t: 0.016, puff: 0.02, prof: 'leaf', segs: 8, mid: V(f * 0.04 + 0.02, C.y + RY * 1.24, 0.0), part: 'crown', az: f });
      }
    }
    H.strand(shell(0.15, 1.1, 0.96), at(0.42, 0.006, 1.12), { w: 0.034, t: 0.013, puff: 0.014, prof: 'sharp', segs: 7, part: 'fringe', az: 0.3 });
    H.strand(shell(0.35, 1.05, 0.96), at(0.62, 0.024, 1.1), { w: 0.03, t: 0.012, puff: 0.012, prof: 'sharp', segs: 7, part: 'fringe', az: 0.5 });
  },
  sideswept(H, o) {
    // Eric: part on his left (+X), volume swept over to his right (-X), a long lock falling past his right eye to the jaw
    if (!o.hat) {
      for (let i = 0; i < 9; i++) {
        const f = i / 8; // 0 front .. 1 back
        const rootAz = 0.42 + f * 0.9;
        const root = shell(rootAz, 1.22, 0.96);
        const mid = shell(-0.2 - f * 0.6, 1.2 - f * 0.25, 1.32);
        const tip = shell(-1.25 - f * 0.9, 0.35 - f * 0.1, 1.12);
        H.strand(root, tip, { w: 0.05, t: 0.017, puff: 0.018, prof: 'leaf', segs: 9, mid, part: 'crown', az: rootAz });
      }
      crown(H, 6, { el1: 0.95, k: 1.06, w: 0.05, swirl: -0.5, from: 1.5, azOff: 2.0 });
    }
    // the signature long lock over the right eye, and a second shorter one
    H.strand(shell(0.25, 1.1, 0.97), at(-0.8, -0.1, 1.08), { w: 0.036, t: 0.014, puff: 0.014, prof: 'sharp', segs: 10, mid: at(-0.3, 0.04, 1.2), part: 'fringe', az: -0.4 });
    H.strand(shell(0.1, 1.05, 0.97), at(-0.3, -0.004, 1.1), { w: 0.03, t: 0.013, puff: 0.012, prof: 'sharp', segs: 9, mid: at(-0.05, 0.05, 1.2), part: 'fringe', az: -0.2 });
    H.strand(shell(-0.6, 1.0, 0.97), at(-1.0, -0.11, 1.06), { w: 0.036, t: 0.013, puff: 0.012, prof: 'sharp', segs: 9, mid: at(-0.85, 0.02, 1.16), part: 'side', az: -0.9 });
    H.strand(shell(-1.0, 0.95, 0.97), at(-1.35, -0.1, 1.06), { w: 0.034, t: 0.013, puff: 0.012, prof: 'sharp', segs: 8, part: 'side', az: -1.3 });
    // short tidy left side + back
    H.strand(shell(0.9, 1.0, 0.97), at(1.15, -0.03, 1.04), { w: 0.03, t: 0.012, puff: 0.008, prof: 'sharp', segs: 7, part: 'side', az: 1.1 });
    H.strand(shell(1.3, 0.9, 0.97), at(1.55, -0.045, 1.04), { w: 0.032, t: 0.012, puff: 0.008, prof: 'sharp', segs: 7, part: 'side', az: 1.5 });
    backRow(H, 8, { spread: 1.5, rootEl: 0.95, tipY: -0.085, k: 1.07, w: 0.04, puff: 0.012, flick: -0.12, prof: 'sharp' });
    backRow(H, 5, { spread: 1.0, rootEl: 0.35, tipY: -0.105, k: 1.02, w: 0.034, puff: 0.005, prof: 'sharp' });
  },
  wolf(H, o) {
    fringe(H, [[-0.66, -0.012, 0.03, -0.12], [-0.38, -0.022, 0.032, -0.06], [-0.1, -0.008, 0.032, 0.06], [0.18, -0.02, 0.032, 0.08], [0.46, -0.014, 0.03, 0.12], [0.72, -0.004, 0.03, 0.14]], { puff: 0.012, tipK: 1.08, rootEl: 1.1 });
    sides(H, [[1.2, -0.09, 1.06, 0.032, 0.14], [1.5, -0.1, 1.1, 0.034, 0.22]], { puff: 0.013 });
    // layered shag that flicks outward at the nape
    backRow(H, 9, { spread: 1.6, rootEl: 0.95, tipY: -0.07, k: 1.16, w: 0.042, puff: 0.018, flick: 0.18, prof: 'sharp', jitter: 0.015 });
    backRow(H, 7, { spread: 1.3, rootEl: 0.4, tipY: -0.16, k: 1.12, w: 0.038, puff: 0.012, flick: 0.32, prof: 'sharp', jitter: 0.02 });
    if (!o.hat) {
      crown(H, 8, { el1: 0.88, k: 1.1, w: 0.05, swirl: 0.35, from: 1.5 });
      for (const az of [0.9, 2.0, 3.14, 4.3, 5.4]) H.strand(shell(az, 1.15, 0.95), shell(az + 0.15, 0.55, 1.24), { w: 0.044, t: 0.016, puff: 0.018, prof: 'sharp', segs: 7, part: 'crown', az });
    }
  },
  curtain(H, o) {
    // middle part, two curtain bangs that curve out to the cheekbones
    for (const s of [-1, 1]) {
      H.strand(shell(s * 0.08, 1.25, 0.97), at(s * 0.62, -0.035, 1.08), { w: 0.04, t: 0.014, puff: 0.014, prof: 'leaf', segs: 9, mid: at(s * 0.18, 0.045, 1.2), part: 'fringe', az: s * 0.3 });
      H.strand(shell(s * 0.2, 1.2, 0.97), at(s * 0.85, -0.05, 1.07), { w: 0.036, t: 0.013, puff: 0.012, prof: 'leaf', segs: 9, mid: at(s * 0.4, 0.04, 1.18), part: 'fringe', az: s * 0.5 });
    }
    sides(H, [[1.2, -0.07, 1.05, 0.032, 0.06], [1.5, -0.06, 1.06, 0.034, 0.08]], { puff: 0.01, prof: 'leaf' });
    backRow(H, 8, { spread: 1.5, rootEl: 0.95, tipY: -0.085, k: 1.07, w: 0.042, puff: 0.012, flick: 0.04, prof: 'leaf' });
    backRow(H, 5, { spread: 1.0, rootEl: 0.35, tipY: -0.1, k: 1.02, w: 0.034, puff: 0.004, prof: 'leaf' });
    if (!o.hat) {
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
        const az = s * (0.25 + i * 0.5);
        H.strand(shell(s * 0.05, 1.5, 0.96), shell(az + s * 0.2, 0.75, 1.07), { w: 0.05, t: 0.014, puff: 0.008, prof: 'flat', segs: 7, part: 'crown', az });
      }
    }
  },
  short(H, o) {
    fringe(H, [[-0.72, 0.03, 0.032, 0.12], [-0.42, 0.018, 0.034, 0.14], [-0.12, 0.01, 0.036, 0.16], [0.18, 0.018, 0.034, 0.18],
      [0.46, 0.028, 0.032, 0.18], [0.74, 0.04, 0.03, 0.15]], { puff: 0.008, tipK: 1.06, rootEl: 1.1 });
    sides(H, [[1.3, -0.035, 1.03, 0.028, 0.05], [1.6, -0.02, 1.04, 0.032, 0.05]]);
    backRow(H, 8, { spread: 1.5, rootEl: 0.95, tipY: -0.075, k: 1.06, w: 0.04, puff: 0.012, flick: 0.05, prof: 'leaf' });
    backRow(H, 5, { spread: 1.0, rootEl: 0.35, tipY: -0.095, k: 1.01, w: 0.032, puff: 0.004, prof: 'leaf' });
    if (!o.hat) crown(H, 8, { el1: 0.85, k: 1.06, w: 0.048, swirl: 0.6, from: 1.5 });
  },
  mop(H, o) {
    // shaggy bob (Dikzzy): uneven fringe, jaw-length sides
    fringe(H, [[-0.85, -0.035, 0.036, 0.05], [-0.6, -0.012, 0.038, 0.12], [-0.34, 0.0, 0.038, 0.2], [-0.1, -0.004, 0.038, 0.3],
      [0.15, -0.016, 0.038, 0.32], [0.42, -0.03, 0.038, 0.3], [0.7, -0.05, 0.036, 0.22]], { puff: 0.013, tipK: 1.08, rootEl: 1.12, rootSpread: 0.35, prof: 'leaf' });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const az = s * (1.0 + i * 0.3);
        H.strand(shell(az * 0.9, 0.95, 0.96), at(az - s * 0.08, -0.105 + i * 0.006, 0.98), { w: 0.04, t: 0.014, puff: 0.02, prof: 'sharp', segs: 8, mid: at(az, -0.035, 1.18), part: 'side', az });
      }
    }
    backRow(H, 7, { spread: 1.1, rootEl: 0.95, tipY: -0.11, k: 1.0, w: 0.044, puff: 0.022, prof: 'sharp', segs: 8 });
    if (!o.hat) crown(H, 8, { el1: 0.7, k: 1.09, w: 0.05, swirl: 0.2, from: 1.5 });
  },
  buzz(H) {
    for (let i = 0; i < 5; i++) {
      const f = (i / 4) * 2 - 1;
      H.strand(shell(f * 0.5, 0.95, 0.97), at(f * 0.62, 0.05, 1.0), { w: 0.032, t: 0.006, puff: 0.001, prof: 'flat', segs: 4, sides: 5, part: 'fringe', az: f });
    }
  },
  // ======== female ========
  twintails(H, o) {
    // Littlechip: blunt bangs, face-framing side locks, middle part, high twin tails of big wavy curls
    bluntBangs(H, -0.006, 9, 0.86, { w: 0.04 });
    for (const s of [-1, 1]) {
      H.strand(shell(s * 0.95, 0.95, 0.96), at(s * 1.05, -0.112, 1.02), { w: 0.03, t: 0.012, puff: 0.012, prof: 'sharp', segs: 9, mid: at(s * 1.08, -0.02, 1.1), part: 'side', az: s * 1.0 });
      H.strand(shell(s * 1.2, 0.9, 0.96), at(s * 1.3, -0.09, 1.04), { w: 0.03, t: 0.012, puff: 0.01, prof: 'sharp', segs: 8, part: 'side', az: s * 1.3 });
    }
    backRow(H, 7, { spread: 1.2, rootEl: 0.9, tipY: -0.1, k: 1.02, w: 0.044, puff: 0.012 });
    if (!o.hat) {
      // middle part: strands from the part line sweep down to each side
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        const f = i / 3;
        H.strand(shell(s * 0.04, 1.5 - f * 0.05, 0.96).setZ(0.05 - f * 0.12), shell(s * (0.6 + f * 1.3), 0.6, 1.06), { w: 0.056, t: 0.013, puff: 0.007, prof: 'flat', segs: 7, part: 'crown', az: s });
      }
    }
    H.tie = [];
    if (o.hood) return;
    for (const s of [-1, 1]) {
      const tie = shell(s * 1.95, 0.72, 1.04);
      // gathered strands to the tie
      for (let i = 0; i < 3; i++) {
        const az = s * (1.0 + i * 0.55);
        H.strand(shell(az, 1.05 - i * 0.25, 0.97), tie.clone(), { w: 0.05, t: 0.012, puff: 0.004, prof: 'flat', segs: 6, part: 'tail', az, ow: 0 });
      }
      // big wavy curls flowing to the hips
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const spread = 0.05 + 0.025 * H.r();
        const tip = V(s * (0.2 + Math.sin(a) * spread), -0.42 + H.rand(-0.05, 0.04), -0.065 + Math.cos(a) * spread);
        const mid = V(s * (0.215 + Math.sin(a) * 0.045), -0.02, -0.075 + Math.cos(a) * 0.04);
        H.strand(tie.clone().add(V(Math.sin(a) * 0.012, 0.004, Math.cos(a) * 0.012)), tip, { w: 0.06, t: 0.032, puff: 0, prof: 'curl', segs: 8, sides: 5, mid, wave: 0.024, waveF: 4.5, curl: 0.014, part: 'tail', az: s * 2, ow: 0.5 });
      }
      // puffy root volume where the tail leaves the tie
      for (let i = 0; i < 2; i++) {
        const a = (i / 2) * Math.PI * 2 + 0.3;
        H.strand(tie.clone(), tie.clone().add(V(s * (0.07 + 0.02 * Math.sin(a)), -0.06, Math.cos(a) * 0.035)), { w: 0.05, t: 0.03, puff: 0, prof: 'leaf', segs: 7, sides: 5, mid: tie.clone().add(V(s * 0.06, 0.02, Math.cos(a) * 0.03)), part: 'tail', az: s * 2, ow: 0.6 });
      }
      H.tie.push({ p: tie, r: [0, 0, s * (Math.PI / 2 - 0.4)] });
    }
  },
  straight(H, o) {
    bluntBangs(H, -0.004, 9, 0.86);
    for (const s of [-1, 1]) {
      H.strand(shell(s * 0.95, 0.95, 0.96), V(s * 0.105, -0.3, 0.04), { w: 0.034, t: 0.013, puff: 0.012, prof: 'leaf', segs: 11, mid: at(s * 1.2, -0.06, 1.1), part: 'side', az: s });
      H.strand(shell(s * 1.4, 0.85, 0.96), V(s * 0.13, -0.38, -0.05), { w: 0.038, t: 0.013, puff: 0.012, prof: 'leaf', segs: 11, mid: at(s * 1.6, -0.06, 1.12), part: 'side', az: s * 1.4 });
    }
    if (o.hood) return;
    backSheet(H, 11, -0.5);
    if (!o.hat) crown(H, 8, { el1: 0.8, k: 1.05, w: 0.05, swirl: 0.1, from: 1.5 });
  },
  bob(H, o) {
    bluntBangs(H, -0.003, 9, 0.85);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const az = s * (1.05 + i * 0.26);
        H.strand(shell(az * 0.9, 0.95, 0.96), at(az - s * 0.05, -0.108 + i * 0.002, 0.97), { w: 0.04, t: 0.014, puff: 0.022, prof: 'blunt', segs: 8, mid: at(az, -0.04, 1.2), part: 'side', az });
      }
    }
    backRow(H, 7, { spread: 1.1, rootEl: 0.95, tipY: -0.115, k: 1.0, w: 0.044, puff: 0.025, prof: 'blunt', segs: 8 });
    backRow(H, 5, { spread: 0.9, rootEl: 0.4, tipY: -0.12, k: 0.98, w: 0.04, puff: 0.012, prof: 'blunt' });
    if (!o.hat) crown(H, 8, { el1: 0.7, k: 1.08, w: 0.05, swirl: 0.15, from: 1.5 });
  },
  ponytail(H, o) {
    fringe(H, [[-0.62, 0.016, 0.032, -0.14], [-0.32, 0.004, 0.034, -0.12], [0.02, 0.012, 0.032, 0.06], [0.32, 0.002, 0.034, 0.12], [0.62, 0.018, 0.032, 0.14]], { puff: 0.009 });
    sides(H, [[1.15, -0.085, 1.04, 0.026, 0.06]], { prof: 'sharp' });
    if (o.hood) return;
    const tie = V(0, 0.07, -0.112);
    for (let i = 0; i < 12; i++) {
      const az = -1.9 + (i / 11) * 3.8;
      const root = shell(az, 0.55 + 0.35 * Math.cos(az), 0.97);
      const m = shell(az * 0.5 + Math.PI * Math.sign(az || 1) * 0.5, 0.95, 1.06);
      H.strand(root, tie.clone().add(V(Math.sin(az) * 0.01, 0, 0)), { w: 0.05, t: 0.013, puff: 0.008, prof: 'flat', segs: 7, mid: m, part: 'tail', az });
    }
    for (let i = 0; i < 6; i++) {
      const az = Math.PI + (i / 5 - 0.5) * 2.4;
      H.strand(shell(az, 0.1, 0.97), tie.clone(), { w: 0.044, t: 0.012, puff: 0.004, prof: 'flat', segs: 6, part: 'tail', az });
    }
    if (!o.hat) crown(H, 6, { el1: 1.0, k: 1.04, w: 0.054, swirl: 0, from: 1.5 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tip = V(Math.sin(a) * 0.04, -0.3 + H.rand(-0.04, 0.03), -0.18 + Math.cos(a) * 0.03);
      const mid = V(Math.sin(a) * 0.04, -0.01, -0.2 + Math.cos(a) * 0.02);
      H.strand(tie.clone().add(V(Math.sin(a) * 0.006, 0, Math.cos(a) * 0.006)), tip, { w: 0.036, t: 0.018, puff: 0, prof: 'leaf', segs: 11, mid, wave: 0.008, waveF: 2, part: 'tail', az: Math.PI });
    }
    H.tie = [{ p: tie, r: [Math.PI / 2 - 0.3, 0, 0] }];
  },
  odango(H, o) {
    bluntBangs(H, -0.002, 8, 0.82, { curve: 0.012 });
    sides(H, [[1.15, -0.1, 1.04, 0.026, 0.05]], { prof: 'sharp' });
    backRow(H, 7, { spread: 1.2, rootEl: 0.9, tipY: -0.1, k: 1.02, w: 0.044, puff: 0.01 });
    if (!o.hat) crown(H, 8, { el1: 0.75, k: 1.06, w: 0.05, swirl: 0.1, from: 1.5 });
    if (o.hood || o.hat) return;
    H.buns = [];
    for (const s of [-1, 1]) {
      const c = shell(s * 1.3, 1.05, 1.18);
      H.buns.push({ p: c, r: 0.046 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const p0 = c.clone().add(V(Math.cos(a) * 0.044, -0.02, Math.sin(a) * 0.044));
        const p1 = c.clone().add(V(Math.cos(a + 1.6) * 0.05, 0.022, Math.sin(a + 1.6) * 0.05));
        const p2 = c.clone().add(V(Math.cos(a + 3.0) * 0.03, 0.044, Math.sin(a + 3.0) * 0.03));
        H.add(ribbonTube([p0, p1, p2], { width: 0.032, thick: 0.011, segs: 6, sides: 6, profile: PROFILES.leaf, outward: (P, O) => O.copy(P).sub(c).normalize() }), 'tail');
      }
    }
  },
  wavy(H, o) {
    fringe(H, [[-0.7, 0.0, 0.034, -0.18], [-0.4, -0.01, 0.036, -0.16], [-0.1, 0.008, 0.034, -0.14], [0.22, 0.02, 0.032, 0.1], [0.5, 0.01, 0.034, 0.14], [0.76, -0.01, 0.032, 0.14]], { puff: 0.015, tipK: 1.1 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const az = s * (1.05 + i * 0.32);
        H.strand(shell(az * 0.9, 0.9, 0.96), V(s * (0.115 + i * 0.012), -0.26 - i * 0.02, 0.03 - i * 0.04), { w: 0.038, t: 0.015, puff: 0.018, prof: 'curl', segs: 12, wave: 0.016, waveF: 3.5, curl: 0.008, mid: at(az, -0.04, 1.16), part: i === 0 ? 'side' : 'back', az });
      }
    }
    if (o.hood) return;
    backSheet(H, 9, -0.36, { wave: 0.018, waveF: 3.5, prof: 'curl', w: 0.05 });
    if (!o.hat) crown(H, 8, { el1: 0.8, k: 1.1, w: 0.054, swirl: 0.3, from: 1.5 });
  },
  hime(H, o) {
    bluntBangs(H, -0.004, 9, 0.86);
    // hime sidelocks cut straight at the chin
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const az = s * (1.0 + i * 0.25);
      H.strand(shell(az * 0.9, 0.95, 0.96), at(az, -0.118, 1.02), { w: 0.036, t: 0.013, puff: 0.012, prof: 'blunt', segs: 9, mid: at(az, -0.03, 1.12), part: 'side', az });
    }
    if (o.hood) return;
    backSheet(H, 11, -0.52, { prof: 'blunt' });
    if (!o.hat) crown(H, 8, { el1: 0.8, k: 1.05, w: 0.05, swirl: 0.05, from: 1.5 });
  },
  pixie(H, o) {
    fringe(H, [[-0.7, 0.012, 0.032, 0.18], [-0.42, 0.0, 0.034, 0.22], [-0.14, -0.01, 0.034, 0.26], [0.14, -0.004, 0.032, 0.26], [0.42, 0.01, 0.032, 0.22], [0.7, 0.025, 0.03, 0.15]], { puff: 0.011, tipK: 1.07, rootEl: 1.1 });
    sides(H, [[1.2, -0.05, 1.04, 0.03, 0.12], [1.5, -0.045, 1.05, 0.032, 0.1]], { puff: 0.01 });
    backRow(H, 8, { spread: 1.5, rootEl: 0.95, tipY: -0.08, k: 1.06, w: 0.04, puff: 0.012, flick: 0.08, prof: 'sharp' });
    backRow(H, 5, { spread: 1.0, rootEl: 0.35, tipY: -0.1, k: 1.02, w: 0.032, puff: 0.004, prof: 'sharp' });
    if (!o.hat) crown(H, 8, { el1: 0.85, k: 1.08, w: 0.05, swirl: 0.5, from: 1.5 });
  },
};
STYLES.buzz.cap = 1.03;

// sway start height (head-local y) & strength per style
const SWAY = {
  straight: [-0.07, 1], hime: [-0.07, 1], wavy: [-0.07, 0.75], ponytail: [0.03, 1.2], twintails: [0.04, 1.0], odango: [-0.05, 0.05], bob: [-0.05, 0.25], pixie: [-0.06, 0.08],
  spiky: [-0.05, 0.12], messy: [-0.05, 0.12], short: [-0.06, 0.08], undercut: [0.0, 0.1], sideswept: [-0.03, 0.18], wolf: [-0.06, 0.2], curtain: [-0.05, 0.12], mop: [-0.05, 0.25], buzz: [0, 0],
};
export const HAIR_STYLES = Object.keys(STYLES);

/** scalp cap geometry: head geometry pushed outward, kept above an azimuth-dependent hairline */
function capGeometry(headGeo, style, scale = 1.06) {
  const p = headGeo.getAttribute('position'), n = headGeo.getAttribute('normal');
  const idx = headGeo.index.array;
  const line = (x, y, z) => {
    const az = Math.atan2(x, z);
    const front = Math.max(0, Math.cos(az));
    let h = lerp(-0.07, 0.05, Math.pow(front, 0.8));
    const ear = Math.exp(-(((Math.abs(az) - 1.57) / 0.35) ** 2));
    h += ear * 0.03 * (1 - front);
    if (style === 'buzz' || style === 'undercut') h += 0.008 * front;
    return y - h;
  };
  const keep = new Uint8Array(p.count), dh = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) { dh[i] = line(p.getX(i), p.getY(i), p.getZ(i)); keep[i] = dh[i] > 0 ? 1 : 0; }
  const map = new Map(), pos = [], nor = [], out = [];
  const get = (i, j) => {
    let k = map.get(i);
    if (k !== undefined) return k;
    k = pos.length / 3; map.set(i, k);
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (!keep[i] && j >= 0) {
      const t = dh[i] / (dh[i] - dh[j]);
      x += (p.getX(j) - x) * t; y += (p.getY(j) - y) * t; z += (p.getZ(j) - z) * t;
    }
    pos.push(x * scale + n.getX(i) * 0.002, y * scale + 0.002, z * scale + n.getZ(i) * 0.002 - 0.001);
    nor.push(n.getX(i), n.getY(i), n.getZ(i));
    return k;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const nk = keep[tri[0]] + keep[tri[1]] + keep[tri[2]];
    if (nk === 0) continue;
    const up = tri.find((v) => keep[v]);
    out.push(get(tri[0], up), get(tri[1], up), get(tri[2], up));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(out);
  return g;
}

const HAIR_HEADER = /* glsl */`
uniform vec3 uSway; uniform float uSwayY; uniform mat3 uCounter; uniform vec3 uPivot;
varying vec3 vHairP;`;
const HAIR_BODY = /* glsl */`
vHairP = transformed;
{
  float hd = max(0.0, uSwayY - transformed.y);
  float w = smoothstep(0.0, 0.14, hd);
  vec3 c = uCounter * (transformed - uPivot) + uPivot;
  transformed = mix(transformed, c, w);
  transformed += uSway * (hd * hd * 6.0 + hd * 0.4);
}`;

function hairMaterial(color, uniforms, key) {
  const mat = toonMat(color, { unique: true });
  mat.gradientMap = clothGradient();
  mat.emissive = new THREE.Color(color).multiplyScalar(0.08);
  const u = { ...uniforms, uHiCol: { value: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5) }, uRootCol: { value: new THREE.Color(color).multiplyScalar(0.62) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${HAIR_HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${HAIR_BODY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vHairP; uniform vec3 uHiCol; uniform vec3 uRootCol; uniform float uHiOn;`)
      .replace('#include <dithering_fragment>', /* glsl */`#include <dithering_fragment>
      {
        vec3 q = vHairP - vec3(0.0, 0.006, -0.004);
        float r = length(q);
        float el = q.y / max(r, 1e-4);
        // "angel ring" sheen band across the crown, broken into lock-shaped dashes
        float band = smoothstep(0.1, 0.03, abs(el - 0.55)) * smoothstep(-0.2, 0.5, sin(atan(q.x, q.z) * 11.0 + q.y * 40.0)) * uHiOn;
        band *= step(0.0, q.y) * step(r, 0.17);
        vec3 vn = normalize(vNormal);
        float facing = clamp(vn.z, 0.0, 1.0);
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHiCol * (0.35 + lum * 1.1), smoothstep(0.4, 0.6, band * facing) * 0.2);
        // occlusion near the scalp, slightly lighter tips on long hair
        float inner = smoothstep(0.125, 0.1, r) * step(-0.02, q.y);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.72, inner * 0.6);
      }`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/**
 * Build hair for a style. Returns { mesh, outline, uniforms, extras, swayK, materials, tris }
 * opts.hat: {k, yCut, ky} squash under a hat dome; opts.hood: keep only fringe + side locks, squashed inside a hood.
 */
export function buildHair(style, color, headGeo, { hat = false, hood = false, body = true, outlineT = 0.0024, streak = null } = {}) {
  const fn = STYLES[style] || STYLES.spiky;
  const H = new HairBuilder(style.length * 977 + 13, body);
  fn(H, { hat: hat || hood, hood });
  let parts = H.parts;
  if (hood) parts = parts.filter((p) => p.part === 'fringe' || p.part === 'side');
  // optional accent streak: the fringe lock nearest to the character's right of the part
  let streakParts = [];
  if (streak) {
    let best = null;
    for (const p of parts) if (p.part === 'fringe' && (!best || Math.abs(p.az + 0.3) < Math.abs(best.az + 0.3))) best = p;
    if (best) { streakParts = [best]; parts = parts.filter((p) => p !== best); }
  }
  // outlined locks first, then hidden ones (no hull), then the scalp cap
  const geos = parts.filter((p) => !p.noOutline).map((p) => prep(p.g));
  if (H.buns && !hood) for (const b of H.buns) {
    const g = new THREE.SphereGeometry(b.r, 14, 10);
    g.scale(1, 0.9, 1);
    g.translate(b.p.x, b.p.y, b.p.z);
    geos.push(prep(g));
  }
  // the scalp cap goes last so the outline hull can skip it (it is hidden under the locks anyway)
  const nOutlined = geos.reduce((n, g) => n + g.index.count, 0);
  for (const p of parts) if (p.noOutline) geos.push(prep(p.g));
  if (!hood) geos.push(prep(capGeometry(headGeo, style, fn.cap || 1.06)));
  const squash = (geo) => {
    if (!hat && !hood) return geo;
    const k = hood ? 1.05 : hat.k * 0.96, yc = hood ? -0.2 : hat.yCut, ky = hood ? 1 : (hat.ky || 1);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < yc - 0.012) continue;
      const qy = y - C.y, qz = z - C.z;
      const e = Math.hypot(x / (RX * k), Math.max(0, qy) / (RY * k * ky), qz / ((qz > 0 ? RZF : RZB) * k));
      const w = Math.min(1, (y - (yc - 0.012)) / 0.02);
      if (e > 1) { const s = 1 + (1 / e - 1) * w; p.setXYZ(i, x * s, C.y + qy * (qy > 0 ? s : 1), C.z + qz * s); }
    }
    geo.computeVertexNormals();
    return geo;
  };
  const geo = squash(merge(geos));
  const [y0, k] = SWAY[style] || [0, 0];
  const uniforms = {
    uSway: { value: new THREE.Vector3() }, uSwayY: { value: y0 }, uCounter: { value: new THREE.Matrix3() }, uPivot: { value: new THREE.Vector3(0, -0.16, -0.02) },
    uHiOn: { value: style === 'buzz' ? 0 : 1 },
  };
  const mat = hairMaterial(color, uniforms, 'anime-hair');
  const omat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  omat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${HAIR_HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${HAIR_BODY}`);
  };
  omat.customProgramCacheKey = () => 'anime-hair-outline';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.name = 'hair';
  const hg = hullGeo(geo, outlineT);
  hg.setIndex(Array.from(hg.index.array.slice(0, nOutlined)));
  const outline = new THREE.Mesh(hg, omat);
  outline.name = 'outline';
  outline.raycast = () => {};
  mesh.add(outline);
  const materials = [mat, omat];
  const extras = [];
  let tris = (geo.index.count + nOutlined) / 6;
  if (streakParts.length) {
    const sg = squash(merge(streakParts.map((p) => prep(p.g))));
    const smat = hairMaterial(streak, uniforms, 'anime-hair');
    const sm = new THREE.Mesh(sg, smat);
    sm.name = 'hair-streak';
    const so = new THREE.Mesh(hullGeo(sg, outlineT), omat);
    so.name = 'outline';
    sm.add(so);
    sm.frustumCulled = so.frustumCulled = false;
    extras.push(sm);
    materials.push(smat);
    tris += sg.index.count / 3;
  }
  for (const t of H.tie || []) {
    const m = new THREE.Mesh(tieBand(), toonMat(darken(color, 0.4)));
    m.position.copy(t.p); m.rotation.set(...t.r);
    extras.push(m);
  }
  mesh.frustumCulled = false; outline.frustumCulled = false;
  return { mesh, outline, uniforms, extras, swayK: k, materials, tris };
}
