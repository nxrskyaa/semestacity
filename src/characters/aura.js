// Cheap character auras (appearance.aura): sprite particles orbiting / rising around the avatar.
//  sparkle   – twinkling star sprites spiralling up
//  hearts    – small pink hearts floating up and fading
//  rialoRing – small cream official Rialo marks orbiting slowly around the waist
import * as THREE from 'three';
import { makeCanvas, canvasTex } from '../core/util.js';
import { makeRialoTexture, RIALO_CREAM } from '../gfx/rialoLogo.js';

let _star = null, _heart = null, _mark = null;
function starTex() {
  if (_star) return _star;
  const [c, x] = makeCanvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,245,200,0.7)'); g.addColorStop(1, 'rgba(255,240,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#fff';
  x.beginPath(); x.moveTo(32, 2); x.lineTo(35, 29); x.lineTo(62, 32); x.lineTo(35, 35); x.lineTo(32, 62); x.lineTo(29, 35); x.lineTo(2, 32); x.lineTo(29, 29); x.closePath(); x.fill();
  _star = canvasTex(c);
  return _star;
}
function heartTex() {
  if (_heart) return _heart;
  const [c, x] = makeCanvas(64, 64);
  x.shadowColor = 'rgba(255,120,180,0.9)'; x.shadowBlur = 8;
  x.fillStyle = '#ff7eb6';
  x.beginPath(); x.moveTo(32, 54); x.bezierCurveTo(4, 34, 8, 8, 32, 20); x.bezierCurveTo(56, 8, 60, 34, 32, 54); x.fill();
  x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.ellipse(22, 24, 5, 3, -0.6, 0, Math.PI * 2); x.fill();
  _heart = canvasTex(c);
  return _heart;
}
function markTex() {
  if (_mark) return _mark;
  _mark = makeRialoTexture(128, 128, { bg: null, fg: RIALO_CREAM, margin: 0.08, glow: 'rgba(232,227,213,0.8)' });
  return _mark;
}

/** returns { root (add to avatar root), update(dt, t), dispose() } or null for 'none' */
export function createAura(id) {
  if (!id || id === 'none') return null;
  const root = new THREE.Group();
  root.name = 'aura';
  const items = [];
  const mats = [];
  const mk = (tex, color, size, additive = true) => {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
    mats.push(m);
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.raycast = () => {};
    root.add(s);
    return s;
  };
  if (id === 'sparkle') {
    for (let i = 0; i < 22; i++) items.push({ s: mk(starTex(), new THREE.Color('#fff2c0').multiplyScalar(1.6), 0.07), a: Math.random() * 6.28, r: 0.42 + Math.random() * 0.18, h: Math.random(), sp: 0.25 + Math.random() * 0.25, tw: Math.random() * 6 });
  } else if (id === 'hearts') {
    for (let i = 0; i < 10; i++) items.push({ s: mk(heartTex(), new THREE.Color('#ffffff'), 0.09, false), a: Math.random() * 6.28, r: 0.38 + Math.random() * 0.15, h: Math.random(), sp: 0.18 + Math.random() * 0.12, tw: Math.random() * 6 });
  } else if (id === 'rialoRing') {
    for (let i = 0; i < 6; i++) items.push({ s: mk(markTex(), new THREE.Color('#ffffff').multiplyScalar(1.25), 0.16, false), a: (i / 6) * Math.PI * 2, r: 0.5, h: 0, sp: 0, tw: i });
  }
  return {
    root,
    update(dt, t) {
      for (const it of items) {
        if (id === 'rialoRing') {
          const a = it.a + t * 0.45;
          it.s.position.set(Math.sin(a) * it.r, 0.95 + 0.06 * Math.sin(t * 1.3 + it.tw), Math.cos(a) * it.r);
          it.s.material.opacity = 0.9;
          continue;
        }
        it.h = (it.h + dt * it.sp * 0.6) % 1;
        const a = it.a + t * (id === 'sparkle' ? 0.8 : 0.3);
        it.s.position.set(Math.sin(a) * it.r, 0.15 + it.h * 1.6, Math.cos(a) * it.r);
        const fade = Math.sin(Math.PI * it.h);
        it.s.material.opacity = fade * (id === 'sparkle' ? 0.55 + 0.45 * Math.sin(t * 7 + it.tw) : 0.9);
      }
    },
    dispose() { for (const m of mats) m.dispose(); root.removeFromParent(); },
  };
}
