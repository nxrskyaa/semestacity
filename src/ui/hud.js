// Exploration HUD (Semesta-style layout, neon-night skin):
//   top-left  : plate (city · time/weather · name) with the $RIALO chip
//   left      : collapsible objective tracker (active quests only, done count, badges, gear perks)
//   top-right : minimap + clock / weather / sound strip
//   bottom    : contextual interact prompt (centre), compact key strip + ☰ MENU (right), tiny look hint
//   world     : screen-projected NPC name tags
// On touch screens the tracker starts folded, the key strip is hidden and the menu sits top-right.
import * as THREE from 'three';
import { settings, saveSettings, t, STR } from '../core/state.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = (en, id) => ({ en, id });

export const MENU_ITEMS = [
  { id: 'wallet', icon: '◈', label: L('Wallet', 'Dompet'), key: 'P' },
  { id: 'help', icon: '?', label: L('Controls', 'Kontrol') },
  { id: 'settings', icon: '⚙', label: L('Settings', 'Pengaturan') },
  { id: 'save', icon: '⤓', label: L('Save', 'Simpan') },
  { id: 'about', icon: '✦', label: L('About Rialo', 'Tentang Rialo') },
  { id: 'credits', icon: '♥', label: L('Credits', 'Kredit') },
  { id: 'quit', icon: '⏻', label: L('Quit to title', 'Ke judul'), cls: 'quit' },
];

const KEYSTRIP = [
  ['WASD', L('Move', 'Jalan')], ['SHIFT', L('Run', 'Lari')], ['SPACE', L('Jump', 'Lompat')],
  ['E', L('Talk', 'Bicara')], ['Q/R', L('Turn', 'Putar')], ['P', L('Wallet', 'Dompet')], ['ESC', L('Pause', 'Jeda')],
];

export function createHUD() {
  const touch = document.body.classList.contains('touch');
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="plate frame">
      <div class="pl-top"><span class="pl-city">SEMESTA CITY</span></div>
      <div class="pl-meta"></div>
      <div class="wallet-chip hidden"><img alt="" class="mk"><span class="bal">0</span><small>$RIALO</small><span class="kc">P</span></div>
    </div>
    <div class="quests frame">
      <button class="qhead"><span class="qt"></span><span class="qn"></span><span class="qcaret">▾</span></button>
      <div class="qbody"></div>
    </div>
    <div class="mapbox frame">
      <canvas id="minimap" width="300" height="300"></canvas>
      <div class="mapstrip"><span class="clock">--:--</span><span class="wx">☂</span><button class="snd" title="Sound">♪</button></div>
    </div>
    <div class="keystrip"></div>
    <button class="menubtn frame">☰ <span>MENU</span></button>
    <div class="menupop frame"></div>
    <div class="prompt hidden"></div>
    <div class="lockhint hidden"></div>
    <div class="tags"></div>`;
  document.getElementById('ui').appendChild(root);
  let toasts = document.getElementById('toasts');
  if (!toasts) { toasts = document.createElement('div'); toasts.id = 'toasts'; document.body.appendChild(toasts); }

  const $ = (s) => root.querySelector(s);
  const meta = $('.pl-meta'), quests = $('.quests'), qhead = $('.qhead'), qbody = $('.qbody');
  const keys = $('.keystrip'), prompt = $('.prompt'), lockhint = $('.lockhint'), tags = $('.tags');
  const menuBtn = $('.menubtn'), menuPop = $('.menupop');
  const mm = $('#minimap'), mctx = mm.getContext('2d');
  const tagEls = new Map();
  const v = new THREE.Vector3();
  let mapBase = null, mapInfo = null;
  let lastObj = null;
  let lockTimer = null;

  // ---- objective tracker (header doubles as the fold toggle; phones start folded)
  let folded = settings.questsFolded ?? touch;
  const applyFold = () => {
    quests.classList.toggle('folded', folded);
    $('.qcaret').textContent = folded ? '▸' : '▾';
  };
  qhead.addEventListener('click', () => { folded = !folded; settings.questsFolded = folded; saveSettings(); applyFold(); });
  applyFold();

  // ---- menu popup
  function renderMenu() {
    menuPop.innerHTML = `<div class="mp-title">${t(L('MENU', 'MENU'))}</div>` + MENU_ITEMS.map((m) =>
      `<button class="mtile ${m.cls || ''}" data-id="${m.id}"><span class="mi">${m.icon}</span><span class="ml">${t(m.label)}</span>${m.key && !touch ? `<small>${m.key}</small>` : ''}</button>`).join('');
  }
  const closeMenu = () => { menuPop.classList.remove('show'); menuBtn.classList.remove('on'); };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !menuPop.classList.contains('show');
    if (on) renderMenu();
    menuPop.classList.toggle('show', on); menuBtn.classList.toggle('on', on);
    api.onMenuToggle?.(on);
  });
  menuPop.addEventListener('click', (e) => {
    const b = e.target.closest('.mtile'); if (!b) return;
    closeMenu();
    api.onMenu?.(b.dataset.id);
  });
  addEventListener('pointerdown', (e) => { if (menuPop.classList.contains('show') && !e.target.closest('.menupop,.menubtn')) closeMenu(); });

  $('.snd').addEventListener('click', () => api.onSound?.());
  $('.wallet-chip').addEventListener('click', () => api.onMenu?.('wallet'));
  $('.wallet-chip').style.cursor = 'pointer';

  function renderKeys() {
    keys.classList.toggle('hidden', !settings.showKeys || touch);
    keys.innerHTML = KEYSTRIP.map(([k, l]) => `<span><span class="kc">${k}</span>${t(l)}</span>`).join('');
    if (lastObj) api.setObjectives(...lastObj);
  }

  const api = {
    root,
    onMenu: null, onMenuToggle: null, onSound: null,
    get menuOpen() { return menuPop.classList.contains('show'); },
    closeMenu,
    setMeta(text) { if (meta.textContent !== text) meta.textContent = text; },
    setClock(text, raining = true) {
      const c = $('.clock'), w = $('.wx'), ic = raining ? '☂' : '⌂';
      if (c.textContent !== text) c.textContent = text;
      if (w.textContent !== ic) { w.textContent = ic; w.title = raining ? 'Rain' : 'Under a roof'; }
    },
    setSound(on) { $('.snd').classList.toggle('muted', !on); $('.snd').textContent = on ? '♪' : '✕'; },
    /** list: [{text, done}], badges: [{icon, name, got}], gear: [{icon, lines}] */
    setObjectives(list, badges, gear = []) {
      lastObj = [list, badges, gear];
      const done = list.filter((q) => q.done).length;
      $('.qt').textContent = t(STR.objective);
      $('.qn').textContent = `${done}/${list.length}`;
      const active = list.filter((q) => !q.done);
      qbody.innerHTML =
        (active.length
          ? active.map((q, i) => `<div class="q ${i === 0 ? 'cur' : ''}"><i>${i === 0 ? '▶' : '◇'}</i><span>${esc(q.text)}</span></div>`).join('')
          : `<div class="q alldone"><i>✓</i><span>${t(L('All done — enjoy the city!', 'Semua beres — nikmati kotanya!'))}</span></div>`) +
        `<div class="badges">${badges.map((b) => `<span class="${b.got ? 'got' : ''}" title="${esc(t(b.name))}">${b.icon}</span>`).join('')}</div>` +
        (gear.length ? `<div class="gear">${gear.map((g) => `<div class="g"><b>${g.icon}</b><span>${g.lines.map(esc).join(' · ')}</span></div>`).join('')}</div>` : '');
    },
    renderKeys,
    prompt(text) {
      api.onPrompt?.(text);
      if (!text) { prompt.classList.add('hidden'); prompt.dataset.t = ''; return; }
      if (prompt.dataset.t === text && !prompt.classList.contains('hidden')) return;
      prompt.dataset.t = text;
      prompt.innerHTML = `${touch ? '' : '<span class="kc">E</span>'}<span>${esc(text)}</span>`;
      prompt.classList.remove('hidden');
    },
    /** $RIALO balance pill (null hides it) */
    setWallet(balance, markUrl) {
      const chip = root.querySelector('.wallet-chip');
      if (balance == null) { chip.classList.add('hidden'); return; }
      chip.classList.remove('hidden');
      const img = chip.querySelector('.mk');
      if (markUrl && !img.src) img.src = markUrl;
      const b = chip.querySelector('.bal');
      const txt = (Math.round(balance * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
      if (b.textContent !== txt) { b.textContent = txt; chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
    },
    /** short "drag to look" hint; fades on its own */
    lockHint(show) {
      clearTimeout(lockTimer);
      if (touch || !show) { lockhint.classList.add('hidden'); return; }
      lockhint.textContent = t(STR.clickLook);
      lockhint.classList.remove('hidden');
      lockTimer = setTimeout(() => lockhint.classList.add('hidden'), 6000);
    },
    toast(html, kind = '') {
      const d = document.createElement('div');
      d.className = `toast ${kind}`;
      d.innerHTML = html;
      toasts.appendChild(d);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => d.remove(), 4100);
    },
    /** tags: [{id, name, sub, pos:Vector3, bang}] */
    updateTags(list, camera) {
      const seen = new Set();
      for (const it of list) {
        seen.add(it.id);
        let el = tagEls.get(it.id);
        if (!el) { el = document.createElement('div'); el.className = 'nametag'; tags.appendChild(el); tagEls.set(it.id, el); el._k = ''; }
        v.copy(it.pos).project(camera);
        const d = camera.position.distanceTo(it.pos);
        // behind a wall: fade out instead of drawing through it
        el._a = Math.max(0, Math.min(1, (el._a ?? 1) + (it.occ ? -0.2 : 0.2)));
        const vis = v.z < 1 && d < 16 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && el._a > 0;
        el.style.display = vis ? '' : 'none';
        if (!vis) continue;
        const k = `${it.name}|${it.sub}|${it.bang}`;
        if (el._k !== k) { el._k = k; el.innerHTML = `${it.bang ? '<span class="bang">!</span>' : ''}${esc(it.name)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}`; }
        el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
        el.style.opacity = String(Math.max(0, Math.min(1, (16 - d) / 5)) * el._a);
      }
      for (const [id, el] of tagEls) if (!seen.has(id)) { el.remove(); tagEls.delete(id); }
    },
    /** bake the static minimap background from collision boxes */
    setMap(collision, bounds) {
      const pad = 4;
      const w = bounds.maxX - bounds.minX + pad * 2, d = bounds.maxZ - bounds.minZ + pad * 2;
      const S = 4; // px per meter
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * S); c.height = Math.ceil(d * S);
      const x = c.getContext('2d');
      x.fillStyle = '#121a38'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#26345f';
      x.fillRect(pad * S, pad * S, (bounds.maxX - bounds.minX) * S, (bounds.maxZ - bounds.minZ) * S);
      x.fillStyle = '#4a5c92';
      for (const b of collision.boxes) {
        if (b.maxY < 0.6) continue;
        x.fillRect((b.minX - bounds.minX + pad) * S, (b.minZ - bounds.minZ + pad) * S, (b.maxX - b.minX) * S, (b.maxZ - b.minZ) * S);
      }
      mapBase = c; mapInfo = { bounds, pad, S };
    },
    /** markers: [{x,z,color,size,label}] */
    updateMap(player, yaw, markers) {
      if (!mapBase) return;
      const { bounds, pad, S } = mapInfo;
      const W = mm.width, R = W / 2, zoom = 1.5;
      mctx.save();
      mctx.clearRect(0, 0, W, W);
      mctx.fillStyle = '#0c1228'; mctx.fillRect(0, 0, W, W);
      mctx.translate(R, R);
      mctx.rotate(yaw);
      mctx.scale(zoom, zoom);
      mctx.translate(-(player.x - bounds.minX + pad) * S, -(player.z - bounds.minZ + pad) * S);
      mctx.drawImage(mapBase, 0, 0);
      for (const m of markers) {
        const mx = (m.x - bounds.minX + pad) * S, mz = (m.z - bounds.minZ + pad) * S;
        mctx.fillStyle = m.color;
        mctx.beginPath(); mctx.arc(mx, mz, (m.size || 2.2) * S / zoom * 1.4, 0, Math.PI * 2); mctx.fill();
        if (m.label) {
          mctx.save(); mctx.translate(mx, mz); mctx.rotate(-yaw);
          mctx.font = '800 12px Inter, sans-serif'; mctx.textAlign = 'center';
          mctx.lineWidth = 3; mctx.strokeStyle = 'rgba(6,10,24,.9)'; mctx.strokeText(m.label, 0, -10);
          mctx.fillStyle = '#e8e3d5'; mctx.fillText(m.label, 0, -10);
          mctx.restore();
        }
      }
      mctx.restore();
      // player arrow (always up) + north tick
      mctx.fillStyle = '#5ee7ff';
      mctx.beginPath(); mctx.moveTo(R, R - 12); mctx.lineTo(R + 9, R + 9); mctx.lineTo(R, R + 3); mctx.lineTo(R - 9, R + 9); mctx.closePath(); mctx.fill();
      const nx = R + Math.sin(-yaw) * (R - 16), ny = R - Math.cos(-yaw) * (R - 16);
      mctx.font = '800 16px Orbitron, sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
      mctx.fillStyle = '#ffcf4a'; mctx.fillText('N', nx, ny);
    },
    show(on) { root.classList.toggle('hidden', !on); if (!on) closeMenu(); },
    dispose() { root.remove(); },
  };
  renderKeys();
  return api;
}
