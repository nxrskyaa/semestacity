// Rival AI: strafes at mid range, ducks behind cover cubes and lobs bombs over them,
// jumps / dashes away from incoming shots after a reaction delay, fires with lead prediction.
// difficulty (0.5 .. 2, default 1) scales reaction time, accuracy, dodge chance and aggression.
// Produces the same intent object the player controller does (see fighter.js).
import * as THREE from 'three';
import { rng, clamp } from '../core/util.js';
import { ARENA_A, octDist, FLOOR_Y } from './arena.js';

export function createAI({ self, target, arena, weapons, difficulty = 1, seed = 7 }) {
  const R = rng(seed);
  const D = clamp(difficulty, 0.3, 2.5);
  const P = {
    reaction: 0.42 / D,                  // s before reacting to a threat
    aimErr: 0.75 / D,                    // m of random aim error
    lead: clamp(0.45 + 0.3 * D, 0, 1),   // fraction of perfect lead
    dodge: clamp(0.25 + 0.25 * D, 0, 0.9),
    fireGate: 0.8 + 0.6 * D,             // gun trigger attempts / s when ready
    bombGate: 0.3 + 0.25 * D,
    podGate: 0.08 + 0.06 * D,
    range: [3.6, 6.2],
  };

  const intent = { mx: 0, mz: 0, jump: false, dash: false, gun: false, bomb: false, pod: false, aimPoint: new THREE.Vector3(), bombPoint: new THREE.Vector3() };
  let strafe = R() < 0.5 ? 1 : -1;
  let strafeT = 1.5 + R() * 2;
  let mode = 'engage', modeT = 3 + R() * 3;
  let coverSpot = new THREE.Vector3();
  let coverCube = null;
  let threatT = -1, threatDir = new THREE.Vector3();
  let dodgeCd = 0;
  let dashBurst = 0;
  let thinkT = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();

  function pickCover() {
    let best = null, bestD = 1e9;
    for (const c of arena.cubes) {
      if (c.h < 0.9) continue; // too low to hide behind
      _a.set(c.x - target.pos.x, 0, c.z - target.pos.z);
      const l = _a.length() || 1;
      _a.divideScalar(l);
      const off = Math.max(c.hx, c.hz) + 0.65;
      _b.set(c.x + _a.x * off, FLOOR_Y, c.z + _a.z * off);
      if (octDist(_b.x, _b.z) > ARENA_A - 0.6) continue;
      const d = _b.distanceTo(self.pos) + (l < 2 ? 3 : 0);
      if (d < bestD) { bestD = d; best = c; coverSpot.copy(_b); }
    }
    coverCube = best;
    return best;
  }

  function update(dt, time) {
    intent.jump = intent.dash = intent.gun = intent.bomb = intent.pod = false;
    if (!self.canAct && self.mode !== 'stagger') { intent.mx = intent.mz = 0; return intent; }
    dodgeCd -= dt; strafeT -= dt; modeT -= dt; thinkT -= dt;

    const sx = self.pos.x, sz = self.pos.z;
    const toX = target.pos.x - sx, toZ = target.pos.z - sz;
    const dist = Math.hypot(toX, toZ) || 0.001;
    const dx = toX / dist, dz = toZ / dist;
    _e.set(sx, self.pos.y + 0.6, sz);
    _f.set(target.pos.x, target.pos.y + 0.6, target.pos.z);
    const los = arena.lineOfSight(_e, _f);

    // -------------------------------------------- mode selection
    if (modeT <= 0) {
      if (mode === 'engage') {
        const behind = self.hp < target.hp - 150;
        if ((behind && R() < 0.6) || R() < 0.3) {
          if (pickCover()) { mode = 'cover'; modeT = 2.5 + R() * 2; }
          else modeT = 2 + R() * 2;
        } else modeT = 2.5 + R() * 3;
      } else { mode = 'engage'; modeT = 3 + R() * 3.5; }
    }
    if (strafeT <= 0) { strafe = R() < 0.65 ? -strafe : strafe; strafeT = 1.2 + R() * 2.2; }

    // -------------------------------------------- movement
    let mx = 0, mz = 0;
    if (mode === 'cover' && coverCube) {
      // re-evaluate the hiding spot as the target moves
      if (thinkT <= 0) { pickCover(); thinkT = 0.4; }
      const cx = coverSpot.x - sx, cz = coverSpot.z - sz;
      const cl = Math.hypot(cx, cz);
      if (cl > 0.35) { mx = cx / cl; mz = cz / cl; }
      else { mx = -dz * strafe * 0.25; mz = dx * strafe * 0.25; } // small peek shuffle
    } else {
      const [rMin, rMax] = P.range;
      let radial = 0;
      if (dist > rMax) radial = 1; else if (dist < rMin) radial = -1; else radial = (dist - (rMin + rMax) / 2) * 0.25;
      mx = -dz * strafe * 0.9 + dx * radial * 0.8;
      mz = dx * strafe * 0.9 + dz * radial * 0.8;
    }
    // keep off the walls
    const od = octDist(sx, sz);
    if (od > ARENA_A - 1.3) {
      const l = Math.hypot(sx, sz) || 1;
      const k = (od - (ARENA_A - 1.3)) * 1.4;
      mx -= sx / l * k; mz -= sz / l * k;
      // flip strafe if it pushes us into the wall
      if ((-dz * strafe) * sx + (dx * strafe) * sz > 0 && strafeT > 0.4) { strafe = -strafe; strafeT = 0.8 + R(); }
    }
    // steer around cubes we are not using as cover
    for (const c of arena.cubes) {
      if (self.pos.y >= c.top - 0.05) continue;
      const qx = Math.max(c.minX, Math.min(sx, c.maxX)), qz = Math.max(c.minZ, Math.min(sz, c.maxZ));
      const ex = sx - qx, ez = sz - qz;
      const d = Math.hypot(ex, ez);
      if (d < 0.75 && d > 0.001 && !(mode === 'cover' && c === coverCube)) {
        const k = (0.75 - d) * 2.2;
        mx += ex / d * k; mz += ez / d * k;
      }
    }
    // dodge bomb markers aimed near us
    weapons.activeBombs((b) => {
      if (b.owner === self) return;
      const bx = sx - b.target.x, bz = sz - b.target.z;
      const bd = Math.hypot(bx, bz);
      if (bd < b.radius + 0.6 && bd > 0.001 && R() < 0.5 + 0.4 * P.dodge) { mx += bx / bd * 2; mz += bz / bd * 2; }
    });

    // -------------------------------------------- threat detection (incoming bullets)
    if (threatT < 0 && dodgeCd <= 0) {
      weapons.forEachActiveBullet((b) => {
        if (threatT >= 0 || b.owner === self) return;
        const rx = sx - b.pos.x, rz = sz - b.pos.z;
        const rd = Math.hypot(rx, rz);
        if (rd > 5) return;
        const vl = Math.hypot(b.vel.x, b.vel.z) || 1;
        const vx = b.vel.x / vl, vz = b.vel.z / vl;
        const along = rx * vx + rz * vz;
        if (along < 0) return;
        const perp = Math.abs(rx * vz - rz * vx);
        if (perp < 0.8) {
          if (R() < P.dodge) { threatT = P.reaction * (0.6 + R() * 0.8); threatDir.set(vx, 0, vz); }
          dodgeCd = 0.6;
        }
      });
    }
    if (threatT >= 0) {
      threatT -= dt;
      if (threatT < 0) {
        if (self.grounded) {
          if (R() < 0.45) intent.jump = true;
          else { intent.dash = true; dashBurst = 0.1; strafe = R() < 0.5 ? 1 : -1; }
        } else if (R() < 0.5) { intent.jump = true; } // air dash
        dodgeCd = 1.0 + R() * 0.6;
        // dodge sideways relative to the shot
        mx = -threatDir.z * strafe; mz = threatDir.x * strafe;
      }
    }
    if (dashBurst > 0) { dashBurst -= dt; mx = -threatDir.z * strafe; mz = threatDir.x * strafe; }
    // occasional aggressive hop
    if (self.grounded && R() < dt * 0.25 * D) intent.jump = true;
    // air dash toward strafe while airborne sometimes
    if (!self.grounded && !self.airDashUsed && self.vel.y < 0.5 && R() < dt * 0.8 * D) intent.jump = true;

    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    intent.mx = mx; intent.mz = mz;

    // -------------------------------------------- attacks
    const tvx = target.vel.x, tvz = target.vel.z;
    if (self.cd.gun <= 0 && los && dist < 9 && R() < dt * P.fireGate * 3) {
      const t = dist / self.st.gun.speed;
      intent.aimPoint.set(
        target.pos.x + tvx * t * P.lead + (R() - 0.5) * 2 * P.aimErr,
        target.pos.y + 0.55 + (R() - 0.5) * P.aimErr * 0.5,
        target.pos.z + tvz * t * P.lead + (R() - 0.5) * 2 * P.aimErr);
      intent.gun = true;
    }
    const wantBomb = !los || mode === 'cover' || (dist > 2.5 && dist < 8 && R() < 0.4);
    if (self.cd.bomb <= 0 && wantBomb && R() < dt * P.bombGate * (los ? 1 : 3)) {
      const T = Math.min(1.15, Math.max(0.6, 0.5 + dist * 0.075)) + 0.42 * 0.45;
      intent.bombPoint.set(
        target.pos.x + tvx * T * P.lead + (R() - 0.5) * 2 * P.aimErr,
        target.pos.y,
        target.pos.z + tvz * T * P.lead + (R() - 0.5) * 2 * P.aimErr);
      intent.bomb = true;
    }
    if (self.cd.pod <= 0 && dist > 3 && R() < dt * P.podGate) intent.pod = true;
    return intent;
  }

  return { update, intent, params: P };
}
