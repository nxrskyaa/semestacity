// Procedural canvas textures for the city. Every painter is cached by key.
// Text textures register a repaint so they are redrawn once web fonts load.
import * as THREE from 'three';
import { makeCanvas, canvasTex, rng } from '../core/util.js';
import { makeRialoWordmarkTexture, makeRialoTexture, paintRialoMark, RIALO_CREAM, RIALO_INK } from '../gfx/rialoLogo.js';

export const JP = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
export const LATIN = '"Inter", "Helvetica Neue", Arial, sans-serif';

const cache = new Map();
const textJobs = [];
const lateJobs = [];

export function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/** cached canvas texture painted by paint(ctx,w,h); repainted after fonts load */
export function paintTex(key, w, h, paint, opts = {}) {
  return cached(key, () => {
    const [c, ctx] = makeCanvas(w, h);
    paint(ctx, w, h);
    const t = canvasTex(c, opts);
    if (opts.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    textJobs.push({ t, c, ctx, paint });
    return t;
  });
}

/** wordmark from the official helper; regenerated in place once Inter is loaded */
export function rialoWordmark(key, w, h, opts) {
  return cached('wm:' + key, () => {
    const t = makeRialoWordmarkTexture(w, h, opts);
    lateJobs.push(() => {
      const n = makeRialoWordmarkTexture(w, h, opts);
      t.image = n.image;
      t.needsUpdate = true;
      n.dispose();
    });
    return t;
  });
}

export function rialoMark(key, w, h, opts) {
  return cached('mk:' + key, () => makeRialoTexture(w, h, opts));
}

let hooked = false;
export function hookFonts() {
  if (hooked || typeof document === 'undefined' || !document.fonts) return;
  hooked = true;
  const faces = ['500 32px "Noto Sans JP"', '700 32px "Noto Sans JP"', '900 32px "Noto Sans JP"',
    '500 32px "Inter"', '600 32px "Inter"', '700 32px "Inter"'];
  Promise.all(faces.map((f) => document.fonts.load(f, 'あア漢字Ab').catch(() => null)))
    .then(() => document.fonts.ready)
    .then(repaintText);
}

export function repaintText() {
  for (const j of textJobs) {
    j.ctx.setTransform(1, 0, 0, 1, 0, 0);
    j.ctx.globalAlpha = 1;
    j.ctx.shadowBlur = 0;
    j.ctx.filter = 'none';
    j.ctx.clearRect(0, 0, j.c.width, j.c.height);
    j.paint(j.ctx, j.c.width, j.c.height);
    j.t.needsUpdate = true;
  }
  for (const f of lateJobs) f();
}

export function disposeTextures() {
  for (const t of cache.values()) {
    if (t && t.isTexture) t.dispose();
    else if (t) for (const k in t) if (t[k] && t[k].isTexture) t[k].dispose();
  }
  cache.clear();
  textJobs.length = 0;
  lateJobs.length = 0;
}

// ---------------------------------------------------------------- helpers
/** draw fn at (x,y) and its wrapped copies so tiled textures stay seamless */
function wrapDraw(S, x, y, r, fn) {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const px = x + dx * S, py = y + dy * S;
    if (px + r < 0 || px - r > S || py + r < 0 || py - r > S) continue;
    fn(px, py);
  }
}

function pixelNoise(ctx, w, h, amt, R, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amt;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } else {
      d[i] += (R() - 0.5) * amt; d[i + 1] += (R() - 0.5) * amt; d[i + 2] += (R() - 0.5) * amt;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** auto-fit text into maxW at given weight/family; returns font size used */
export function fitText(ctx, text, maxW, size, weight = 900, family = JP) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  const m = ctx.measureText(text).width;
  if (m > maxW) s = Math.floor(s * maxW / m);
  ctx.font = `${weight} ${s}px ${family}`;
  return s;
}

function heightToNormal(hctx, S, strength = 2) {
  const src = hctx.getImageData(0, 0, S, S).data;
  const [c, ctx] = makeCanvas(S, S);
  const out = ctx.createImageData(S, S);
  const H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * S + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function dataTex(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function repeatTex(canvas) {
  const t = canvasTex(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- ground
/** wet asphalt: { map, rough, normal } (tile ~6 m) */
export function asphalt() {
  return cached('asphalt', () => {
    const S = 1024, R = rng(11);
    // puddle mask (shared by all three maps)
    const [mc, m] = makeCanvas(S, S);
    m.fillStyle = '#000'; m.fillRect(0, 0, S, S);
    m.filter = 'blur(22px)';
    for (let i = 0; i < 9; i++) {
      const x = R() * S, y = R() * S, rx = 60 + R() * 150, ry = rx * (0.25 + R() * 0.35), a = R() * Math.PI;
      wrapDraw(S, x, y, rx + 20, (px, py) => {
        m.save(); m.translate(px, py); m.rotate(a);
        m.fillStyle = `rgba(255,255,255,${0.45 + R() * 0.4})`;
        m.beginPath(); m.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); m.fill();
        m.restore();
      });
    }
    m.filter = 'none';
    const mask = m.getImageData(0, 0, S, S).data;

    const [c, x] = makeCanvas(S, S);
    x.fillStyle = '#2b2c30'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const px = R() * S, py = R() * S, rad = 40 + R() * 200;
      const dark = R() < 0.55;
      wrapDraw(S, px, py, rad, (qx, qy) => {
        const g = x.createRadialGradient(qx, qy, 0, qx, qy, rad);
        g.addColorStop(0, dark ? 'rgba(0,0,0,0.22)' : 'rgba(90,92,100,0.13)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(qx - rad, qy - rad, rad * 2, rad * 2);
      });
    }
    // patched repair seams
    x.strokeStyle = 'rgba(10,10,12,0.55)';
    for (let i = 0; i < 5; i++) {
      x.lineWidth = 2 + R() * 3;
      x.beginPath();
      let px = R() * S, py = R() * S;
      x.moveTo(px, py);
      for (let k = 0; k < 8; k++) { px += (R() - 0.5) * 120; py += R() * 90; x.lineTo(px, py); }
      x.stroke();
    }
    const img = x.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      let n = (R() - 0.5) * 26;
      if (R() < 0.015) n += 40 * R();
      const wet = mask[i] / 255;
      const k = 1 - wet * 0.18;
      d[i] = (d[i] + n) * k; d[i + 1] = (d[i + 1] + n) * k; d[i + 2] = (d[i + 2] + n) * k * 1.04;
    }
    x.putImageData(img, 0, 0);

    // roughness (G channel)
    const RS = 512;
    const [rc, r] = makeCanvas(RS, RS);
    r.drawImage(mc, 0, 0, RS, RS);
    const ri = r.getImageData(0, 0, RS, RS);
    for (let i = 0; i < ri.data.length; i += 4) {
      const wet = ri.data[i] / 255;
      const v = (0.36 + (R() - 0.5) * 0.12) * (1 - wet) + 0.1 * wet;
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.max(0, Math.min(255, v * 255));
    }
    r.putImageData(ri, 0, 0);

    // normal: aggregate bumps, flat in puddles
    const [hc, h] = makeCanvas(RS, RS);
    const hi = h.createImageData(RS, RS);
    const mi = r.getImageData(0, 0, RS, RS).data;
    for (let i = 0; i < hi.data.length; i += 4) {
      const flat = 1 - Math.min(1, Math.max(0, (0.36 - mi[i + 1] / 255) / 0.22));
      const v = 128 + (R() - 0.5) * 120 * Math.max(0, Math.min(1, flat));
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = v; hi.data[i + 3] = 255;
    }
    h.putImageData(hi, 0, 0);
    h.filter = 'blur(0.6px)'; h.drawImage(hc, 0, 0); h.filter = 'none';
    return { map: repeatTex(c), rough: dataTex(rc), normal: dataTex(heightToNormal(h, RS, 1.6)) };
  });
}

/** square concrete sidewalk pavers, 4x4 per tile */
export function sidewalk() {
  return cached('sidewalk', () => {
    const S = 512, R = rng(5), n = 4, q = S / n;
    const [c, x] = makeCanvas(S, S);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 92 + R() * 26;
      x.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      x.fillRect(i * q, j * q, q, q);
    }
    pixelNoise(x, S, S, 9, R);
    x.strokeStyle = 'rgba(30,30,32,0.9)'; x.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      x.beginPath(); x.moveTo(i * q, 0); x.lineTo(i * q, S); x.stroke();
      x.beginPath(); x.moveTo(0, i * q); x.lineTo(S, i * q); x.stroke();
    }
    const [rc, r] = makeCanvas(256, 256);
    r.fillStyle = 'rgb(95,95,95)'; r.fillRect(0, 0, 256, 256);
    r.filter = 'blur(6px)';
    for (let i = 0; i < 14; i++) { r.fillStyle = `rgba(20,20,20,${0.4 + R() * 0.5})`; r.beginPath(); r.ellipse(R() * 256, R() * 256, 10 + R() * 30, 6 + R() * 18, R() * 3, 0, 7); r.fill(); }
    r.filter = 'none';
    r.strokeStyle = 'rgb(40,40,40)'; r.lineWidth = 2;
    for (let i = 0; i <= n; i++) { r.beginPath(); r.moveTo(i * 64, 0); r.lineTo(i * 64, 256); r.stroke(); r.beginPath(); r.moveTo(0, i * 64); r.lineTo(256, i * 64); r.stroke(); }
    return { map: repeatTex(c), rough: dataTex(rc) };
  });
}

/** yellow tactile paving (dots). 1 tile = 0.3 m */
export function tactile() {
  return cached('tactile', () => {
    const S = 128;
    const [c, x] = makeCanvas(S, S);
    x.fillStyle = '#d9a816'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#f2c22a';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      x.beginPath(); x.arc(13 + i * 25.5, 13 + j * 25.5, 8, 0, 7); x.fill();
    }
    x.strokeStyle = '#8a6a10'; x.lineWidth = 3; x.strokeRect(0, 0, S, S);
    return repeatTex(c);
  });
}

/** brown / beige checkerboard (2x2 tiles per texture) */
export function checker() {
  return cached('checker', () => {
    const S = 512, R = rng(9), h = S / 2;
    const [c, x] = makeCanvas(S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? '#5a3c28' : '#b49c7e';
      x.fillRect(i * h, j * h, h, h);
    }
    pixelNoise(x, S, S, 18, R);
    x.globalAlpha = 0.12;
    for (let i = 0; i < 40; i++) { x.fillStyle = R() < 0.5 ? '#000' : '#fff'; x.beginPath(); x.ellipse(R() * S, R() * S, 4 + R() * 30, 3 + R() * 10, R() * 3, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    x.strokeStyle = '#3a2c22'; x.lineWidth = 5;
    for (const p of [0, h, S]) {
      x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.stroke();
      x.beginPath(); x.moveTo(0, p); x.lineTo(S, p); x.stroke();
    }
    return repeatTex(c);
  });
}

/** polished granite plaza slabs (1 tile = 2 slabs) */
export function plazaStone() {
  return cached('plaza', () => {
    const S = 512, R = rng(21);
    const [c, x] = makeCanvas(S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const v = 70 + R() * 14;
      x.fillStyle = `rgb(${v},${v + 1},${v + 5})`; x.fillRect(i * 256, j * 256, 256, 256);
    }
    pixelNoise(x, S, S, 30, R);
    x.strokeStyle = '#1c1d22'; x.lineWidth = 3;
    for (const p of [0, 256, 512]) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(S, p); x.stroke(); }
    return repeatTex(c);
  });
}

export function concrete(tint = '#8a8a88', key = 'concrete') {
  return cached(key + tint, () => {
    const S = 256, R = rng(3);
    const [c, x] = makeCanvas(S, S);
    x.fillStyle = tint; x.fillRect(0, 0, S, S);
    pixelNoise(x, S, S, 20, R);
    x.globalAlpha = 0.1;
    for (let i = 0; i < 30; i++) { x.fillStyle = '#000'; x.fillRect(R() * S, R() * S * 0.3 + S * 0.7, 2 + R() * 6, 10 + R() * 50); }
    x.globalAlpha = 1;
    return repeatTex(c);
  });
}

/** concrete block wall (Japanese burokku-bei); tile = 0.8 x 0.4 m (2x2 blocks) */
export function blockWall() {
  return cached('block', () => {
    const [c, x] = makeCanvas(256, 128), R = rng(8);
    x.fillStyle = '#858581'; x.fillRect(0, 0, 256, 128);
    pixelNoise(x, 256, 128, 26, R);
    x.strokeStyle = '#4c4c4a'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, 64); x.lineTo(256, 64); x.moveTo(0, 1); x.lineTo(256, 1);
    x.moveTo(1, 0); x.lineTo(1, 64); x.moveTo(128, 0); x.lineTo(128, 64);
    x.moveTo(64, 64); x.lineTo(64, 128); x.moveTo(192, 64); x.lineTo(192, 128); x.stroke();
    x.globalAlpha = 0.25; x.fillStyle = '#2a2a28';
    for (let i = 0; i < 12; i++) x.fillRect(R() * 256, 100 + R() * 28, 3, 28);
    return repeatTex(c);
  });
}

/** horizontal siding boards; tile = 1 m */
export function siding(color = '#b9ae9c') {
  return cached('siding' + color, () => {
    const [c, x] = makeCanvas(128, 128), R = rng(4);
    x.fillStyle = color; x.fillRect(0, 0, 128, 128);
    pixelNoise(x, 128, 128, 12, R);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, i * 16 + 14, 128, 2);
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, i * 16, 128, 2);
    }
    return repeatTex(c);
  });
}

/** kawara roof tiles; tile = 1.2 m */
export function roofTile(color = '#3b4352') {
  return cached('roof' + color, () => {
    const [c, x] = makeCanvas(256, 256), R = rng(6);
    x.fillStyle = color; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      const g = x.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      x.fillStyle = g; x.fillRect(i * 32, 0, 32, 256);
    }
    for (let j = 0; j < 8; j++) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, j * 32 + 28, 256, 4); }
    pixelNoise(x, 256, 256, 14, R);
    return repeatTex(c);
  });
}

/** corrugated roller shutter; tile = 1 m */
export function shutter(seed = 1) {
  return cached('shutter' + seed, () => {
    const [c, x] = makeCanvas(256, 256), R = rng(seed * 7);
    x.fillStyle = '#7d8288'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 32; i++) {
      const g = x.createLinearGradient(0, i * 8, 0, i * 8 + 8);
      g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.6, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      x.fillStyle = g; x.fillRect(0, i * 8, 256, 8);
    }
    pixelNoise(x, 256, 256, 14, R);
    x.globalAlpha = 0.18;
    for (let i = 0; i < 6; i++) { x.fillStyle = '#3a2a1a'; x.fillRect(R() * 256, 200 + R() * 56, 2 + R() * 4, 30 + R() * 40); }
    return repeatTex(c);
  });
}

/** soft radial glow (white) for light pools / halos */
export function radialGlow() {
  return cached('glow', () => {
    const [c, x] = makeCanvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = canvasTex(c);
    return t;
  });
}

// ---------------------------------------------------------------- windows
/** warm house window with curtains (variant 0..5); dark when lit=false */
export function houseWindow(v = 0, lit = true) {
  return cached(`hwin${v}${lit}`, () => {
    const [c, x] = makeCanvas(128, 128), R = rng(v * 13 + 1);
    const warm = ['#ffcf8a', '#ffd9a0', '#ffe2b8', '#ffc070', '#f7e6c8', '#ffd28f'][v % 6];
    if (lit) {
      const g = x.createRadialGradient(64, 50, 4, 64, 64, 90);
      g.addColorStop(0, '#fff3dc'); g.addColorStop(1, warm);
      x.fillStyle = g;
    } else x.fillStyle = '#1b2233';
    x.fillRect(0, 0, 128, 128);
    if (lit) {
      // curtains
      const cc = ['#c96b4a', '#e8d7b0', '#7b8fb5', '#d8b36a', '#a3c08a', '#e0a0a0'][v % 6];
      x.fillStyle = cc; x.globalAlpha = 0.85;
      const open = 18 + R() * 30;
      x.fillRect(0, 0, 64 - open, 128); x.fillRect(64 + open * (0.4 + R() * 0.6), 0, 64, 128);
      x.globalAlpha = 0.25; x.fillStyle = '#000';
      for (let i = 0; i < 6; i++) { x.fillRect(i * 10, 0, 3, 128); x.fillRect(128 - i * 10, 0, 3, 128); }
      x.globalAlpha = 1;
      if (v % 3 === 1) { // silhouette
        x.fillStyle = 'rgba(60,40,30,0.55)';
        x.beginPath(); x.arc(70, 60, 13, 0, 7); x.fill();
        x.fillRect(52, 72, 36, 56);
      }
      if (v % 3 === 2) { x.fillStyle = 'rgba(40,60,30,0.6)'; x.beginPath(); x.ellipse(30, 110, 18, 22, 0, 0, 7); x.fill(); }
    } else {
      x.fillStyle = 'rgba(120,140,190,0.15)'; x.fillRect(10, 10, 50, 108);
    }
    // frame + muntins
    x.strokeStyle = '#2a2a2e'; x.lineWidth = 8; x.strokeRect(0, 0, 128, 128);
    x.lineWidth = 4; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 128); x.stroke();
    return canvasTex(c);
  });
}

/** façade window grid. kind: 'office'|'apt'|'far' ; tile = cols x rows windows */
export function windowGrid(kind = 'far', seed = 1, cols = 8, rows = 8) {
  return cached(`wg${kind}${seed}${cols}x${rows}`, () => {
    const W = 512, H = 512, R = rng(seed * 31 + 7);
    const [c, x] = makeCanvas(W, H);
    x.fillStyle = kind === 'office' ? '#0d1220' : '#0b0f1a'; x.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const lit = R() < (kind === 'office' ? 0.62 : 0.42);
      let col;
      if (!lit) col = kind === 'office' ? '#1a2440' : '#141b2c';
      else {
        const p = R();
        col = kind === 'office' ? (p < 0.6 ? '#cfe2ff' : p < 0.85 ? '#fff4dc' : '#9fd8ff')
          : (p < 0.55 ? '#ffc979' : p < 0.8 ? '#ffe7c0' : p < 0.92 ? '#b6d4ff' : '#ff9a6a');
      }
      x.fillStyle = col;
      const px = i * cw + cw * 0.14, py = j * rh + rh * 0.18;
      x.fillRect(px, py, cw * 0.72, rh * 0.6);
      if (lit && kind !== 'office' && R() < 0.4) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(px, py, cw * 0.72 * R(), rh * 0.6); }
    }
    if (kind === 'office') { x.fillStyle = 'rgba(255,255,255,0.05)'; for (let j = 0; j < rows; j++) x.fillRect(0, j * rh, W, 3); }
    return repeatTex(c);
  });
}

// ---------------------------------------------------------------- signs
/**
 * Generic shop sign. opts: bg, fg, text, sub, vertical, border, weight, accent(fn), stripes
 */
export function signTex(key, w, h, o) {
  return paintTex('sign:' + key, w, h, (x) => {
    x.fillStyle = o.bg || '#fff'; x.fillRect(0, 0, w, h);
    if (o.grad) {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, o.grad[0]); g.addColorStop(1, o.grad[1]);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    if (o.border) { x.strokeStyle = o.border; x.lineWidth = Math.min(w, h) * 0.06; x.strokeRect(0, 0, w, h); }
    if (o.accent) o.accent(x, w, h);
    x.fillStyle = o.fg || '#111';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (o.glow) { x.shadowColor = o.glow; x.shadowBlur = h * 0.12; }
    if (o.vertical) {
      const chars = [...o.text];
      const step = (h * 0.9) / chars.length;
      const fs = Math.min(w * 0.72, step * 0.92);
      x.font = `${o.weight || 900} ${fs}px ${o.family || JP}`;
      chars.forEach((ch, i) => x.fillText(ch, w / 2, h * 0.05 + step * (i + 0.5)));
    } else {
      const main = o.sub ? h * 0.42 : h * 0.62;
      const tx = o.textX ?? w / 2;
      fitText(x, o.text, (o.maxW ?? 0.88) * w, main, o.weight || 900, o.family || JP);
      x.fillText(o.text, tx, o.sub ? h * 0.42 : h * 0.54);
      if (o.sub) {
        x.shadowBlur = 0;
        x.fillStyle = o.subFg || o.fg || '#111';
        fitText(x, o.sub, 0.8 * w, h * 0.2, 600, o.subFamily || LATIN);
        x.fillText(o.sub, tx, h * 0.8);
      }
    }
  });
}

/** red paper lantern skin (wraps around a lathe): vertical ribs + kanji */
export function lanternTex(ch = '祭') {
  return paintTex('lantern' + ch, 256, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7a0d0d'); g.addColorStop(0.5, '#ff3a26'); g.addColorStop(1, '#7a0d0d');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,220,180,0.25)';
    for (let i = 0; i < h; i += 9) x.fillRect(0, i, w, 1.5);
    x.fillStyle = '#1a0a08'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `900 ${h * 0.5}px ${JP}`;
    x.fillText(ch, w * 0.25, h * 0.52); x.fillText(ch, w * 0.75, h * 0.52);
  });
}

/** painted interior of an open shop (seen through the opening) */
export function shopInterior(kind, seed = 1) {
  return paintTex('interior:' + kind + seed, 512, 256, (x, w, h) => {
    const R = rng(seed * 17 + 3);
    const base = { ramen: '#f3c98a', drug: '#e9fff2', manga: '#fff6e6', izakaya: '#ffb070', cafe: '#f2c58c', tako: '#ffd28a' }[kind] || '#ffe0b0';
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fffaf0'); g.addColorStop(0.4, base); g.addColorStop(1, '#6b4a30');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (kind === 'drug' || kind === 'manga') {
      for (let s = 0; s < 4; s++) {
        const y = 40 + s * 50;
        x.fillStyle = '#d8d0c4'; x.fillRect(0, y + 38, w, 6);
        for (let i = 0; i < 80; i++) {
          const bw = kind === 'manga' ? 5 + R() * 4 : 10 + R() * 14;
          const px = R() * w;
          x.fillStyle = `hsl(${R() * 360},${60 + R() * 30}%,${45 + R() * 25}%)`;
          x.fillRect(px, y + (kind === 'manga' ? 6 : 14 + R() * 8), bw, kind === 'manga' ? 32 : 24);
        }
      }
    } else {
      // counter, stools, menu boards
      x.fillStyle = '#5a3a22'; x.fillRect(0, h * 0.62, w, h * 0.12);
      x.fillStyle = '#2b1a10'; x.fillRect(0, h * 0.74, w, h * 0.26);
      for (let i = 0; i < 7; i++) { x.fillStyle = '#c03020'; x.beginPath(); x.ellipse(40 + i * 70, h * 0.8, 18, 8, 0, 0, 7); x.fill(); x.fillStyle = '#222'; x.fillRect(38 + i * 70, h * 0.8, 4, h * 0.2); }
      for (let i = 0; i < 10; i++) {
        x.fillStyle = R() < 0.5 ? '#fffdf5' : '#f5d77a';
        x.fillRect(12 + i * 50, 18, 40, 70);
        x.fillStyle = '#222'; x.font = `700 16px ${JP}`;
        x.textAlign = 'center';
        const menu = kind === 'cafe' ? ['珈琲', '紅茶', 'ラテ', 'ケーキ', 'トースト', 'コピ', 'パフェ', 'ソーダ', 'プリン', 'ココア']
          : kind === 'izakaya' ? ['焼鳥', '枝豆', 'ビール', '刺身', '唐揚', '冷奴', '熱燗', 'おでん', '焼酎', 'お通し']
            : ['醤油', '味噌', '塩', '餃子', '豚骨', '炒飯', 'つけ麺', 'ビール', '定食', '替玉'];
        x.fillText(menu[i], 32 + i * 50, 50);
        x.fillText('¥' + (300 + Math.floor(R() * 9) * 100), 32 + i * 50, 74);
      }
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 100, w, 20);
    }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, w, 10);
  });
}

/** noren curtain (split cloth) */
export function norenTex(text, bg = '#1d2a50') {
  return paintTex('noren' + text, 512, 160, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f4ecd8'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = [...text];
    const cw = w / chars.length;
    x.font = `900 ${Math.min(cw * 0.7, h * 0.6)}px ${JP}`;
    chars.forEach((ch, i) => x.fillText(ch, cw * (i + 0.5), h * 0.5));
    x.fillStyle = 'rgba(0,0,0,0.6)';
    for (let i = 1; i < chars.length; i++) x.fillRect(cw * i - 2, h * 0.25, 4, h);
  });
}

/** vending machine front: drink rows + bright panel; variant 0..2 */
export function vendingFront(v = 0) {
  return paintTex('vend' + v, 256, 512, (x, w, h) => {
    const R = rng(v * 5 + 2);
    const body = ['#d8202a', '#f2f2f2', '#1f5fd8'][v % 3];
    x.fillStyle = body; x.fillRect(0, 0, w, h);
    // display window
    const g = x.createLinearGradient(0, 30, 0, 300);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dfeaff');
    x.fillStyle = g; x.fillRect(16, 26, w - 32, 280);
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 6; i++) {
        const cx = 30 + i * 37, cy = 40 + r * 68;
        x.fillStyle = `hsl(${R() * 360},70%,${45 + R() * 20}%)`;
        x.fillRect(cx - 12, cy, 24, 46);
        x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(cx - 12, cy + 14, 24, 8);
        x.fillStyle = '#e8352e'; x.fillRect(cx - 9, cy + 50, 18, 7);
        x.fillStyle = '#fff'; x.font = '600 7px sans-serif'; x.textAlign = 'center'; x.fillText('120', cx, cy + 56);
      }
    }
    // brand stripe + buttons + slot
    x.fillStyle = v === 1 ? '#1f8a3a' : '#ffffff';
    x.fillRect(16, 316, w - 32, 34);
    x.fillStyle = v === 1 ? '#fff' : body; x.font = `900 22px ${JP}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(['つめた〜い', 'おいしい水', 'あったか〜い'][v % 3], w / 2, 334);
    x.fillStyle = '#222'; x.fillRect(150, 370, 70, 50);
    x.fillStyle = '#5f5'; x.fillRect(156, 378, 58, 16);
    x.fillStyle = '#111'; x.fillRect(40, 440, w - 80, 46);
  });
}

/** bright manga shelf / poster wall billboard */
export function mangaWall() {
  return paintTex('mangawall', 1024, 512, (x, w, h) => {
    const R = rng(77);
    x.fillStyle = '#fff8ec'; x.fillRect(0, 0, w, h);
    for (let s = 0; s < 6; s++) {
      const y = 70 + s * 72;
      x.fillStyle = '#d9cbb3'; x.fillRect(0, y + 62, w, 8);
      let px = 6;
      while (px < w - 6) {
        const bw = 9 + R() * 8;
        x.fillStyle = `hsl(${R() * 360},${55 + R() * 40}%,${40 + R() * 30}%)`;
        x.fillRect(px, y + 6, bw - 1, 56);
        x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(px + 1, y + 12, bw - 3, 4);
        px += bw;
      }
    }
    x.fillStyle = '#e62a3a'; x.fillRect(0, 0, w, 62);
    x.fillStyle = '#fff'; x.font = `900 46px ${JP}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('新刊入荷！ まんが・ラノベ・アニメ', w / 2, 33);
    for (let i = 0; i < 4; i++) {
      x.save(); x.translate(110 + i * 270, 300); x.rotate((R() - 0.5) * 0.15);
      x.fillStyle = ['#ffde3b', '#3bd6ff', '#ff6ec7', '#7cff6b'][i]; x.fillRect(-70, -95, 140, 190);
      x.fillStyle = '#111'; x.font = `900 30px ${JP}`;
      x.fillText(['ロボ', '最新巻', 'TOP10', '限定'][i], 0, -40);
      x.font = `900 52px ${JP}`; x.fillText(['魂', '第9巻', '★', '版'][i], 0, 30);
      x.restore();
    }
  });
}

/** arcade end-wall poster: robot battle tournament */
export function battlePoster() {
  return paintTex('battleposter', 512, 768, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1a40'); g.addColorStop(0.6, '#2a0f4a'); g.addColorStop(1, '#ff2f7a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(80,230,255,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(0, 420 + i * 22); x.lineTo(w, 420 + i * 22); x.stroke(); }
    for (let i = -8; i < 9; i++) { x.beginPath(); x.moveTo(w / 2, 400); x.lineTo(w / 2 + i * 80, h); x.stroke(); }
    // robot silhouette
    x.fillStyle = '#e8f6ff'; x.shadowColor = '#4ff'; x.shadowBlur = 30;
    x.fillRect(206, 230, 100, 120); x.fillRect(226, 180, 60, 50); x.fillRect(160, 240, 40, 100); x.fillRect(312, 240, 40, 100);
    x.fillRect(214, 350, 34, 90); x.fillRect(264, 350, 34, 90);
    x.fillStyle = '#ff2f7a'; x.fillRect(236, 196, 40, 10);
    x.shadowBlur = 0;
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `900 70px ${JP}`; x.fillText('ロボ通り', w / 2, 70);
    x.font = `900 44px ${JP}`; x.fillStyle = '#ffe14a'; x.fillText('ホロバトル大会', w / 2, 130);
    x.fillStyle = '#fff'; x.font = `700 30px ${LATIN}`; x.fillText('SEMESTA CUP', w / 2, 520);
    x.font = `600 22px ${LATIN}`; x.fillText('every night · holo-table plaza', w / 2, 560);
  });
}

// ---------------------------------------------------------------- konbini
export function konbiniFascia() {
  return paintTex('kfascia', 1024, 128, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const bands = [['#13a35a', 0, 0.16], ['#ffffff', 0.16, 0.08], ['#f2a51a', 0.24, 0.07], ['#13a35a', 0.84, 0.16]];
    for (const [c, y, hh] of bands) { x.fillStyle = c; x.fillRect(0, y * h, w, hh * h); }
    x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillStyle = '#13a35a'; x.font = `900 ${h * 0.46}px ${JP}`;
    x.fillText('ハレマート', 40, h * 0.56);
    const tw = x.measureText('ハレマート').width;
    x.fillStyle = '#1b3a8a'; x.font = `700 ${h * 0.26}px ${LATIN}`;
    x.fillText('Semesta Mart', 60 + tw, h * 0.58);
    x.fillStyle = '#13a35a'; x.textAlign = 'right'; x.font = `700 ${h * 0.24}px ${JP}`;
    x.fillText('24時間営業  OPEN 24H', w - 30, h * 0.56);
  });
}

export function konbiniPoleSign() {
  return paintTex('kpole', 256, 512, (x, w, h) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#13a35a'; x.fillRect(0, 0, w, 70); x.fillRect(0, h - 70, w, 70);
    x.fillStyle = '#f2a51a'; x.fillRect(0, 70, w, 16);
    x.fillStyle = '#13a35a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `900 66px ${JP}`;
    ['ハ', 'レ', 'マ', 'ー', 'ト'].forEach((ch, i) => x.fillText(ch, w / 2, 125 + i * 62));
    x.fillStyle = '#fff'; x.font = `700 30px ${LATIN}`; x.fillText('24H', w / 2, h - 35);
  });
}

export function fridgeTex() {
  return paintTex('fridge', 512, 512, (x, w, h) => {
    const R = rng(44);
    x.fillStyle = '#eaf6ff'; x.fillRect(0, 0, w, h);
    for (let s = 0; s < 6; s++) {
      const y = 12 + s * 82;
      x.fillStyle = '#c9d8e6'; x.fillRect(0, y + 72, w, 6);
      for (let i = 0; i < 20; i++) {
        const cx = 8 + i * 25;
        const hue = [0, 30, 50, 120, 200, 220, 280, 340][Math.floor(R() * 8)];
        const tall = R() < 0.6;
        x.fillStyle = `hsl(${hue},75%,${45 + R() * 20}%)`;
        if (tall) { x.fillRect(cx, y + 14, 18, 58); x.fillRect(cx + 5, y + 6, 8, 10); } else x.fillRect(cx, y + 34, 18, 38);
        x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(cx + 2, y + (tall ? 30 : 44), 14, 8);
      }
    }
    x.strokeStyle = '#9aa6b2'; x.lineWidth = 8;
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 0); x.lineTo(i * w / 4, h); x.stroke(); }
  }, { wrap: true });
}

export function productTex() {
  return cached('product', () => {
    const [c, x] = makeCanvas(64, 64);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, 64, 10); x.fillRect(0, 54, 64, 10);
    x.fillStyle = '#ffffff'; x.fillRect(8, 22, 48, 18);
    x.fillStyle = '#888'; x.fillRect(12, 27, 30, 3); x.fillRect(12, 33, 22, 3);
    return canvasTex(c);
  });
}

export function floorTile(color = '#e9e9e4', line = '#b9bab4', key = 'ftile') {
  return cached(key, () => {
    const [c, x] = makeCanvas(256, 256), R = rng(2);
    x.fillStyle = color; x.fillRect(0, 0, 256, 256);
    pixelNoise(x, 256, 256, 8, R);
    x.strokeStyle = line; x.lineWidth = 3;
    for (const p of [0, 128, 256]) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 256); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(256, p); x.stroke(); }
    return repeatTex(c);
  });
}

export function magazineTex() {
  return paintTex('mags', 512, 256, (x, w, h) => {
    const R = rng(12);
    x.fillStyle = '#ddd'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) {
      const px = 6 + i * 56, py = 8 + r * 124;
      x.fillStyle = `hsl(${R() * 360},70%,55%)`; x.fillRect(px, py, 52, 112);
      x.fillStyle = '#fff'; x.fillRect(px + 4, py + 6, 44, 18);
      x.fillStyle = '#111'; x.font = `900 14px ${JP}`; x.textAlign = 'center';
      x.fillText(['週刊', '月刊', 'ゲーム', '旅', '車', '漫画', '料理', '音楽', 'ロボ'][i], px + 26, py + 20);
      x.fillStyle = 'rgba(255,240,220,0.8)'; x.beginPath(); x.arc(px + 26, py + 66, 16, 0, 7); x.fill();
    }
  }, { wrap: true });
}

// ---------------------------------------------------------------- street furniture
export function noticeBoardTex() {
  return paintTex('notice', 512, 320, (x, w, h) => {
    const R = rng(31);
    x.fillStyle = '#b08a5a'; x.fillRect(0, 0, w, h);
    pixelNoise(x, w, h, 18, R);
    const flyers = [
      ['セメスタ市 お知らせ', 'Semesta City notice', '#fff7e0'],
      ['ロボバトル大会', 'Holo-table · Robo-dori', '#ffe1ea'],
      ['Rialo HQ 見学会', 'Open house — ask the guide', '#e6f1ff'],
      ['雨の日は足元注意', 'Slippery when wet', '#f0ffe6'],
      ['ごみ出し 月・木', 'Recycling Mon/Thu', '#fffde0'],
    ];
    flyers.forEach(([t, s, c], i) => {
      x.save();
      const px = 24 + (i % 3) * 162, py = 20 + Math.floor(i / 3) * 150;
      x.translate(px + 70, py + 64); x.rotate((R() - 0.5) * 0.1);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(-66, -58, 140, 128);
      x.fillStyle = c; x.fillRect(-70, -62, 140, 128);
      x.fillStyle = '#c22'; x.beginPath(); x.arc(0, -56, 5, 0, 7); x.fill();
      x.fillStyle = '#222'; x.textAlign = 'center';
      fitText(x, t, 124, 20, 900, JP); x.fillText(t, 0, -26);
      fitText(x, s, 124, 13, 600, LATIN); x.fillText(s, 0, 0);
      x.fillStyle = '#999'; for (let k = 0; k < 4; k++) x.fillRect(-56, 14 + k * 11, 112 - R() * 40, 4);
      x.restore();
    });
    x.strokeStyle = '#5a3b1c'; x.lineWidth = 16; x.strokeRect(0, 0, w, h);
  });
}

/** circle traffic sign helpers */
export function trafficSign(kind) {
  return paintTex('tsign:' + kind, 256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (kind === 'ped') { // blue square crosswalk sign
      x.fillStyle = '#fff'; x.fillRect(4, 4, 248, 248);
      x.fillStyle = '#1b5fc4'; x.fillRect(14, 14, 228, 228);
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(128, 34); x.lineTo(226, 206); x.lineTo(30, 206); x.closePath(); x.fill();
      x.fillStyle = '#111';
      x.beginPath(); x.arc(132, 94, 13, 0, 7); x.fill();
      x.lineWidth = 12; x.strokeStyle = '#111'; x.lineCap = 'round';
      x.beginPath(); x.moveTo(128, 110); x.lineTo(118, 150); x.lineTo(100, 186); x.moveTo(118, 150); x.lineTo(146, 186);
      x.moveTo(126, 120); x.lineTo(150, 140); x.moveTo(126, 120); x.lineTo(104, 136); x.stroke();
      x.fillStyle = '#111'; for (let i = 0; i < 5; i++) x.fillRect(66 + i * 26, 194, 14, 8);
    } else if (kind === 'tomare') { // red inverted triangle
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(8, 18); x.lineTo(248, 18); x.lineTo(128, 238); x.closePath(); x.fill();
      x.fillStyle = '#d8141e'; x.beginPath(); x.moveTo(24, 28); x.lineTo(232, 28); x.lineTo(128, 220); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.font = `900 52px ${JP}`; x.fillText('止まれ', 128, 84);
      x.font = `700 20px ${LATIN}`; x.fillText('STOP', 128, 126);
    } else if (kind === 'speed20') {
      x.fillStyle = '#fff'; x.beginPath(); x.arc(128, 128, 122, 0, 7); x.fill();
      x.strokeStyle = '#d8141e'; x.lineWidth = 26; x.beginPath(); x.arc(128, 128, 104, 0, 7); x.stroke();
      x.fillStyle = '#1b4bb0'; x.font = `800 112px ${LATIN}`; x.fillText('20', 128, 134);
    } else if (kind === 'pedonly') { // blue circle pedestrian only
      x.fillStyle = '#fff'; x.beginPath(); x.arc(128, 128, 122, 0, 7); x.fill();
      x.fillStyle = '#1b5fc4'; x.beginPath(); x.arc(128, 128, 112, 0, 7); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 14; x.lineCap = 'round';
      x.fillStyle = '#fff'; x.beginPath(); x.arc(100, 70, 14, 0, 7); x.fill(); x.beginPath(); x.arc(160, 82, 12, 0, 7); x.fill();
      x.beginPath(); x.moveTo(100, 90); x.lineTo(96, 140); x.lineTo(80, 186); x.moveTo(96, 140); x.lineTo(116, 186); x.moveTo(98, 100); x.lineTo(76, 128); x.moveTo(98, 100); x.lineTo(122, 124);
      x.moveTo(160, 100); x.lineTo(158, 140); x.lineTo(146, 180); x.moveTo(158, 140); x.lineTo(172, 180); x.stroke();
    } else if (kind === 'crossing') { // railway crossing X
      x.save(); x.translate(128, 128);
      for (const a of [0.7, -0.7]) {
        x.save(); x.rotate(a);
        x.fillStyle = '#111'; x.fillRect(-120, -22, 240, 44);
        x.fillStyle = '#f5c400'; for (let i = -120; i < 120; i += 48) x.fillRect(i, -18, 24, 36);
        x.restore();
      }
      x.restore();
    }
  });
}

/** pedestrian signal head: green walking figure lit */
export function pedSignalTex() {
  return paintTex('pedsig', 128, 256, (x, w, h) => {
    x.fillStyle = '#111'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2a0a0a'; x.beginPath(); x.arc(64, 64, 50, 0, 7); x.fill();
    const g = x.createRadialGradient(64, 192, 4, 64, 192, 56);
    g.addColorStop(0, '#9dffd8'); g.addColorStop(1, '#00a97a');
    x.fillStyle = g; x.beginPath(); x.arc(64, 192, 52, 0, 7); x.fill();
    x.fillStyle = '#0a3a2a';
    x.beginPath(); x.arc(64, 158, 9, 0, 7); x.fill();
    x.strokeStyle = '#0a3a2a'; x.lineWidth = 10; x.lineCap = 'round';
    x.beginPath(); x.moveTo(64, 172); x.lineTo(60, 200); x.lineTo(46, 226); x.moveTo(60, 200); x.lineTo(80, 224);
    x.moveTo(62, 180); x.lineTo(80, 196); x.moveTo(62, 180); x.lineTo(46, 196); x.stroke();
  });
}

/** 止まれ painted on asphalt (stretched along travel direction is done by the plane size) */
export function roadText(text = '止まれ') {
  return paintTex('road:' + text, 256, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(240,240,236,0.92)';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = [...text];
    const step = h / chars.length;
    x.save();
    x.scale(1, step / (w * 0.9));
    x.font = `900 ${w * 0.9}px ${JP}`;
    chars.forEach((ch, i) => x.fillText(ch, w / 2, (step * (i + 0.5)) / (step / (w * 0.9))));
    x.restore();
    // worn paint
    const R = rng(5);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.6})`; x.fillRect(R() * w, R() * h, 2 + R() * 5, 2 + R() * 5); }
    x.globalCompositeOperation = 'source-over';
  });
}

/** worn white road paint (tileable lines material) */
export function paintTexW() {
  return cached('paintw', () => {
    const [c, x] = makeCanvas(64, 256), R = rng(15);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 300; i++) { const v = 150 + R() * 100; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(R() * 64, R() * 256, 2 + R() * 4, 2 + R() * 6); }
    return repeatTex(c);
  });
}

// ---------------------------------------------------------------- Semesta / Rialo
export function semestaBanner() {
  return paintTex('semesta', 1024, 192, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#101a3a'); g.addColorStop(0.5, '#1c2c5c'); g.addColorStop(1, '#101a3a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#ffd36a'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff'; x.shadowColor = '#7fd8ff'; x.shadowBlur = 18;
    fitText(x, 'セメスタ市', w * 0.36, 86, 900, JP); x.fillText('セメスタ市', w * 0.26, h * 0.52);
    x.fillStyle = '#ffd36a'; x.shadowColor = '#ffb030';
    fitText(x, 'SEMESTA CITY', w * 0.42, 66, 800, LATIN); x.fillText('SEMESTA CITY', w * 0.72, h * 0.52);
    x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.6)';
    x.beginPath(); x.arc(w * 0.5, h * 0.5, 8, 0, 7); x.fill();
  });
}

export function kopiRialoSign() {
  return paintTex('kopi', 1024, 256, (x, w, h) => {
    x.fillStyle = '#2b1a12'; x.fillRect(0, 0, w, h);
    x.strokeStyle = RIALO_CREAM; x.lineWidth = 6; x.strokeRect(12, 12, w - 24, h - 24);
    x.shadowColor = '#ffcf8a'; x.shadowBlur = 16;
    paintRialoMark(x, h * 0.62, { x: 48, y: h * 0.19, bg: null, fg: RIALO_CREAM });
    x.fillStyle = RIALO_CREAM; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.font = `700 ${h * 0.4}px ${LATIN}`;
    x.fillText('Kopi Rialo', 48 + h * 0.75, h * 0.42);
    x.shadowBlur = 0;
    x.fillStyle = '#ffcf8a'; x.font = `700 ${h * 0.17}px ${JP}`;
    x.fillText('喫茶 · コーヒー · kopi susu', 52 + h * 0.75, h * 0.76);
  });
}

export function hqLobbyScreen() {
  return paintTex('hqscreen', 1024, 384, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#141414'); g.addColorStop(1, '#23211d');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(232,227,213,0.12)'; x.lineWidth = 1;
    for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    for (let j = 0; j < h; j += 32) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
    x.shadowColor = RIALO_CREAM; x.shadowBlur = 20;
    paintRialoMark(x, h * 0.5, { x: 60, y: h * 0.25, bg: null, fg: RIALO_CREAM });
    x.fillStyle = RIALO_CREAM; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.font = `700 ${h * 0.17}px ${LATIN}`;
    x.fillText('the real-world blockchain', 60 + h * 0.6, h * 0.44);
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(232,227,213,0.7)'; x.font = `500 ${h * 0.075}px ${LATIN}`;
    x.fillText('rialo.io  ·  Semesta City headquarters', 64 + h * 0.6, h * 0.64);
  });
}

export function hqBanner() {
  return paintTex('hqbanner', 256, 768, (x, w, h) => {
    x.fillStyle = RIALO_CREAM; x.fillRect(0, 0, w, h);
    paintRialoMark(x, w * 0.7, { x: w * 0.15, y: 60, bg: null, fg: RIALO_INK });
    x.fillStyle = RIALO_INK; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 46px ${LATIN}`;
    x.fillText('Get real,', w / 2, 420);
    x.fillText('on Rialo.', w / 2, 480);
    x.fillRect(w * 0.3, 560, w * 0.4, 4);
    x.font = `500 22px ${LATIN}`; x.fillText('rialo.io', w / 2, 610);
  });
}

export function hqPlaque() {
  return paintTex('hqplaque', 512, 640, (x, w, h) => {
    x.fillStyle = RIALO_CREAM; x.fillRect(0, 0, w, h);
    paintRialoMark(x, w * 0.62, { x: w * 0.19, y: 50, bg: null, fg: RIALO_INK });
    x.fillStyle = RIALO_INK; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 60px ${LATIN}`; x.fillText('Rialo HQ', w / 2, 470);
    x.font = `500 28px ${LATIN}`; x.fillText('Semesta City', w / 2, 530);
    x.fillText('リアロ本社', w / 2, 580);
  });
}

/** small "rialo" label text (Inter) on transparent — lowercase like the brand */
export function wordOnly(key, color = RIALO_CREAM, glow = null) {
  return rialoWordmark('wo' + key, 1024, 256, { bg: null, fg: color, withMark: false, glow });
}

export { RIALO_CREAM, RIALO_INK };
