// Touch controls for phones/tablets (only built when input.isTouch): dynamic joystick on the left,
// camera swipe on the right, compact action cluster bottom-right. Buttons feed input.setVirtual() so the
// game code keeps reading the same keys. Modes: 'explore' | 'battle' | 'off'.
import { input } from '../core/input.js';

let onLateTouch = null;
/** called with the controls object when a hybrid device switches to touch */
export function onTouchActivated(fn) { onLateTouch = fn; }

const LOOK_K = 1.7;            // swipe px -> mouse px (touch swipes are shorter than mouse moves)
const RUN_AT = 0.86;           // stick push beyond this runs (virtual Shift)

const BTNS = {
  explore: [
    { id: 'act', code: 'KeyE', label: 'E', cls: 'big act' },
    { id: 'jump', code: 'Space', label: '⤒', cls: 'jump' },
    { id: 'run', code: 'ShiftLeft', label: '»', cls: 'run', toggle: true },
  ],
  battle: [
    { id: 'gun', code: 'KeyJ', label: '✸', cls: 'big gun' },
    { id: 'bomb', code: 'KeyK', label: '◉', cls: 'bomb' },
    { id: 'dash', code: 'ShiftLeft', label: '»', cls: 'dash' },
    { id: 'jump', code: 'Space', label: '⤒', cls: 'jump2' },
    { id: 'pod', code: 'KeyE', label: '◆', cls: 'pod' },
  ],
};

export function createTouchControls() {
  if (!input.isTouch) {
    // hybrid device (touchscreen laptop): build the touch UI the first time the player actually touches the game
    const late = (e) => {
      if (e.pointerType !== 'touch') return;
      removeEventListener('pointerdown', late, true);
      input.isTouch = true;
      onLateTouch?.(createTouchControls());
    };
    addEventListener('pointerdown', late, true);
    return null;
  }
  document.body.classList.add('touch');
  const root = document.createElement('div');
  root.id = 'touchui';
  root.innerHTML = `<div class="joyzone"><div class="joy"><div class="nub"></div></div></div>
    <div class="lookzone"></div><div class="btns"></div>`;
  document.body.appendChild(root);
  const joyzone = root.querySelector('.joyzone'), joy = root.querySelector('.joy'), nub = root.querySelector('.nub');
  const lookzone = root.querySelector('.lookzone'), btns = root.querySelector('.btns');
  let mode = 'off';
  let runToggle = false;
  let actLabel = '';

  // ---- joystick (appears where the thumb lands)
  let joyId = null, jx = 0, jy = 0;
  const R = 44;
  joyzone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joyId !== null) return;
    const t = e.changedTouches[0];
    joyId = t.identifier; jx = t.clientX; jy = t.clientY;
    joy.style.left = `${jx}px`; joy.style.top = `${jy}px`; joy.style.display = 'block';
    nub.style.transform = 'translate(-50%,-50%)';
  }, { passive: false });
  const joyMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      e.preventDefault();
      let dx = t.clientX - jx, dy = t.clientY - jy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const k = Math.min(1, l / R);
      const dz = k < 0.18 ? 0 : (k - 0.18) / 0.82;     // dead zone
      input.stick.x = l ? (dx / l) * dz : 0;
      input.stick.y = l ? (-dy / l) * dz : 0;
      if (!runToggle) input.setVirtual('ShiftLeft', mode === 'explore' && k > RUN_AT);
    }
  };
  const joyEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyId = null; joy.style.display = 'none';
      input.stick.x = 0; input.stick.y = 0;
      if (!runToggle) input.setVirtual('ShiftLeft', false);
    }
  };
  joyzone.addEventListener('touchmove', joyMove, { passive: false });
  joyzone.addEventListener('touchend', joyEnd);
  joyzone.addEventListener('touchcancel', joyEnd);

  // ---- camera swipe
  let lookId = null, lx = 0, ly = 0;
  lookzone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier; lx = t.clientX; ly = t.clientY; input.touchLooking = true;
  }, { passive: false });
  lookzone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      e.preventDefault();
      input.addLook((t.clientX - lx) * LOOK_K, (t.clientY - ly) * LOOK_K);
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: false });
  const lookEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) { lookId = null; input.touchLooking = false; } };
  lookzone.addEventListener('touchend', lookEnd);
  lookzone.addEventListener('touchcancel', lookEnd);

  // ---- buttons
  function build() {
    btns.innerHTML = '';
    for (const b of BTNS[mode] || []) {
      const el = document.createElement('button');
      el.className = `tbtn ${b.cls}`;
      el.dataset.id = b.id;
      el.innerHTML = `<span class="g">${b.label}</span>${b.id === 'act' ? '<small class="lbl"></small>' : ''}`;
      const down = (e) => {
        e.preventDefault();
        if (b.toggle) { runToggle = !runToggle; el.classList.toggle('on', runToggle); input.setVirtual(b.code, runToggle); return; }
        el.classList.add('down'); input.setVirtual(b.code, true);
      };
      const up = (e) => { e.preventDefault(); if (b.toggle) return; el.classList.remove('down'); input.setVirtual(b.code, false); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      btns.appendChild(el);
    }
    if (runToggle && mode === 'explore') btns.querySelector('.run')?.classList.add('on');
    setAction(actLabel);
  }
  function setAction(label) {
    actLabel = label || '';
    const a = btns.querySelector('.act');
    if (!a) return;
    a.classList.toggle('ready', !!actLabel);
    a.querySelector('.lbl').textContent = actLabel;
  }
  function releaseAll() {
    input.stick.x = 0; input.stick.y = 0; joyId = null; lookId = null; input.touchLooking = false;
    joy.style.display = 'none';
    for (const c of ['KeyE', 'Space', 'KeyJ', 'KeyK', 'ShiftLeft']) input.setVirtual(c, false);
    if (runToggle && mode === 'explore') input.setVirtual('ShiftLeft', true);
  }

  // stop the page from scrolling / zooming under the game
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  return {
    root,
    /** 'explore' | 'battle' | 'off' */
    setMode(m) {
      if (m === mode) return;
      mode = m;
      root.classList.toggle('off', m === 'off');
      root.dataset.mode = m;
      releaseAll();
      build();
    },
    /** contextual interact label (null = nothing to interact with) */
    setAction,
    dispose() { root.remove(); document.body.classList.remove('touch'); },
  };
}
