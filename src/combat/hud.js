// Battle HUD (DOM, inside #battle-hud): mirrored HP bars with lagging damage trail, VS badge,
// pilot names, GUN/BOMB/POD cooldown rings, lock-on reticle, world-space damage numbers,
// READY/GO/VICTORY/DEFEAT banners, controls card and result card (with the Rialo mark).
import './battle.css';
import { rialoMarkDataURL } from '../gfx/rialoLogo.js';

const RING_C = 2 * Math.PI * 17;

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function createHUD({ p1Label, p2Label, playerName, rivalName, maxHp = 1000 }) {
  const root = document.createElement('div');
  root.id = 'battle-hud';
  const ring = (id, label, key) => `
    <div class="bh-ring" data-w="${id}">
      <svg viewBox="0 0 40 40"><circle class="bh-ring-bg" cx="20" cy="20" r="17"/>
        <circle class="bh-ring-fg" cx="20" cy="20" r="17" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0"/></svg>
      <div class="bh-ring-key">${key}</div>
      <div class="bh-ring-label">${label}</div>
    </div>`;
  const side = (cls, label, pilot) => `
    <div class="bh-side ${cls}">
      <div class="bh-head"><span class="bh-robot">${esc(label)}</span><span class="bh-hpnum">${maxHp}</span></div>
      <div class="bh-bar"><div class="bh-bar-in"><div class="bh-trail"></div><div class="bh-fill"></div><div class="bh-sheen"></div></div></div>
      <div class="bh-pilot"><span>PILOT</span> ${esc(pilot)}</div>
    </div>`;
  root.innerHTML = `
    <div class="bh-top">
      ${side('bh-p1', p1Label, playerName)}
      <div class="bh-vs"><span>VS</span></div>
      ${side('bh-p2', p2Label, rivalName)}
    </div>
    <div class="bh-rings">${ring('gun', 'GUN', 'LMB')}${ring('bomb', 'BOMB', 'RMB')}${ring('pod', 'POD', 'E')}</div>
    <div class="bh-reticle"><i></i><i></i><i></i><i></i><b></b></div>
    <div class="bh-dmg-layer"></div>
    <div class="bh-banner"><div class="bh-banner-text"></div></div>
    <div class="bh-result">
      <div class="bh-result-stats"></div>
      <div class="bh-chain"><img alt="" src="${rialoMarkDataURL(64, { bg: null, fg: '#e8e3d5' })}"><span>ON-CHAIN SCORE VERIFIED</span></div>
    </div>
    <div class="bh-controls">
      <div class="bh-controls-title">HOLO BATTLE</div>
      <div class="bh-c-row"><span class="bh-chip">W</span><span class="bh-chip">A</span><span class="bh-chip">S</span><span class="bh-chip">D</span><em>Move</em></div>
      <div class="bh-c-row"><span class="bh-chip wide">SPACE</span><em>Jump · Air dash</em></div>
      <div class="bh-c-row"><span class="bh-chip wide">SHIFT</span><em>Dash</em></div>
      <div class="bh-c-row"><span class="bh-chip">LMB</span><em>Gun</em></div>
      <div class="bh-c-row"><span class="bh-chip">RMB</span><em>Bomb</em></div>
      <div class="bh-c-row"><span class="bh-chip">E</span><span class="bh-chip">Q</span><em>Pod</em></div>
    </div>
    <div class="bh-flash"></div>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  $('.bh-p1').appendChild($('.bh-rings')); // rings sit under the P1 bar
  const bars = ['.bh-p1', '.bh-p2'].map((s) => {
    const el = $(s);
    return { el, fill: el.querySelector('.bh-fill'), trail: el.querySelector('.bh-trail'), num: el.querySelector('.bh-hpnum'),
      hp: maxHp, shown: maxHp, trailV: maxHp, trailDelay: 0, numShown: maxHp };
  });
  const rings = {};
  for (const id of ['gun', 'bomb', 'pod']) {
    const el = root.querySelector(`.bh-ring[data-w="${id}"]`);
    rings[id] = { el, fg: el.querySelector('.bh-ring-fg'), v: -1, ready: null };
  }
  const reticle = $('.bh-reticle');
  const dmgLayer = $('.bh-dmg-layer');
  const banner = $('.bh-banner');
  const bannerText = $('.bh-banner-text');
  const result = $('.bh-result');
  const resultStats = $('.bh-result-stats');
  const flashEl = $('.bh-flash');

  // damage numbers pool
  const DMG = [];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'bh-dmg';
    dmgLayer.appendChild(el);
    DMG.push({ el, x: 0, y: 0, z: 0, age: 1, life: 0.9, active: false, dx: 0 });
  }
  let dmgNext = 0;

  function setHP(i, hp) {
    const b = bars[i];
    if (hp < b.hp) b.trailDelay = 0.45;
    b.hp = hp;
  }
  function popDamage(worldPos, amount, onPlayer) {
    const d = DMG[dmgNext]; dmgNext = (dmgNext + 1) % DMG.length;
    d.x = worldPos.x; d.y = worldPos.y; d.z = worldPos.z;
    d.age = 0; d.active = true; d.dx = (Math.random() - 0.5) * 40;
    d.el.textContent = amount;
    d.el.className = 'bh-dmg' + (onPlayer ? ' hurt' : '') + (amount >= 100 ? ' big' : '');
    d.el.style.display = 'block';
  }
  function setCooldowns(gun, bomb, pod) {
    const set = (r, v) => {
      if (Math.abs(r.v - v) > 0.004) { r.v = v; r.fg.setAttribute('stroke-dashoffset', (RING_C * (1 - v)).toFixed(2)); }
      const ready = v >= 0.999;
      if (ready !== r.ready) { r.ready = ready; r.el.classList.toggle('ready', ready); if (ready) { r.el.classList.remove('pulse'); void r.el.offsetWidth; r.el.classList.add('pulse'); } }
    };
    set(rings.gun, gun); set(rings.bomb, bomb); set(rings.pod, pod);
  }
  let bannerTimer = 0;
  function showBanner(text, kind, hold = 0) {
    banner.className = 'bh-banner';
    void banner.offsetWidth;
    bannerText.textContent = text;
    bannerText.setAttribute('data-text', text);
    banner.className = `bh-banner show ${kind}`;
    bannerTimer = hold;
  }
  function hideBanner() { banner.className = 'bh-banner'; }
  function showResult(statsHtml) {
    resultStats.innerHTML = statsHtml;
    result.classList.add('show');
  }
  function hitFlash(strength = 1) {
    flashEl.style.opacity = String(0.35 * strength);
  }
  function setReticle(x, y, visible, hot, scale = 1) {
    if (!visible) { if (reticle.style.display !== 'none') reticle.style.display = 'none'; return; }
    reticle.style.display = 'block';
    reticle.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%,-50%) scale(${scale.toFixed(3)})`;
    reticle.classList.toggle('hot', !!hot);
  }
  function setControlsVisible(v) { $('.bh-controls').classList.toggle('hidden', !v); }
  function setVisible(v) { root.classList.toggle('bh-hidden', !v); }

  /** project(x,y,z) -> {x,y,visible} in CSS px (screen) */
  function update(dt, project) {
    for (let i = 0; i < 2; i++) {
      const b = bars[i];
      b.shown += (b.hp - b.shown) * Math.min(1, dt * 18);
      if (b.trailDelay > 0) b.trailDelay -= dt; else b.trailV += (b.shown - b.trailV) * Math.min(1, dt * 3.5);
      if (b.trailV < b.shown) b.trailV = b.shown;
      const r = Math.max(0, b.shown / maxHp);
      b.fill.style.transform = `scaleX(${r.toFixed(4)})`;
      b.trail.style.transform = `scaleX(${Math.max(0, b.trailV / maxHp).toFixed(4)})`;
      // cyan -> amber -> red
      const hue = r > 0.5 ? 190 - (1 - (r - 0.5) * 2) * 140 : 50 - (1 - r * 2) * 50;
      b.fill.style.setProperty('--hue', hue.toFixed(0));
      const n = Math.round(b.shown);
      if (n !== b.numShown) { b.numShown = n; b.num.textContent = n; }
      b.el.classList.toggle('low', r < 0.3);
    }
    for (const d of DMG) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age > d.life) { d.active = false; d.el.style.display = 'none'; continue; }
      const p = project(d.x, d.y, d.z);
      if (!p.visible) { d.el.style.opacity = '0'; continue; }
      const t = d.age / d.life;
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.8 : 1.4 - Math.min(0.4, (t - 0.12) * 1.2);
      const yOff = -40 * t - 18;
      d.el.style.opacity = String(t > 0.65 ? (1 - t) / 0.35 : 1);
      d.el.style.transform = `translate3d(${(p.x + d.dx * t).toFixed(1)}px, ${(p.y + yOff).toFixed(1)}px, 0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
    }
    const fo = parseFloat(flashEl.style.opacity || '0');
    if (fo > 0) flashEl.style.opacity = String(Math.max(0, fo - dt * 2.2));
    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) hideBanner(); }
  }

  function dispose() { root.remove(); }

  return { root, setHP, popDamage, setCooldowns, showBanner, hideBanner, showResult, setReticle, hitFlash, setControlsVisible, setVisible, update, dispose };
}
