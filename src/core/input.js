// Keyboard + mouse input with per-frame edge detection.
// Usage: input.down('KeyW'), input.pressed('KeyE') (true only on the frame it went down),
// input.mouse.dx/dy (pointer-lock deltas this frame), input.mouseDown(0), input.mousePressed(2).
// Call input.endFrame() once at the end of every frame (main loop does this).
// Touch UI (src/ui/touch.js) feeds the same API: setVirtual(code, down) for buttons, stick {x,y} for the
// left joystick and addLook(dx, dy) for the camera swipe zone.

class Input {
  constructor() {
    this.keys = new Set();
    this.justDown = new Set();
    this.justUp = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, wheel: 0, buttons: new Set(), justDown: new Set(), justUp: new Set() };
    this.locked = false;
    this.canvas = null;
    this.enabled = true;
    this.dragLook = true;
    this.stick = { x: 0, y: 0 };   // touch joystick, analog -1..1 (y up = forward)
    this.touchLooking = false;
    // phones/tablets only: a touchscreen LAPTOP still has a mouse as its primary pointer (hover: hover)
    this.isTouch = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  attach(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.justDown.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.justUp.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons.clear(); });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      // look deltas: pointer-locked, or dragging with any button held (fallback when
      // the browser/iframe refuses pointer lock)
      if (this.locked || (this.dragLook && this.mouse.buttons.size)) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.buttons.add(e.button); this.mouse.justDown.add(e.button);
    });
    addEventListener('mouseup', (e) => { this.mouse.buttons.delete(e.button); this.mouse.justUp.add(e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  /** press / release a key from an on-screen button */
  setVirtual(code, down) {
    if (down) { if (!this.keys.has(code)) this.justDown.add(code); this.keys.add(code); }
    else if (this.keys.has(code)) { this.keys.delete(code); this.justUp.add(code); }
  }
  /** camera swipe deltas (px) from the touch look zone */
  addLook(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }

  requestLock() {
    if (this.isTouch) return;
    if (this.canvas && !this.locked) {
      try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
    }
  }
  exitLock() { if (this.locked) document.exitPointerLock(); }

  /** true while mouse deltas should orbit the camera */
  get looking() { return this.locked || this.touchLooking || (this.dragLook && this.mouse.buttons.size > 0); }

  down(code) { return this.enabled && this.keys.has(code); }
  pressed(code) { return this.enabled && this.justDown.has(code); }
  released(code) { return this.justUp.has(code); }
  mouseDown(b = 0) { return this.enabled && this.mouse.buttons.has(b); }
  mousePressed(b = 0) { return this.enabled && this.mouse.justDown.has(b); }

  /** -1..1 movement axes from WASD/arrows */
  axis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.enabled && (this.stick.x || this.stick.y)) { x += this.stick.x; y += this.stick.y; }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  endFrame() {
    this.justDown.clear(); this.justUp.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.justDown.clear(); this.mouse.justUp.clear();
  }
}

export const input = new Input();
