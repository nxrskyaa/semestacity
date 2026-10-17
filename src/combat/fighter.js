// Fighter = robot body + arena physics + weapon handling + hit/stagger/knockdown state machine.
// Both the player and the AI drive a Fighter through the same "intent" object:
//   { mx, mz  (desired move dir in arena-local XZ, length 0..1),
//     jump, dash (edge-triggered), gun (held ok), bomb, pod (edge),
//     aimPoint: Vector3|null (gun aim, local), bombPoint: Vector3|null }
import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDelta } from '../core/util.js';
import { FLOOR_Y } from './arena.js';

export const MAX_HP = 1000;

export const STATS = {
  ray: {
    run: 4.7, accel: 32, airControl: 0.5, jump: 6.9, gravity: 18,
    dash: 12.5, dashTime: 0.22, dashCd: 0.8, airDash: 10.5, airDashTime: 0.28,
    gun: { burst: 3, interval: 0.09, cooldown: 1.1, speed: 21, dmg: 40, homing: 1.0, life: 1.0 },
    bomb: { cooldown: 2.6, dmg: 110, radius: 1.8 },
    pod: { cooldown: 5.0, dmg: 70, speed: 3.3, turn: 1.8, life: 6.5 },
  },
  fang: {
    run: 4.5, accel: 30, airControl: 0.5, jump: 6.9, gravity: 18,
    dash: 12.0, dashTime: 0.24, dashCd: 0.85, airDash: 10.0, airDashTime: 0.28,
    gun: { burst: 3, interval: 0.11, cooldown: 1.25, speed: 19, dmg: 40, homing: 0.9, life: 1.05 },
    bomb: { cooldown: 2.9, dmg: 110, radius: 1.8 },
    pod: { cooldown: 5.5, dmg: 70, speed: 3.0, turn: 1.6, life: 6.5 },
  },
};

const RADIUS = 0.34;
const DOWN_POINTS = { gun: 1, pod: 1.5, bomb: 2 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3();

export class Fighter {
  constructor({ kind, robot, arena, weapons, fx, audio, toLocal, cdScale = 1 }) {
    this.kind = kind;
    this.robot = robot;
    this.arena = arena;
    this.weapons = weapons;
    this.fx = fx;
    this.audio = audio;
    this.toLocal = toLocal;           // (worldVec3) -> arena-local (in place)
    this.st = STATS[kind] || STATS.ray;
    this.cdScale = cdScale;
    this.color = robot.info.bullet;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.mode = 'intro';              // intro|normal|dash|stagger|down|getup|ko|victory
    this.timer = 0;
    this.hp = MAX_HP; this.maxHp = MAX_HP;
    this.dead = false;
    this.invulnT = 0;
    this.downPts = 0; this.lastHit = -10;
    this.cd = { gun: 0, bomb: 0, pod: 0, dash: 0 };
    this.cdMax = { gun: this.st.gun.cooldown * cdScale, bomb: this.st.bomb.cooldown * cdScale, pod: this.st.pod.cooldown * cdScale, dash: this.st.dashCd };
    this.burstLeft = 0; this.burstT = 0;
    this.aim = 0; this.aimHold = 0; this.recoil = 0;
    this.throwT = 0; this.bombQueued = false; this.podQueued = 0;
    this.airDashUsed = false;
    this.dashDir = new THREE.Vector3();
    this.airTime = 0;
    this.victoryT = 0;
    this.aimPoint = new THREE.Vector3();
    this.bombPoint = new THREE.Vector3();
    this.hasBombPoint = false;
    this.stats = { shots: 0, hits: 0, dmgDealt: 0 };
    this.anim = { mode: 'idle', speed: 0, runSpeed: this.st.run, vy: 0, grounded: true, aim: 0, aimPitch: 0, aimYaw: 0,
      recoil: 0, throwT: 0, lookYaw: 0, lookPitch: 0, moveSide: 0, thrust: 0, invuln: false, victoryT: 0 };
    this.thrustEmit = 0;
  }

  get invuln() { return this.invulnT > 0 || this.mode === 'down' || this.mode === 'getup' || this.mode === 'ko' || this.dead; }
  get canAct() { return this.mode === 'normal' || this.mode === 'dash'; }
  get chestY() { return this.pos.y + 0.6; }

  place(x, z, yaw) {
    this.pos.set(x, FLOOR_Y, z); this.vel.set(0, 0, 0); this.yaw = yaw;
    this.robot.root.position.copy(this.pos); this.robot.root.rotation.y = yaw;
  }

  /** returns true if the hit was applied */
  takeHit(dmg, kind, dir, time) {
    if (this.invuln || this.dead) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.robot.hitFlash(1);
    this.burstLeft = 0; this.throwT = 0; this.bombQueued = false;
    this.downPts += DOWN_POINTS[kind] || 1;
    this.lastHit = time;
    if (this.hp <= 0) this.dead = true;
    if (this.downPts >= 3 || this.dead) {
      this.downPts = 0;
      this.mode = 'down';
      this.timer = 0;
      this.grounded = false;
      this.vel.set(dir.x * 5.2, this.dead ? 6.5 : 5.2, dir.z * 5.2);
      this.yaw = Math.atan2(-dir.x, -dir.z); // face the attacker, fly backwards
      this.audio.sfx('hit', { pitch: 0.7, volume: 1 });
    } else {
      this.mode = 'stagger';
      this.timer = kind === 'gun' ? 0.3 : 0.5;
      this.vel.x = dir.x * (kind === 'gun' ? 2.6 : 4.5);
      this.vel.z = dir.z * (kind === 'gun' ? 2.6 : 4.5);
      if (!this.grounded) this.vel.y = Math.max(this.vel.y, 1.5);
    }
    return true;
  }

  update(dt, time, intent, opp) {
    const st = this.st;
    const robot = this.robot;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    if (time - this.lastHit > 1.1) this.downPts = Math.max(0, this.downPts - dt * 1.6);
    this.recoil = Math.max(0, this.recoil - dt * 8);

    const toX = opp.pos.x - this.pos.x, toZ = opp.pos.z - this.pos.z;
    const oppYaw = Math.atan2(toX, toZ);
    const oppDist = Math.hypot(toX, toZ);
    let thrust = 0;
    let wantFaceOpp = false;

    // ------------------------------------------------ state machine
    switch (this.mode) {
      case 'intro':
      case 'victory':
      case 'ko':
        this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt);
        if (this.mode === 'victory') this.victoryT += dt;
        break;
      case 'stagger':
        this.timer -= dt;
        this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt);
        if (this.timer <= 0) this.mode = 'normal';
        break;
      case 'down':
        this.timer += dt;
        if (this.grounded) {
          this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt);
          if (this.dead) { if (this.timer > 0.3) this.mode = 'ko'; }
          else if (this.timer > 0.85) { this.mode = 'getup'; this.timer = 0; }
        }
        break;
      case 'getup':
        this.timer += dt;
        this.vel.x = 0; this.vel.z = 0;
        if (this.timer > 0.5) { this.mode = 'normal'; this.invulnT = 1.1; }
        break;
      case 'dash': {
        this.timer -= dt;
        const air = !this.grounded;
        const sp = air ? st.airDash : st.dash;
        this.vel.x = this.dashDir.x * sp; this.vel.z = this.dashDir.z * sp;
        if (air) this.vel.y = 0.4;
        thrust = 1;
        if (this.timer <= 0) {
          this.mode = 'normal';
          this.vel.x *= 0.45; this.vel.z *= 0.45;
        }
        break;
      }
      case 'normal': {
        // movement
        let mx = intent ? intent.mx : 0, mz = intent ? intent.mz : 0;
        const ml = Math.hypot(mx, mz);
        if (ml > 1) { mx /= ml; mz /= ml; }
        const tx = mx * st.run, tz = mz * st.run;
        const acc = this.grounded ? st.accel : st.accel * st.airControl;
        const lam = acc / st.run;
        this.vel.x = damp(this.vel.x, tx, lam, dt);
        this.vel.z = damp(this.vel.z, tz, lam, dt);
        if (intent) {
          if (intent.jump) {
            if (this.grounded) this.doJump();
            else if (!this.airDashUsed) this.doDash(mx, mz, oppYaw, true);
          }
          if (intent.dash) {
            if (this.grounded && this.cd.dash <= 0) this.doDash(mx, mz, oppYaw, false);
            else if (!this.grounded && !this.airDashUsed) this.doDash(mx, mz, oppYaw, true);
          }
        }
        if (!this.grounded) thrust = this.vel.y > 2 && this.airTime < 0.3 ? 0.75 : 0.18;
        break;
      }
      default: break;
    }

    // ------------------------------------------------ weapons
    if (intent && this.canAct && opp) {
      if (intent.gun && this.cd.gun <= 0 && this.burstLeft === 0) {
        this.burstLeft = st.gun.burst; this.burstT = 0.07;
        this.cd.gun = this.cdMax.gun;
        this.aimHold = 0.75;
      }
      if (intent.bomb && this.cd.bomb <= 0 && this.throwT <= 0) {
        this.cd.bomb = this.cdMax.bomb;
        this.throwT = 1; this.bombQueued = true;
        if (intent.bombPoint) { this.bombPoint.copy(intent.bombPoint); this.hasBombPoint = true; } else this.hasBombPoint = false;
      }
      if (intent.pod && this.cd.pod <= 0) {
        this.cd.pod = this.cdMax.pod;
        this.podQueued = 0.12;
      }
      if (intent.aimPoint) this.aimPoint.copy(intent.aimPoint);
      else this.aimPoint.set(opp.pos.x, opp.chestY, opp.pos.z);
    }
    if (!this.canAct) { this.burstLeft = 0; this.aimHold = 0; }
    this.aimHold = Math.max(0, this.aimHold - dt);
    this.aim = damp(this.aim, this.aimHold > 0 ? 1 : 0, 18, dt);
    if (this.aimHold > 0) wantFaceOpp = true;
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.fireBullet(opp);
        this.burstLeft--;
        this.burstT = st.gun.interval;
      }
    }
    if (this.throwT > 0) {
      const prev = this.throwT;
      this.throwT = Math.max(0, this.throwT - dt / 0.42);
      wantFaceOpp = true;
      if (this.bombQueued && prev > 0.55 && this.throwT <= 0.55 && this.canAct) {
        this.bombQueued = false;
        this.launchBomb(opp);
      }
    }
    if (this.podQueued > 0) {
      this.podQueued -= dt;
      if (this.podQueued <= 0 && this.canAct) this.launchPod(opp);
    }

    // ------------------------------------------------ physics
    if (!this.grounded && !(this.mode === 'dash')) this.vel.y -= st.gravity * dt;
    if (!this.grounded) this.airTime += dt;
    this.pos.addScaledVector(this.vel, dt);
    this.arena.resolveCircle(this.pos, RADIUS);
    const g = this.arena.groundAt(this.pos.x, this.pos.z, RADIUS, this.pos.y);
    if (this.grounded) {
      if (g < this.pos.y - 0.03) { this.grounded = false; this.airTime = 0.3; this.vel.y = 0; } // walked off a ledge
      else this.pos.y = g;
    } else if (this.pos.y <= g && this.vel.y <= 0) {
      this.pos.y = g;
      this.land();
    }
    if (this.pos.y < FLOOR_Y) this.pos.y = FLOOR_Y;

    // ------------------------------------------------ facing
    let targetYaw = this.yaw;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.mode === 'normal' || this.mode === 'dash') {
      if (wantFaceOpp || hs < 0.6) targetYaw = oppYaw;
      else targetYaw = Math.atan2(this.vel.x, this.vel.z);
      this.yaw = dampAngle(this.yaw, targetYaw, wantFaceOpp ? 18 : 12, dt);
    } else if (this.mode === 'intro' || this.mode === 'stagger') {
      this.yaw = dampAngle(this.yaw, oppYaw, 4, dt);
    }

    robot.root.position.copy(this.pos);
    robot.root.rotation.y = this.yaw;

    // ------------------------------------------------ animation state
    const a = this.anim;
    let mode = 'idle';
    switch (this.mode) {
      case 'normal': mode = this.grounded ? (hs > 0.4 ? 'run' : 'idle') : 'air'; break;
      case 'dash': mode = 'dash'; break;
      case 'stagger': mode = 'stagger'; break;
      case 'down': mode = 'down'; break;
      case 'ko': mode = 'ko'; break;
      case 'getup': mode = 'getup'; break;
      case 'victory': mode = 'victory'; break;
      default: mode = 'idle';
    }
    a.mode = mode;
    a.speed = hs; a.vy = this.vel.y; a.grounded = this.grounded;
    a.aim = this.aim; a.recoil = this.recoil; a.throwT = this.throwT;
    const relYaw = angleDelta(this.yaw, oppYaw);
    a.lookYaw = relYaw; a.aimYaw = clamp(relYaw, -0.6, 0.6);
    const dy = (opp.chestY) - (this.pos.y + 0.85);
    a.lookPitch = Math.atan2(dy, Math.max(0.5, oppDist));
    a.aimPitch = clamp(a.lookPitch, -0.7, 0.7);
    const cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    a.moveSide = clamp((this.vel.x * cs - this.vel.z * sn) / st.run, -1, 1);
    a.thrust = thrust;
    a.invuln = this.invulnT > 0;
    a.victoryT = this.victoryT;
    robot.animate(dt, time, a);

    // thruster particles
    if (thrust > 0.1) {
      this.thrustEmit += dt * 60 * thrust;
      while (this.thrustEmit > 1) {
        this.thrustEmit -= 1;
        const nodes = robot.thrusterNodes;
        const n = nodes[(Math.random() * nodes.length) | 0];
        n.getWorldPosition(_o); this.toLocal(_o);
        this.fx.spark(_o.x, _o.y - 0.04, _o.z,
          -sn * 1.2 + (Math.random() - 0.5) * 0.8, -2.2 - Math.random() * 1.5, -cs * 1.2 + (Math.random() - 0.5) * 0.8,
          robot.info.thrust, 0.07, 0.22, 0, 2);
      }
    }
  }

  doJump() {
    this.grounded = false;
    this.vel.y = this.st.jump;
    this.airDashUsed = false;
    this.airTime = 0;
    this.audio.sfx('jump');
    this.fx.ring(_v.set(this.pos.x, this.pos.y + 0.03, this.pos.z), this.robot.info.thrust, 0.15, 0.7, 0.35);
  }

  doDash(mx, mz, oppYaw, air) {
    let l = Math.hypot(mx, mz);
    if (l < 0.2) { mx = Math.sin(oppYaw); mz = Math.cos(oppYaw); l = 1; }
    this.dashDir.set(mx / l, 0, mz / l);
    this.mode = 'dash';
    this.timer = air ? this.st.airDashTime : this.st.dashTime;
    if (air) { this.airDashUsed = true; this.vel.y = 0.4; } else this.cd.dash = this.st.dashCd;
    this.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.audio.sfx('dash');
    this.fx.ring(_v.set(this.pos.x, this.pos.y + (air ? 0.5 : 0.04), this.pos.z), this.robot.info.thrust, 0.2, 0.9, 0.3,
      air ? _w.copy(this.dashDir) : null);
  }

  land() {
    const wasDown = this.mode === 'down';
    this.grounded = true;
    this.airDashUsed = false;
    if (this.vel.y < -2 || wasDown) {
      this.audio.sfx('land', { volume: wasDown ? 1 : 0.6 });
      this.fx.ring(_v.set(this.pos.x, this.pos.y + 0.03, this.pos.z), this.robot.info.thrust, 0.2, wasDown ? 1.2 : 0.8, 0.35);
      if (wasDown) { this.fx.shake(0.06); this.timer = 0; }
    }
    this.vel.y = 0;
    this.airTime = 0;
    if (this.mode === 'dash') { /* keep dashing along the ground */ }
  }

  muzzleLocal(out) {
    this.robot.muzzle.updateWorldMatrix(true, false);
    this.robot.muzzle.getWorldPosition(out);
    return this.toLocal(out);
  }

  fireBullet(opp) {
    const st = this.st.gun;
    this.muzzleLocal(_o);
    // keep the spawn point inside the arena and above the floor
    if (_o.y < FLOOR_Y + 0.15) _o.y = FLOOR_Y + 0.15;
    _v.copy(this.aimPoint).sub(_o);
    if (_v.lengthSq() < 0.01) _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _v.normalize();
    // limit how far off the facing a shot may go (no shooting backwards)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const fdot = _v.x * fx + _v.z * fz;
    if (fdot < 0.3) { _v.x = fx; _v.z = fz; _v.y = 0; _v.normalize(); }
    this.weapons.fireBullet(this, _o, _v, opp, { speed: st.speed, dmg: st.dmg, homing: st.homing, life: st.life, color: this.color });
    this.fx.muzzle(_o, _v, this.color);
    this.recoil = 1;
    this.stats.shots++;
    this.audio.sfx('shoot', { volume: 0.55, pitch: this.kind === 'fang' ? 0.85 : 1.05 });
  }

  launchBomb(opp) {
    this.robot.bombPort.updateWorldMatrix(true, false);
    this.robot.bombPort.getWorldPosition(_o); this.toLocal(_o);
    if (!this.hasBombPoint) _v.set(opp.pos.x + opp.vel.x * 0.45, opp.pos.y, opp.pos.z + opp.vel.z * 0.45);
    else _v.copy(this.bombPoint);
    this.weapons.fireBomb(this, _o, _v, { dmg: this.st.bomb.dmg, radius: this.st.bomb.radius, color: this.color });
    this.fx.flash(_o, this.color, 0.14, 0.12);
    this.stats.shots++;
    this.audio.sfx('bomb');
  }

  launchPod(opp) {
    this.robot.podPort.updateWorldMatrix(true, false);
    this.robot.podPort.getWorldPosition(_o); this.toLocal(_o);
    const p = this.st.pod;
    this.weapons.firePod(this, _o, opp, { dmg: p.dmg, speed: p.speed, turn: p.turn, life: p.life, color: this.color });
    this.fx.flash(_o, this.color, 0.12, 0.1);
    this.stats.shots++;
    this.audio.sfx('shoot', { pitch: 0.6, volume: 0.6 });
  }

  setVictory() { this.mode = 'victory'; this.victoryT = 0; this.burstLeft = 0; this.aimHold = 0; }
}
