// Third-person player controller + orbit follow camera.
import * as THREE from 'three';
import { input } from './input.js';
import { clamp, damp, dampAngle } from './util.js';

const WALK = 2.0, RUN = 5.2, ACCEL = 14, GRAV = 22, JUMP_V = 6.4, RADIUS = 0.32;

export class PlayerController {
  constructor({ avatar, collision, camera, roofs = [], groundAt = null }) {
    this.groundAt = groundAt || (() => 0);
    this.avatar = avatar;
    this.collision = collision;
    this.camera = camera;
    this.roofs = roofs;
    this.root = avatar.root;
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.facing = 0;
    this.speed = 0;
    // camera orbit
    this.yaw = Math.PI;      // camera azimuth around player
    this.pitch = 0.22;
    this.dist = 3.5;
    this.targetDist = 3.5;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.enabled = true;
    this.lookAt = null;
    this.talking = false;
    this.emote = null;
    this._tmp = new THREE.Vector3();
    this.lookSm = new THREE.Vector3();
    this.blend = null; // { t, dur, p0, l0 } eased hand-back from a cinematic camera
  }

  /** ease the follow camera in from an arbitrary camera position/look over `dur` seconds */
  blendFrom(pos, look, dur = 0.8) {
    this.blend = { t: 0, dur, p0: pos.clone(), l0: look.clone() };
  }

  /** camera target height: just above the avatar's eyes (characters are small chibis) */
  lookH() { const d = this.avatar.rig?.d; return d ? d.eyeY * d.scale + 0.08 : 1.2; }

  place(x, z, rotY = 0) {
    this.pos.set(x, this.groundAt(x, z), z);
    this.vy = 0; this.grounded = true;
    this.facing = rotY;
    this.root.rotation.y = rotY;
    this.yaw = rotY + Math.PI;
    this.snapCamera();
  }

  underRoof() {
    const { x, z } = this.pos;
    for (const r of this.roofs) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return true;
    return false;
  }

  update(dt) {
    const m = input.mouse;
    if (this.enabled && input.looking) {
      this.yaw -= m.dx * 0.0026;
      this.pitch = clamp(this.pitch + m.dy * 0.0022, -0.35, 1.1);
    }
    // keyboard orbit (arrow keys / Q-R), handy on trackpads
    if (this.enabled) {
      const kr = (input.down('KeyQ') ? 1 : 0) - (input.down('KeyR') ? 1 : 0);
      if (kr) this.yaw += kr * 2.2 * dt;
    }
    if (this.enabled) this.targetDist = clamp(this.targetDist + m.wheel * 0.5, 1.8, 7);

    // movement relative to camera
    let want = 0;
    const ax = this.enabled ? input.axis() : { x: 0, y: 0 };
    if (ax.x || ax.y) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // camera forward on XZ
      const rx = -fz, rz = fx;
      let dx = fx * ax.y + rx * ax.x, dz = fz * ax.y + rz * ax.x;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      want = (input.down('ShiftLeft') || input.down('ShiftRight') ? RUN : WALK) * (this.speedMul || 1);
      this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);
      this.vel.x = damp(this.vel.x, dx * want, ACCEL * 0.6, dt);
      this.vel.z = damp(this.vel.z, dz * want, ACCEL * 0.6, dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, ACCEL, dt);
      this.vel.z = damp(this.vel.z, 0, ACCEL, dt);
    }
    if (this.enabled && this.grounded && input.pressed('Space')) {
      this.vy = JUMP_V; this.grounded = false;
      this.onJump && this.onJump();
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collision.resolve(this.pos, RADIUS, this.pos.y);
    const gy = this.groundAt(this.pos.x, this.pos.z);
    if (!this.grounded) {
      this.vy -= GRAV * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gy) { this.pos.y = gy; this.grounded = true; this.onLand && this.onLand(-this.vy); this.vy = 0; }
    } else if (gy < this.pos.y - 0.25) {
      this.grounded = false; this.vy = 0; // walked off a ledge
    } else {
      this.pos.y = damp(this.pos.y, gy, 30, dt); // step up/down curbs smoothly
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.root.rotation.y = this.facing;

    this.avatar.update(dt, {
      speed: this.speed, grounded: this.grounded, vy: this.vy,
      talking: this.talking, emote: this.emote, lookAt: this.lookAt, raining: !this.noUmbrella && !this.underRoof(),
    });
    this.emote = null;
    this.updateCamera(dt);
  }

  idealCamera(out, look) {
    this.dist = this.targetDist;
    look.set(this.pos.x, this.pos.y + this.lookH(), this.pos.z);
    const cp = Math.cos(this.pitch);
    out.set(
      look.x + Math.sin(this.yaw) * cp * this.dist,
      look.y + Math.sin(this.pitch) * this.dist,
      look.z + Math.cos(this.yaw) * cp * this.dist,
    );
    // pull in if a wall is between player and camera (march along the ray)
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = look.x + (out.x - look.x) * t, z = look.z + (out.z - look.z) * t, y = look.y + (out.y - look.y) * t;
      if (this.collision.pointBlocked(x, z, y)) {
        // never closer than ~1.4 m; lift over the obstacle instead (indoor shelves, walls)
        const k = Math.max(1.4 / this.dist, (i - 1.5) / steps);
        out.set(look.x + (out.x - look.x) * k, look.y + (out.y - look.y) * k + (1 - k) * 0.55, look.z + (out.z - look.z) * k);
        break;
      }
    }
    if (out.y < 0.25) out.y = 0.25;
    return out;
  }

  snapCamera() {
    this.idealCamera(this.camPos, this.camLook);
    this.lookSm.copy(this.camLook);
    this.blend = null;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  updateCamera(dt) {
    const ideal = this.idealCamera(this._tmp, this.camLook);
    const k = 1 - Math.exp(-12 * dt);
    this.camPos.lerp(ideal, k);
    this.lookSm.lerp(this.camLook, 1 - Math.exp(-18 * dt));
    if (this.blend) {
      const b = this.blend;
      b.t = Math.min(b.dur, b.t + dt);
      const x = b.t / b.dur, e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      this.camera.position.lerpVectors(b.p0, this.camPos, e);
      this._tmp.lerpVectors(b.l0, this.lookSm, e);
      this.camera.lookAt(this._tmp);
      if (b.t >= b.dur) this.blend = null;
      return;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookSm);
  }
}
