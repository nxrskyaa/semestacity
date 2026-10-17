// NPC actor: avatar + idle behaviour ('stand' | 'phone' | 'lean' | 'sweep' | 'counter' | 'wander'),
// notices the player within ~4 m (head first, then body if > 60deg), talking + emotes.
import * as THREE from 'three';
import { createAvatar } from './avatar.js';
import { createGLBAvatar, hasModel } from './glbAvatar.js';
import { angleDelta, dampAngle, damp } from '../core/util.js';

const NOTICE = 4.0;

/** model: id of a preloaded GLB (public/models/<id>.glb); falls back to the procedural avatar when missing */
export function createNPC({ id, name, appearance, model = null, x = 0, y = 0, z = 0, rotY = 0, idle = 'stand', roofs = null }) {
  const app = { ...(appearance || {}), name: name || appearance?.name };
  const avatar = hasModel(model) ? createGLBAvatar(model, app) : createAvatar(app);
  const root = avatar.root;
  root.position.set(x, y, z);
  root.rotation.y = rotY;
  const home = new THREE.Vector3(x, y, z);
  const homeRot = rotY;
  const wander = idle === 'wander';
  avatar.setIdleMode(wander ? 'stand' : idle);

  let talking = false;
  let pendingEmote = null;
  let faceTarget = null;   // explicit faceTowards target (kept while talking)
  let bodyYaw = rotY;
  let noticed = false;
  let noticeT = 0;
  const lookAt = new THREE.Vector3();
  // wander state
  const W = { ang: Math.random() * Math.PI * 2, pause: 1 + Math.random() * 2, speed: 0, r: 1.3 };
  let speed = 0;

  const npc = {
    id, name: name || avatar.appearance.name, avatar, root, position: root.position,
    /** set rotation target toward a world point (e.g. the player when a dialog opens) */
    faceTowards(v) {
      faceTarget = faceTarget || new THREE.Vector3();
      faceTarget.copy(v);
    },
    setTalking(on) {
      talking = !!on;
    },
    emote(n) { pendingEmote = n; },
    setUnderRoof(on) { avatar.setUmbrella(!on); },
    update(dt, time, playerPos) {
      dt = Math.min(dt || 0, 0.1);
      const p = root.position;
      // roof check for the umbrella
      if (roofs) {
        let under = false;
        for (const r of roofs) if (p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ) { under = true; break; }
        avatar.setUmbrella(!under);
      }
      let dist = Infinity;
      if (playerPos) dist = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
      const near = dist < NOTICE;
      if (faceTarget && !talking && dist > NOTICE + 1) faceTarget = null; // conversation over, player walked off
      if (near !== noticed) { noticed = near; noticeT = 0; }
      noticeT += dt;

      // --- locomotion (wander loop around the home spot)
      let wantSpeed = 0;
      if (wander && !talking && !near) {
        if (W.pause > 0) {
          W.pause -= dt;
        } else {
          W.ang += dt * 0.65;
          const tx = home.x + Math.sin(W.ang) * W.r, tz = home.z + Math.cos(W.ang) * W.r * 0.8;
          const dx = tx - p.x, dz = tz - p.z;
          const l = Math.hypot(dx, dz);
          if (l > 0.05) {
            const yaw = Math.atan2(dx, dz);
            bodyYaw = dampAngle(bodyYaw, yaw, 4, dt);
            wantSpeed = Math.min(1.1, l * 2.5);
          }
          if (Math.random() < dt * 0.08) W.pause = 1.5 + Math.random() * 2.5;
        }
      }
      speed = damp(speed, wantSpeed, 5, dt);
      if (speed > 0.01) {
        p.x += Math.sin(root.rotation.y) * speed * dt;
        p.z += Math.cos(root.rotation.y) * speed * dt;
      }

      // --- attention: head first, body if the angle is large or while talking
      let look = null;
      const tgt = faceTarget || (near ? playerPos : null);
      if (tgt) {
        lookAt.set(tgt.x, (tgt.y || 0) + 1.1, tgt.z);   // eye height of a ~1.35 m chibi
        if (faceTarget && faceTarget.y > 0.5) lookAt.y = faceTarget.y;
        look = lookAt;
        const yawTo = Math.atan2(tgt.x - p.x, tgt.z - p.z);
        const off = Math.abs(angleDelta(root.rotation.y, yawTo));
        if (faceTarget || talking || (off > Math.PI / 3 && noticeT > 0.5)) bodyYaw = yawTo;
      } else if (!wander) {
        bodyYaw = noticeT > 2 ? homeRot : bodyYaw;
      }
      root.rotation.y = dampAngle(root.rotation.y, bodyYaw, talking || faceTarget ? 5 : 2.6, dt);
      const turning = Math.abs(angleDelta(root.rotation.y, bodyYaw));

      avatar.setAttention(!!tgt);
      avatar.update(dt, {
        speed: Math.max(speed, turning > 0.3 ? 0.35 : 0), grounded: true, vy: 0,
        talking, emote: pendingEmote, lookAt: look, raining: true,
      });
      pendingEmote = null;
      void time;
    },
    dispose() { avatar.dispose(); },
  };
  return npc;
}
