// Anime-doll head: soft round cranium, full cheeks, small pointed chin and a tiny nose bump, plus a painted
// face decal (eyes / brows / nose / mouth / blush / face paint) on a planar-projected front patch of the head.
// Expressions are frames of one high-res atlas texture (switching = changing texture offset, no re-uploads).
import * as THREE from 'three';
import { makeCanvas, canvasTex } from '../core/util.js';
import { weld, darken, mix } from './geom.js';

// head-local space: origin = head centre, +Z = face forward, +Y up. Meters (before HEAD_SCALE).
export const HEAD = { rx: 0.09, ry: 0.1, rz: 0.091, eyeY: -0.033, eyeX: 0.039, noseY: -0.06, mouthY: -0.081, chinY: -0.106 };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** deform a unit-sphere point into the anime head shape */
export function headShape(x, y, z, out, jawK = 0.46) {
  let X = x * HEAD.rx, Y = y * HEAD.ry, Z = z * HEAD.rz;
  if (y < 0) {
    const t = -y;
    const jaw = sstep(0.28, 1.0, t);
    // full cheeks, then a soft V to a small rounded chin
    X *= 1 - jawK * Math.pow(jaw, 2.2) - 0.03 * jaw;
    Y *= 1 + 0.06 * sstep(0.45, 1, t) * (0.55 + 0.45 * z);
    if (z > 0) Z *= 1 - 0.2 * sstep(0.5, 1, t);
    else Z *= 1 - 0.46 * sstep(0.0, 0.85, t); // nape tucks into the neck
  } else {
    if (z < 0) Z *= 1.05;
    X *= 1 + 0.03 * y;
  }
  if (z > 0) {
    // flatter face plane so painted eyes don't swim
    const face = sstep(-1.0, 0.0, y) * (1 - sstep(0.25, 0.7, y));
    Z *= 1 - 0.1 * face * z * z;
    // cheek puffs
    const ch = Math.exp(-(((y + 0.47) / 0.24) ** 2)) * Math.exp(-(((Math.abs(x) - 0.55) / 0.28) ** 2)) * z;
    X += Math.sign(x) * 0.0075 * ch; Z += 0.004 * ch;
    // tiny button nose
    const nb = Math.exp(-((x / 0.075) ** 2 + ((y + 0.6) / 0.085) ** 2)) * z;
    Z += 0.0042 * nb;
  }
  return out.set(X, Y, Z);
}

export function headGeometry(ws = 40, hs = 30, jawK = 0.46) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    headShape(p.getX(i), p.getY(i), p.getZ(i), v, jawK);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return weld(g);
}

/** front cap of the head as the face decal surface, with planar UVs */
export const FACE_BOX = { x0: -0.089, x1: 0.089, y0: -0.124, y1: 0.054 };
export function faceDecalGeometry(headGeo, lift = 0.0006) {
  const p = headGeo.getAttribute('position'), n = headGeo.getAttribute('normal');
  const idx = headGeo.index.array;
  const keep = (i) => p.getZ(i) > 0.012 && p.getY(i) < FACE_BOX.y1 && p.getY(i) > FACE_BOX.y0 && Math.abs(p.getX(i)) < FACE_BOX.x1;
  const map = new Map(), pos = [], uv = [], nor = [], out = [];
  const get = (i) => {
    let k = map.get(i);
    if (k !== undefined) return k;
    k = pos.length / 3; map.set(i, k);
    pos.push(p.getX(i) + n.getX(i) * lift, p.getY(i) + n.getY(i) * lift, p.getZ(i) + n.getZ(i) * lift);
    nor.push(n.getX(i), n.getY(i), n.getZ(i));
    uv.push((p.getX(i) - FACE_BOX.x0) / (FACE_BOX.x1 - FACE_BOX.x0), (p.getY(i) - FACE_BOX.y0) / (FACE_BOX.y1 - FACE_BOX.y0));
    return k;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (keep(a) && keep(b) && keep(c)) out.push(get(a), get(b), get(c));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(out);
  return g;
}

// ---------- face painting ----------
const COLS = 3, ROWS = 2, FS = 512;
export const FRAMES = { open: 0, half: 1, closed: 2, talk: 3, talkO: 4, happy: 5 };
const FRAME_DEF = [
  { eyes: 'open', mouth: 'closed' }, { eyes: 'half', mouth: 'closed' }, { eyes: 'closed', mouth: 'closed' },
  { eyes: 'open', mouth: 'open' }, { eyes: 'open', mouth: 'o' }, { eyes: 'happy', mouth: 'smile' },
];

function rgba(hex, a) {
  const c = new THREE.Color(hex);
  return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
}
const lum = (hex) => { const c = new THREE.Color(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; };

/** eye shape params per style (meters, head-local) */
function eyeParams(style, fem) {
  const base = { w: 0.04, h: fem ? 0.042 : 0.037, tilt: 0, droop: 0, iris: 0.8, irisH: 0.9, lash: fem ? 1 : 0.5, wing: fem ? 1 : 0.35, liner: null, sleepy: false };
  switch (style) {
    case 'doll': return { ...base, w: 0.042, h: 0.045, iris: 0.88, irisH: 0.97, lash: 1.25, wing: 1.1, droop: 0.002, liner: '#a23a2e' };
    case 'sharp': return { ...base, w: 0.042, h: 0.025, tilt: 0.006, iris: 0.62, irisH: 1.3, lash: fem ? 0.9 : 0.75, wing: 0.7 };
    case 'soft': return { ...base, h: base.h * 0.92, tilt: -0.003, droop: 0.004 };
    case 'sleepy': return { ...base, h: base.h * 0.95, iris: 0.8, sleepy: true, droop: 0.002 };
    default: return base;
  }
}

/** paint one eye at origin. Outer corner toward +x (caller mirrors with side). */
function paintEye(ctx, E, state, app, side, ec) {
  const { w, h, tilt } = E;
  const ink = '#1a1218';
  const lineCol = mix(ink, darken(app.hairColor, 0.3), 0.18);
  const hw = w / 2;
  const inX = -hw, outX = hw;
  const inY = -h * 0.04 - tilt * 0.5, outY = h * 0.14 + tilt;
  const topY = h * 0.5, botY = -h * 0.5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (state === 'closed' || state === 'happy') {
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 0.0034 + 0.001 * E.lash;
    ctx.beginPath();
    if (state === 'closed') {
      ctx.moveTo(inX, -h * 0.05);
      ctx.quadraticCurveTo(0, -h * 0.34, outX + 0.002, 0.0 + tilt * 0.5);
    } else {
      ctx.moveTo(inX + 0.002, -h * 0.16);
      ctx.quadraticCurveTo(0, h * 0.34, outX - 0.001, -h * 0.12);
    }
    ctx.stroke();
    if (E.lash > 0.8 && state === 'closed') {
      ctx.lineWidth = 0.0018;
      for (let i = 0; i < 3; i++) {
        const t = 0.6 + i * 0.16;
        const x = inX + w * t, y = -h * 0.34 * 4 * t * (1 - t) * 0.5 - 0.001;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.0035, y - 0.004); ctx.stroke();
      }
    }
    return;
  }
  const lidDrop = state === 'half' ? h * 0.48 : (E.sleepy ? h * 0.36 : 0);
  const upperPath = (dy = 0) => {
    ctx.moveTo(inX, inY - lidDrop * 0.5 + dy);
    ctx.bezierCurveTo(inX + w * 0.1, topY * 1.04 - lidDrop + dy, outX - w * 0.28, topY * 1.1 - lidDrop - E.droop + dy, outX, outY - lidDrop * 0.45 + dy);
  };
  // --- sclera
  ctx.save();
  ctx.beginPath();
  upperPath();
  ctx.bezierCurveTo(outX + w * 0.01, botY * 0.45, outX - w * 0.22, botY * 1.02, 0, botY);
  ctx.bezierCurveTo(-w * 0.3, botY * 0.99, inX - 0.0005, botY * 0.5, inX, inY - lidDrop * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#fbfaff';
  ctx.fill();
  ctx.clip();
  let gr = ctx.createLinearGradient(0, topY, 0, topY - h * 0.5);
  gr.addColorStop(0, 'rgba(120,105,160,0.55)'); gr.addColorStop(1, 'rgba(120,105,160,0)');
  ctx.fillStyle = gr; ctx.fillRect(-w, -h, w * 2, h * 2);
  // --- iris
  const rw = hw * E.iris, rh = (h / 2) * E.irisH;
  const icx = -0.0008, icy = -h * 0.03;
  const dark = lum(ec) < 0.2;
  gr = ctx.createLinearGradient(0, icy + rh, 0, icy - rh);
  gr.addColorStop(0, darken(ec, dark ? 0.35 : 0.22));
  gr.addColorStop(0.45, darken(ec, dark ? 0.7 : 0.62));
  gr.addColorStop(0.8, dark ? mix(ec, '#5a4a50', 0.4) : ec);
  gr.addColorStop(1, mix(ec, dark ? '#9a8a88' : '#ffffff', dark ? 0.5 : 0.5));
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.ellipse(icx, icy, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
  // iris streaks (lower half)
  ctx.strokeStyle = rgba(mix(ec, '#ffffff', 0.55), dark ? 0.22 : 0.3);
  ctx.lineWidth = 0.0008;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (1.12 + (i / 8) * 0.76);
    ctx.beginPath();
    ctx.moveTo(icx + Math.cos(a) * rw * 0.42, icy + Math.sin(a) * rh * 0.42);
    ctx.lineTo(icx + Math.cos(a) * rw * 0.86, icy + Math.sin(a) * rh * 0.86);
    ctx.stroke();
  }
  ctx.lineWidth = 0.0014; ctx.strokeStyle = darken(ec, dark ? 0.4 : 0.25);
  ctx.beginPath(); ctx.ellipse(icx, icy, rw, rh, 0, 0, Math.PI * 2); ctx.stroke();
  // pupil
  ctx.fillStyle = darken(ec, dark ? 0.35 : 0.14);
  ctx.beginPath(); ctx.ellipse(icx, icy + rh * 0.06, rw * 0.44, rh * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  // lower glow crescent
  ctx.strokeStyle = rgba(mix(ec, '#ffffff', 0.65), dark ? 0.45 : 0.7);
  ctx.lineWidth = 0.0018;
  ctx.beginPath(); ctx.ellipse(icx, icy - rh * 0.08, rw * 0.66, rh * 0.68, 0, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
  // lid shadow over the top of the eye
  gr = ctx.createLinearGradient(0, topY - lidDrop, 0, topY - lidDrop - h * 0.48);
  gr.addColorStop(0, 'rgba(18,8,26,0.62)'); gr.addColorStop(1, 'rgba(18,8,26,0)');
  ctx.fillStyle = gr; ctx.fillRect(-w, -h, w * 2, h * 2);
  // highlights: light from the viewer's upper-left (local x = viewer x * side)
  ctx.fillStyle = '#ffffff';
  const hx = (vx) => icx + vx * side;
  ctx.save(); ctx.translate(hx(-rw * 0.34), icy + rh * 0.36); ctx.rotate(-0.55 * side);
  ctx.beginPath(); ctx.ellipse(0, 0, rw * 0.36, rh * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.globalAlpha = 0.95;
  ctx.beginPath(); ctx.arc(hx(rw * 0.38), icy - rh * 0.4, rw * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.arc(hx(rw * 0.12), icy + rh * 0.58, rw * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  // --- lash line (thick, tapering toward the inner corner) + wing
  ctx.fillStyle = lineCol;
  const lt = 0.0028 + 0.0018 * E.lash;
  const ld = lidDrop;
  ctx.beginPath();
  ctx.moveTo(inX - 0.0006, inY - ld * 0.5);
  ctx.bezierCurveTo(inX + w * 0.1, topY * 1.04 - ld, outX - w * 0.28, topY * 1.1 - ld - E.droop, outX, outY - ld * 0.45);
  ctx.lineTo(outX + 0.0055 * E.wing + 0.001, outY - ld * 0.45 + 0.0038 * E.wing + 0.0006);
  ctx.lineTo(outX + 0.0004, outY - ld * 0.45 + lt * 0.95);
  ctx.bezierCurveTo(outX - w * 0.28, topY * 1.1 - ld - E.droop + lt * 1.35, inX + w * 0.1, topY * 1.04 - ld + lt * 0.7, inX - 0.0006, inY - ld * 0.5 + 0.0011);
  ctx.closePath();
  ctx.fill();
  if (E.lash > 0.8) {
    ctx.strokeStyle = lineCol; ctx.lineWidth = 0.0015;
    for (let i = 0; i < 3; i++) {
      const bx = outX - 0.001 - i * 0.0045, by = outY - ld * 0.45 + 0.0025 + i * 0.0024;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + 0.0025, by + 0.0045, bx + 0.006, by + 0.0048); ctx.stroke();
    }
  }
  // lower lash / liner
  ctx.strokeStyle = rgba(lineCol, 0.7);
  ctx.lineWidth = 0.0011;
  ctx.beginPath();
  ctx.moveTo(outX - 0.0008, botY * 0.3);
  ctx.quadraticCurveTo(outX - w * 0.18, botY * 0.98, -w * 0.05, botY * 1.03);
  ctx.stroke();
  if (E.liner) {
    ctx.strokeStyle = rgba(E.liner, 0.85); ctx.lineWidth = 0.0019;
    ctx.beginPath();
    ctx.moveTo(outX + 0.0035, outY - 0.0015);
    ctx.quadraticCurveTo(outX - w * 0.05, botY * 0.7, outX - w * 0.38, botY * 1.1);
    ctx.stroke();
    // warm shadow on the outer lid
    const g2 = ctx.createRadialGradient(outX - 0.002, topY * 0.85, 0, outX - 0.002, topY * 0.85, w * 0.42);
    g2.addColorStop(0, rgba(E.liner, 0.32)); g2.addColorStop(1, rgba(E.liner, 0));
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(outX - 0.002, topY * 0.85, w * 0.42, 0, Math.PI * 2); ctx.fill();
  }
  // double eyelid crease
  if (!E.sleepy && state === 'open') {
    ctx.strokeStyle = rgba(darken(app.skin, 0.55), 0.5);
    ctx.lineWidth = 0.0009;
    ctx.beginPath();
    ctx.moveTo(inX + w * 0.28, topY + 0.0046);
    ctx.quadraticCurveTo(w * 0.15, topY * 1.18 + 0.005, outX - 0.0015, outY + 0.0042);
    ctx.stroke();
  }
}

function paintBrow(ctx, style, app, y) {
  const L = lum(app.hairColor);
  const col = mix(darken(app.hairColor, 0.55), '#2a2026', L > 0.55 ? 0.55 : 0.15);
  ctx.fillStyle = rgba(col, 0.95);
  ctx.beginPath();
  if (style === 'angled') {
    // confident: low at the inner end, rising outward, sharp taper
    ctx.moveTo(-0.019, y - 0.0075);
    ctx.lineTo(0.012, y + 0.005);
    ctx.quadraticCurveTo(0.02, y + 0.006, 0.024, y + 0.001);
    ctx.quadraticCurveTo(0.012, y - 0.0005, -0.019, y - 0.0125);
    ctx.closePath();
  } else {
    const th = style === 'thick' ? 0.0042 : style === 'thin' ? 0.0017 : 0.0026;
    const arch = style === 'straight' ? 0.0006 : 0.0035;
    const x0 = -0.016, x1 = 0.019;
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo(0, y + arch + th, x1, y - 0.003);
    ctx.quadraticCurveTo(0, y + arch, x0, y - th);
    ctx.closePath();
  }
  ctx.fill();
}

function paintMouth(ctx, kind, app, clown) {
  const y = HEAD.mouthY;
  const lineCol = clown ? '#7a1418' : darken(app.skin, 0.42);
  ctx.lineCap = 'round';
  if (kind === 'closed') {
    ctx.strokeStyle = lineCol; ctx.lineWidth = 0.0015;
    ctx.beginPath(); ctx.moveTo(-0.0058, y + 0.0011); ctx.quadraticCurveTo(0, y - 0.0022, 0.0058, y + 0.0011); ctx.stroke();
    return;
  }
  const w = kind === 'o' ? 0.0046 : kind === 'smile' ? 0.0092 : 0.0064;
  const h = kind === 'o' ? 0.0052 : kind === 'smile' ? 0.0072 : 0.0058;
  ctx.fillStyle = '#5e1c28';
  ctx.beginPath();
  if (kind === 'o') ctx.ellipse(0, y - 0.0012, w, h, 0, 0, Math.PI * 2);
  else {
    ctx.moveTo(-w, y + 0.0012);
    ctx.quadraticCurveTo(0, y + 0.0002, w, y + 0.0012);
    ctx.quadraticCurveTo(w * 0.85, y - h * 1.05, 0, y - h * 1.12);
    ctx.quadraticCurveTo(-w * 0.85, y - h * 1.05, -w, y + 0.0012);
  }
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#e57a88';
  ctx.beginPath(); ctx.ellipse(0, y - h * 1.12, w * 0.72, h * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  if (kind !== 'o') { ctx.fillStyle = '#ffffff'; ctx.fillRect(-w * 0.6, y - 0.0009, w * 1.2, 0.0014); }
  ctx.restore();
  ctx.strokeStyle = rgba(lineCol, 0.9); ctx.lineWidth = 0.001;
  ctx.stroke();
}

function diamond(ctx, cx, cy, hw, hh, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy - hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); ctx.fill();
}

/** clown paint base layer (white face, red/teal diamonds, red nose); the smile is painted after the mouth */
function paintClown(ctx, E) {
  ctx.save();
  ctx.shadowColor = 'rgba(252,252,248,0.9)'; ctx.shadowBlur = 0; // feathering handled by the gradient
  const g = ctx.createRadialGradient(0, -0.04, 0.03, 0, -0.04, 0.085);
  g.addColorStop(0, 'rgba(252,251,247,0.97)'); g.addColorStop(0.82, 'rgba(252,251,247,0.95)'); g.addColorStop(1, 'rgba(252,251,247,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -0.038, 0.085, 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  for (const s of [-1, 1]) {
    const x = s * HEAD.eyeX;
    // red spike above the eye
    ctx.fillStyle = '#d6262c';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.004, HEAD.eyeY + E.h * 0.5 + 0.002);
    ctx.lineTo(x + s * 0.012, HEAD.eyeY + E.h * 0.5 + 0.026);
    ctx.lineTo(x + s * 0.019, HEAD.eyeY + E.h * 0.5 + 0.0);
    ctx.closePath(); ctx.fill();
    // teal inverted triangle below the eye
    ctx.fillStyle = '#2fa595';
    ctx.beginPath();
    ctx.moveTo(x - 0.011, HEAD.eyeY - E.h * 0.42);
    ctx.lineTo(x + 0.011, HEAD.eyeY - E.h * 0.42);
    ctx.lineTo(x + s * 0.001, HEAD.eyeY - E.h * 0.42 - 0.032);
    ctx.closePath(); ctx.fill();
  }
}

/** paint the whole expression atlas for an appearance */
export function paintFaceAtlas(app, existing = null) {
  const [cv, ctx] = existing || makeCanvas(FS * COLS, FS * ROWS);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const fem = app.body === 'female';
  const E = eyeParams(app.eyeStyle, fem);
  const clown = app.facePaint === 'clown';
  const sx = FS / (FACE_BOX.x1 - FACE_BOX.x0), sy = FS / (FACE_BOX.y1 - FACE_BOX.y0);
  FRAME_DEF.forEach((fr, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    ctx.save();
    ctx.beginPath(); ctx.rect(col * FS + 4, row * FS + 4, FS - 8, FS - 8); ctx.clip();
    ctx.setTransform(sx, 0, 0, -sy, col * FS - FACE_BOX.x0 * sx, row * FS + FACE_BOX.y1 * sy);
    if (clown) paintClown(ctx, E);
    else {
      // blush
      for (const s of [-1, 1]) {
        const bx = s * 0.05, by = -0.054;
        const a = (fr.eyes === 'happy' ? 0.6 : 0.45) * (fem ? 1 : 0.6);
        ctx.save(); ctx.translate(bx, by); ctx.scale(1.5, 0.78);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, fem ? 0.019 : 0.016);
        g.addColorStop(0, `rgba(255,128,140,${a})`); g.addColorStop(1, 'rgba(255,128,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.02, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (fem) {
          ctx.strokeStyle = 'rgba(235,110,125,0.45)'; ctx.lineWidth = 0.0008;
          for (let k = 0; k < 3; k++) { const x = bx - 0.006 + k * 0.005; ctx.beginPath(); ctx.moveTo(x, by - 0.003); ctx.lineTo(x + 0.003, by + 0.003); ctx.stroke(); }
        }
      }
    }
    // brows (hidden under bangs for most styles but they still show through gaps)
    const browY = HEAD.eyeY + E.h * 0.5 + 0.012 + (fr.eyes === 'happy' ? 0.002 : 0);
    if (!clown) {
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(s * (HEAD.eyeX + 0.001), 0); ctx.scale(s, 1);
        paintBrow(ctx, app.brows, app, browY);
        ctx.restore();
      }
    }
    // eyes (s=+1 is the character's LEFT eye -> eyeColor2)
    for (const s of [-1, 1]) {
      const ec = s > 0 && app.eyeColor2 ? app.eyeColor2 : app.eyeColor;
      ctx.save(); ctx.translate(s * HEAD.eyeX, HEAD.eyeY); ctx.scale(s, 1);
      paintEye(ctx, E, fr.eyes, app, s, ec);
      ctx.restore();
    }
    // nose: tiny shadow tick
    if (clown) {
      ctx.fillStyle = '#d6262c'; ctx.beginPath(); ctx.arc(0, HEAD.noseY + 0.001, 0.0058, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = rgba(darken(app.skin, 0.55), 0.7);
      ctx.lineWidth = 0.0013; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0.0016, HEAD.noseY + 0.003); ctx.quadraticCurveTo(0.0022, HEAD.noseY - 0.001, -0.0004, HEAD.noseY - 0.0015); ctx.stroke();
    }
    if (clown) {
      ctx.strokeStyle = '#d6262c'; ctx.lineWidth = 0.0042; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-0.042, HEAD.mouthY + 0.012); ctx.quadraticCurveTo(0, HEAD.mouthY - 0.02, 0.042, HEAD.mouthY + 0.012); ctx.stroke();
    }
    paintMouth(ctx, fr.mouth, app, clown);
    ctx.restore();
  });
  return [cv, ctx];
}

/** controls atlas frame selection on a texture */
export class FaceAnimator {
  constructor(tex) {
    this.tex = tex;
    tex.repeat.set(1 / COLS, 1 / ROWS);
    this.blinkT = 2 + Math.random() * 3;
    this.blinkPhase = -1;
    this.mouthT = 0; this.mouth = 'closed';
    this.frame = -1;
    this.set(0);
  }
  set(i) {
    if (i === this.frame) return;
    this.frame = i;
    const col = i % COLS, row = Math.floor(i / COLS);
    this.tex.offset.set(col / COLS, 1 - (row + 1) / ROWS);
  }
  update(dt, { talking = false, happy = false, eyesClosed = false } = {}) {
    this.blinkT -= dt;
    let eyes = 'open';
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt;
      const p = this.blinkPhase;
      eyes = p < 0.04 ? 'half' : p < 0.11 ? 'closed' : p < 0.16 ? 'half' : 'open';
      if (p > 0.16) { this.blinkPhase = -1; this.blinkT = 1.8 + Math.random() * 4.2; if (Math.random() < 0.15) this.blinkT = 0.25; }
    } else if (this.blinkT <= 0) this.blinkPhase = 0;
    if (eyesClosed) eyes = 'closed';
    if (talking) {
      this.mouthT -= dt;
      if (this.mouthT <= 0) {
        const r = Math.random();
        this.mouth = this.mouth === 'closed' ? (r < 0.65 ? 'open' : 'o') : (r < 0.45 ? 'closed' : r < 0.75 ? 'open' : 'o');
        this.mouthT = 0.07 + Math.random() * 0.1;
      }
    } else this.mouth = 'closed';
    let f;
    if (happy) f = FRAMES.happy;
    else if (eyes === 'closed') f = FRAMES.closed;
    else if (eyes === 'half') f = FRAMES.half;
    else f = this.mouth === 'open' ? FRAMES.talk : this.mouth === 'o' ? FRAMES.talkO : FRAMES.open;
    this.set(f);
  }
}

export function makeFaceTexture(app) {
  const [cv] = paintFaceAtlas(app);
  const tex = canvasTex(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** green dragon tattoo texture (painted on a neck wrap patch). u runs around the neck, v up. */
export function makeTattooTexture() {
  const [cv, x] = makeCanvas(256, 256);
  x.clearRect(0, 0, 256, 256);
  x.lineCap = 'round'; x.lineJoin = 'round';
  // sinuous body: from the collar (bottom) up and around, head near the jaw
  const body = [[60, 250], [90, 210], [150, 196], [176, 160], [140, 128], [96, 112], [104, 78], [146, 64], [178, 46]];
  const path = () => { x.beginPath(); x.moveTo(...body[0]); for (let i = 1; i < body.length - 1; i++) { const mx = (body[i][0] + body[i + 1][0]) / 2, my = (body[i][1] + body[i + 1][1]) / 2; x.quadraticCurveTo(body[i][0], body[i][1], mx, my); } x.lineTo(...body[body.length - 1]); };
  x.strokeStyle = 'rgba(16,40,26,0.95)'; x.lineWidth = 38; path(); x.stroke();
  x.strokeStyle = 'rgba(52,130,78,0.97)'; x.lineWidth = 28; path(); x.stroke();
  x.strokeStyle = 'rgba(120,180,110,0.8)'; x.lineWidth = 5; x.setLineDash([6, 7]); path(); x.stroke(); x.setLineDash([]);
  // spines along the back
  x.strokeStyle = 'rgba(16,40,26,0.9)'; x.lineWidth = 3;
  for (let i = 1; i < body.length - 1; i++) { const [px, py] = body[i]; x.beginPath(); x.moveTo(px, py - 10); x.lineTo(px + 6, py - 20); x.lineTo(px + 10, py - 9); x.stroke(); }
  // head
  const [hx, hy] = body[body.length - 1];
  x.fillStyle = 'rgba(52,120,74,0.98)'; x.strokeStyle = 'rgba(16,40,26,0.95)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(hx - 14, hy + 10); x.lineTo(hx + 30, hy - 2); x.lineTo(hx + 36, hy + 10); x.lineTo(hx + 8, hy + 18); x.closePath(); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(hx - 6, hy - 4); x.lineTo(hx - 20, hy - 26); x.moveTo(hx + 2, hy - 4); x.lineTo(hx - 4, hy - 30); x.stroke(); // horns
  x.strokeStyle = 'rgba(30,70,44,0.9)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(hx + 30, hy + 4); x.quadraticCurveTo(hx + 56, hy - 10, hx + 60, hy + 16); x.stroke(); // whisker
  x.fillStyle = '#e8d24a'; x.beginPath(); x.arc(hx + 12, hy + 4, 3.5, 0, Math.PI * 2); x.fill();
  // claws
  x.strokeStyle = 'rgba(16,40,26,0.95)'; x.lineWidth = 4;
  for (const [cx, cy, dx, dy] of [[150, 196, 12, 18], [104, 112, -16, 10]]) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + dx, cy + dy); x.lineTo(cx + dx + 6, cy + dy - 2); x.stroke(); }
  const tex = canvasTex(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
