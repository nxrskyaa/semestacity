// "Rialo Gacha": a row of three capsule-toy machines under a small canopy in front
// of Semesta Mart (west glass front), plus Spider's cat bed next to the bins.
import * as THREE from 'three';
import { rng } from '../core/util.js';
import { PAVE } from './layout.js';
import { trs } from './builder.js';
import { glow, signMat, std } from './mats.js';
import * as T from './textures.js';
import { paintRialoMark, RIALO_CREAM, RIALO_INK } from '../gfx/rialoLogo.js';

const _m = new THREE.Matrix4();

function gachaHeaderTex() {
  return T.paintTex('rialoGacha', 1024, 192, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d8262c'); g.addColorStop(1, '#a8141c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = RIALO_CREAM; x.lineWidth = 8; x.strokeRect(8, 8, w - 16, h - 16);
    // official mark (helper, uniform scale) in a cream roundel
    x.fillStyle = RIALO_CREAM;
    x.beginPath(); x.arc(h * 0.62, h / 2, h * 0.36, 0, Math.PI * 2); x.fill();
    paintRialoMark(x, h * 0.6, { x: h * 0.32, y: h * 0.2, bg: null, fg: RIALO_INK });
    x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillStyle = '#fff6e6'; x.shadowColor = '#ffd0a0'; x.shadowBlur = 14;
    T.fitText(x, 'RIALO GACHA', w * 0.56, h * 0.5, 900, T.LATIN);
    x.fillText('RIALO GACHA', h * 1.12, h * 0.42);
    x.shadowBlur = 0; x.fillStyle = '#ffd36a';
    T.fitText(x, 'ガチャガチャ  ·  CAPSULE TOYS  ·  1回 1 PULL', w * 0.6, h * 0.17, 700, T.JP);
    x.fillText('ガチャガチャ  ·  CAPSULE TOYS  ·  1回 1 PULL', h * 1.14, h * 0.78);
    // little capsule doodles on the right
    const cols = ['#ffd84a', '#38e1ff', '#ff6ec7', '#7cff9a'];
    cols.forEach((c, i) => {
      const cx = w - 70 - i * 46, cy = h / 2 + (i % 2 ? 18 : -18);
      x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 18, 0, Math.PI); x.fill();
      x.fillStyle = c; x.beginPath(); x.arc(cx, cy, 18, Math.PI, Math.PI * 2); x.fill();
    });
  });
}

/** one atlas for the three series cards (256 px each) + the Rialo sticker (128 px) */
function gachaAtlas() {
  return T.paintTex('gachaAtlas', 1024, 256, (ctx) => {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.beginPath(); ctx.rect(i * 256, 0, 256, 256); ctx.clip();
      ctx.translate(i * 256, 0);
      paintCard(ctx, i, 256, 256);
      ctx.restore();
    }
    // official mark sticker (helper, uniform scale) on cream
    paintRialoMark(ctx, 128, { x: 768, y: 0, bg: RIALO_CREAM, fg: RIALO_INK, margin: 0.14 });
  });
}

function paintCard(x, i, w, h) {
    x.fillStyle = '#f2e8d2'; x.fillRect(0, 0, w, h);
    x.fillStyle = ['#d8262c', '#1f8fd8', '#e0388a'][i % 3];
    x.fillRect(0, 0, w, 50);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `900 30px ${T.LATIN}`;
    x.fillText(['SERIES 01', 'SERIES 02', 'SERIES 03'][i % 3], w / 2, 27);
    x.fillStyle = '#2a1a12'; x.font = `700 22px ${T.JP}`;
    x.fillText('1回', w * 0.25, h - 34);
    x.font = `900 26px ${T.LATIN}`; x.fillText('1 PULL', w * 0.66, h - 34);
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 3; x.strokeRect(4, 54, w - 8, h - 98);
    // capsule-toy lineup illustration
    const cols = [['#ff2e5a', '#ffc400', '#00b8f0'], ['#1f6bff', '#ff2e8a', '#22d36a'], ['#8a3bff', '#ffc400', '#ff6a00']][i % 3];
    cols.forEach((c, k) => {
      const cx = 52 + k * 76, cy = 128 + (k % 2) * 18, r = 30;
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI); x.fill();
      x.fillStyle = c; x.beginPath(); x.arc(cx, cy, r, Math.PI, Math.PI * 2); x.fill();
      x.strokeStyle = '#2a1a12'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx + r, cy); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(cx - 11, cy - 13, 6, 0, 7); x.fill();
    });
    x.fillStyle = '#d8262c'; x.font = `900 20px ${T.LATIN}`; x.fillText('★ RARE INSIDE ★', w / 2, 190);
}

/** PlaneGeometry whose UVs map to a pixel rect of the 1024x256 atlas */
function atlasPlane(w, h, px, py, pw, ph) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, (px + uv.getX(k) * pw) / 1024, 1 - (py + (1 - uv.getY(k)) * ph) / 256);
  }
  return g;
}

/**
 * row of machines facing -X against the konbini glass at x = wallX.
 * returns { root, crank, cranks, spot } (spot = interactable point in front of the middle machine)
 */
export function buildGacha(ctx, { wallX = 7.5, zs = [-18.55, -17.6, -16.65] } = {}) {
  const { batch: b, mats: M, coll, glows, root, interactables } = ctx;
  const R = rng(5151);
  const ry = -Math.PI / 2; // local +Z (front) -> world -X
  const depth = 0.6;
  const mx = wallX - 0.14 - depth / 2; // machine centre x

  const red = std({ color: 0xd2232a, roughness: 0.32, metalness: 0.25, envMapIntensity: 1.1, emissive: 0x400406, emissiveIntensity: 0.6 });
  const creamM = std({ color: 0xf2e8d2, roughness: 0.45, emissive: 0xf2e8d2, emissiveIntensity: 0.18 });
  const chrome = std({ color: 0xdfe3e8, roughness: 0.18, metalness: 0.95, envMapIntensity: 1.6 });
  const dark = std({ color: 0x15161a, roughness: 0.5 });
  const crankMat = std({ color: 0xffffff, vertexColors: true, roughness: 0.2, metalness: 0.85, envMapIntensity: 1.5 });
  const trim = glow(0xff9ab0, 2.2);
  const trimB = glow(0xfff0c8, 2.0);
  const glass = new THREE.MeshStandardMaterial({ color: 0xdff2ff, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.1, envMapIntensity: 0.9, depthWrite: false });

  const group = new THREE.Group();
  group.name = 'rialoGacha';
  root.add(group);
  const flapMat = new THREE.MeshStandardMaterial({ color: 0xffb0c8, roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
  const atlasMat = signMat(gachaAtlas(), 1.05);
  const capsTop = [];
  const cranks = [];
  const domeY = 1.4, domeR = 0.34;
  const capR = 0.058;
  const palettes = [
    [0xff1e3c, 0xffc400, 0x00b8f0, 0x22d36a, 0xff6a00],
    [0x1f6bff, 0x8a3bff, 0x00c2e0, 0xff2e8a, 0xffc400],
    [0xff2e8a, 0xffc400, 0x22d36a, 0xff1e3c, 0x8a3bff],
  ];

  zs.forEach((mz, i) => {
    const M0 = new THREE.Matrix4().compose(new THREE.Vector3(mx, PAVE, mz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
    const put = (mat, geo, t, opts) => {
      geo.applyMatrix4(trs(t, _m)).applyMatrix4(M0);
      b.add(mat, geo, null, opts);
      geo.dispose();
    };
    const box = (mat, x, y0, z, w, h, d, opts) => put(mat, new THREE.BoxGeometry(w, h, d), { x, y: y0 + h / 2, z }, opts);
    // plinth + body
    box(dark, 0, 0, 0, 0.8, 0.08, depth + 0.04, { cast: false });
    box(red, 0, 0.08, 0, 0.76, 0.94, depth);
    // rounded front edges (vertical chrome strips)
    for (const sx of [-0.375, 0.375]) box(chrome, sx, 0.08, depth / 2 - 0.01, 0.03, 0.94, 0.03);
    // cream front panel with the series card
    box(creamM, 0, 0.2, depth / 2, 0.62, 0.66, 0.02);
    put(atlasMat, atlasPlane(0.3, 0.3, (i % 3) * 256, 0, 256, 256), { x: -0.13, y: 0.68, z: depth / 2 + 0.012 }, { cast: false });
    put(atlasMat, atlasPlane(0.12, 0.12, 768, 0, 128, 128), { x: 0.19, y: 0.78, z: depth / 2 + 0.012 }, { cast: false });
    // coin slot plate
    box(chrome, 0.19, 0.56, depth / 2 + 0.01, 0.14, 0.12, 0.03);
    box(dark, 0.19, 0.6, depth / 2 + 0.026, 0.02, 0.06, 0.01, { cast: false });
    // capsule chute: dark mouth + chrome rim + flap
    box(chrome, 0, 0.24, depth / 2 + 0.005, 0.3, 0.2, 0.05);
    box(dark, 0, 0.26, depth / 2 + 0.032, 0.24, 0.15, 0.01, { cast: false });
    put(flapMat, new THREE.PlaneGeometry(0.24, 0.12), { x: 0, y: 0.355, z: depth / 2 + 0.05, rx: -0.5 }, { cast: false });
    // glowing trim lines (bloom a little)
    box(trim, 0, 0.995, depth / 2 + 0.005, 0.74, 0.025, 0.012, { cast: false });
    box(trimB, 0, 0.1, depth / 2 + 0.025, 0.7, 0.02, 0.01, { cast: false });
    // collar + glow ring + dome + cap
    put(red, new THREE.CylinderGeometry(0.37, 0.38, 0.08, 28), { y: 1.06 });
    put(trim, new THREE.CylinderGeometry(0.372, 0.372, 0.018, 28, 1, true), { y: 1.1 }, { cast: false });
    put(chrome, new THREE.CylinderGeometry(0.35, 0.35, 0.03, 28), { y: 1.115 });
    put(glass, new THREE.SphereGeometry(domeR, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.86), { y: domeY }, { cast: false, receive: false });
    put(red, new THREE.CylinderGeometry(0.11, 0.15, 0.07, 20), { y: domeY + domeR - 0.01 });
    put(creamM, new THREE.SphereGeometry(0.05, 12, 8), { y: domeY + domeR + 0.08 });
    // capsules (top half colour, bottom half cream) packed in the lower part of the dome
    const pal = palettes[i % palettes.length];
    const placed = [];
    for (let tries = 0; tries < 900 && placed.length < 34; tries++) {
      const p = new THREE.Vector3((R() * 2 - 1) * 0.29, (R() * 2 - 1) * 0.29, (R() * 2 - 1) * 0.29);
      if (p.length() > domeR - capR - 0.015) continue;
      if (p.y > 0.08) continue;
      if (domeY + p.y - capR < 1.14) continue;
      if (placed.some((q) => q.distanceTo(p) < capR * 1.95)) continue;
      placed.push(p);
    }
    for (const p of placed) {
      const w = p.clone(); w.y += domeY;
      w.applyMatrix4(M0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6.28, R() * 6.28, R() * 6.28));
      capsTop.push({ m: new THREE.Matrix4().compose(w, q, new THREE.Vector3(1, 1, 1)), c: pal[Math.floor(R() * pal.length)] });
    }
    // crank (own object so core can spin it): hub + T-handle + grips, axis = machine front normal
    const crank = new THREE.Group();
    crank.name = 'gachaCrank' + i;
    const parts = [];
    const cg = (g, t, c) => {
      g.applyMatrix4(trs(t, _m));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      const ng = g.index ? g.toNonIndexed() : g;
      const col = new THREE.Color(c), arr = new Float32Array(ng.attributes.position.count * 3);
      for (let k = 0; k < arr.length; k += 3) { arr[k] = col.r; arr[k + 1] = col.g; arr[k + 2] = col.b; }
      ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      parts.push(ng);
    };
    cg(new THREE.CylinderGeometry(0.1, 0.11, 0.04, 24), { rx: Math.PI / 2, z: 0.02 }, 0xffffff);
    cg(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 12), { rx: Math.PI / 2, z: 0.07 }, 0xffffff);
    cg(new THREE.BoxGeometry(0.3, 0.05, 0.04), { z: 0.105 }, 0xffffff);
    for (const s of [-1, 1]) cg(new THREE.SphereGeometry(0.032, 12, 8), { x: s * 0.15, z: 0.105 }, 0xd2232a);
    cg(new THREE.SphereGeometry(0.036, 12, 8), { z: 0.13 }, 0xd2232a);
    const cm = new THREE.Mesh(mergeTo(parts), crankMat);
    crank.add(cm);
    // holder carries the placement; core spins crank.rotation.z (axis = machine front normal)
    const holder = new THREE.Group();
    holder.position.copy(new THREE.Vector3(-0.06, 0.48, depth / 2 + 0.01).applyMatrix4(M0));
    holder.rotation.set(0, ry, 0);
    holder.add(crank);
    group.add(holder);
    cranks.push(crank);
    // a capsule waiting in the middle machine's tray
    if (i === 1) {
      const w = new THREE.Vector3(0, 0.2 + capR, depth / 2 + 0.11).applyMatrix4(M0);
      capsTop.push({ m: new THREE.Matrix4().compose(w, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0.2)), new THREE.Vector3(1, 1, 1)), c: 0xffd84a });
      box(dark, 0, 0.16, depth / 2 + 0.11, 0.26, 0.04, 0.16);
    }
  });
  coll.addBox(mx - depth / 2 - 0.05, zs[0] - 0.42, wallX, zs[zs.length - 1] + 0.42, { tag: 'gacha' });

  // capsules: two instanced hemispheres (2 draw calls for every machine)
  const hemi = new THREE.SphereGeometry(capR, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const hemiB = hemi.clone().rotateX(Math.PI);
  const capMat = std({ color: 0xffffff, roughness: 0.3, metalness: 0.0, envMapIntensity: 0.5 });
  const capMatB = std({ color: 0xe9e4d8, roughness: 0.35, envMapIntensity: 0.6 });
  const top = new THREE.InstancedMesh(hemi, capMat, capsTop.length);
  const bot = new THREE.InstancedMesh(hemiB, capMatB, capsTop.length);
  const col = new THREE.Color();
  capsTop.forEach((c, k) => {
    top.setMatrixAt(k, c.m); bot.setMatrixAt(k, c.m);
    top.setColorAt(k, col.set(c.c));
  });
  top.name = 'gachaCapsules';
  group.add(top, bot);

  // ------------------------------------------------ canopy over the machines + cat corner
  const z0 = -19.55, z1 = -13.15, cy = PAVE + 2.75;
  const frameM = std({ color: 0x2a2d33, roughness: 0.4, metalness: 0.7 });
  const poly = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.35, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide });
  b.box(frameM, wallX - 0.72, cy, (z0 + z1) / 2, 1.44, 0.07, z1 - z0);
  b.box(poly, wallX - 0.72, cy + 0.07, (z0 + z1) / 2, 1.4, 0.02, z1 - z0 - 0.1, { cast: false });
  b.box(frameM, wallX - 1.42, cy - 0.12, (z0 + z1) / 2, 0.06, 0.2, z1 - z0);
  for (const z of [z0 + 0.1, (z0 + z1) / 2, z1 - 0.1]) {
    const len = Math.hypot(1.2, 0.9);
    b.box(frameM, wallX - 0.6, cy - 0.45 - len / 2, z, 0.05, len, 0.05, { rz: -Math.atan2(1.2, 0.9) });
  }
  // underside light strip (fake light) + soft pool
  b.box(glow(0xfff2e0, 2.4), wallX - 1.0, cy - 0.03, (z0 + z1) / 2, 0.12, 0.02, z1 - z0 - 0.4, { cast: false });
  glows.pool(wallX - 1.2, PAVE + 0.02, -17.6, 2.4, 0xffb8c8, 0.22);
  glows.pool(wallX - 0.9, PAVE + 0.02, -13.6, 1.4, 0xfff0d8, 0.3);
  glows.streak(wallX - 0.8, -17.6, 2.6, 7, 0xff8aa8, 0.5, PAVE + 0.02);
  ctx.roofs.push({ minX: wallX - 1.45, minZ: z0, maxX: wallX + 0.1, maxZ: z1 });
  // header lightbox on the wall above the machines
  const hz = (zs[0] + zs[zs.length - 1]) / 2;
  const hw = 3.0, hh = hw * 192 / 1024;
  b.box(frameM, wallX - 0.1, PAVE + 2.02, hz, 0.14, hh + 0.12, hw + 0.12);
  b.plane(signMat(gachaHeaderTex(), 1.45), wallX - 0.175, PAVE + 2.08 + hh / 2, hz, hw, hh, { ry });
  const gl = ctx.addLight(0xffc2d0, 5, 5.5, wallX - 1.3, PAVE + 2.4, hz, 2);

  // ------------------------------------------------ Spider's cat bed (cardboard box + cushion + bowl)
  const home = { x: 6.95, z: -13.55 };
  const card = std({ color: 0xb7864e, roughness: 0.85 });
  const bw = 0.62, bd = 0.46, bh = 0.2;
  b.box(card, home.x, PAVE, home.z, bw, 0.02, bd);
  for (const s of [-1, 1]) {
    b.box(card, home.x + s * (bw / 2 - 0.01), PAVE, home.z, 0.02, bh, bd);
    b.box(card, home.x, PAVE, home.z + s * (bd / 2 - 0.01), bw, bh, 0.02);
  }
  b.box(card, home.x + bw / 2 + 0.06, PAVE + bh - 0.01, home.z, 0.14, 0.015, bd, { rz: -0.5 }); // open flap
  b.cyl(std({ color: 0x8a2a3a, roughness: 0.9 }), home.x, PAVE + 0.02, home.z, 0.21, 0.23, 0.07, 18);
  b.cyl(std({ color: 0xe8e8ee, roughness: 0.3, metalness: 0.4 }), home.x - 0.5, PAVE, home.z + 0.12, 0.08, 0.06, 0.05, 14);
  b.plane(signMat(T.signTex('catSign', 256, 96, { bg: '#f4efe2', fg: '#2a1a12', text: 'スパイダー', sub: 'SPIDER · please be nice', border: '#2a1a12' }), 0.9), 7.36, PAVE + 0.55, home.z, 0.42, 0.16, { ry });

  const spot = { x: mx - depth / 2 - 0.85, z: zs[1] };
  interactables.push({ id: 'gacha', x: spot.x, z: spot.z, radius: 1.8, label: 'Rialo Gacha' });
  const center = new THREE.Vector3(mx, PAVE + 1.0, zs[1]);
  return { root: group, crank: cranks[1], cranks, spot, center, home, light: gl };
}

function mergeTo(parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const col = parts[0].attributes.color ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of parts) {
    if (col) col.set(g.attributes.color.array, o * 3);
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
