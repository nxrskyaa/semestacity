// Procedural animation: idle / walk / run (blended by speed, IK foot planting), air, landing,
// talking gestures, emotes, look-at, umbrella hold and NPC idle variants.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/util.js';

const TAU = Math.PI * 2;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ARM_KEYS = ['x', 'y', 'z', 'fx', 'fy', 'fz', 'hx', 'hz', 'curl'];
const arm = (o = {}) => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, hx: 0, hz: 0, curl: 0.25, ...o });
function mixArm(a, b, t) {
  if (t <= 0) return a;
  for (const k of ARM_KEYS) a[k] = lerp(a[k], b[k], t);
  return a;
}
// side-aware arm pose: s=+1 left, -1 right. "in"-ward values are mirrored automatically.
const sideArm = (s, { x = 0, twistIn = 0, out = 0, fx = 0, fy = 0, fz = 0, hx = 0, hz = 0, curl = 0.25 }) => arm({ x, y: -s * twistIn, z: s * out, fx, fy: -s * fy, fz: s * fz, hx, hz: s * hz, curl });

export const EMOTES = { wave: 2.0, nod: 1.1, think: 2.8, cheer: 1.7, pat: 3.4, feed: 2.8, play: 2.8 };
// crouch-down emotes used with Spider the cat (player kneels, reaches toward the ground in front)
const CROUCH = { pat: 1, feed: 1, play: 0.3 };
/** 'play': the yarn ball leaves the throwing hand at this emote time (main.js flies it to Spider) */
export const TOSS_AT = 0.5;
/** pat pose knobs: a real squat (hips drop, back stays fairly upright) instead of folding at the waist */
// (searched in-engine: the right grip lands at y 0.38 m, 0.33 m ahead of the feet and 0.11 m to the right,
//  then lifts to ~0.44 m; main.js places Spider's head (0.34 m high when sitting) right under it)
export const PAT = { drop: 0.55, lean: 0.18, hipLean: 0.05, x0: -1.12, xs: -0.3, out: 0.22, fx0: -0.22, fxs: 0, hx0: 0.45, hxs: -0.35, rate: 1.6 };
export const PAT_HAND = { x: -0.11, z: 0.33 };   // player-local contact point (for emoteSide -1 = right hand)
/** feed: both hands hold the bowl at the chest (elbows bent), then lower it to the floor */
export const FEED = { x0: -0.95, x1: -0.9, fx0: -1.1, fx1: -0.1, out: -0.02, lean: 0.5 };   // hands reach ~0.19 m off the floor, 0.2 m ahead

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.d = rig.d;
    this.t = Math.random() * 10;
    this.cycle = 0;
    this.move = 0; this.run = 0; this.air = 0; this.land = 0; this.speed = 0;
    this.wasGrounded = true;
    this.vy = 0;
    this.lookYaw = 0; this.lookPitch = 0;
    this.idleLook = { yaw: 0, pitch: 0, timer: 2 + Math.random() * 3 };
    this.emote = null; this.emoteT = 0; this.emoteSide = -1; this.lastEmoteReq = null;
    this.talkW = 0; this.gest = { t: 0, side: 1, amp: 0.5, both: false };
    this.umbW = 0; this.umbOn = false;
    this.mode = 'stand'; this.modeW = { phone: 0, lean: 0, sweep: 0, counter: 0 };
    this.counterWave = 4 + Math.random() * 4;
    this.attn = false; // NPC is paying attention to someone -> idle variants relax
    this.onFootstep = null;
    this.face = { happy: false, eyesClosed: false };
    this.prevC = 0;
    this.footTargets = [new THREE.Vector3(), new THREE.Vector3()];
  }

  playEmote(name) {
    if (!EMOTES[name]) return;
    this.emote = name; this.emoteT = 0;
    this.emoteSide = this.umbOn ? 1 : -1;
  }

  update(dt, st, lookLocal) {
    dt = Math.min(dt, 0.1);
    const R = this.rig, d = this.d;
    this.t += dt;
    const t = this.t;
    const speed = clamp(st.speed || 0, 0, 8);
    const grounded = st.grounded !== false;
    this.speed = damp(this.speed, speed, 10, dt);
    const sp = this.speed;
    this.move = damp(this.move, sstep(0.05, 0.9, sp), 9, dt);
    this.run = damp(this.run, sstep(2.2, 4.6, sp), 6, dt);
    this.air = damp(this.air, grounded ? 0 : 1, grounded ? 14 : 9, dt);
    if (grounded && !this.wasGrounded) {
      this.land = Math.min(1, 0.35 + Math.abs(this.vy) / 10);
    }
    if (!grounded) this.vy = st.vy || 0;
    this.wasGrounded = grounded;
    this.land = damp(this.land, 0, 5, dt);

    // emote trigger on change
    const req = st.emote || null;
    if (req && req !== this.lastEmoteReq) this.playEmote(req);
    this.lastEmoteReq = req;
    if (this.emote) {
      this.emoteT += dt;
      if (this.emoteT > EMOTES[this.emote]) this.emote = null;
    }
    this.talkW = damp(this.talkW, st.talking ? 1 : 0, 4, dt);
    this.umbW = damp(this.umbW, this.umbOn ? 1 : 0, 5, dt);
    const busyIdle = this.attn || !!this.emote || !!st.talking;
    for (const k in this.modeW) this.modeW[k] = damp(this.modeW[k], this.mode === k && sp < 0.3 && !busyIdle ? 1 : 0, 3, dt);

    const move = this.move, run = this.run, air = this.air;
    const walkW = move * (1 - run);

    // ---------- gait cycle ----------
    const LK = (d.thigh + d.shin) / 0.83; // gait tuned for 0.83 m legs; scale to this rig
    const stride = lerp(lerp(0.95, 1.7, sstep(0.3, 2.0, sp)), 3.3, run) * LK;
    this.cycle = (this.cycle + (sp / stride) * dt * (grounded ? 1 : 0.4)) % 1;
    const c = this.cycle;
    const duty = lerp(0.56, 0.36, run);
    const S = Math.min(lerp(0.74, 0.95, run) * LK, stride * duty) * sstep(0.0, 0.7, sp);
    // footsteps (heel strikes at c=0 (L) and c=0.5 (R))
    if (grounded && move > 0.35) {
      const pc = this.prevC;
      if (pc > c) this.onFootstep && this.onFootstep('L', sp);
      else if (pc < 0.5 && c >= 0.5) this.onFootstep && this.onFootstep('R', sp);
    }
    this.prevC = c;

    // ---------- hips / torso ----------
    const breathe = Math.sin(t * TAU / 4.2);
    const shift = Math.sin(t * TAU / 7.5) + 0.35 * Math.sin(t * TAU / 3.1);
    const idleW = 1 - move;
    const cw = TAU * c;
    let hx = 0, hy = 0, hz = 0, hrx = 0, hry = 0, hrz = 0;
    // idle weight shift
    hx += idleW * 0.018 * shift;
    hrz += idleW * -0.025 * shift;
    hy += idleW * (-0.006 - 0.004 * Math.abs(shift));
    // walk
    hy += walkW * (-0.032 + 0.018 * Math.cos(2 * TAU * (c - 0.27)));
    hx += walkW * 0.016 * Math.cos(TAU * (c - 0.27)) * (d.fem ? 1.3 : 1);
    hry += walkW * -0.12 * Math.cos(cw) * (d.fem ? 1.2 : 1);
    hrz += walkW * 0.045 * Math.cos(TAU * (c - 0.27)) * (d.fem ? 1.4 : 1);
    // run
    hy += move * run * (-0.06 - 0.035 * Math.cos(2 * TAU * (c - 0.18)));
    hry += move * run * -0.2 * Math.cos(cw);
    hrz += move * run * 0.03 * Math.cos(TAU * (c - 0.18));
    const lean = walkW * 0.05 + move * run * 0.22;
    hrx += lean * 0.35;
    hz += move * run * 0.03;
    // air
    const vyN = clamp(this.vy / 6, -1, 1);
    hy += air * 0.02;
    hrx += air * -0.05 * vyN;
    // landing squash
    hy -= this.land * 0.12;
    hrx += this.land * 0.12;
    // emote body motion
    const em = this.emote, et = this.emoteT;
    const ew = em ? sstep(0, 0.22, et) * (1 - sstep(EMOTES[em] - 0.35, EMOTES[em], et)) : 0;
    if (em === 'cheer') hy += ew * 0.045 * Math.abs(Math.sin(et * 7.5)) * (et > 0.3 ? 1 : 0);
    const crouch = em && CROUCH[em] ? ew * CROUCH[em] : 0;
    hy -= crouch * (d.thigh + d.shin) * PAT.drop;
    hz -= crouch * 0.05;
    hrx += crouch * PAT.hipLean;
    // lean idle
    const lw = this.modeW.lean;
    hz -= lw * 0.03; hrx -= lw * 0.03;

    R.hips.position.set(hx, d.hipsY + hy, hz);
    R.hips.rotation.set(hrx, hry, hrz);

    let srx = lean * 0.65 - 0.01 * breathe * idleW, sry = 0, srz = -hrz * 0.6;
    let crx = -0.015 * breathe, cry = walkW * 0.18 * Math.cos(cw) + move * run * 0.3 * Math.cos(cw), crz = -hrz * 0.3;
    srx += air * -0.06 * vyN + this.land * 0.1;
    srx -= lw * 0.06;
    // talk sway
    cry += this.talkW * 0.04 * Math.sin(t * 1.3);
    // sweep: torso twist with broom
    const sw = this.modeW.sweep;
    const swp = Math.sin(t * 2.4);
    sry += sw * 0.22 * swp; srx += sw * 0.12;
    // phone: hunch a little
    srx += this.modeW.phone * 0.05;
    srx += crouch * (em === 'feed' ? FEED.lean : PAT.lean);   // setting the bowl down needs a deeper bend than a pat
    // counter: lean a little over the counter top
    const cw2 = this.modeW.counter;
    srx += cw2 * 0.1;
    if (cw2 > 0.01 && !this.emote) {
      this.counterWave -= dt;
      if (this.counterWave <= 0) { this.counterWave = 7 + Math.random() * 6; this.counterWaveT = 0; }
    }
    if (this.counterWaveT !== undefined && this.counterWaveT >= 0) { this.counterWaveT += dt; if (this.counterWaveT > 1.8) this.counterWaveT = -1; }
    const cWave = cw2 * (this.counterWaveT >= 0 ? sstep(0, 0.25, this.counterWaveT) * (1 - sstep(1.5, 1.8, this.counterWaveT)) : 0);
    R.spine.rotation.set(srx, sry, srz);
    R.chest.rotation.set(crx, cry, crz);

    // ---------- head / look ----------
    let nrx = -lean * 0.55 - 0.01 * breathe, nry = -cry * 0.75 - sry * 0.5, nrz = -srz * 0.5 - hrz * 0.3;
    // idle look-around
    const il = this.idleLook;
    il.timer -= dt;
    if (il.timer <= 0) {
      il.timer = 2.5 + Math.random() * 5;
      if (Math.random() < 0.45) { il.yaw = 0; il.pitch = 0; } else { il.yaw = (Math.random() - 0.5) * 1.1; il.pitch = (Math.random() - 0.4) * 0.25; }
    }
    let wantYaw = il.yaw * idleW * (1 - this.talkW), wantPitch = il.pitch * idleW * (1 - this.talkW);
    if (lookLocal) {
      const yaw = Math.atan2(lookLocal.x, lookLocal.z);
      const pitch = Math.atan2(lookLocal.y, Math.hypot(lookLocal.x, lookLocal.z));
      if (Math.abs(yaw) < 2.2) { wantYaw = clamp(yaw, -1.2, 1.2); wantPitch = clamp(pitch, -0.5, 0.45); }
    }
    this.lookYaw = damp(this.lookYaw, wantYaw, 4, dt);
    this.lookPitch = damp(this.lookPitch, wantPitch, 4, dt);
    let headRx = -this.lookPitch * 0.6, headRy = this.lookYaw * 0.6, headRz = 0;
    nry += this.lookYaw * 0.4; nrx += -this.lookPitch * 0.4;
    R.chest.rotation.y += this.lookYaw * 0.12;
    // talking nods
    headRx += this.talkW * (0.05 * Math.sin(t * 4.1) + 0.03 * Math.sin(t * 6.7));
    headRz += this.talkW * 0.05 * Math.sin(t * 1.7);
    // phone: look down at screen
    headRx += this.modeW.phone * 0.38; nrx += this.modeW.phone * 0.18;
    headRx += sw * 0.25;
    if (em === 'nod') headRx += ew * 0.32 * Math.max(0, Math.sin(et * TAU * 1.9));
    if (em === 'think') { headRz += ew * 0.16; headRx += ew * -0.1; headRy += ew * 0.12 * this.emoteSide; }
    if (em === 'cheer') headRx += ew * -0.15;
    if (em === 'wave') headRz += ew * 0.1 * -this.emoteSide;
    if (crouch) { headRx += crouch * 0.42; nrx += crouch * 0.15; headRz += crouch * 0.08 * Math.sin(et * 1.6); }
    headRx += air * 0.06 * vyN;
    R.neck.rotation.set(nrx, nry, nrz);
    R.head.rotation.set(headRx, headRy, headRz);
    this.face.happy = (em === 'cheer' && et > 0.2) || (em === 'wave' && et > 0.3 && et < 1.6) || cWave > 0.5 || (crouch > 0.5 && em !== 'feed');
    this.face.eyesClosed = em === 'think' && et > 0.6 && et < 2.0;

    // ---------- legs (IK) ----------
    const fx0 = d.legX + (d.fem ? 0.012 : 0.02);
    for (const Lg of [R.legL, R.legR]) {
      const s = Lg.side;
      const lc = (c + (s > 0 ? 0 : 0.5)) % 1;
      // idle stance
      const target = _p;
      let fx = s * fx0, fy = d.ankleH, fz = s > 0 ? 0.035 : -0.01, pitch = 0;
      let yaw = s * 0.12;
      // lean: one leg crossed in front
      if (lw > 0) {
        if (s > 0) { fx = lerp(fx, -0.02, lw); fz = lerp(fz, 0.16, lw); pitch = lerp(0, 0.5, lw); fy = lerp(fy, fy + 0.035, lw); }
        else { fz = lerp(fz, 0.06, lw); }
      }
      // gait
      let gx = s * (d.legX - (d.fem ? 0.012 : 0.004)), gy = d.ankleH, gz = 0, gp = 0;
      const toeLift = lerp(0.05, 0.09, run);
      if (lc < duty) {
        const u = lc / duty;
        gz = S * (0.5 - u);
        gy += 0.02 * Math.pow(1 - u, 6) * (1 - run) + toeLift * Math.pow(sstep(0.55, 1, u), 1.6);
        gp = -0.22 * Math.pow(1 - u, 5) * (1 - run) + 0.75 * Math.pow(sstep(0.55, 1, u), 2);
      } else {
        const u = (lc - duty) / (1 - duty);
        const e = u * u * (3 - 2 * u);
        gz = -S / 2 + S * e - run * 0.28 * Math.sin(Math.PI * u) * (1 - u);
        gy += toeLift * Math.pow(1 - u, 2) + lerp(0.075, 0.26, run) * Math.pow(Math.sin(Math.PI * Math.pow(u, lerp(1, 0.7, run))), 1.2);
        gp = lerp(0.75, -0.2 * (1 - run), sstep(0, 1, u)) + run * 0.5 * Math.sin(Math.PI * u);
      }
      gz += hz;
      fx = lerp(fx, gx, move); fy = lerp(fy, gy, move); fz = lerp(fz, gz, move); pitch = lerp(pitch, gp, move);
      yaw = lerp(yaw, s * 0.06, move);
      target.set(fx, fy, fz);
      // air: targets relative to the hip joint
      if (air > 0.001) {
        const up = vyN > 0 ? 1 : 0;
        const tuck = s > 0 ? [0.0, -0.52 - 0.18 * (1 - up), 0.16] : [0.0, -0.68 - 0.08 * (1 - up), -0.12];
        const hipW = this._hipWorld(Lg, _v);
        const ax = hipW.x + s * 0.01, ay = hipW.y + tuck[1], az = hipW.z + tuck[2];
        target.set(lerp(target.x, ax, air), lerp(target.y, ay, air), lerp(target.z, az, air));
        pitch = lerp(pitch, 0.45, air);
      }
      this.footTargets[s > 0 ? 0 : 1].copy(target);
      this._solveLeg(Lg, target, pitch, yaw);
    }

    // ---------- arms ----------
    const armOut = d.fem ? 0.1 : 0.13;
    for (const A of [R.armL, R.armR]) {
      const s = A.side;
      const ph = Math.cos(cw) * s; // + when this arm swings back
      const sway = Math.sin(t * TAU / 4.2 + s) * 0.015;
      const base = sideArm(s, {
        x: 0.03 + sway + idleW * -0.02 * breathe * s * 0,
        out: armOut + idleW * 0.02 * breathe + 0.02 * idleW * shift * s,
        twistIn: 0.15,
        fx: -0.16 - idleW * 0.04,
        curl: 0.35,
      });
      // walk
      const w = sideArm(s, { x: 0.38 * ph - 0.04, out: armOut + 0.02, twistIn: 0.2, fx: -0.22 - 0.25 * Math.max(0, -ph), curl: 0.45 });
      mixArm(base, w, walkW);
      const r = sideArm(s, { x: 0.85 * ph - 0.25, out: armOut + 0.06, twistIn: 0.35, fx: -1.45 + 0.25 * ph, fz: 0.15, curl: 1.0 });
      mixArm(base, r, move * run);
      // air
      const a = sideArm(s, { x: -0.25 - 0.2 * vyN, out: 0.55 + 0.25 * vyN, twistIn: 0.1, fx: -0.5, curl: 0.3 });
      mixArm(base, a, air * 0.85);
      // talking gestures
      if (this.talkW > 0.01) {
        const g = this.gest;
        g.t -= dt;
        if (g.t <= 0) { g.t = 1.1 + Math.random() * 1.4; g.side = Math.random() < 0.5 ? 1 : -1; g.both = Math.random() < 0.3; g.amp = 0.5 + Math.random() * 0.6; }
        const active = (g.both || g.side === s) && !(this.umbOn && s < 0);
        const beat = Math.sin(t * 6.3 + s) * 0.18 * g.amp;
        const tk = active
          ? sideArm(s, { x: -0.42 * g.amp, out: armOut + 0.05, twistIn: 0.45, fx: -1.25 + beat, fz: 0.05, hz: 0.2, curl: 0.15 })
          : sideArm(s, { x: -0.05, out: armOut, twistIn: 0.2, fx: -0.35, curl: 0.35 });
        mixArm(base, tk, this.talkW * (1 - move * 0.7));
      }
      // NPC idle modes
      if (this.modeW.phone > 0.001) {
        const p = s > 0
          ? sideArm(s, { x: -0.3, out: 0.05, twistIn: 0.75, fx: -1.85, fz: 0.1, hx: 0.2, curl: 0.9 })
          : sideArm(s, { x: -0.18, out: 0.06, twistIn: 0.7, fx: -1.55, curl: 0.4 });
        mixArm(base, p, this.modeW.phone);
      }
      if (cw2 > 0.001) {
        // right hand wipes the counter in small circles, left hand rests (or waves at a customer)
        const wp = t * 2.6;
        let p;
        if (s < 0) p = sideArm(s, { x: -0.85 + 0.08 * Math.sin(wp), out: 0.16 + 0.07 * Math.cos(wp), twistIn: 0.55, fx: -0.78 + 0.1 * Math.cos(wp), hx: 0.5, curl: 0.8 });
        else p = sideArm(s, { x: -0.78, out: 0.18, twistIn: 0.5, fx: -0.8, hx: 0.6, curl: 0.3 });
        mixArm(base, p, cw2);
        if (s > 0 && cWave > 0.001) mixArm(base, sideArm(s, { x: -0.25, out: 1.45, twistIn: -1.45, fx: -1.45 + 0.38 * Math.sin(t * 10), curl: 0.05 }), cWave);
      }
      if (lw > 0.001) {
        const p = sideArm(s, { x: -0.42, out: 0.12, twistIn: 0.95, fx: -1.95 + (s > 0 ? 0.08 : -0.08), fz: 0.1, curl: 0.5 });
        mixArm(base, p, lw);
      }
      if (sw > 0.001) {
        const p = s < 0
          ? sideArm(s, { x: -0.55 - 0.15 * swp, out: 0.15, twistIn: 0.6, fx: -0.6, curl: 1 })
          : sideArm(s, { x: -0.75 - 0.15 * swp, out: 0.05, twistIn: 0.8, fx: -0.9, curl: 1 });
        mixArm(base, p, sw);
      }
      // umbrella (right arm), overrides most other things
      if (s < 0 && this.umbW > 0.001) {
        const u = sideArm(s, { x: -0.28 + 0.04 * Math.sin(t * 1.3), out: 0.3, twistIn: 0.3, fx: -1.55, fz: 0.0, hx: 0.0, curl: 1.0 });
        mixArm(base, u, this.umbW);
      }
      // emotes
      if (em && ew > 0.001) {
        const es = this.emoteSide;
        let p = null;
        if (em === 'wave') {
          p = s === es
            ? sideArm(s, { x: -0.25, out: 1.55, twistIn: -1.45, fx: -1.45 + 0.38 * Math.sin(et * 10), fz: 0, hx: 0, curl: 0.05 })
            : null;
        } else if (em === 'think') {
          p = s === es
            ? sideArm(s, { x: -0.62, out: -0.12, twistIn: 0.55, fx: -2.25, fz: 0.0, hx: 0.3, curl: 0.7 })
            : sideArm(s, { x: -0.38, out: 0.0, twistIn: 0.95, fx: -1.6, curl: 0.4 });
        } else if (em === 'cheer') {
          const pump = et > 0.3 ? Math.abs(Math.sin(et * 7.5)) : 0;
          p = s === es
            ? sideArm(s, { x: -2.7 + 0.15 * pump, out: 0.22, twistIn: 0, fx: -0.1 - 0.3 * pump, curl: 1.0 })
            : sideArm(s, { x: -0.35, out: 0.12, twistIn: 0.4, fx: -1.7, curl: 1.0 });
        } else if (em === 'pat') {
          // stroke the cat's back: reach down-forward, hand slides head->tail and lifts back
          // pat: lift slowly, come down onto the head (smooth both ways)
          const ph = (et * PAT.rate) % 1;
          const stroke = ph < 0.6 ? sstep(0, 1, ph / 0.6) : 1 - sstep(0, 1, (ph - 0.6) / 0.4);
          const slide = stroke;
          p = s === es
            ? sideArm(s, { x: PAT.x0 + PAT.xs * stroke, out: PAT.out, twistIn: 0.2, fx: PAT.fx0 + PAT.fxs * slide, hx: PAT.hx0 + PAT.hxs * slide, curl: 0.12 })
            : sideArm(s, { x: -0.55, out: 0.2, twistIn: 0.6, fx: -1.25, curl: 0.5 });      // other hand on the knee
        } else if (em === 'feed') {
          // both hands lower the bowl to the ground in front, then pull back
          const put = sstep(0.2, 1.2, et) * (1 - sstep(1.8, 2.5, et));
          p = sideArm(s, { x: lerp(FEED.x0, FEED.x1, put), out: FEED.out, twistIn: 0.75, fx: lerp(FEED.fx0, FEED.fx1, put), hx: 0.2, curl: 0.55 });
        } else if (em === 'play') {
          // underhand toss of the yarn ball: wind back, swing through (release at TOSS_AT), then clap while Spider pounces
          const wind = sstep(0, 0.3, et), swing = sstep(0.3, TOSS_AT + 0.08, et), clap = sstep(0.95, 1.3, et);
          p = s === es
            ? sideArm(s, { x: -0.2 + 0.95 * wind - 2.0 * swing, out: 0.2, twistIn: 0.3, fx: -0.6 - 0.4 * wind + 0.85 * swing, hx: 0.3 * wind - 0.2 * swing, curl: 0.9 - 0.75 * swing })
            : sideArm(s, { x: -0.3 - 0.25 * swing, out: 0.28, twistIn: 0.4, fx: -0.6, curl: 0.5 });
          const c2 = Math.abs(Math.sin((et - 1.0) * 11));
          mixArm(p, sideArm(s, { x: -1.15, out: 0.0 + 0.16 * c2, twistIn: 0.85, fx: -1.25, curl: 0.15 }), clap);
        }
        if (p && !(this.umbOn && s < 0)) mixArm(base, p, ew);
      }
      this._applyArm(A, base);
    }
  }

  _hipWorld(Lg, out) {
    // hip joint position in scaleG space
    const R = this.rig;
    R.hips.updateMatrix();
    return out.copy(Lg.up.position).applyMatrix4(R.hips.matrix);
  }

  _solveLeg(Lg, target, pitch, yaw) {
    const R = this.rig, d = this.d;
    R.hips.updateMatrix();
    _m.copy(R.hips.matrix).invert();
    const p = _v.copy(target).applyMatrix4(_m).sub(Lg.up.position);
    const L1 = d.thigh, L2 = d.shin;
    const gamma = Math.atan2(p.x, -p.y);
    const dy = -Math.hypot(p.x, p.y), dz = p.z;
    let dist = Math.hypot(dy, dz);
    dist = clamp(dist, 0.2, (L1 + L2) * 0.9995);
    const alpha = Math.atan2(dz, -dy);
    const cosK = clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1);
    const knee = Math.PI - Math.acos(cosK);
    const beta = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
    const thighX = -(alpha + beta);
    Lg.up.rotation.set(thighX, 0, gamma);
    Lg.low.rotation.set(knee, 0, 0);
    Lg.foot.rotation.set(pitch - (R.hips.rotation.x + thighX + knee), yaw - R.hips.rotation.y * 0.8, -gamma - R.hips.rotation.z);
  }

  _applyArm(A, p) {
    A.upper.rotation.set(p.x, p.y, p.z);
    A.fore.rotation.set(p.fx, p.fy, p.fz);
    A.hand.rotation.set(p.hx, 0, p.hz);
    A.fingers.rotation.set(0, 0, -A.side * p.curl * 1.35);
  }
}
