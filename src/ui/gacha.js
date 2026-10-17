// "Semesta Gacha" capsule-toy overlay: animated 2D gashapon machine, pull ×1 / ×10 paid with
// simulated $RIALO (src/systems/chain.js), reveal cards, pity counter, collection + equip.
//
//   const g = openGacha({ chain, save, lang, onEquip(item|null, slot), onClose, onNeedFunds });  g.close();
//   onEquip: core applies the cosmetic to the avatar (the gacha UI never touches the avatar).
//   onNeedFunds: called after the overlay closes when the player clicks "Open Rialo Playground…".
import './gacha.css';
import { rialoMarkDataURL } from '../gfx/rialoLogo.js';
import { settings } from '../core/state.js';
import { shortSig } from '../systems/chain.js';
import {
  ITEMS, RARITY, GACHA, SLOTS, RARITY_ORDER, ensureGachaSave, pullCost, rates, buyPulls, pityLeft,
  equip, unequip, collectionStats,
} from '../systems/gacha.js';
import { trapGameInput, sfx, fmtNum, fmtSecs, fmtCountdown } from './playground.js';
import { perkLines } from '../data/cosmetics.js';

const S = {
  title: { en: 'RIALO GACHA', id: 'RIALO GACHA' },
  sub: { en: 'Semesta capsule toys · paid with test $RIALO (simulated)', id: 'Mainan kapsul Semesta · bayar pakai $RIALO tes (simulasi)' },
  tabMachine: { en: 'Machine', id: 'Mesin' },
  tabCollection: { en: 'Collection', id: 'Koleksi' },
  balance: { en: 'BALANCE', id: 'SALDO' },
  pull1: { en: 'Pull ×1', id: 'Tarik ×1' },
  pull10: { en: 'Pull ×10', id: 'Tarik ×10' },
  save10: { en: 'SAVE 10%', id: 'HEMAT 10%' },
  pity: { en: 'Rare+ guaranteed within {n} pull(s)', id: 'Rare+ dijamin dalam {n} tarikan' },
  pityNext: { en: 'Next pull is a guaranteed Rare+!', id: 'Tarikan berikutnya pasti Rare+!' },
  rates: { en: 'DROP RATES', id: 'PELUANG' },
  items: { en: '{n} items', id: '{n} item' },
  rateNote: {
    en: 'Every {p}th pull without a Rare+ is guaranteed Rare+. Duplicates refund {r} $RIALO. Each pull earns +5 points.',
    id: 'Setiap tarikan ke-{p} tanpa Rare+ dijamin Rare+. Duplikat dapat refund {r} $RIALO. Tiap tarikan +5 poin.',
  },
  idle: { en: 'Insert $RIALO and turn the crank!', id: 'Masukkan $RIALO lalu putar engkolnya!' },
  signing: { en: 'Signing transaction…', id: 'Menandatangani transaksi…' },
  confirmed: { en: 'Confirmed in {s} · slot {slot} · {sig}', id: 'Terkonfirmasi dalam {s} · slot {slot} · {sig}' },
  refunded: { en: 'Dupe refund +{a} $RIALO confirmed', id: 'Refund duplikat +{a} $RIALO terkonfirmasi' },
  failed: { en: 'Transaction failed: {m}', id: 'Transaksi gagal: {m}' },
  broke: { en: 'Not enough $RIALO', id: '$RIALO tidak cukup' },
  brokeMsg: {
    en: 'This pull costs {c} $RIALO but your wallet holds {b}. Grab free test $RIALO from the daily faucet in the Rialo Playground!',
    id: 'Tarikan ini butuh {c} $RIALO tapi dompetmu cuma {b}. Ambil $RIALO tes gratis dari faucet harian di Rialo Playground!',
  },
  brokeCool: { en: 'Faucet refills in {t}. Quests (badges, battles, quiz) also pay $RIALO.', id: 'Faucet terisi lagi dalam {t}. Misi (badge, battle, kuis) juga memberi $RIALO.' },
  openPg: { en: 'Open Rialo Playground to claim faucet', id: 'Buka Rialo Playground untuk klaim faucet' },
  close: { en: 'Close', id: 'Tutup' },
  tapOpen: { en: 'Tap the capsule!', id: 'Ketuk kapsulnya!' },
  new: { en: 'NEW!', id: 'BARU!' },
  dupe: { en: 'Duplicate · +{r} $RIALO refund', id: 'Duplikat · refund +{r} $RIALO' },
  owned: { en: 'Owned ×{n}', id: 'Dimiliki ×{n}' },
  equipNow: { en: 'Equip now', id: 'Pakai sekarang' },
  equip: { en: 'Equip', id: 'Pakai' },
  equipped: { en: 'Equipped ✓', id: 'Dipakai ✓' },
  unequip: { en: 'Unequip', id: 'Lepas' },
  again1: { en: 'Pull again', id: 'Tarik lagi' },
  ok: { en: 'Nice!', id: 'Mantap!' },
  skip: { en: 'Skip ▸▸', id: 'Lewati ▸▸' },
  pity_hit: { en: 'PITY', id: 'PITY' },
  collected: { en: '{o}/{t} collected', id: '{o}/{t} terkumpul' },
  equippedNow: { en: 'EQUIPPED', id: 'DIPAKAI' },
  none: { en: '— none —', id: '— kosong —' },
  locked: { en: 'Locked', id: 'Terkunci' },
  history: { en: 'LAST PULLS', id: 'TARIKAN TERAKHIR' },
  t_headwear: { en: 'Headwear', id: 'Penutup kepala' },
  t_aura: { en: 'Aura', id: 'Aura' },
  t_umbrella: { en: 'Umbrella', id: 'Payung' },
  t_title: { en: 'Title', id: 'Gelar' },
  r_common: { en: 'Common', id: 'Common' }, r_rare: { en: 'Rare', id: 'Rare' }, r_epic: { en: 'Epic', id: 'Epic' }, r_legendary: { en: 'Legendary', id: 'Legendary' },
  keys: { en: 'Space: pull ×1 · Esc: close', id: 'Space: tarik ×1 · Esc: tutup' },
};

const CAPSULE_COLORS = ['#ff7eb6', '#5ee7ff', '#ffcf4a', '#b49cff', '#7ef0c0', '#ff9f5a', '#8fb6ff', '#ff6b6b'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stars = (r) => '★'.repeat(RARITY[r].stars) + '☆'.repeat(4 - RARITY[r].stars);
const rIdx = (r) => RARITY_ORDER.indexOf(r);

export function openGacha({ chain, save, lang, onEquip, onClose, onNeedFunds } = {}) {
  if (!chain || !save) throw new Error('openGacha: chain and save required');
  ensureGachaSave(save);
  const L = lang || settings.lang || 'en';
  const tr = (k, vars) => {
    const s = typeof k === 'string' ? S[k] : k;
    let out = s && typeof s === 'object' ? (s[L] ?? s.en) : String(s ?? '');
    if (vars) out = out.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
    return out;
  };
  const nameOf = (item) => (typeof item.name === 'object' ? item.name[L] ?? item.name.en : item.name);

  const root = document.createElement('div');
  root.className = 'gc';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Rialo Gacha');
  const mark = rialoMarkDataURL(64, { bg: null, fg: '#141414' });
  const markCream = rialoMarkDataURL(64, { bg: null, fg: '#e8e3d5' });
  root.innerHTML = `
  <div class="gc-win">
    <header class="gc-head">
      <div class="gc-titles"><span class="jp">ガチャ</span><h1>${tr('title')}</h1><small>${tr('sub')}</small></div>
      <nav class="gc-tabs">
        <button data-tab="machine" class="on">${tr('tabMachine')}</button>
        <button data-tab="collection">${tr('tabCollection')} <span data-f="collCount"></span></button>
      </nav>
      <div class="gc-balpill"><img src="${markCream}" alt=""><b data-f="bal">0</b><span>$RIALO</span></div>
      <button class="gc-x" data-act="close" title="${tr('close')} (Esc)">✕</button>
    </header>
    <section class="gc-pane gc-machine-pane" data-pane="machine">
      <div class="gc-stage">
        <div class="gc-machine" data-f="machine">
          <div class="gc-cap"><span>GACHA</span></div>
          <div class="gc-dome"><canvas data-f="dome"></canvas><div class="gc-glass"></div></div>
          <div class="gc-body">
            <div class="gc-plate"><img src="${mark}" alt="Rialo"><span>SEMESTA<br>CAPSULE</span></div>
            <div class="gc-price">${GACHA.costSingle} $RIALO</div>
            <div class="gc-coin"><i></i></div>
            <div class="gc-crank" data-f="crank"><div class="gc-crank-bar"></div><div class="gc-crank-hub"></div></div>
            <div class="gc-chute"><div class="gc-flap" data-f="flap"></div></div>
            <div class="gc-tray"></div>
            <div class="gc-drop" data-f="drop"><i class="t"></i><i class="b"></i></div>
          </div>
          <div class="gc-feet"></div>
        </div>
      </div>
      <div class="gc-side">
        <div class="gc-balance"><span class="k">${tr('balance')}</span><div><b data-f="bal2">0</b> <span>$RIALO</span></div></div>
        <div class="gc-status" data-f="status">${tr('idle')}</div>
        <div class="gc-buttons">
          <button class="gc-btn one" data-pull="1"><b>${tr('pull1')}</b><small>${GACHA.costSingle} $RIALO</small></button>
          <button class="gc-btn ten" data-pull="10"><em>${tr('save10')}</em><b>${tr('pull10')}</b><small>${GACHA.costTen} $RIALO</small></button>
        </div>
        <div class="gc-funds" data-f="funds" hidden>
          <b>${tr('broke')}</b><p data-f="fundsMsg"></p><p class="cool" data-f="fundsCool"></p>
          <button class="gc-btn pg" data-act="need-funds">${tr('openPg')} →</button>
        </div>
        <div class="gc-pity"><div class="lbl" data-f="pityLbl"></div><div class="bar"><i data-f="pityBar"></i></div></div>
        <div class="gc-rates">
          <span class="k">${tr('rates')}</span>
          <ul>${rates().map((r) => `<li style="--rc:${RARITY[r.rarity].color}"><i></i><span class="n">${tr('r_' + r.rarity)}</span>
            <span class="s">${stars(r.rarity)}</span><span class="c">${tr('items', { n: r.count })}</span><b>${+r.pct.toFixed(1)}%</b></li>`).join('')}</ul>
          <p>${tr('rateNote', { p: GACHA.pityRare, r: GACHA.dupeRefund })}</p>
        </div>
        <div class="gc-hist"><span class="k">${tr('history')}</span><div data-f="hist"></div></div>
        <p class="gc-keys">${tr('keys')}</p>
      </div>
    </section>
    <section class="gc-pane gc-coll" data-pane="collection" hidden></section>
    <div class="gc-reveal" data-f="reveal" hidden></div>
  </div>
  <div class="gc-flash" data-f="flash"></div>`;
  document.body.appendChild(root);
  const $ = (f) => root.querySelector(`[data-f="${f}"]`);

  let closed = false, busy = false, tab = 'machine', revealCtl = null;
  const untrap = trapGameInput(root, {
    onEscape: () => { if (revealCtl) revealCtl.key(); else close(); },
    onKey: (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      if (e.target?.tagName === 'BUTTON' && e.code === 'Enter') return; // native activation
      e.preventDefault();
      if (revealCtl) revealCtl.key();
      else if (tab === 'machine' && !busy && e.code === 'Space') doPull(1);
    },
  });

  // ---------------------------------------------------------------- dome physics (canvas)
  const dome = $('dome');
  const DW = 260, dpr = Math.min(2, window.devicePixelRatio || 1);
  dome.width = DW * dpr; dome.height = DW * dpr;
  const dctx = dome.getContext('2d');
  const balls = [];
  for (let i = 0; i < 17; i++) {
    const r = 20 + Math.random() * 6;
    const a = Math.random() * Math.PI * 2, d = Math.random() * 60;
    balls.push({ x: DW / 2 + Math.cos(a) * d, y: DW / 2 + 30 + Math.sin(a) * d * 0.5, vx: (Math.random() - 0.5) * 80, vy: 0, r, c: CAPSULE_COLORS[i % CAPSULE_COLORS.length], ang: Math.random() * 6 });
  }
  let shake = 0, kickT = 0, rafId = 0, lastT = performance.now();
  function physics(dt) {
    const cx = DW / 2, cy = DW / 2, R = DW / 2 - 8;
    for (const b of balls) {
      b.vy += 980 * dt;
      if (shake > 0) { b.vx += (Math.random() - 0.5) * 5200 * dt; b.vy -= Math.random() * 5200 * dt * (b.y > cy ? 1 : 0.3); }
      b.x += b.vx * dt; b.y += b.vy * dt; b.ang += (b.vx * dt) / b.r;
      const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) || 1;
      if (d + b.r > R) {
        const nx = dx / d, ny = dy / d;
        b.x = cx + nx * (R - b.r); b.y = cy + ny * (R - b.r);
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; }
        b.vx *= 0.985; b.vy *= 0.985;
      }
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d > 0 && d < min) {
        const nx = dx / d, ny = dy / d, o = (min - d) / 2;
        a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) { const j2 = -(1.4 * rv) / 2; a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny; }
      }
    }
  }
  function drawBall(b) {
    const g = dctx;
    g.save(); g.translate(b.x, b.y); g.rotate(b.ang);
    g.beginPath(); g.arc(0, 0, b.r, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#f6f2e9'; g.fillRect(-b.r, -b.r, b.r * 2, b.r * 2);
    g.fillStyle = b.c; g.fillRect(-b.r, -b.r, b.r * 2, b.r);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-b.r, -1.5, b.r * 2, 3);
    g.restore();
    g.save();
    const hl = g.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, 1, b.x - b.r * 0.2, b.y - b.r * 0.2, b.r);
    hl.addColorStop(0, 'rgba(255,255,255,.85)'); hl.addColorStop(0.35, 'rgba(255,255,255,.15)'); hl.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = hl; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(20,20,40,.45)'; g.stroke();
    g.restore();
  }
  function frame(t) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, (t - lastT) / 1000); lastT = t;
    if (tab !== 'machine' || document.hidden) return;
    kickT -= dt; shake = Math.max(0, shake - dt);
    if (kickT <= 0) { // idle: a random capsule hops so the machine feels alive
      kickT = 0.9 + Math.random() * 1.4;
      const b = balls[(Math.random() * balls.length) | 0];
      b.vy -= 260 + Math.random() * 260; b.vx += (Math.random() - 0.5) * 220;
    }
    physics(dt / 2); physics(dt / 2);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.clearRect(0, 0, DW, DW);
    for (const b of balls) drawBall(b);
  }
  rafId = requestAnimationFrame(frame);

  // ---------------------------------------------------------------- side panel renders
  let shownBal = chain.wallet.balance, balAnim = 0;
  function renderBalance(animate = true) {
    const target = chain.wallet.balance;
    cancelAnimationFrame(balAnim);
    const set = (v) => { $('bal').textContent = fmtNum(v); $('bal2').textContent = fmtNum(v); };
    if (!animate || Math.abs(target - shownBal) < 0.001) { shownBal = target; set(target); return; }
    const from = shownBal, t0 = performance.now();
    const pill = root.querySelector('.gc-balpill');
    pill.classList.remove('up', 'down'); void pill.offsetWidth; pill.classList.add(target > from ? 'up' : 'down');
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - k, 3);
      shownBal = from + (target - from) * e; set(shownBal);
      if (k < 1) balAnim = requestAnimationFrame(step);
    };
    balAnim = requestAnimationFrame(step);
  }
  function renderPity() {
    const left = pityLeft(save);
    $('pityLbl').textContent = left <= 1 ? tr('pityNext') : tr('pity', { n: left });
    $('pityBar').style.width = `${((GACHA.pityRare - left) / (GACHA.pityRare - 1)) * 100}%`;
    root.querySelector('.gc-pity').classList.toggle('hot', left <= 1);
  }
  function renderHist() {
    $('hist').innerHTML = save.gacha.history.slice(0, 12).map((h) => {
      const it = ITEMS.find((i) => i.id === h.id);
      return it ? `<span title="${esc(nameOf(it))}" style="--rc:${RARITY[h.rarity].color}">${it.icon}</span>` : '';
    }).join('');
  }
  function renderButtons() {
    const bal = chain.wallet.balance;
    for (const b of root.querySelectorAll('[data-pull]')) {
      const n = +b.dataset.pull;
      b.disabled = busy;
      b.classList.toggle('poor', bal + 1e-9 < pullCost(n));
    }
  }
  function renderCollCount() {
    const { owned, total } = collectionStats(save);
    $('collCount').textContent = `${owned}/${total}`;
  }
  function setStatus(html, kind = '') {
    const el = $('status');
    el.className = `gc-status ${kind}`;
    el.innerHTML = html;
  }

  // ---------------------------------------------------------------- not enough funds
  let fundsTimer = 0;
  function showFunds(cost) {
    const box = $('funds');
    box.hidden = false;
    $('fundsMsg').textContent = tr('brokeMsg', { c: fmtNum(cost), b: fmtNum(chain.wallet.balance) });
    const upd = () => {
      $('fundsCool').textContent = chain.faucet.canClaim() ? '' : tr('brokeCool', { t: fmtCountdown(chain.faucet.remainingMs()) });
    };
    upd(); clearInterval(fundsTimer); fundsTimer = setInterval(upd, 1000);
    box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  }
  function hideFunds() { $('funds').hidden = true; clearInterval(fundsTimer); }

  // ---------------------------------------------------------------- machine animations
  function crankAnim() {
    sfx('crank');
    shake = 1.1;
    const a = $('crank').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(380deg)', offset: 0.55 }, { transform: 'rotate(360deg)' }],
      { duration: 1150, easing: 'cubic-bezier(.45,.05,.35,1)' });
    $('machine').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px) rotate(-.6deg)' }, { transform: 'translateX(3px) rotate(.6deg)' }, { transform: 'translateX(0)' }],
      { duration: 260, iterations: 4 });
    return a.finished.catch(() => {});
  }
  function dropAnim(color) {
    const d = $('drop');
    d.style.setProperty('--cc', color);
    $('flap').animate([{ transform: 'rotateX(0)' }, { transform: 'rotateX(70deg)', offset: 0.3 }, { transform: 'rotateX(0)' }], { duration: 700 });
    sfx('capsule');
    const a = d.animate([
      { opacity: 0, transform: 'translate(0,-34px) rotate(0)' },
      { opacity: 1, transform: 'translate(0,0) rotate(40deg)', offset: 0.35 },
      { opacity: 1, transform: 'translate(10px,26px) rotate(120deg)', offset: 0.6 },
      { opacity: 1, transform: 'translate(16px,16px) rotate(160deg)', offset: 0.78 },
      { opacity: 1, transform: 'translate(20px,26px) rotate(200deg)' },
    ], { duration: 760, easing: 'ease-in', fill: 'forwards' });
    return a.finished.catch(() => {});
  }
  function burst(host, color, n = 22, spread = 160) {
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'gc-spark';
      const a = Math.random() * Math.PI * 2, d = spread * (0.45 + Math.random() * 0.75);
      p.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${Math.random() < 0.3 ? '#fff' : color};--s:${4 + Math.random() * 7}px;animation-delay:${Math.random() * 80}ms`;
      host.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }
  function flash(gold = true) {
    const f = $('flash');
    f.classList.remove('go', 'gold'); void f.offsetWidth;
    f.classList.add('go'); if (gold) f.classList.add('gold');
  }

  // gameplay perks of an item (src/data/cosmetics.js) — what the item actually DOES
  const perkHTML = (it) => {
    const lines = perkLines(it, L);
    return lines.length ? `<ul class="pk">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
  };

  // ---------------------------------------------------------------- reveal cards
  function cardHTML(r, { small = false } = {}) {
    const it = r.item, rc = RARITY[r.rarity].color;
    const eq = save.equipped[it.type] === it.id;
    return `<div class="gc-card ${r.rarity} ${small ? 'sm' : ''}" style="--rc:${rc}">
      ${r.pity ? `<span class="pity">${tr('pity_hit')}</span>` : ''}
      <span class="badge ${r.isNew ? 'new' : 'dup'}">${r.isNew ? tr('new') : `×${r.count}`}</span>
      <div class="icon">${it.icon}</div>
      <div class="rar">${tr('r_' + r.rarity)}</div>
      <div class="stars">${stars(r.rarity)}</div>
      <div class="nm">${esc(nameOf(it))}</div>
      <div class="ty">${tr('t_' + it.type)}</div>
      ${perkHTML(it)}
      ${!small ? `<div class="note">${r.isNew ? '' : tr('dupe', { r: GACHA.dupeRefund })}</div>
        ${eq ? `<div class="eqd">${tr('equipped')}</div>` : `<button class="gc-btn mini" data-equip="${it.id}">${tr('equipNow')}</button>`}` : ''}
    </div>`;
  }

  function reveal(results) {
    return new Promise((resolve) => {
      const host = $('reveal');
      host.hidden = false;
      const best = results.reduce((m, r) => (rIdx(r.rarity) > rIdx(m) ? r.rarity : m), 'common');
      host.className = `gc-reveal ${best}`;
      host.style.setProperty('--rc', RARITY[best].color);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        revealCtl = null;
        host.classList.add('closing');
        setTimeout(() => { host.hidden = true; host.innerHTML = ''; host.classList.remove('closing'); resolve(); }, 180);
      };
      const footer = (single) => `<div class="gc-rfoot">
        <button class="gc-btn ghost" data-r="again">${tr('again1')} ${single ? '×1' : '×10'}</button>
        <button class="gc-btn ok" data-r="ok">${tr('ok')}</button></div>`;
      const wire = (single) => {
        host.querySelector('[data-r="ok"]').onclick = () => { sfx('confirm'); finish(); };
        host.querySelector('[data-r="again"]').onclick = () => { sfx('confirm'); finish(); setTimeout(() => doPull(single ? 1 : 10), 320); };
      };

      if (results.length === 1) {
        const r = results[0];
        const rc = RARITY[r.rarity].color;
        host.innerHTML = `<div class="gc-rays"></div><div class="gc-rstage">
          <div class="gc-bigcap" style="--cc:${rc}"><i class="t"></i><i class="b"></i></div>
          <p class="gc-tap">${tr('tapOpen')}</p></div>`;
        const cap = host.querySelector('.gc-bigcap');
        let opened = false;
        const open = () => {
          if (opened) return; opened = true;
          clearTimeout(auto);
          cap.classList.add('pop');
          const stage = host.querySelector('.gc-rstage');
          burst(stage, rc, r.rarity === 'legendary' ? 46 : r.rarity === 'epic' ? 32 : 20, r.rarity === 'legendary' ? 260 : 180);
          if (r.rarity === 'legendary') { flash(true); sfx('legendary'); } else sfx('reveal', { pitch: 1 + rIdx(r.rarity) * 0.08 });
          host.classList.add('opened');
          setTimeout(() => {
            if (done) return;
            stage.insertAdjacentHTML('beforeend', `<div class="gc-single">${cardHTML(r)}</div>${footer(true)}`);
            stage.querySelector('.gc-tap')?.remove();
            cap.remove();
            wire(true);
            revealCtl = { key: finish };
          }, 380);
        };
        cap.onclick = open;
        const wobble = 2 + rIdx(r.rarity);
        cap.animate([{ transform: 'translateY(-60vh) scale(.6)' }, { transform: 'translateY(0) scale(1)', offset: 0.6 }, { transform: 'translateY(-18px) scale(1)', offset: 0.8 }, { transform: 'translateY(0) scale(1)' }],
          { duration: 650, easing: 'ease-in' }).finished.then(() => {
          if (!opened) cap.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(0)' }], { duration: 300, iterations: wobble });
        }).catch(() => {});
        const auto = setTimeout(open, 650 + 300 * wobble + 150);
        revealCtl = { key: open };
        return;
      }

      // ×10 grid, revealed one by one
      host.innerHTML = `<div class="gc-rays"></div><div class="gc-rstage multi">
        <div class="gc-grid">${results.map((r, i) => `<div class="gc-slot" data-i="${i}" style="--rc:${RARITY[r.rarity].color}">
          <div class="gc-mini-cap" style="--cc:${RARITY[r.rarity].color}"><i class="t"></i><i class="b"></i></div></div>`).join('')}</div>
        <div class="gc-rfoot"><button class="gc-btn ghost" data-r="skip">${tr('skip')}</button></div></div>`;
      let k = 0, timer = 0, legendaryShown = false;
      const flip = (i, quiet = false) => {
        const slot = host.querySelector(`.gc-slot[data-i="${i}"]`);
        if (!slot || slot.classList.contains('open')) return;
        const r = results[i];
        slot.innerHTML = cardHTML(r, { small: true });
        slot.classList.add('open', r.rarity);
        if (!quiet) burst(slot, RARITY[r.rarity].color, r.rarity === 'common' ? 8 : 16, 90);
        if (r.rarity === 'legendary' && !legendaryShown) { legendaryShown = true; flash(true); sfx('legendary'); }
        else if (!quiet) sfx('reveal', { volume: 0.7, pitch: 1 + rIdx(r.rarity) * 0.1 + i * 0.02 });
      };
      const showFooter = () => {
        clearTimeout(timer);
        const stage = host.querySelector('.gc-rstage');
        stage.querySelector('.gc-rfoot').outerHTML = footer(false);
        wire(false);
        revealCtl = { key: finish };
      };
      const next = () => {
        if (done) return;
        if (k >= results.length) { showFooter(); return; }
        flip(k++);
        timer = setTimeout(next, results[k - 1].rarity === 'legendary' ? 900 : 330);
      };
      const skipAll = () => {
        clearTimeout(timer);
        for (let i = 0; i < results.length; i++) flip(i, true);
        if (!legendaryShown) sfx('reveal');
        k = results.length; showFooter();
      };
      host.querySelector('[data-r="skip"]').onclick = skipAll;
      revealCtl = { key: skipAll };
      timer = setTimeout(next, 350);
    });
  }

  // ---------------------------------------------------------------- pull flow
  async function doPull(n) {
    if (busy || closed) return;
    const cost = pullCost(n);
    if (chain.wallet.balance + 1e-9 < cost) { sfx('cancel'); showFunds(cost); return; }
    hideFunds();
    busy = true; renderButtons();
    sfx('coin');
    root.querySelector('.gc-coin').classList.remove('in'); void root.offsetWidth; root.querySelector('.gc-coin').classList.add('in');
    setStatus(`<span class="spin"></span>${tr('signing')}`, 'pending');
    let res;
    try {
      res = await buyPulls(chain, save, n, {
        onSigned: (tx) => setStatus(`✓ ${tr('confirmed', { s: fmtSecs(tx.latencyMs), slot: fmtNum(tx.slot, 0), sig: `<span class="sig">${shortSig(tx.sig, 5, 5)}</span>` })}`, 'ok'),
      });
    } catch (e) {
      busy = false;
      if (closed) return;
      renderButtons();
      if (e.code === 'INSUFFICIENT_FUNDS') { sfx('cancel'); setStatus(tr('idle')); showFunds(cost); }
      else { sfx('cancel'); setStatus(tr('failed', { m: esc(e.message) }), 'err'); }
      return;
    }
    if (closed) return;
    renderPity(); renderHist(); renderCollCount();
    if (res.refundTx) {
      res.refundTx.then((tx) => { if (!closed) setStatus(`↺ ${tr('refunded', { a: fmtNum(tx.amount) })}`, 'ok'); }).catch(() => {});
    }
    await crankAnim();
    if (closed) return;
    const best = res.results.reduce((m, r) => (rIdx(r.rarity) > rIdx(m) ? r.rarity : m), 'common');
    await dropAnim(RARITY[best].color);
    if (closed) return;
    await wait(120);
    await reveal(res.results);
    $('drop').getAnimations().forEach((a) => a.cancel());
    busy = false;
    if (!closed) { renderButtons(); if (tab === 'collection') renderCollection(); }
  }

  // ---------------------------------------------------------------- collection
  function renderCollection() {
    const pane = root.querySelector('[data-pane="collection"]');
    const { owned, total } = collectionStats(save);
    const eqBox = SLOTS.map((slot) => {
      const it = ITEMS.find((i) => i.id === save.equipped[slot]);
      return `<div class="gc-eq ${it ? 'on' : ''}" style="--rc:${it ? RARITY[it.rarity].color : '#3a4a70'}">
        <span class="k">${tr('t_' + slot)}</span>
        <div class="v">${it ? `<span class="ic">${it.icon}</span><span>${esc(nameOf(it))}</span>` : `<span class="none">${tr('none')}</span>`}</div>
        ${it ? `<button class="gc-btn mini ghost" data-unequip="${slot}">${tr('unequip')}</button>` : ''}
      </div>`;
    }).join('');
    const groups = SLOTS.map((type) => {
      const list = ITEMS.filter((i) => i.type === type).sort((a, b) => rIdx(b.rarity) - rIdx(a.rarity));
      const have = list.filter((i) => save.inventory[i.id] > 0).length;
      return `<div class="gc-group"><h3>${tr('t_' + type)} <small>${have}/${list.length}</small></h3><div class="gc-items">${list.map((it) => {
        const n = save.inventory[it.id] | 0, eq = save.equipped[type] === it.id;
        return `<div class="gc-item ${n ? 'own' : 'lock'} ${eq ? 'eq' : ''} ${it.rarity}" style="--rc:${RARITY[it.rarity].color}">
          <div class="icon">${n ? it.icon : '?'}</div>
          <div class="stars">${stars(it.rarity)}</div>
          <div class="nm">${esc(nameOf(it))}</div>
          ${perkHTML(it)}
          ${n ? `<span class="cnt">×${n}</span>
            ${eq ? `<button class="gc-btn mini on" data-unequip="${type}">${tr('equipped')}</button>` : `<button class="gc-btn mini" data-equip="${it.id}">${tr('equip')}</button>`}`
          : `<span class="lk">🔒 ${tr('locked')}</span>`}
        </div>`;
      }).join('')}</div></div>`;
    }).join('');
    pane.innerHTML = `<div class="gc-coll-head"><b>${tr('collected', { o: owned, t: total })}</b>
      <div class="bar"><i style="width:${(owned / total) * 100}%"></i></div></div>
      <div class="gc-eqrow"><span class="k">${tr('equippedNow')}</span><div>${eqBox}</div></div>${groups}`;
  }

  function doEquip(id) {
    const item = equip(save, id);
    if (!item) return;
    sfx('confirm');
    try { onEquip?.(item, item.type); } catch (e) { console.error(e); }
    chain.emitChange?.();
    if (tab === 'collection') renderCollection();
    const b = root.querySelector(`.gc-reveal [data-equip="${id}"]`);
    if (b) b.outerHTML = `<div class="eqd">${tr('equipped')}</div>`;
  }
  function doUnequip(slot) {
    unequip(save, slot);
    sfx('cancel');
    try { onEquip?.(null, slot); } catch (e) { console.error(e); }
    chain.emitChange?.();
    renderCollection();
  }

  function setTab(t) {
    if (busy && t !== 'machine') return;
    tab = t;
    for (const b of root.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === t);
    for (const p of root.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== t;
    if (t === 'collection') renderCollection();
  }

  // ---------------------------------------------------------------- events
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.dataset.pull) { doPull(+b.dataset.pull); return; }
    if (b.dataset.tab) { sfx('blip'); setTab(b.dataset.tab); return; }
    if (b.dataset.equip) { doEquip(b.dataset.equip); return; }
    if (b.dataset.unequip) { doUnequip(b.dataset.unequip); return; }
    if (b.dataset.act === 'close') { close(); return; }
    if (b.dataset.act === 'need-funds') { sfx('confirm'); close(); onNeedFunds?.(); }
  });
  const offTx = chain.on('tx', () => { renderBalance(); renderButtons(); });
  const offCh = chain.on('change', () => { renderBalance(); renderButtons(); });

  renderBalance(false); renderPity(); renderHist(); renderButtons(); renderCollCount();
  sfx('door', { volume: 0.6 });
  requestAnimationFrame(() => root.classList.add('in'));

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(rafId); cancelAnimationFrame(balAnim);
    clearInterval(fundsTimer);
    offTx(); offCh(); untrap();
    revealCtl = null;
    sfx('cancel');
    root.classList.remove('in'); root.classList.add('out');
    setTimeout(() => root.remove(), 220);
    onClose?.();
  }

  return { close, root, pull: doPull, setTab, get busy() { return busy; }, get closed() { return closed; } };
}
