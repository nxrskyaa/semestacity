// Title menu, settings / about-Rialo / credits / controls modals, pause menu. (Loading screen: ui/loading.js)
import { settings, saveSettings, t, STR, hasSave } from '../core/state.js';
import { audio } from '../core/audio.js';
import { rialoMarkDataURL } from '../gfx/rialoLogo.js';
import { SOURCES } from '../data/rialo.js';

const ui = () => document.getElementById('ui');
const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
let markURL = null;
export const markSrc = () => (markURL ||= rialoMarkDataURL(128, { margin: 0.08 }));

function modal(inner, { onClose, wide = false } = {}) {
  const wrap = h(`<div class="modal-wrap"><div class="modal" style="${wide ? 'width:min(760px,94vw)' : ''}">${inner}</div></div>`);
  const close = () => { wrap.remove(); audio.sfx('cancel'); onClose && onClose(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const esc = (e) => { if (e.code === 'Escape') { e.stopPropagation(); close(); removeEventListener('keydown', esc, true); } };
  addEventListener('keydown', esc, true);
  ui().appendChild(wrap);
  return { el: wrap, close };
}

export function openSettings({ onChange, onClose } = {}) {
  const seg = (key, vals) => `<div class="seg" data-key="${key}">${vals.map(([v, l]) => `<button data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const range = (key, min, max, step) => `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}">`;
  const m = modal(`
    <h2>${t(STR.settings)}</h2>
    <div class="row"><span>${t(STR.language)}</span>${seg('lang', [['en', 'English'], ['id', 'Bahasa Indonesia']])}</div>
    <div class="row"><span>${t(STR.graphics)}</span>${seg('quality', [['low', t(STR.low)], ['medium', t(STR.medium)], ['high', t(STR.high)]])}</div>
    <div class="row"><span>${t(STR.masterVol)}</span>${range('master', 0, 1, 0.05)}</div>
    <div class="row"><span>${t(STR.musicVol)}</span>${range('music', 0, 1, 0.05)}</div>
    <div class="row"><span>${t(STR.sfxVol)}</span>${range('sfx', 0, 1, 0.05)}</div>
    <div class="row"><span>${t(STR.sens)}</span>${range('sens', 0.3, 2.5, 0.1)}</div>
    <div class="row"><span>${t(STR.invertY)}</span>${seg('invertY', [['false', t(STR.off)], ['true', t(STR.on)]])}</div>
    <div class="actions"><button class="btn primary" data-close>${t(STR.close)}</button></div>`, { onClose });
  m.el.querySelectorAll('.seg').forEach((s) => s.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const key = s.dataset.key;
    let v = b.dataset.v;
    if (v === 'true' || v === 'false') v = v === 'true';
    settings[key] = v; saveSettings();
    s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    audio.sfx('blip');
    onChange && onChange(key, v);
    if (key === 'lang') { m.el.remove(); openSettings({ onChange, onClose }); }
  }));
  m.el.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
    settings[r.dataset.key] = +r.value; saveSettings();
    audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
    onChange && onChange(r.dataset.key, +r.value);
  }));
  return m;
}

/** controls reference (desktop keys + touch layout) */
export function openHelp({ onClose } = {}) {
  const id = settings.lang === 'id';
  const F = (en, idn) => (id ? idn : en);
  const touch = document.body.classList.contains('touch');
  const row = (k, d) => `<div class="krow"><span class="kc">${k}</span><span>${d}</span></div>`;
  const keys = [
    ['WASD', F('Move', 'Jalan')], ['SHIFT', F('Run (hold)', 'Lari (tahan)')], ['SPACE', F('Jump', 'Lompat')],
    ['E', F('Talk / interact', 'Ngobrol / interaksi')], ['MOUSE', F('Drag or click-lock to look', 'Drag / klik buat lihat sekitar')],
    ['Q / R', F('Turn camera', 'Putar kamera')], ['WHEEL', F('Zoom', 'Zoom')], ['P', F('Rialo Playground wallet', 'Dompet Rialo Playground')],
    ['H', F('Show / hide key strip', 'Tampil / sembunyi strip tombol')], ['ESC', F('Pause', 'Jeda')],
  ];
  const battle = [
    ['LMB / J', F('Shoot', 'Tembak')], ['RMB / K', F('Bomb', 'Bom')], ['E / Q', F('Pod', 'Pod')],
    ['SHIFT', F('Dash', 'Dash')], ['SPACE', F('Jump (air: dash)', 'Lompat (di udara: dash)')],
  ];
  const touchRows = [
    ['◐', F('Left side: drag anywhere for the joystick (push far to run)', 'Sisi kiri: geser di mana saja buat joystick (dorong jauh = lari)')],
    ['↔', F('Right side: swipe to look around', 'Sisi kanan: swipe buat lihat sekitar')],
    ['E', F('Big button: talk / interact (glows when something is near)', 'Tombol besar: ngobrol / interaksi (menyala kalau ada yang dekat)')],
    ['⤒ »', F('Jump · Run toggle', 'Lompat · Lari (toggle)')],
    ['☰', F('Menu: wallet, settings, save…', 'Menu: dompet, pengaturan, simpan…')],
  ];
  return modal(`
    <h2>${F('CONTROLS', 'KONTROL')}</h2>
    ${touch ? `<h3>${F('TOUCH', 'SENTUH')}</h3><div class="kgrid">${touchRows.map(([k, d]) => row(k, d)).join('')}</div>` : ''}
    <h3>${F('EXPLORE', 'JELAJAH')}</h3><div class="kgrid">${keys.map(([k, d]) => row(k, d)).join('')}</div>
    <h3>${F('HOLO-BATTLE', 'HOLO-BATTLE')}</h3><div class="kgrid">${battle.map(([k, d]) => row(k, d)).join('')}</div>
    <div class="actions"><button class="btn primary" data-close>${t(STR.close)}</button></div>`, { onClose, wide: true });
}

export function openAboutRialo({ onClose } = {}) {
  const id = settings.lang === 'id';
  const F = (en, idn) => (id ? idn : en);
  return modal(`
    <div class="about-head"><img alt="Rialo" src="${markSrc()}"><div>
      <h2 style="margin:0">${t(STR.aboutRialo)}</h2>
      <div style="color:var(--muted);font-size:13px;margin-top:4px">${F('"the real-world blockchain" · built by Subzero Labs', '"the real-world blockchain" · dibangun oleh Subzero Labs')}</div></div></div>
    <p>${F('Rialo is a decentralized, high-performance network designed to interact with real life: smart contracts that call the web, react on their own, keep secrets and know who you are — all built in.',
      'Rialo adalah jaringan terdesentralisasi berperforma tinggi yang dirancang untuk berinteraksi dengan dunia nyata: smart contract yang bisa memanggil web, bereaksi sendiri, menjaga rahasia, dan mengenali identitasmu — semuanya bawaan.')}</p>
    <div class="feat">
      <div><b>REAL WORLD DATA</b>${F('One-liner HTTPS calls from contracts — no oracle tax.', 'HTTPS call satu baris dari kontrak — tanpa oracle tax.')}</div>
      <div><b>REACTIVITY</b>${F('Reactive transactions fire on-chain — no watcher bots, no gas wars.', 'Transaksi reaktif jalan on-chain — tanpa bot pemantau, tanpa gas war.')}</div>
      <div><b>PROGRAMMABILITY</b>${F('Future / Promise / .await, timers & randomness. Powered by RISC-V.', 'Future / Promise / .await, timer & randomness. Ditenagai RISC-V.')}</div>
      <div><b>IDENTITY & PRIVACY</b>${F('Email, SMS or social login as your passport, 2FA, confidential execution.', 'Login email, SMS, atau sosmed sebagai paspor, 2FA, eksekusi rahasia.')}</div>
      <div><b>AGENT ECONOMY</b>${F('Native webcalls + A2A, native timers, and SCALE contracts for agent work.', 'Webcall bawaan + A2A, timer bawaan, dan kontrak SCALE untuk kerja agent.')}</div>
      <div><b>REAL-WORLD ASSETS</b>${F('Assets that subscribe to live data and react — "living instruments".', 'Aset yang berlangganan data live dan bereaksi — "living instruments".')}</div>
    </div>
    <h3>${F('SOURCES', 'SUMBER')}</h3>
    <ul>${SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.label}</a></li>`).join('')}</ul>
    <p style="font-size:12px;color:var(--muted)">${F('Semesta City is a fan-made community game built for Rialo. Not an official Rialo product.', 'Semesta City adalah game komunitas buatan fans untuk Rialo. Bukan produk resmi Rialo.')}</p>
    <div class="actions"><button class="btn primary" data-close>${t(STR.close)}</button></div>`, { onClose, wide: true });
}

export const TEAM = [
  { name: 'Nxrskyaa', role: { en: 'Game Developer', id: 'Game Developer' }, url: 'https://x.com/nxrskyaa', handle: '@nxrskyaa', avatar: '/brand/nxr.png' },
  { name: 'Baster', role: { en: 'Technical Game Developer', id: 'Technical Game Developer' }, url: 'https://x.com/Bas_Basterx', handle: '@Bas_Basterx' },
  { name: 'Dikzzy', role: { en: 'Game Tester & Bug Hunter', id: 'Game Tester & Bug Hunter' }, url: 'https://x.com/diikzzyy__', handle: '@diikzzyy__' },
];

export function openCredits({ onClose } = {}) {
  const id = settings.lang === 'id';
  return modal(`
    <div class="credits-head"><img class="semesta-logo sm" alt="SEMESTA" src="/brand/semesta-logo.png"></div>
    <h2>${t(STR.credits)}</h2>
    <h3>${id ? 'TIM' : 'THE TEAM'}</h3>
    <div class="team">${TEAM.map((m, i) => `
      <a class="member" href="${m.url}" target="_blank" rel="noopener">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <span class="av">${m.avatar ? `<img alt="" src="${m.avatar}">` : m.name[0]}</span>
        <span class="who"><b>${m.name}</b><small>${t(m.role)}</small></span>
        <span class="x">𝕏 ${m.handle}</span>
      </a>`).join('')}</div>
    <p>${id ? 'Semua model 3D, tekstur, musik, dan efek suara dibuat secara prosedural di dalam kode (three.js + WebAudio). Logo Semesta, banner Rialo Builder Hub, dan avatar NXR (Nxrskyaa) adalah karya tim.' : 'Every 3D model, texture, music track and sound effect is generated procedurally in code (three.js + WebAudio). The Semesta logo, the Rialo Builder Hub banner and the NXR avatar (Nxrskyaa) are the team’s own artwork.'}</p>
    <p style="font-size:12px;color:var(--muted)">${id ? 'Game komunitas, bukan produk resmi Rialo.' : 'A community game — not an official Rialo product.'}</p>
    <div class="rialo-badge" style="margin-top:10px"><img alt="" src="${markSrc()}">BUILD FOR RIALO</div>
    <div class="actions"><button class="btn primary" data-close>${t(STR.close)}</button></div>`, { onClose, wide: true });
}

/** Title screen over the live city. handlers: onNew, onContinue, onSettingsChange */
export function createTitle(handlers) {
  const el = h(`<div id="title">
    <div class="jp">セメスタ・シティ</div>
    <img class="semesta-logo" alt="SEMESTA" src="/brand/semesta-logo.png">
    <h1>CITY</h1>
    <div class="sub"></div>
    <div class="hint"></div>
    <div class="menu hidden"></div>
    <div class="foot"><span class="rialo-badge"><img alt="" src="${markSrc()}">BUILD FOR RIALO</span><span>v0.2 · Nxrskyaa · Baster · Dikzzy</span></div>
  </div>`);
  ui().appendChild(el);
  const menu = el.querySelector('.menu'), hint = el.querySelector('.hint'), sub = el.querySelector('.sub');
  let started = false, modalOpen = false;

  function render() {
    sub.textContent = t(STR.subtitle);
    hint.textContent = document.body.classList.contains('touch') ? t({ en: 'Tap anywhere to start', id: 'Ketuk di mana saja untuk mulai' }) : t(STR.clickStart);
    const items = [
      ['new', STR.newGame, STR.newGameSub],
      ['continue', STR.cont, STR.contSub, !hasSave()],
      ['settings', STR.settings],
      ['about', STR.aboutRialo],
      ['credits', STR.credits],
    ];
    menu.innerHTML = items.map(([id, l, s, dis]) => `<button class="mbtn" data-id="${id}" ${dis ? 'disabled' : ''}>${t(l)}${s ? `<small>${t(s)}</small>` : ''}</button>`).join('');
  }
  render();
  const start = () => {
    if (started) return;
    started = true;
    audio.unlock(); audio.setMusic('menu'); audio.sfx('chime');
    hint.classList.add('hidden'); menu.classList.remove('hidden');
  };
  el.addEventListener('pointerdown', start);
  const onKey = (e) => { if (!started && (e.code === 'Enter' || e.code === 'Space')) start(); };
  addEventListener('keydown', onKey);
  menu.addEventListener('mouseover', (e) => { if (e.target.closest('.mbtn:not(:disabled)')) audio.sfx('blip', { pitch: 1.3, volume: 0.5 }); });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('.mbtn'); if (!b || b.disabled || modalOpen) return;
    audio.sfx('confirm');
    const back = () => { modalOpen = false; render(); };
    switch (b.dataset.id) {
      case 'new': handlers.onNew(); break;
      case 'continue': handlers.onContinue(); break;
      case 'settings': modalOpen = true; openSettings({ onChange: handlers.onSettingsChange, onClose: back }); break;
      case 'about': modalOpen = true; openAboutRialo({ onClose: back }); break;
      case 'credits': modalOpen = true; openCredits({ onClose: back }); break;
    }
  });
  return {
    el,
    show() { el.classList.remove('hidden'); render(); },
    hide() { el.classList.add('hidden'); },
    dispose() { removeEventListener('keydown', onKey); el.remove(); },
  };
}

export function openPause({ onResume, onSave, onQuit, onSettingsChange }) {
  const el = h(`<div id="pause"><div class="inner">
    <h2>${t(STR.paused)}</h2>
    <button class="mbtn" data-id="resume">${t(STR.resume)}</button>
    <button class="mbtn" data-id="save">${t(STR.save)}</button>
    <button class="mbtn" data-id="settings">${t(STR.settings)}</button>
    <button class="mbtn" data-id="about">${t(STR.aboutRialo)}</button>
    <button class="mbtn" data-id="quit">${t(STR.quit)}</button>
  </div></div>`);
  ui().appendChild(el);
  let sub = false;
  const close = () => { el.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.code === 'Escape' && !sub) { e.stopPropagation(); close(); onResume(); } };
  addEventListener('keydown', onKey, true);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.mbtn'); if (!b || sub) return;
    audio.sfx('confirm');
    const back = () => { sub = false; };
    switch (b.dataset.id) {
      case 'resume': close(); onResume(); break;
      case 'save': onSave(); break;
      case 'settings': sub = true; openSettings({ onChange: onSettingsChange, onClose: back }); break;
      case 'about': sub = true; openAboutRialo({ onClose: back }); break;
      case 'quit': close(); onQuit(); break;
    }
  });
  return { close };
}

export function openCertificate({ name, score, onClose }) {
  return modal(`<div class="cert">
    <div class="seal"><img alt="Rialo" src="${markSrc()}"></div>
    <h2>${t(STR.certTitle)}</h2>
    <div style="font-size:22px;font-weight:800">${name.replace(/[<>&]/g, '')}</div>
    <div class="score">${score}/5</div>
    <p>${t(STR.certBody)}</p>
    <div class="actions" style="justify-content:center"><button class="btn primary" data-close>${t(STR.close)}</button></div>
  </div>`, { onClose });
}
