// Procedural Indonesian batik textures (gold #e0b043 on black) for NXR's udeng, collar, belt,
// sarong and ankle cuffs + the "NXR" visor plate. All painted on <canvas>, deterministic.
import * as THREE from 'three';
import { makeCanvas, canvasTex, rng } from '../core/util.js';

export const GOLD = '#e0b043';
export const GOLD_D = '#a8781f';
export const GOLD_L = '#f6d27a';
export const BLACK = '#151416';

function spiral(x, cx, cy, r, turns = 1.6, dir = 1, lw = 3) {
  x.beginPath();
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = dir * t * turns * Math.PI * 2;
    const rr = r * (1 - t * 0.85);
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.lineWidth = lw; x.lineCap = 'round'; x.stroke();
}

function leaf(x, cx, cy, len, w, ang) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  x.beginPath();
  x.moveTo(0, 0);
  x.quadraticCurveTo(w, -len * 0.5, 0, -len);
  x.quadraticCurveTo(-w, -len * 0.5, 0, 0);
  x.fill();
  x.restore();
}

/** kawung: four ellipses around a point (classic Javanese motif) */
function kawung(x, cx, cy, r, fill, dot) {
  x.fillStyle = fill;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    x.beginPath();
    x.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, r * 0.28, a, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = dot;
  x.beginPath(); x.arc(cx, cy, r * 0.12, 0, Math.PI * 2); x.fill();
}

/** tumpal / pucuk rebung: flame-arch triangle with inner curls */
function tumpal(x, cx, base, w, h, fg, bg) {
  x.fillStyle = fg;
  x.beginPath();
  x.moveTo(cx - w / 2, base);
  x.bezierCurveTo(cx - w * 0.5, base - h * 0.55, cx - w * 0.12, base - h * 0.6, cx, base - h);
  x.bezierCurveTo(cx + w * 0.12, base - h * 0.6, cx + w * 0.5, base - h * 0.55, cx + w / 2, base);
  x.closePath(); x.fill();
  x.strokeStyle = bg; x.fillStyle = bg;
  spiral(x, cx - w * 0.17, base - h * 0.3, w * 0.13, 1.3, 1, Math.max(2, w * 0.04));
  spiral(x, cx + w * 0.17, base - h * 0.3, w * 0.13, 1.3, -1, Math.max(2, w * 0.04));
  leaf(x, cx, base - h * 0.45, h * 0.4, w * 0.09, 0);
}

function swirlField(x, w, h, seed, color, density = 1, lw = 3) {
  const r = rng(seed);
  x.strokeStyle = color; x.fillStyle = color;
  const n = Math.floor(w * h / 2200 * density);
  for (let i = 0; i < n; i++) {
    const cx = r() * w, cy = r() * h, rr = 7 + r() * 12;
    spiral(x, cx, cy, rr, 1.2 + r(), r() < 0.5 ? 1 : -1, lw);
    if (r() < 0.6) leaf(x, cx + rr, cy, rr * 1.2, rr * 0.35, r() * Math.PI * 2);
    if (r() < 0.5) { x.beginPath(); x.arc(cx - rr, cy + rr * 0.6, 2.2, 0, Math.PI * 2); x.fill(); }
  }
}

/** gold background, dense black paisley/swirls (udeng, collar) */
export function batikGoldTex(seed = 3, { w = 512, h = 256, center = false } = {}) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = GOLD; x.fillRect(0, 0, w, h);
  // soft warm variation
  const r = rng(seed + 99);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(${170 + r() * 40 | 0},${120 + r() * 30 | 0},30,0.10)`;
    x.beginPath(); x.arc(r() * w, r() * h, 20 + r() * 40, 0, Math.PI * 2); x.fill();
  }
  swirlField(x, w, h, seed, BLACK, 1.1, 3.2);
  // kawung rosettes
  const rr = rng(seed + 7);
  for (let i = 0; i < Math.floor(w * h / 14000); i++) kawung(x, rr() * w, rr() * h, 13, BLACK, GOLD);
  if (center) {
    // centre diamond medallion (collar front, u = 0 / 1 seam -> paint both edges)
    for (const cx of [0, w]) {
      x.fillStyle = GOLD;
      x.beginPath(); x.moveTo(cx, h * 0.3); x.lineTo(cx + 34, h * 0.6); x.lineTo(cx, h * 0.92); x.lineTo(cx - 34, h * 0.6); x.closePath(); x.fill();
      x.strokeStyle = BLACK; x.lineWidth = 5; x.stroke();
      x.beginPath(); x.moveTo(cx, h * 0.42); x.lineTo(cx + 18, h * 0.6); x.lineTo(cx, h * 0.8); x.lineTo(cx - 18, h * 0.6); x.closePath();
      x.lineWidth = 3; x.stroke();
      x.fillStyle = BLACK; x.beginPath(); x.arc(cx, h * 0.6, 4, 0, Math.PI * 2); x.fill();
    }
  }
  // edge trims
  x.fillStyle = BLACK; x.fillRect(0, 0, w, 5); x.fillRect(0, h - 5, w, 5);
  return canvasTex(c);
}

/** black background with dense gold swirls + kawung (udeng band) */
export function batikBlackTex(seed = 21, { w = 512, h = 256 } = {}) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = BLACK; x.fillRect(0, 0, w, h);
  swirlField(x, w, h, seed, GOLD, 1.25, 3.4);
  const rr = rng(seed + 7);
  for (let i = 0; i < Math.floor(w * h / 12000); i++) kawung(x, rr() * w, rr() * h, 13, GOLD, BLACK);
  x.fillStyle = GOLD; x.fillRect(0, 0, w, 6); x.fillRect(0, h - 6, w, 6);
  return canvasTex(c);
}

/** black background with gold motifs: rows of tumpal + a gold border at the bottom (sarong). u wraps. */
export function batikSarongTex(seed = 11, { w = 1024, h = 256 } = {}) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = BLACK; x.fillRect(0, 0, w, h);
  // top thin gold line
  x.fillStyle = GOLD; x.fillRect(0, 6, w, 5);
  const cols = 14;
  const cw = w / cols;
  // row 1 (big tumpal pointing up)
  for (let i = 0; i < cols; i++) tumpal(x, cw * (i + 0.5), h * 0.55, cw * 0.78, h * 0.36, GOLD, BLACK);
  // tiny dotted motifs between
  x.fillStyle = GOLD;
  for (let i = 0; i < cols; i++) {
    const cx = cw * i;
    for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(cx, h * 0.24 + k * 13, 3, 0, Math.PI * 2); x.fill(); }
    kawung(x, cx, h * 0.6, 9, GOLD, BLACK);
  }
  // row 2 small inverted tumpal (pointing down from the band)
  x.save(); x.translate(0, h); x.scale(1, -1);
  for (let i = 0; i < cols * 2; i++) tumpal(x, (cw / 2) * (i + 0.5), h * 0.2, cw * 0.36, h * 0.13, GOLD, BLACK);
  x.restore();
  // bottom border: gold band with black zigzag
  x.fillStyle = GOLD; x.fillRect(0, h * 0.86, w, h * 0.14);
  x.strokeStyle = BLACK; x.lineWidth = 3;
  x.beginPath();
  for (let i = 0; i <= cols * 4; i++) { const px = (w / (cols * 4)) * i; x.lineTo(px, i % 2 ? h * 0.89 : h * 0.97); }
  x.stroke();
  x.fillStyle = BLACK; x.fillRect(0, h * 0.86, w, 3);
  return canvasTex(c);
}

/** ankle cuff: gold band, black tumpal row, black stripes at both edges */
export function batikCuffTex(seed = 5, { w = 512, h = 128 } = {}) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = GOLD; x.fillRect(0, 0, w, h);
  x.fillStyle = BLACK;
  x.fillRect(0, 0, w, 10); x.fillRect(0, h - 10, w, 10);
  x.fillRect(0, 18, w, 4); x.fillRect(0, h - 22, w, 4);
  const cols = 10, cw = w / cols;
  for (let i = 0; i < cols; i++) tumpal(x, cw * (i + 0.5), h - 26, cw * 0.7, h * 0.5, BLACK, GOLD);
  void seed;
  return canvasTex(c);
}

/** belt: plain gold sash with darker fold lines */
export function beltTex({ w = 512, h = 64 } = {}) {
  const [c, x] = makeCanvas(w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, GOLD_L); g.addColorStop(0.5, GOLD); g.addColorStop(1, GOLD_D);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(90,60,10,0.45)';
  x.fillRect(0, h * 0.32, w, 2); x.fillRect(0, h * 0.66, w, 2);
  x.fillStyle = BLACK; x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3);
  return canvasTex(c);
}

/** front panel of the sarong (kancut): black with a gold border and a small motif */
export function panelTex({ w = 128, h = 256 } = {}) {
  const [c, x] = makeCanvas(w, h);
  x.fillStyle = BLACK; x.fillRect(0, 0, w, h);
  x.strokeStyle = GOLD; x.lineWidth = 9; x.strokeRect(8, -10, w - 16, h - 2);
  x.fillStyle = GOLD;
  tumpal(x, w / 2, h - 30, w * 0.5, h * 0.35, GOLD, BLACK);
  return canvasTex(c);
}

/** "NXR" visor faceplate (dark plastic + bevel highlight + grey letters). repaint() after fonts load. */
export function visorTex({ w = 512, h = 200 } = {}) {
  const [c, x] = makeCanvas(w, h);
  const tex = canvasTex(c);
  const paint = () => {
    x.clearRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3c3c42'); g.addColorStop(0.5, '#2b2b30'); g.addColorStop(1, '#232327');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // top bevel highlight
    const hl = x.createLinearGradient(0, 0, 0, h * 0.25);
    hl.addColorStop(0, 'rgba(255,255,255,0.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = hl; x.fillRect(0, 0, w, h * 0.25);
    x.fillStyle = '#b4b4ba';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(h * 0.44)}px "M PLUS Rounded 1c", "Inter", "Arial Rounded MT Bold", Arial, sans-serif`;
    x.fillText('NXR', w * 0.5, h * 0.53);
    tex.needsUpdate = true;
  };
  paint();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    document.fonts.load('800 80px "M PLUS Rounded 1c"').then(paint).catch(() => {});
  }
  tex.anisotropy = 8;
  return tex;
}

/** additive glint band texture (white band in the middle, transparent ends). */
export function glintTex() {
  const [c, x] = makeCanvas(256, 8);
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.42, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.53, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}
