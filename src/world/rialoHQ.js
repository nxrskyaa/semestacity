// Rialo HQ: glass + cream-concrete tower terminating the main street.
// The official mark is only ever drawn through src/gfx/rialoLogo.js helpers
// (via textures.js wrappers) and always on planes matching the canvas aspect.
import * as THREE from 'three';
import { L, PAVE } from './layout.js';
import { boxGeo } from './builder.js';
import { glow, signMat, std } from './mats.js';
import * as T from './textures.js';
import { RIALO_CREAM, RIALO_INK } from '../gfx/rialoLogo.js';

/** width/height ratio the wordmark helper needs so its content is centred */
function wordmarkAspect(withMark) {
  const ctx = document.createElement('canvas').getContext('2d');
  const h = 256;
  ctx.font = `600 ${Math.round(h * 0.56)}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  const tw = ctx.measureText('rialo').width;
  const content = (withMark ? h * 0.98 : 0) + tw;
  return (content / 0.92) / h;
}

/** cream-glow wordmark material + plane size for a given height */
function wordmark(key, height, { withMark = true, fg = RIALO_CREAM, bg = null, glow: g = RIALO_CREAM, k = 2.4 } = {}) {
  const asp = wordmarkAspect(withMark);
  const H = 256 * 2;
  const tex = T.rialoWordmark(key, Math.round(H * asp), H, { bg, fg, withMark, glow: g });
  const mat = signMat(tex, k, { transparent: !bg, depthWrite: !!bg });
  return { mat, w: height * asp, h: height };
}

function markMat(key, { bg = null, fg = RIALO_CREAM, glowC = RIALO_CREAM, k = 2.4, margin = 0.06, w = 512, h = 512 } = {}) {
  const tex = T.rialoMark(key, w, h, { bg, fg, margin, glow: glowC });
  return signMat(tex, k, { transparent: !bg, depthWrite: !!bg });
}

export function buildRialoHQ(ctx) {
  const { batch: b, mats: M, coll, glows } = ctx;
  const P = L.plaza;
  const front = L.hq.maxZ; // -36
  const cream = std({ map: T.concrete('#d9d3c3', 'hqcream'), color: 0xffffff, roughness: 0.55, envMapIntensity: 0.7 });
  const creamSolid = std({ color: 0xe8e3d5, roughness: 0.4, emissive: 0xe8e3d5, emissiveIntensity: 0.06 });
  const ink = std({ color: 0x141414, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.0 });
  const creamGlow = glow(RIALO_CREAM, 2.2);
  const creamGlowSoft = glow(RIALO_CREAM, 1.3);

  // ------------------------------------------------ forecourt plaza
  const stone = std({ map: T.plazaStone(), roughness: 0.25, envMapIntensity: 1.2 });
  b.box(M.curb, 0, -0.02, (P.minZ + P.maxZ) / 2, P.maxX - P.minX, PAVE + 0.01, P.maxZ - P.minZ, { cast: false });
  b.floor(stone, P.minX, P.minZ, P.maxX, P.maxZ, PAVE, { uv: 2.4 });
  // walkway light strips
  for (const s of [-1, 1]) b.box(creamGlowSoft, s * 2.4, PAVE - 0.005, -28.6, 0.08, 0.02, 12.4, { cast: false });
  b.box(creamGlowSoft, 0, PAVE - 0.005, -22.6, 4.9, 0.02, 0.08, { cast: false });
  // bollards closing the road end
  for (let x = -3.2; x <= 3.21; x += 1.6) {
    b.cyl(ink, x, 0, -22.4, 0.11, 0.12, 0.85, 10);
    b.cyl(creamGlow, x, 0.85, -22.4, 0.105, 0.105, 0.04, 10, { cast: false });
    coll.addCircle(x, -22.4, 0.16);
  }
  // planters with hedges + benches
  const hedge = std({ color: 0x24442a, roughness: 0.85 });
  for (const s of [-1, 1]) {
    const px = s * 12.6;
    b.box(cream, px, PAVE, -32.2, 3.2, 0.55, 5.0, { uv: 1 });
    b.box(hedge, px, PAVE + 0.55, -32.2, 2.9, 0.55, 4.7);
    coll.addRect(px, -32.2, 3.2, 5.0, { maxY: 1.2 });
    b.box(M.wood, px - s * 2.3, PAVE + 0.42, -32.2, 0.5, 0.08, 2.2);
    b.box(ink, px - s * 2.3, PAVE, -32.2, 0.4, 0.42, 2.0);
    coll.addRect(px - s * 2.3, -32.2, 0.55, 2.2, { maxY: 0.6 });
    glows.pool(px, PAVE + 0.02, -32.2, 3.2, 0xe8e3d5, 0.25);
  }
  // modern plaza lamps
  const lampFace = glow(0xfff6e0, 3.0);
  for (const [x, z] of [[-6.8, -23.4], [6.8, -23.4], [-13.4, -26.0], [13.4, -26.0]]) {
    b.cyl(ink, x, PAVE, z, 0.07, 0.09, 4.6, 10);
    b.box(creamGlow, x - 0.04, PAVE + 1.0, z, 0.03, 3.4, 0.03, { cast: false });
    b.box(ink, x, PAVE + 4.6, z, 0.9, 0.08, 0.3);
    b.box(lampFace, x, PAVE + 4.58, z, 0.8, 0.02, 0.22, { cast: false });
    coll.addCircle(x, z, 0.14);
    glows.pool(x, PAVE + 0.02, z, 3.6, 0xfff0d8, 0.3);
    glows.streak(x, z, 0.8, 8, 0xfff0d8, 0.6, PAVE + 0.02);
  }

  // ------------------------------------------------ podium + glass lobby
  const pod = { minX: -13, maxX: 13, minZ: -48, maxZ: front, h: 7.2 };
  const lobbyBack = -45;
  coll.addBox(pod.minX, pod.minZ, pod.maxX, pod.maxZ + 0.15, { tag: 'hq' });
  // solid piers at the corners and flanking the doors
  for (const s of [-1, 1]) {
    b.box(cream, s * 12, 0, front - 4.5, 2, pod.h, 9, { uv: 1.5 });
    b.box(cream, s * 2.3, 0, front - 0.4, 1.2, 4.2, 0.8, { uv: 1.5 });
  }
  b.box(cream, 0, pod.h - 0.9, front - 0.4, 26, 0.9, 0.8, { uv: 1.5 });      // spandrel
  b.box(cream, 0, pod.h, -42, 26, 0.5, 12, { uv: 1.5 });                        // podium roof
  b.box(cream, 0, 0, (pod.minZ + lobbyBack) / 2, 26, pod.h, lobbyBack - pod.minZ, { uv: 1.5 });
  // lobby interior (seen through the glass)
  const lobbyFloor = std({ color: 0x1b1a18, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.4 });
  b.floor(lobbyFloor, -11, lobbyBack, 11, front - 0.2, PAVE);
  const wood = std({ color: 0x7a5a3c, roughness: 0.55, emissive: 0x3a2412, emissiveIntensity: 0.6 });
  b.plane(wood, -10.98, 3.2, (lobbyBack + front) / 2, 9, 6.2, { ry: Math.PI / 2 });
  b.plane(wood, 10.98, 3.2, (lobbyBack + front) / 2, 9, 6.2, { ry: -Math.PI / 2 });
  b.plane(std({ color: 0x2a2724, roughness: 0.6, emissive: 0x2a2724, emissiveIntensity: 0.5 }), 0, 3.2, lobbyBack + 0.01, 22, 6.2);
  b.plane(std({ color: 0xe8e3d5, roughness: 0.8, emissive: 0xe8e3d5, emissiveIntensity: 0.35 }), 0, 6.3, (lobbyBack + front) / 2, 22, 9, { rx: Math.PI / 2 });
  for (let z = lobbyBack + 1; z < front - 0.5; z += 1.6) b.box(creamGlow, 0, 6.2, z, 18, 0.04, 0.09, { cast: false });
  // lobby screen with the tagline
  const scr = signMat(T.hqLobbyScreen(), 1.7);
  b.box(ink, 0, 1.45, lobbyBack + 0.08, 10.4, 4.1, 0.14);
  b.plane(scr, 0, 3.5, lobbyBack + 0.16, 10, 3.75);
  // reception desk
  b.box(creamSolid, 0, PAVE, -41.2, 4.2, 1.1, 0.9);
  b.box(ink, 0, PAVE + 1.1, -41.2, 4.4, 0.06, 1.0);
  b.plane(markMat('desk', { bg: RIALO_CREAM, fg: RIALO_INK, glowC: null, k: 1.2, w: 256, h: 256, margin: 0.12 }), 0, PAVE + 0.6, -40.74, 0.7, 0.7);
  b.box(creamGlow, 0, PAVE + 0.02, -40.72, 4.1, 0.03, 0.03, { cast: false });
  // lobby plants
  for (const x of [-8.5, 8.5]) {
    b.cyl(ink, x, PAVE, -43.5, 0.4, 0.32, 0.7, 12);
    b.add(hedge, new THREE.IcosahedronGeometry(0.75, 1), { x, y: PAVE + 1.4, z: -43.5, sy: 1.4 });
  }
  // glass curtain + mullions
  b.plane(M.glass, 0, 3.15, front + 0.02, 20, 6.3, { cast: false });
  for (let x = -10; x <= 10.01; x += 2) if (Math.abs(x) > 1.7 || Math.abs(x) < 0.1) b.box(ink, x, PAVE, front + 0.05, 0.08, 6.2, 0.12);
  b.box(ink, 0, PAVE, front + 0.05, 20, 0.12, 0.14);
  // entrance doors
  b.box(ink, 0, PAVE + 3.0, front + 0.06, 3.4, 0.16, 0.18);
  for (const s of [-1, 1]) {
    b.box(ink, s * 1.65, PAVE, front + 0.06, 0.1, 3.0, 0.18);
    b.plane(std({ color: 0x8fa3b8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, envMapIntensity: 1.5 }), s * 0.8, PAVE + 1.5, front + 0.1, 1.55, 2.95, { cast: false });
    b.box(M.metalGrey, s * 0.1, PAVE + 0.9, front + 0.16, 0.04, 1.2, 0.04);
  }
  // plaque beside the door
  b.plane(signMat(T.hqPlaque(), 1.05), 2.3, PAVE + 2.0, front + 0.02, 0.96, 1.2);
  // "Get real, on Rialo." banners on the corner piers
  const ban = signMat(T.hqBanner(), 1.15);
  for (const s of [-1, 1]) {
    b.plane(ban, s * 12, PAVE + 3.4, front + 0.03, 1.4, 4.2);
    b.box(ink, s * 12, PAVE + 5.55, front + 0.06, 1.6, 0.06, 0.1);
    glows.pool(s * 12, PAVE + 0.02, front + 1.2, 2.2, 0xe8e3d5, 0.4);
  }

  // canopy
  const cz0 = front, cz1 = front + 4.6;
  b.box(creamSolid, 0, 4.25, (cz0 + cz1) / 2, 10, 0.32, cz1 - cz0);
  b.box(ink, 0, 4.2, cz1 - 0.02, 10.1, 0.08, 0.06);
  for (const s of [-1, 1]) {
    b.cyl(ink, s * 4.5, PAVE, cz1 - 0.45, 0.1, 0.1, 4.1, 12);
    coll.addCircle(s * 4.5, cz1 - 0.45, 0.16);
  }
  const downlight = glow(0xfff4e0, 3.0);
  for (let x = -3.6; x <= 3.61; x += 1.8) for (const z of [front + 1.4, front + 3.3]) {
    b.add(downlight, new THREE.CircleGeometry(0.12, 12), { x, y: 4.24, z, rx: Math.PI / 2 }, { cast: false });
    glows.pool(x, PAVE + 0.02, z, 1.4, 0xfff0d8, 0.18);
  }
  glows.streak(0, cz1, 6, 10, 0xfff0d8, 0.5, PAVE + 0.02);
  // wordmark sign standing on the canopy edge
  const cw = wordmark('canopy', 0.95, { k: 2.6 });
  b.box(ink, 0, 4.57, cz1 - 0.35, cw.w + 1.2, 1.25, 0.14);
  b.plane(cw.mat, 0, 5.2, cz1 - 0.27, cw.w, cw.h);
  b.box(creamGlow, 0, 4.57, cz1 - 0.27, cw.w + 1.2, 0.03, 0.03, { cast: false });
  ctx.roofs.push({ minX: -5.2, minZ: front - 0.2, maxX: 5.2, maxZ: cz1 + 0.1 });
  ctx.interactables.push({ id: 'hq-door', x: 0, z: front + 0.9, radius: 2.2, label: 'Rialo HQ' });

  // ------------------------------------------------ tower
  const tw = { minX: -10, maxX: 10, minZ: -54, maxZ: -40, y0: pod.h + 0.5, y1: 36 };
  const th = tw.y1 - tw.y0;
  const tcx = 0, tcz = (tw.minZ + tw.maxZ) / 2;
  b.box(M.glassDark, tcx, tw.y0, tcz, 19.6, th, 13.6);
  const office = signMat(T.windowGrid('office', 41, 6, 4), 0.5);
  // floor plates: 8 floors of 3.6 m
  const fh = 3.6;
  b.plane(office, tcx, tw.y0 + th / 2 - 1.2, tw.maxZ - 0.18, 19.4, th - 2.4, { uv: [19.4 * 6 / 12, fh * 4] });
  b.plane(office, -9.82, tw.y0 + th / 2 - 1.2, tcz, 13.4, th - 2.4, { ry: -Math.PI / 2, uv: [13.4 * 6 / 12, fh * 4] });
  b.plane(office, 9.82, tw.y0 + th / 2 - 1.2, tcz, 13.4, th - 2.4, { ry: Math.PI / 2, uv: [13.4 * 6 / 12, fh * 4] });
  b.plane(office, tcx, tw.y0 + th / 2 - 1.2, tw.minZ + 0.18, 19.4, th - 2.4, { ry: Math.PI, uv: [19.4 * 6 / 12, fh * 4] });
  for (let y = tw.y0; y < tw.y1 - 5; y += fh) {
    b.box(cream, tcx, y, tw.maxZ - 0.05, 20, 0.35, 0.3, { uv: 2 });
  }
  // vertical cream fins with light lines
  for (let x = -7.5; x <= 7.51; x += 2.5) {
    b.box(cream, x, tw.y0, tw.maxZ + 0.25, 0.28, th - 6, 0.7, { uv: 2 });
    if (Math.round(x / 2.5) % 2 === 0) b.box(creamGlowSoft, x, tw.y0 + 0.2, tw.maxZ + 0.61, 0.05, th - 6.4, 0.02, { cast: false });
  }
  // corner piers wrapping the tower
  for (const s of [-1, 1]) {
    b.box(cream, s * 9.3, tw.y0, tw.maxZ - 0.6, 1.4, th, 1.8, { uv: 2 });
    b.box(cream, s * 9.3, tw.y0, tw.minZ + 0.9, 1.4, th, 1.8, { uv: 2 });
    b.box(creamGlow, s * 10.02, tw.y0, tw.maxZ + 0.32, 0.04, th - 6, 0.04, { cast: false });
  }
  coll.addBox(tw.minX, tw.minZ, tw.maxX, tw.maxZ, { tag: 'hq' });

  // big facade sign band (dark ink) with the illuminated wordmark, low enough
  // to read from the spawn point down the main street
  const bandY = 9.4, bandH = 6.6;
  b.box(ink, tcx, bandY, tw.maxZ + 0.35, 21.2, bandH, 1.6);
  for (const y of [bandY + 0.14, bandY + bandH - 0.14]) b.box(creamGlow, tcx, y, tw.maxZ + 1.16, 21.2, 0.06, 0.06, { cast: false });
  for (const s of [-1, 1]) b.box(creamGlow, s * 10.58, bandY + 0.14, tw.maxZ + 1.16, 0.06, bandH - 0.28, 0.06, { cast: false });
  const big = wordmark('band', 4.6, { k: 2.8 });
  b.plane(big.mat, tcx, bandY + bandH / 2, tw.maxZ + 1.17, big.w, big.h);
  // crown: square glowing mark on all four faces
  const crownY = tw.y1 - 6.2, crownH = 6.2;
  b.box(ink, tcx, crownY, tcz + 0.4, 20.4, crownH, 14.4);
  for (const s of [-1, 1]) b.box(creamGlow, s * 10.22, crownY, tw.maxZ + 0.62, 0.05, crownH, 0.05, { cast: false });
  b.box(creamGlow, tcx, crownY + 0.1, tw.maxZ + 0.62, 20.4, 0.05, 0.05, { cast: false });
  const sideMark = markMat('crownSide', { k: 2.6 });
  b.plane(sideMark, tcx, crownY + crownH / 2, tw.maxZ + 0.63, 5.4, 5.4);
  for (const s of [-1, 1]) b.plane(sideMark, s * 10.22, crownY + crownH / 2, tcz + 0.4, 5.4, 5.4, { ry: s * Math.PI / 2 });
  b.plane(sideMark, tcx, crownY + crownH / 2, tw.minZ - 0.42, 5.4, 5.4, { ry: Math.PI });
  // rooftop parapet, mast + aviation light
  b.box(ink, tcx, tw.y1 + 0.4, tcz, 20.8, 0.5, 15.2);
  b.box(M.metalGrey, 4, tw.y1 + 0.9, tcz - 3, 3, 1.4, 2);
  b.cyl(M.metalGrey, -5, tw.y1 + 0.9, tcz - 2, 0.06, 0.08, 6, 6);
  const avi = glow(0xff2a1a, 4);
  b.add(avi, new THREE.SphereGeometry(0.22, 10, 8), { x: -5, y: tw.y1 + 7.0, z: tcz - 2 }, { cast: false });
  ctx.updaters.push((dt, t) => { const on = (t % 2.0) < 0.35; avi.color.setRGB(on ? 4 : 0.2, on ? 0.6 : 0.03, on ? 0.4 : 0.02); });

  // reflections of the HQ sign + lobby on the wet street
  glows.streak(-2.2, -35.0, 3.2, 30, 0xe8e3d5, 0.5, PAVE + 0.02);
  glows.streak(2.2, -35.0, 3.2, 30, 0xe8e3d5, 0.5, PAVE + 0.02);
  glows.streak(0, -35.4, 12, 14, 0xffe8c8, 0.45, PAVE + 0.02);
  glows.pool(0, PAVE + 0.02, -33.5, 7, 0xffe8c8, 0.14);

  // ------------------------------------------------ monument totem (two-sided)
  const mx = -9.4, mz = -26.4;
  const granite = std({ color: 0x2a2a2c, roughness: 0.25, metalness: 0.2, envMapIntensity: 1.2 });
  b.box(granite, mx, PAVE, mz, 2.0, 0.35, 1.1);
  b.box(ink, mx, PAVE + 0.35, mz, 1.5, 4.8, 0.5);
  const tm = markMat('totem', { k: 1.7, glowC: null, margin: 0.04 });
  const tword = wordmark('totem', 0.6, { withMark: false, k: 1.6, glow: null });
  for (const s of [1, -1]) {
    const fz = mz + s * 0.26;
    const ry = s > 0 ? 0 : Math.PI;
    b.plane(tm, mx, PAVE + 3.85, fz, 1.15, 1.15, { ry });
    b.plane(tword.mat, mx, PAVE + 2.75, fz, tword.w, tword.h, { ry });
    b.box(creamGlowSoft, mx, PAVE + 2.25, fz, 0.9, 0.025, 0.02, { cast: false });
  }
  for (const ex of [-0.76, 0.76]) b.box(creamGlowSoft, mx + ex, PAVE + 0.35, mz, 0.03, 4.8, 0.52, { cast: false });
  coll.addRect(mx, mz, 2.0, 1.1, { tag: 'totem' });
  glows.pool(mx, PAVE + 0.02, mz, 2.6, 0xe8e3d5, 0.5);
  glows.streak(mx, mz + 0.6, 1.4, 9, 0xe8e3d5, 0.6, PAVE + 0.02);

  // ------------------------------------------------ banner flags (two-sided)
  const flagTex = T.rialoMark('flag', 256, 704, { bg: RIALO_CREAM, fg: RIALO_INK, margin: 0.14 });
  const flagMat = std({ map: flagTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: flagTex, emissiveIntensity: 0.45 });
  for (const fx of [9.4, 11.2, 13.0]) {
    const fz = -27.4;
    b.cyl(M.metalGrey, fx, PAVE, fz, 0.05, 0.06, 7.4, 8);
    b.box(M.metalGrey, fx + 0.45, PAVE + 7.0, fz, 0.95, 0.04, 0.04);
    const fw = 0.9, fh2 = fw * 704 / 256;
    b.plane(flagMat, fx + 0.45, PAVE + 7.0 - fh2 / 2, fz + 0.012, fw, fh2);
    b.plane(flagMat, fx + 0.45, PAVE + 7.0 - fh2 / 2, fz - 0.012, fw, fh2, { ry: Math.PI });
    coll.addCircle(fx, fz, 0.12);
    glows.pool(fx + 0.45, PAVE + 0.02, fz, 1.4, 0xe8e3d5, 0.35);
  }

  ctx.addLight(0xffeccc, 10, 16, 0, 3.6, front + 5.5);
}
