// Character creator: neon studio scene (own THREE.Scene + camera) + glass DOM panel (#creator).
// openCreator({ renderer, initial, onConfirm(appearance), onBack() }) -> { update(dt,time), render(), dispose() }
import * as THREE from 'three';
import './creator.css';
import { createAvatar } from '../characters/avatar.js';
import { OPTIONS, DEFAULT_APPEARANCE, GENDER_DEFAULTS, hairOptionsFor, sanitizeAppearance, randomAppearance } from '../characters/appearance.js';
import { makeCanvas, canvasTex, clamp, damp } from '../core/util.js';

const GLYPH = {
  male: '♂', female: '♀',
  spiky: '✸', messy: '☄', undercut: '◩', sideswept: '⟋', wolf: '⋔', curtain: '⌒', short: '◠', mop: '◖', buzz: '▪',
  twintails: '❦', straight: '≋', bob: '◗', ponytail: '➰', odango: '◕', wavy: '∿', hime: '▥', pixie: '✿',
  round: '◉', doll: '◍', sharp: '◈', soft: '◡', sleepy: '◒', natural: '⌒', thick: '▬', thin: '╌', angled: '⟋',
  hoodie: '⛉', bearhoodie: 'ʕ', tshirt: '▣', jacket: '⧉', blazer: '♦', coat: '⧈', sweater: '▦', puffcrop: '❀', onesie: '⬭', tank: '▯',
  pants: '‖', joggers: '⫴', shorts: '⊓', skirt: '⏅', miniskirt: '⛓', cargo: '⫼',
  sneakers: '◣', boots: '▙', loafers: '▁', warmers: '▒',
  none: '∅', glasses: '◎', cap: '◓', headphones: '♫', beanie: '◒', scarf: '≈', mask: '▭', apron: '▤', choker: '⋈', headband: '━',
};

const TABS = [
  { id: 'identity', label: 'IDENTITY', ic: '✦', zoom: 0 },
  { id: 'face', label: 'FACE', ic: '◉', zoom: 1 },
  { id: 'hair', label: 'HAIR', ic: '✸', zoom: 0.8 },
  { id: 'outfit', label: 'OUTFIT', ic: '⛉', zoom: 0 },
  { id: 'extras', label: 'EXTRAS', ic: '☂', zoom: 0.35 },
];

const labelOf = (key, id) => (OPTIONS[key]?.find((o) => o.id === id)?.label) || id;

function backdropTexture() {
  const [c, x] = makeCanvas(1024, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#060a1a'); g.addColorStop(0.55, '#101d44'); g.addColorStop(1, '#1b2c5c');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  // faint vertical light strips + kanji-free signage glow
  for (let i = 0; i < 26; i++) {
    const px = (i / 26) * 1024 + Math.random() * 20;
    const a = 0.03 + Math.random() * 0.06;
    x.fillStyle = `rgba(94,231,255,${a})`;
    x.fillRect(px, 120 + Math.random() * 160, 2 + Math.random() * 3, 160 + Math.random() * 200);
  }
  for (let i = 0; i < 10; i++) {
    x.fillStyle = `rgba(255,95,180,${0.03 + Math.random() * 0.05})`;
    x.fillRect(Math.random() * 1024, 200 + Math.random() * 150, 30 + Math.random() * 60, 3);
  }
  // horizon haze
  const h = x.createLinearGradient(0, 300, 0, 512);
  h.addColorStop(0, 'rgba(94,231,255,0)'); h.addColorStop(1, 'rgba(94,231,255,0.12)');
  x.fillStyle = h; x.fillRect(0, 300, 1024, 212);
  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function floorTexture() {
  const [c, x] = makeCanvas(512, 512);
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, '#24345f'); g.addColorStop(0.55, '#121b38'); g.addColorStop(1, '#070b18');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(94,231,255,0.10)'; x.lineWidth = 1;
  for (let r = 40; r < 256; r += 36) { x.beginPath(); x.arc(256, 256, r, 0, Math.PI * 2); x.stroke(); }
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    x.beginPath(); x.moveTo(256 + Math.cos(t) * 40, 256 + Math.sin(t) * 40); x.lineTo(256 + Math.cos(t) * 256, 256 + Math.sin(t) * 256); x.stroke();
  }
  return canvasTex(c);
}

export function openCreator({ renderer, initial = null, onConfirm = () => {}, onBack = () => {} } = {}) {
  let app = sanitizeAppearance(initial || DEFAULT_APPEARANCE);
  // ---------------- scene ----------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b1a);
  scene.fog = new THREE.Fog(0x0b1430, 9, 22);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  const owned = []; // geometries/materials/textures to dispose
  const own = (o) => { owned.push(o); return o; };

  scene.add(new THREE.HemisphereLight(0x8aa2e8, 0x1a1f33, 1.0));
  const key = new THREE.DirectionalLight(0xdfe6ff, 1.6);
  key.position.set(2.5, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 0.5, far: 15 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rimC = new THREE.PointLight(0x5ee7ff, 9, 9, 1.5); rimC.position.set(-2.2, 2.4, -1.6); scene.add(rimC);
  const rimM = new THREE.PointLight(0xff5fb4, 7, 9, 1.5); rimM.position.set(2.4, 1.9, -1.8); scene.add(rimM);
  const fill = new THREE.PointLight(0xffd7b0, 2.2, 7, 1.8); fill.position.set(0, 1.7, 2.6); scene.add(fill);

  const back = new THREE.Mesh(own(new THREE.CylinderGeometry(11, 11, 9, 48, 1, true)), own(new THREE.MeshBasicMaterial({ map: own(backdropTexture()), side: THREE.BackSide, fog: false })));
  back.position.y = 3.2;
  scene.add(back);
  const floorMat = own(new THREE.MeshStandardMaterial({ map: own(floorTexture()), roughness: 0.18, metalness: 0.35, color: 0xb8c4e8 }));
  const floor = new THREE.Mesh(own(new THREE.CircleGeometry(9, 64)), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  // turntable disc + neon ring
  const disc = new THREE.Mesh(own(new THREE.CylinderGeometry(0.78, 0.82, 0.05, 64)), own(new THREE.MeshStandardMaterial({ color: 0x141d3a, roughness: 0.12, metalness: 0.6 })));
  disc.position.y = 0.025; disc.receiveShadow = true; disc.castShadow = false;
  scene.add(disc);
  const ringMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ee7ff).multiplyScalar(1.6), transparent: true, opacity: 0.95, fog: false }));
  const ring = new THREE.Mesh(own(new THREE.TorusGeometry(0.8, 0.012, 8, 96)), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.052;
  scene.add(ring);
  const ring2Mat = own(new THREE.MeshBasicMaterial({ color: 0xff5fb4, transparent: true, opacity: 0.35, fog: false }));
  const ring2 = new THREE.Mesh(own(new THREE.RingGeometry(1.0, 1.02, 96)), ring2Mat);
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.004;
  scene.add(ring2);
  const glowMat = own(new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glow = new THREE.Mesh(own(new THREE.RingGeometry(0.8, 1.35, 64)), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.006;
  scene.add(glow);
  // rain streaks in the background
  const RN = 700;
  const rp = new Float32Array(RN * 6), rv = new Float32Array(RN);
  for (let i = 0; i < RN; i++) {
    const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 1.5, y = Math.random() * 7;
    rp.set([x, y, z, x + 0.01, y - 0.22, z], i * 6);
    rv[i] = 6 + Math.random() * 4;
  }
  const rainGeo = own(new THREE.BufferGeometry());
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainMat = own(new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.32, fog: true }));
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);

  // avatar on the turntable
  const table = new THREE.Group();
  table.position.y = 0.05;
  scene.add(table);
  const avatar = createAvatar(app);
  table.add(avatar.root);
  avatar.root.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow && o.name !== 'outline'; });

  // ---------------- camera rig ----------------
  const view = { yaw: 0.28, yawT: 0.28, zoom: 0, zoomT: 0, spin: 0 };
  let dragging = false, lastX = 0, lastY = 0, velYaw = 0;
  let size = { w: 0, h: 0 };

  // ---------------- DOM ----------------
  const root = document.createElement('div');
  root.id = 'creator';
  root.innerHTML = `
    <div class="cr-flash"></div>
    <div class="cr-head cr-fade">
      <div class="cr-kicker">SEMESTA CITY</div>
      <div class="cr-title">CHARACTER <b>CREATE</b></div>
      <div class="cr-jp">キャラクター作成</div>
    </div>
    <div class="cr-plate cr-fade"><div class="nm"></div><div class="sub"></div><div class="bar"></div></div>
    <div class="cr-hint cr-fade"><kbd>DRAG</kbd> rotate · <kbd>WHEEL</kbd> zoom face / full body</div>
    <div class="cr-panel cr-fade">
      <div class="cr-tabs">${TABS.map((t) => `<button class="cr-tab" data-tab="${t.id}"><span class="ic">${t.ic}</span>${t.label}</button>`).join('')}</div>
      <div class="cr-tabline"></div>
      <div class="cr-body"></div>
      <div class="cr-foot">
        <button class="cr-btn" data-act="back">◂ BACK</button>
        <button class="cr-btn" data-act="random">⚄ RANDOM</button>
        <button class="cr-btn go" data-act="go">ENTER SEMESTA CITY<span>スタート</span></button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const body = root.querySelector('.cr-body');
  const plateName = root.querySelector('.cr-plate .nm');
  const plateSub = root.querySelector('.cr-plate .sub');
  let tab = 'identity';
  let busy = false;

  // keep keyboard input inside the creator (game input listens on window)
  const stopKeys = (e) => {
    if (!root.contains(e.target) && e.target !== document.body) return;
    e.stopPropagation();
    if (e.type === 'keydown' && e.key === 'Enter' && e.target.classList?.contains('cr-name')) e.target.blur();
  };
  root.addEventListener('keydown', stopKeys);
  root.addEventListener('keyup', stopKeys);
  root.addEventListener('keypress', stopKeys);
  const winKey = (e) => { if (root.contains(e.target)) e.stopImmediatePropagation(); };
  window.addEventListener('keydown', winKey, true);
  window.addEventListener('keyup', winKey, true);

  // ------------- rebuild throttling -------------
  let dirty = false, lastBuild = 0;
  const markDirty = () => { dirty = true; };
  function set(k, v) {
    if (k === 'body' && v !== app.body) {
      // switching gender: that gender's hair list + sensible defaults (every garment stays choosable)
      Object.assign(app, GENDER_DEFAULTS[v] || {});
    }
    app[k] = v;
    if (k === 'name') { updatePlate(); return; }
    markDirty();
    updatePlate();
    renderTab(false);
  }

  function updatePlate() {
    plateName.textContent = app.name || 'Player';
    plateSub.textContent = [labelOf('hairStyle', app.hairStyle) + ' hair', labelOf('top', app.top), labelOf('bottom', app.bottom), labelOf('shoes', app.shoes),
      [app.accessory, app.accessory2].filter((a) => a && a !== 'none').map((a) => labelOf('accessory', a)).join(' + ')].filter(Boolean).join('  ·  ');
  }

  // ------------- widgets -------------
  const sec = (title, value, inner) => `<div class="cr-sec"><div class="cr-sec-h"><span class="t">${title}</span><span class="v">${value ?? ''}</span></div>${inner}</div>`;
  const cards = (field, optKey = field, list = OPTIONS[optKey]) => `<div class="cr-cards">${list.map((o) => `<div class="cr-card ${app[field] === o.id ? 'on' : ''}" data-f="${field}" data-v="${o.id}"><span class="g">${GLYPH[o.id] || '◇'}</span>${o.label}</div>`).join('')}</div>`;
  const swatches = (field, pal) => `<div class="cr-sw">${pal.map((c) => `<div class="cr-dot ${app[field] === c ? 'on' : ''}" data-f="${field}" data-c="${c}" style="background:${c}" title="${c}"></div>`).join('')}<label class="cr-pick" title="Custom colour"><input type="color" data-f="${field}" value="${app[field]}"></label></div>`;
  const range = (field, min, max, step, fmt) => {
    const p = ((app[field] - min) / (max - min)) * 100;
    return `<div class="cr-range"><input type="range" data-f="${field}" min="${min}" max="${max}" step="${step}" value="${app[field]}" style="--p:${p}%"><span class="v" data-out="${field}">${fmt(app[field])}</span></div>`;
  };
  const toggle = (field, label, note) => `<div class="cr-toggle ${app[field] ? 'on' : ''}" data-tg="${field}"><span class="sw"></span>${label}<small>${note}</small></div>`;
  const cm = (h) => `${Math.round(h * (app.body === 'female' ? 158 : 166))} cm`;
  const genderCards = () => `<div class="cr-gender">${OPTIONS.body.map((o) => {
    const [jp, en] = o.label.split(' · ');
    return `<div class="cr-gcard ${o.id} ${app.body === o.id ? 'on' : ''}" data-f="body" data-v="${o.id}"><span class="gi">${GLYPH[o.id]}</span><b>${jp}</b><small>${en}</small></div>`;
  }).join('')}</div>`;
  const pal = OPTIONS.palettes;

  function renderTab(full = true) {
    let html = '';
    if (tab === 'identity') {
      html += sec('GENDER', labelOf('body', app.body), genderCards());
      html += sec('NAME', '', `<input class="cr-name" maxlength="14" spellcheck="false" autocomplete="off" value="${(app.name || '').replace(/"/g, '&quot;')}" placeholder="Your name"><div class="cr-count">${(app.name || '').length}/14</div>`);
      html += sec('HEIGHT', '', range('height', 0.92, 1.08, 0.005, cm));
      html += sec('BUILD', '', range('build', 0.88, 1.15, 0.01, (v) => (v < 0.96 ? 'Slim' : v > 1.06 ? 'Sturdy' : 'Average')));
    } else if (tab === 'face') {
      html += sec('SKIN TONE', '', swatches('skin', pal.skin));
      html += sec('EYE COLOUR', '', swatches('eyeColor', pal.eye));
      html += sec('EYE SHAPE', labelOf('eyeStyle', app.eyeStyle), cards('eyeStyle'));
      html += sec('BROWS', labelOf('brows', app.brows), cards('brows'));
    } else if (tab === 'hair') {
      html += sec(app.body === 'female' ? 'HAIRSTYLE · CEWEK' : 'HAIRSTYLE · COWOK', labelOf('hairStyle', app.hairStyle), cards('hairStyle', 'hairStyle', hairOptionsFor(app.body)));
      html += sec('HAIR COLOUR', '', swatches('hairColor', pal.hair));
    } else if (tab === 'outfit') {
      html += sec('TOP', labelOf('top', app.top), cards('top') + '<div class="cr-sub">MAIN COLOUR</div>' + swatches('topColor', pal.cloth) + '<div class="cr-sub">ACCENT · TRIM</div>' + swatches('topColor2', pal.cloth));
      html += sec('BOTTOM', labelOf('bottom', app.bottom), cards('bottom') + '<div class="cr-sub">COLOUR</div>' + swatches('bottomColor', pal.cloth));
      html += sec('SHOES', labelOf('shoes', app.shoes), cards('shoes') + '<div class="cr-sub">COLOUR</div>' + swatches('shoesColor', pal.cloth));
    } else if (tab === 'extras') {
      html += sec('ACCESSORY', labelOf('accessory', app.accessory), cards('accessory') + '<div class="cr-sub">COLOUR</div>' + swatches('accessoryColor', pal.cloth));
      html += sec('SECOND ACCESSORY', labelOf('accessory', app.accessory2), cards('accessory2', 'accessory') + '<div class="cr-sub">COLOUR</div>' + swatches('accessory2Color', pal.cloth));
      html += sec('UMBRELLA', app.umbrella ? 'Clear umbrella' : 'None', toggle('umbrella', 'Carry an umbrella', 'opens in the rain') + '<div class="cr-sub">TINT</div>' + swatches('umbrellaColor', pal.umbrella));
    }
    const st = body.scrollTop;
    const focusedName = document.activeElement && document.activeElement.classList.contains('cr-name');
    if (!full && focusedName) return; // never re-render under the caret
    body.innerHTML = html;
    if (!full) body.scrollTop = st; else body.scrollTop = 0;
    for (const b of root.querySelectorAll('.cr-tab')) b.classList.toggle('on', b.dataset.tab === tab);
  }

  // ------------- events (delegated) -------------
  const onClick = (e) => {
    if (busy) return;
    const t = e.target.closest('[data-tab],[data-act],[data-f],[data-tg]');
    if (!t || !root.contains(t)) return;
    if (t.dataset.tab) {
      tab = t.dataset.tab;
      const T = TABS.find((x) => x.id === tab);
      view.zoomT = T.zoom;
      renderTab(true);
      return;
    }
    if (t.dataset.act === 'back') { onBack(); return; }
    if (t.dataset.act === 'random') {
      const nm = app.name;
      app = randomAppearance();
      app.name = nm;
      markDirty(); updatePlate(); renderTab(false);
      avatar.playEmote('nod');
      return;
    }
    if (t.dataset.act === 'go') { confirm(); return; }
    if (t.dataset.tg) { set(t.dataset.tg, !app[t.dataset.tg]); return; }
    if (t.dataset.f && t.dataset.v) { set(t.dataset.f, t.dataset.v); return; }
    if (t.dataset.f && t.dataset.c) { set(t.dataset.f, t.dataset.c); return; }
  };
  const onInput = (e) => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.classList.contains('cr-name')) {
      app.name = t.value.slice(0, 14);
      const cnt = root.querySelector('.cr-count'); if (cnt) cnt.textContent = `${app.name.length}/14`;
      updatePlate();
      return;
    }
    const f = t.dataset.f;
    if (!f) return;
    if (t.type === 'range') {
      app[f] = parseFloat(t.value);
      t.style.setProperty('--p', `${((app[f] - t.min) / (t.max - t.min)) * 100}%`);
      const out = root.querySelector(`[data-out="${f}"]`);
      if (out) out.textContent = f === 'height' ? cm(app[f]) : (app[f] < 0.96 ? 'Slim' : app[f] > 1.06 ? 'Sturdy' : 'Average');
      markDirty();
    } else if (t.type === 'color') {
      app[f] = t.value;
      markDirty();
      for (const d of root.querySelectorAll(`.cr-dot[data-f="${f}"]`)) d.classList.toggle('on', d.dataset.c === t.value);
    }
  };
  const onChange = (e) => { if (e.target.type === 'color') { set(e.target.dataset.f, e.target.value); } };
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);

  // turntable drag + wheel zoom on the canvas area (anything outside the panel)
  const panel = root.querySelector('.cr-panel');
  const inPanel = (e) => panel.contains(e.target);
  const onDown = (e) => { if (inPanel(e) || e.button !== 0) return; dragging = true; lastX = e.clientX; lastY = e.clientY; velYaw = 0; };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX; lastY = e.clientY;
    view.yawT -= dx * 0.008; velYaw = -dx * 0.008;
  };
  const onUp = () => { dragging = false; };
  const onWheel = (e) => { if (inPanel(e)) return; view.zoomT = clamp(view.zoomT - Math.sign(e.deltaY) * 0.18, 0, 1); };
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('wheel', onWheel, { passive: true });

  function confirm() {
    if (busy) return;
    busy = true;
    root.classList.add('busy');
    if (dirty) { avatar.setAppearance(app); dirty = false; }
    view.zoomT = 0.15;
    view.yawT = Math.round(view.yawT / (Math.PI * 2)) * Math.PI * 2 + 0.1;
    avatar.playEmote('cheer');
    confirmT = 1.55;
  }
  let confirmT = -1;
  let time = 0;
  updatePlate();
  renderTab(true);

  function layout() {
    const s = new THREE.Vector2();
    renderer.getSize(s);
    if (s.x === size.w && s.y === size.h) return;
    size = { w: s.x, h: s.y };
    camera.aspect = s.x / Math.max(1, s.y);
    const pw = panel.getBoundingClientRect().width;
    const narrow = innerWidth <= 760;
    if (!narrow && pw > 0) camera.setViewOffset(s.x, s.y, (pw + 30) * 0.5 * (s.x / innerWidth), 0, s.x, s.y);
    else if (narrow) camera.setViewOffset(s.x, s.y, 0, s.y * 0.22, s.x, s.y);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  const onResize = () => { size = { w: 0, h: 0 }; };
  window.addEventListener('resize', onResize);

  const look = new THREE.Vector3();
  return {
    update(dt, t) {
      dt = Math.min(dt || 0.016, 0.1);
      time = t ?? time + dt;
      if (dirty && performance.now() - lastBuild > 70) {
        avatar.setAppearance(app);
        avatar.root.traverse((o) => { if (o.isMesh && o.name === 'outline') o.castShadow = false; });
        dirty = false; lastBuild = performance.now();
      }
      if (!dragging) { view.yawT += velYaw; velYaw *= Math.pow(0.02, dt); }
      view.yaw = damp(view.yaw, view.yawT, 8, dt);
      view.zoom = damp(view.zoom, view.zoomT, 5, dt);
      table.rotation.y = view.yaw;
      // camera between full body and face
      const z = view.zoom;
      const head = avatar.headWorldPos(look);
      const ty = THREE.MathUtils.lerp(0.95, head.y - 0.02, z);
      const dist = THREE.MathUtils.lerp(4.6, 1.25, z);
      camera.position.set(0, ty + THREE.MathUtils.lerp(0.18, 0.03, z), dist);
      camera.lookAt(0, ty, 0);
      // umbrella would hide the face in close-ups
      avatar.setUmbrella(z < 0.55 && (tab === 'extras' || busy));
      avatar.update(dt, { speed: 0, grounded: true, vy: 0, talking: false, emote: null, lookAt: z > 0.6 ? camera.position : null, raining: true });
      // rain
      const p = rainGeo.attributes.position.array;
      for (let i = 0; i < RN; i++) {
        const o = i * 6;
        const dy = rv[i] * dt;
        p[o + 1] -= dy; p[o + 4] -= dy;
        if (p[o + 4] < 0) { const y = 6 + Math.random(); p[o + 1] = y; p[o + 4] = y - 0.22; }
      }
      rainGeo.attributes.position.needsUpdate = true;
      ringMat.opacity = 0.75 + 0.2 * Math.sin(time * 2.2);
      glowMat.opacity = 0.1 + 0.05 * Math.sin(time * 1.4);
      ring2.rotation.z = time * 0.1;
      if (confirmT > 0) {
        confirmT -= dt;
        if (confirmT <= 0) { confirmT = -1; onConfirm(sanitizeAppearance(app)); }
      }
    },
    /** post(scene, camera) lets the game run its bloom/grade chain over the studio */
    render(_time, post) {
      layout();
      if (post) { post(scene, camera); return; }
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    get appearance() { return sanitizeAppearance(app); },
    dispose() {
      window.removeEventListener('keydown', winKey, true);
      window.removeEventListener('keyup', winKey, true);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      root.remove();
      avatar.dispose();
      for (const o of owned) o.dispose && o.dispose();
      scene.clear();
      key.shadow.map && key.shadow.map.dispose();
    },
  };
}
