// Cinematic loading screen: a hand-drawn (canvas 2D) rainy neon skyline with parallax layers, flickering
// signs, rain and puddle reflections behind the Semesta logo; a segmented progress bar that eases toward the
// real boot progress, stage labels, rotating tips, and an outro (logo pulse + fade) once everything is in.
// createLoading() -> { stage(label, pct), progress(pct), done(): Promise }
import { t } from '../core/state.js';
import { TIPS } from '../data/rialo.js';
import { rialoMarkDataURL } from '../gfx/rialoLogo.js';

const SEGS = 24;
const MIN_SHOW_MS = 2600;          // keep the intro on screen long enough to read as a moment, not a flash

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t2 = Math.imul(a ^ (a >>> 15), 1 | a); t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2; return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296; }; }

function makeSkyline(seed, w, h, { base, top, color, winColor, winP, signs }) {
  const r = mulberry(seed);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const blds = [];
  let px = -20;
  while (px < w + 20) {
    const bw = 40 + r() * 90, bh = base + r() * (top - base);
    blds.push({ x: px, w: bw, h: bh });
    px += bw + r() * 6;
  }
  for (const b of blds) {
    x.fillStyle = color;
    x.fillRect(b.x, h - b.h, b.w, b.h);
    // rooftop details
    if (r() < 0.4) x.fillRect(b.x + b.w * 0.2, h - b.h - 8 - r() * 10, 4, 18);
    // windows
    for (let wy = h - b.h + 10; wy < h - 14; wy += 11) {
      for (let wx = b.x + 6; wx < b.x + b.w - 8; wx += 9) {
        if (r() < winP) { x.fillStyle = winColor[Math.floor(r() * winColor.length)]; x.globalAlpha = 0.35 + r() * 0.6; x.fillRect(wx, wy, 4, 5); x.globalAlpha = 1; }
      }
    }
  }
  const sg = [];
  for (let i = 0; i < signs; i++) {
    const b = blds[Math.floor(r() * blds.length)];
    const vertical = r() < 0.55;
    sg.push({ x: b.x + b.w * (0.2 + r() * 0.5), y: h - b.h * (0.35 + r() * 0.5), vertical, len: 30 + r() * 40,
      col: ['#5ee7ff', '#ff5fa2', '#ffcf4a', '#9b7bff', '#57e39f'][Math.floor(r() * 5)], ph: r() * 10, flick: r() < 0.3 });
  }
  return { canvas: c, signs: sg };
}

export function createLoading() {
  const el = document.createElement('div');
  el.id = 'loading';
  const mark = rialoMarkDataURL(64, { margin: 0.08 });
  el.innerHTML = `
    <canvas class="ld-bg"></canvas>
    <div class="ld-vignette"></div>
    <div class="ld-center">
      <div class="jp">セメスタ・シティ</div>
      <img class="semesta-logo" alt="SEMESTA" src="/brand/semesta-logo.png">
      <div class="city">CITY</div>
      <div class="ld-sub">RAINY NIGHT · RIALO EDITION</div>
    </div>
    <div class="ld-bottom">
      <div class="ld-stage"><span class="lbl">…</span><span class="pct">0%</span></div>
      <div class="ld-bar">${'<i></i>'.repeat(SEGS)}</div>
      <div class="ld-tip"><b>TIP</b><span></span></div>
    </div>
    <div class="rialo-badge"><img alt="" src="${mark}">BUILD FOR RIALO</div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('.ld-bg'), cx = cv.getContext('2d');
  const segs = [...el.querySelectorAll('.ld-bar i')];
  const lbl = el.querySelector('.ld-stage .lbl'), pctEl = el.querySelector('.ld-stage .pct');
  const tipEl = el.querySelector('.ld-tip span');
  const t0 = performance.now();
  let target = 0, shown = 0, running = true, outro = 0;

  // ---- tips: rotate every 4 s
  let tipI = Math.floor(Math.random() * TIPS.length);
  const showTip = () => { tipEl.classList.remove('in'); void tipEl.offsetWidth; tipEl.textContent = t(TIPS[tipI % TIPS.length]); tipEl.classList.add('in'); tipI++; };
  showTip();
  const tipTimer = setInterval(showTip, 4000);

  // ---- background scene
  let W = 0, H = 0, layers = null, drops = [];
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lw = Math.max(1400, W * 1.6);
    layers = [
      { ...makeSkyline(7, lw, H, { base: H * 0.14, top: H * 0.33, color: '#141b3c', winColor: ['#3b4f8f', '#5b6fb0'], winP: 0.18, signs: 3 }), speed: 6, y: -H * 0.08 },
      { ...makeSkyline(21, lw, H, { base: H * 0.1, top: H * 0.26, color: '#0d1330', winColor: ['#ffd88a', '#9fd8ff', '#ffb0d0'], winP: 0.22, signs: 6 }), speed: 14, y: -H * 0.03 },
      { ...makeSkyline(42, lw, H, { base: H * 0.06, top: H * 0.17, color: '#070b1e', winColor: ['#ffe1a0', '#7fe0ff'], winP: 0.16, signs: 7 }), speed: 26, y: 0 },
    ];
    drops = Array.from({ length: Math.round(W * H / 5200) }, () => ({ x: Math.random() * W, y: Math.random() * H, l: 10 + Math.random() * 18, s: 600 + Math.random() * 500 }));
  }
  resize();
  addEventListener('resize', resize);

  let last = t0;
  function draw(now) {
    if (!running) return;
    requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const T = (now - t0) / 1000;
    // sky
    const g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1030'); g.addColorStop(0.55, '#1a2556'); g.addColorStop(0.72, '#2b2a5e'); g.addColorStop(1, '#070a18');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    // moon glow behind the clouds
    const mg = cx.createRadialGradient(W * 0.78, H * 0.2, 4, W * 0.78, H * 0.2, H * 0.35);
    mg.addColorStop(0, 'rgba(200,215,255,.35)'); mg.addColorStop(1, 'rgba(200,215,255,0)');
    cx.fillStyle = mg; cx.fillRect(0, 0, W, H);
    // skyline layers (slow pan) + neon signs
    const horizon = H * 0.74;
    for (const L of layers) {
      const lw = L.canvas.width;
      const off = -((T * L.speed) % lw);
      for (let k = 0; k < 2; k++) {
        const ox = off + k * lw;
        cx.drawImage(L.canvas, ox, L.y - (H - horizon));
        for (const s of L.signs) {
          let a = 0.75 + 0.25 * Math.sin(T * 3 + s.ph);
          if (s.flick && Math.sin(T * 13 + s.ph * 7) > 0.92) a = 0.15;
          cx.save();
          cx.globalAlpha = a; cx.shadowColor = s.col; cx.shadowBlur = 14; cx.fillStyle = s.col;
          const sx = ox + s.x, sy = L.y - (H - horizon) + s.y;
          if (s.vertical) cx.fillRect(sx, sy, 6, s.len); else cx.fillRect(sx, sy, s.len, 6);
          cx.restore();
        }
      }
    }
    // wet street + reflections
    const sg = cx.createLinearGradient(0, horizon, 0, H);
    sg.addColorStop(0, '#0c1230'); sg.addColorStop(1, '#04060f');
    cx.fillStyle = sg; cx.fillRect(0, horizon, W, H - horizon);
    cx.save();
    cx.globalAlpha = 0.22; cx.translate(0, horizon * 2); cx.scale(1, -1);
    for (const L of layers.slice(1)) {
      const lw = L.canvas.width, off = -((T * L.speed) % lw);
      for (let k = 0; k < 2; k++) cx.drawImage(L.canvas, off + k * lw, L.y - (H - horizon));
    }
    cx.restore();
    // ripple lines on the road
    cx.strokeStyle = 'rgba(160,190,255,.08)'; cx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = horizon + 10 + i * i * 4 + (T * 8) % 4;
      cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke();
    }
    // rain
    cx.strokeStyle = 'rgba(190,215,255,.32)'; cx.lineWidth = 1.1;
    cx.beginPath();
    for (const d of drops) {
      d.y += d.s * dt; d.x -= d.s * dt * 0.12;
      if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 80); }
      cx.moveTo(d.x, d.y); cx.lineTo(d.x + d.l * 0.12, d.y - d.l);
    }
    cx.stroke();
    // progress easing + segments
    shown += (target - shown) * Math.min(1, dt * 5);
    const lit = Math.round(shown * SEGS);
    for (let i = 0; i < SEGS; i++) segs[i].classList.toggle('on', i < lit);
    pctEl.textContent = `${Math.round(shown * 100)}%`;
    if (outro) {
      outro += dt;
      el.style.setProperty('--outro', String(Math.min(1, outro / 0.9)));
    }
  }
  requestAnimationFrame(draw);
  requestAnimationFrame(() => el.classList.add('in'));

  return {
    stage(label, pct) { lbl.textContent = label; if (pct != null) target = Math.max(target, pct); },
    progress(pct) { target = Math.max(target, pct); },
    /** resolves when the outro has played (call once everything is loaded) */
    async done() {
      target = 1;
      const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - t0));
      await new Promise((r) => setTimeout(r, wait + 350));
      lbl.textContent = t({ en: 'Welcome to Semesta City', id: 'Selamat datang di Semesta City' });
      el.classList.add('out'); outro = 0.001;
      await new Promise((r) => setTimeout(r, 900));
      running = false;
      clearInterval(tipTimer);
      removeEventListener('resize', resize);
      el.classList.add('fade');
      setTimeout(() => el.remove(), 900);
    },
  };
}
