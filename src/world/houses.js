// Residential + filler buildings, Kopi Rialo cafe, apartment block, props
// (bikes, plants, bins, AC units), jizō shrine and the distant skyline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/util.js';
import { gableRoof, boxGeo, trs } from './builder.js';
import { glow, signMat, std } from './mats.js';
import { L, PAVE } from './layout.js';
import * as T from './textures.js';

const R = rng(2024);
const pick = (a) => a[Math.floor(R() * a.length)];

/** windows on one face of an axis-aligned box. face: 'px'|'nx'|'pz'|'nz' */
function faceWindows(ctx, minX, minZ, maxX, maxZ, face, y, n, ww, wh, { litP = 0.7, margin = 0.9, frame = true } = {}) {
  const { batch: b, mats: M } = ctx;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const alongX = face === 'pz' || face === 'nz';
  const len = alongX ? maxX - minX : maxZ - minZ;
  const ry = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[face];
  const out = 0.03;
  const lit = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -len / 2 + margin + (len - 2 * margin) * i / (n - 1);
    const x = alongX ? cx + t : face === 'px' ? maxX + out : minX - out;
    const z = alongX ? (face === 'pz' ? maxZ + out : minZ - out) : cz + t;
    const on = R() < litP;
    const mat = on ? pick(M.winLit) : M.winDark;
    b.plane(mat, x, y, z, ww, wh, { ry });
    if (frame) {
      // sill
      const sx = alongX ? x : x + (face === 'px' ? 0.06 : -0.06);
      const sz = alongX ? z + (face === 'pz' ? 0.06 : -0.06) : z;
      b.box(M.concrete, sx, y - wh / 2 - 0.06, sz, alongX ? ww + 0.15 : 0.14, 0.06, alongX ? 0.14 : ww + 0.15, { cast: false });
    }
    if (on) lit.push([x, z]);
  }
  return lit;
}

/** a 2-storey Japanese house; front = face the door is on */
function house(ctx, minX, minZ, maxX, maxZ, { front = 'nx', floors = 2, wall = null, roof = null, ridgeX = null, door = true } = {}) {
  const { batch: b, mats: M, coll, glows } = ctx;
  const wallMat = wall || pick([M.sidingA, M.sidingB, M.plasterA, M.plasterC, M.sidingC]);
  const roofMat = roof || pick([M.roofTile, M.roofTileB, M.roofTileC, M.roofTile]);
  const w = maxX - minX, d = maxZ - minZ, h = floors * 2.75;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  b.box(M.concreteDark, cx, 0, cz, w + 0.1, 0.45, d + 0.1, { uv: 1 });
  b.box(wallMat, cx, 0.45, cz, w, h - 0.45, d, { uv: 1 });
  // floor band
  if (floors > 1) b.box(M.concrete, cx, 2.75, cz, w + 0.08, 0.12, d + 0.08, { uv: 1 });
  const alongX = ridgeX ?? (w >= d);
  gableRoof(b, roofMat, wallMat, cx, h, cz, alongX ? w : d, alongX ? d : w, Math.min(2.0, (alongX ? d : w) * 0.32), { ry: alongX ? 0 : Math.PI / 2, over: 0.5 });
  coll.addBox(minX, minZ, maxX, maxZ, { tag: 'house' });

  const faces = ['px', 'nx', 'pz', 'nz'];
  for (const f of faces) {
    const flen = f === 'pz' || f === 'nz' ? w : d;
    const isFront = f === front;
    for (let fl = 0; fl < floors; fl++) {
      const n = Math.max(1, Math.floor(flen / (isFront ? 2.6 : 3.4)));
      if (!isFront && R() < 0.35) continue;
      faceWindows(ctx, minX, minZ, maxX, maxZ, f, 1.55 + fl * 2.75, n, isFront ? 1.2 : 0.9, isFront ? 1.1 : 0.9, { litP: fl === 0 ? 0.65 : 0.5, margin: Math.min(1.1, flen / 4) });
    }
  }
  // small rain hood over ground-floor front + door + porch light
  const ry = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[front];
  const nx = Math.sin(ry), nz = Math.cos(ry);
  const fx = front === 'px' ? maxX : front === 'nx' ? minX : cx;
  const fz = front === 'pz' ? maxZ : front === 'nz' ? minZ : cz;
  const along = front === 'pz' || front === 'nz' ? w : d;
  b.box(M.metalDark, fx + nx * 0.35, 2.45, fz + nz * 0.35, nz ? along * 0.9 : 0.7, 0.06, nz ? 0.7 : along * 0.9, { cast: true });
  if (door) {
    const off = along * 0.3;
    const dx = fx + nx * 0.03 + (nz ? off : 0), dz = fz + nz * 0.03 + (nx ? off : 0);
    b.plane(M.woodDark, dx, 1.0, dz, 0.95, 2.0, { ry });
    b.plane(M.lampWarm, dx + (nz ? 0.75 : 0) + nx * 0.02, 1.95, dz + (nx ? 0.75 : 0) + nz * 0.02, 0.14, 0.2, { ry });
    glows.pool(dx + nx * 0.9, PAVE + 0.01, dz + nz * 0.9, 1.6, 0xffb870, 0.45);
  }
  // AC outdoor unit on a side
  const side = front === 'nx' || front === 'px' ? 'pz' : 'px';
  const ax = side === 'px' ? maxX + 0.25 : cx + w * 0.25, az = side === 'pz' ? maxZ + 0.25 : cz - d * 0.2;
  b.box(M.plasterC, ax, 0.45, az, side === 'px' ? 0.35 : 0.8, 0.6, side === 'px' ? 0.8 : 0.35);
  return { cx, cz, h, fx, fz, nx, nz };
}

/** concrete block fence along a line with an optional gate gap */
function blockFence(ctx, x0, z0, x1, z1, h = 1.2, gap = null) {
  const { batch: b, mats: M, coll } = ctx;
  const segs = gap ? [[0, gap[0]], [gap[1], 1]] : [[0, 1]];
  for (const [a, c] of segs) {
    const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * c, bz = z0 + (z1 - z0) * c;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.1) continue;
    const ry = Math.atan2(bx - ax, bz - az);
    b.box(M.block, (ax + bx) / 2, 0, (az + bz) / 2, 0.15, h, len, { ry, uv: [0.8, 0.4] });
    b.box(M.concrete, (ax + bx) / 2, h, (az + bz) / 2, 0.2, 0.06, len, { ry });
    coll.addBox(Math.min(ax, bx) - 0.1, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, Math.max(az, bz) + 0.1, { maxY: h, tag: 'fence' });
  }
}

function bikeGeometry() {
  const parts = [];
  const add = (g, t) => { g.applyMatrix4(trs(t)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); parts.push(g.index ? g.toNonIndexed() : g); };
  for (const x of [-0.52, 0.52]) add(new THREE.TorusGeometry(0.31, 0.025, 5, 18), { x, y: 0.33 });
  const tube = (a, c, r = 0.02) => {
    const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
    const len = va.distanceTo(vc);
    const g = new THREE.CylinderGeometry(r, r, len, 5);
    const mid = va.clone().add(vc).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vc.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    parts.push(g.toNonIndexed());
  };
  tube([-0.52, 0.33, 0], [-0.05, 0.36, 0]); tube([-0.05, 0.36, 0], [0.38, 0.78, 0]); tube([-0.52, 0.33, 0], [-0.15, 0.82, 0]);
  tube([-0.05, 0.36, 0], [-0.15, 0.82, 0]); tube([-0.15, 0.82, 0], [0.38, 0.78, 0]); tube([0.52, 0.33, 0], [0.38, 0.95, 0]);
  tube([0.38, 0.95, -0.25], [0.38, 0.95, 0.25]);
  add(new THREE.BoxGeometry(0.22, 0.05, 0.12), { x: -0.17, y: 0.88 });
  add(new THREE.BoxGeometry(0.32, 0.22, 0.34), { x: 0.6, y: 0.82 });
  return mergeGeometries(parts, false);
}

export function buildHouses(ctx) {
  const { batch: b, mats: M, coll, glows } = ctx;
  const bikes = (ctx.bikes ||= []);
  const plants = (ctx.plants ||= []);

  // ------------------------------------------------ east residential (south of the cross street)
  const e1 = house(ctx, 10.2, 5.6, 17.0, 11.6, { front: 'nx', wall: M.sidingA });
  const e2 = house(ctx, 10.2, 13.6, 16.6, 19.6, { front: 'nx', wall: M.plasterA, roof: M.roofTileB });
  house(ctx, 10.2, 21.4, 16.8, 25.4, { front: 'nx', wall: M.sidingB });
  house(ctx, 19.2, 5.8, 25.6, 12.0, { front: 'nz', wall: M.plasterC, roof: M.roofTileC });
  house(ctx, 19.0, 14.2, 25.6, 21.4, { front: 'nx', wall: M.sidingC });
  blockFence(ctx, 7.8, 4.4, 7.8, 12.6, 1.2, [0.38, 0.55]);
  blockFence(ctx, 7.8, 12.9, 7.8, 20.6, 1.2, [0.42, 0.6]);
  blockFence(ctx, 7.8, 20.9, 7.8, 25.7, 1.2);
  blockFence(ctx, 8.0, 4.4, 26.2, 4.4, 1.2, [0.62, 0.72]);
  bikes.push([8.6, 7.0, 0.2, 0xd03030, 0], [8.7, 8.2, 0.1, 0x3060c0, 0], [8.5, 16.5, -0.15, 0xe0e0e0, 0], [9.0, 15.4, 3.0, 0x2f8f50, 0]);
  plants.push([8.3, 6.0, 1, 0], [8.3, 9.6, 1, 0], [8.4, 14.0, 1, 0], [8.4, 18.5, 1, 0], [9.2, 12.2, 1, 0], [17.6, 4.9, 1, 0], [21.2, 5.1, 1, 0]);

  // ------------------------------------------------ west: corner shop-house, shrine, apartment
  // south-west corner: dry cleaner with shutter + upstairs flat
  b.box(M.plasterB, -9.85, 0, 7.7, 5.3, 6.0, 6.0, { uv: 1 });
  coll.addBox(-12.5, 4.7, -7.2, 10.7, { tag: 'shop' });
  gableRoof(b, M.roofTile, M.plasterB, -9.85, 6.0, 7.7, 6.0, 5.3, 1.5, { ry: Math.PI / 2 });
  b.plane(std({ map: T.shutter(3), roughness: 0.45, metalness: 0.5 }), -7.13, 1.3, 7.7, 4.4, 2.5, { ry: Math.PI / 2, uv: 1 });
  b.plane(signMat(T.signTex('cleaning', 512, 128, { bg: '#e8f2ff', fg: '#1b4fa0', text: 'クリーニング 白波', border: '#1b4fa0' }), 1.5), -7.1, 2.95, 7.7, 4.4, 0.75, { ry: Math.PI / 2 });
  faceWindows(ctx, -12.5, 4.7, -7.2, 10.7, 'px', 4.4, 2, 1.3, 1.2);
  faceWindows(ctx, -12.5, 4.7, -7.2, 10.7, 'nz', 4.4, 2, 1.2, 1.1, { litP: 0.8 });
  // jizō shrine in a tiny niche next to it
  const sx = -7.75, sz = 11.35;
  b.box(M.concreteDark, sx, PAVE, sz, 0.8, 0.4, 0.8);
  b.box(M.woodDark, sx, PAVE + 0.4, sz, 0.75, 0.9, 0.7);
  b.box(std({ color: 0x8a1a12, roughness: 0.5 }), sx, PAVE + 1.3, sz, 0.95, 0.08, 0.95);
  b.box(std({ color: 0x8a1a12, roughness: 0.5 }), sx, PAVE + 1.38, sz, 0.6, 0.18, 0.95);
  b.cyl(std({ color: 0x8f8a80, roughness: 0.9 }), sx + 0.32, PAVE + 0.45, sz, 0.12, 0.14, 0.42, 10);
  b.add(std({ color: 0x8f8a80, roughness: 0.9 }), new THREE.SphereGeometry(0.11, 10, 8), { x: sx + 0.32, y: PAVE + 0.95, z: sz });
  b.box(std({ color: 0xd8261c, roughness: 0.6 }), sx + 0.4, PAVE + 0.72, sz, 0.05, 0.16, 0.24);
  b.plane(glow(0xffa040, 2.2), sx + 0.38, PAVE + 1.12, sz + 0.25, 0.08, 0.12, { ry: Math.PI / 2 });
  glows.pool(sx + 0.6, PAVE + 0.01, sz, 1.0, 0xffa050, 0.6);
  coll.addBox(sx - 0.45, sz - 0.5, sx + 0.5, sz + 0.5, { tag: 'shrine' });

  // apartment block (4 floors) with lit outdoor corridor facing the street
  buildApartment(ctx, -17.2, 12.2, -8.0, 25.6);

  // ------------------------------------------------ Kopi Rialo cafe (NW corner, faces the main street)
  buildCafe(ctx);

  // ------------------------------------------------ houses behind the arcade (mostly roofs above it)
  house(ctx, -26, 12.4, -19.5, 18.4, { front: 'pz', door: false });
  house(ctx, -35, 12.4, -28.5, 18.4, { front: 'pz', door: false });
  house(ctx, -43.5, 12.4, -37.5, 18.4, { front: 'pz', door: false });
  house(ctx, -30, 20.2, -21.5, 25.6, { front: 'nz', door: false });
  house(ctx, -43.5, 20.2, -33, 25.6, { front: 'nz', door: false });

  // ------------------------------------------------ mid-rise filler blocks (window grids + signage)
  const tower = (minX, minZ, maxX, maxZ, h, seed, kind = 'apt', mat = M.concrete) => {
    const w = maxX - minX, d = maxZ - minZ;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    b.box(mat, cx, 0, cz, w, h, d, { uv: 2 });
    const win = signMat(T.windowGrid(kind, seed, 4, 4), kind === 'office' ? 0.62 : 0.6);
    const ww = 3.2, hh = 3.0;
    for (const [f, len] of [['pz', w], ['nz', w], ['px', d], ['nx', d]]) {
      const ry = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[f];
      const fx = f === 'px' ? maxX + 0.02 : f === 'nx' ? minX - 0.02 : cx;
      const fz = f === 'pz' ? maxZ + 0.02 : f === 'nz' ? minZ - 0.02 : cz;
      b.plane(win, fx, h / 2 + 1.2, fz, len - 1.0, h - 3.2, { ry, uv: [ww * 4, hh * 4] });
    }
    b.box(M.metalDark, cx, h, cz, w + 0.3, 0.5, d + 0.3);
    coll.addBox(minX, minZ, maxX, maxZ, { tag: 'bldg' });
  };
  tower(-30.5, -35, -15.6, -21.2, 16, 3, 'apt', M.plasterB);
  tower(-44.5, -35, -31.5, -16.2, 22, 5, 'office', M.concreteDark);
  // stretched along the plaza so its west face carries the giant Rialo Builder Hub banner (brand.js)
  tower(15.6, -39.0, 26.4, -21.25, 19, 7, 'office', M.concrete);
  tower(-30.5, -48, -14, -36, 26, 9, 'office', M.concreteDark);
  tower(14, -52, 30, -38, 30, 11, 'apt', M.plasterA);
  // karaoke vertical neon on the west block, facing the plaza
  const kara = signMat(T.signTex('karaoke', 128, 512, { bg: '#190a28', fg: '#ff4fd8', text: 'カラオケ', vertical: true, glow: '#ff4fd8', border: '#ff4fd8' }), 2.4);
  b.box(M.metalDark, -15.3, 7, -24.5, 0.25, 6.2, 1.5);
  b.plane(kara, -15.15, 10.1, -24.5, 1.4, 5.8, { ry: Math.PI / 2 });
  glows.streak(-14.4, -24.5, 1.4, 12, 0xff4fd8, 0.6, PAVE + 0.02);
  const pachi = signMat(T.signTex('hotel', 512, 128, { bg: '#08142a', fg: '#5fe0ff', text: 'BAR  ネオン', glow: '#5fe0ff', weight: 900 }), 2.6);
  b.plane(pachi, 21, 12.5, -21.2, 8, 2, { ry: 0 });
  glows.streak(21, -20.4, 3, 14, 0x5fe0ff, 0.45, PAVE + 0.02);

  // coin parking next to the konbini (not walkable)
  b.floor(M.asphalt, 19.5, -21, 26.3, -9, 0.004, { uv: 6 });
  for (let z = -20.5; z < -10; z += 2.6) b.floor(M.paintW, 20.2, z, 24.8, z + 0.1, 0.012, { uv: [0.5, 2] });
  ctx.railing(19.6, -9.1, 26.2, -9.1, 1.0);
  ctx.railing(26.2, -21, 26.2, -9.1, 1.0);
  buildCar(ctx, 22.5, -15.0, Math.PI / 2, 0xd9dde2);
  buildCar(ctx, 22.5, -19.9, Math.PI / 2, 0x2b3e66);
  b.box(M.metalGrey, 25.6, 0, -11, 0.5, 1.3, 0.4);
  b.plane(signMat(T.signTex('park', 256, 256, { bg: '#ffd600', fg: '#111', text: 'P', sub: '¥200 / 30分' }), 1.3), 25.4, 3.2, -10.4, 1.0, 1.0, { ry: -Math.PI / 2 });
  b.cyl(M.metalGrey, 25.5, 0, -10.4, 0.05, 0.05, 2.7, 6);

  // ------------------------------------------------ beyond the railway / river (visual only)
  for (let i = 0; i < 6; i++) {
    const x0 = -40 + i * 11 + R() * 2;
    house(ctx, x0, 32 + R() * 2, x0 + 7 + R() * 2, 38 + R() * 2, { front: 'nz', door: false });
  }
  for (let i = 0; i < 5; i++) house(ctx, 46, -30 + i * 12, 52, -22 + i * 12, { front: 'nx', door: false });

  // ------------------------------------------------ distant skyline (not fogged, pre-darkened)
  buildSkyline(ctx);

}

function buildApartment(ctx, minX, minZ, maxX, maxZ) {
  const { batch: b, mats: M, coll, glows } = ctx;
  const floors = 4, fh = 2.8, h = floors * fh + 0.6;
  const corr = 1.4; // corridor depth on the +X (street) side
  const unitsMaxX = maxX - corr;
  const cz = (minZ + maxZ) / 2, d = maxZ - minZ;
  b.box(M.plasterC, (minX + unitsMaxX) / 2, 0, cz, unitsMaxX - minX, h, d, { uv: 2 });
  coll.addBox(minX, minZ, maxX, maxZ, { tag: 'apt' });
  const corridorLight = glow(0xe8f2ff, 2.6);
  const doorMat = std({ color: 0x5a6470, roughness: 0.4, metalness: 0.5 });
  const units = 4, uw = d / units;
  for (let f = 0; f < floors; f++) {
    const y = f * fh;
    if (f > 0) {
      // slab + white panel railing
      b.box(M.concrete, maxX - corr / 2, y - 0.2, cz, corr, 0.2, d, { uv: 2 });
      b.box(M.railWhite, maxX - 0.05, y, cz, 0.1, 1.05, d);
      b.box(M.concrete, maxX - 0.05, y + 1.05, cz, 0.16, 0.08, d);
    }
    for (let u = 0; u < units; u++) {
      const z = minZ + uw * (u + 0.5);
      if (f > 0) {
        b.plane(doorMat, unitsMaxX + 0.02, y + 1.0, z - 0.8, 0.85, 2.0, { ry: Math.PI / 2 });
        b.plane(M.winLit[(u + f) % 6], unitsMaxX + 0.02, y + 1.5, z + 0.7, 1.0, 0.7, { ry: Math.PI / 2 });
        b.box(M.metalGrey, unitsMaxX + 0.1, y + 0.2, z + 1.5, 0.2, 0.9, 0.4);
        // corridor ceiling light
        b.plane(corridorLight, maxX - corr / 2, y + fh - 0.21, z, 0.18, 0.6, { rx: Math.PI / 2 });
      }
      // back windows
      b.plane(R() < 0.6 ? M.winLit[(u * 3 + f) % 6] : M.winDark, minX - 0.02, y + 1.5, z, 1.6, 1.2, { ry: -Math.PI / 2 });
    }
  }
  // ground floor: bike parking under the corridor
  b.floor(M.concrete, maxX - corr - 0.1, minZ, maxX + 0.8, maxZ, PAVE, { uv: 2 });
  b.box(M.concrete, maxX - corr / 2, fh - 0.2, cz, corr, 0.2, d, { uv: 2 });
  b.plane(corridorLight, maxX - corr / 2, fh - 0.21, cz, 0.18, 1.2, { rx: Math.PI / 2 });
  for (const z of [minZ + 0.2, maxZ - 0.2]) b.box(M.concrete, maxX - 0.2, 0, z, 0.4, h, 0.4);
  glows.pool(maxX + 0.3, PAVE + 0.01, cz, 4, 0xdfe9ff, 0.35);
  glows.streak(maxX + 0.2, cz, 4, 10, 0xdfe9ff, 0.35);
  ctx.bikes = ctx.bikes || [];
  for (let i = 0; i < 5; i++) ctx.bikes.push([maxX - 0.7, minZ + 2 + i * 0.75, Math.PI / 2, [0xc0c0c0, 0x8a1a1a, 0x1a3a8a, 0xe0d0a0, 0x333333][i]]);
  // name plate + roof parapet
  b.box(M.concreteDark, (minX + maxX) / 2, h, cz, maxX - minX, 0.6, d);
  b.plane(signMat(T.signTex('apt', 512, 128, { bg: '#2a2a2a', fg: '#f2efe6', text: 'メゾン・セメスタ', weight: 700 }), 1.1), maxX + 0.04, 1.9, maxZ - 0.9, 1.4, 0.35, { ry: Math.PI / 2 });
}

function buildCafe(ctx) {
  const { batch: b, mats: M, coll, glows } = ctx;
  const c = L.cafe;
  const w = c.maxX - c.minX, d = c.maxZ - c.minZ, cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
  const h = 7.2;
  b.box(M.plasterA, cx, 0, cz, w, h, d, { uv: 1.5 });
  coll.addBox(c.minX, c.minZ, c.maxX, c.maxZ, { tag: 'cafe' });
  b.box(M.woodDark, cx, h, cz, w + 0.3, 0.35, d + 0.3);
  // ground floor shop front facing +X (street): warm interior + glass
  b.plane(signMat(T.shopInterior('cafe', 4), 1.25), c.maxX + 0.02, 1.45, -15.5, 8.0, 2.4, { ry: Math.PI / 2 });
  b.plane(M.glass, c.maxX + 0.06, 1.45, -15.5, 8.0, 2.5, { ry: Math.PI / 2 });
  for (let z = -19.5; z <= -11.5; z += 2) b.box(M.woodDark, c.maxX + 0.05, PAVE, z, 0.1, 2.6, 0.12);
  b.box(M.woodDark, c.maxX + 0.08, 2.7, -15.5, 0.16, 0.12, 8.2);
  // awning (striped)
  const awn = std({ map: T.paintTex('awning', 256, 64, (x, ww, hh) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f2e8d2' : '#6b3b22'; x.fillRect(i * 32, 0, 32, hh); } }), roughness: 0.6 });
  b.box(awn, c.maxX + 0.65, 2.95, -15.5, 1.3, 0.06, 8.6, { rz: -0.32, uv: [8.6 / 8, 1] });
  // Kopi Rialo sign (mark painted with the official helper)
  const sign = signMat(T.kopiRialoSign(), 1.9);
  b.box(M.woodDark, c.maxX + 0.1, 3.35, -15.5, 0.12, 1.2, 4.6);
  b.plane(sign, c.maxX + 0.17, 3.95, -15.5, 4.4, 1.1, { ry: Math.PI / 2 });
  glows.streak(c.maxX + 0.6, -15.5, 2.6, 9, 0xffd7a0, 0.7, PAVE + 0.02);
  glows.pool(c.maxX + 1.4, PAVE + 0.01, -15.5, 3.2, 0xffc080, 0.55);
  // projecting blade sign toward the junction
  const blade = signMat(T.signTex('kopiV', 128, 512, { bg: '#2b1a12', fg: '#e8e3d5', text: '喫茶コピ', vertical: true, border: '#e8e3d5', glow: '#ffcf8a' }), 2.0);
  b.plane(blade, c.maxX + 0.75, 5.0, -9.6, 0.7, 2.6, { ry: 0 });
  b.plane(blade, c.maxX + 0.75, 5.0, -9.62, 0.7, 2.6, { ry: Math.PI });
  b.box(M.metalDark, c.maxX + 0.4, 6.35, -9.61, 0.8, 0.06, 0.06);
  // side face toward the arcade forecourt (z = maxZ): window + door
  b.plane(signMat(T.shopInterior('cafe', 6), 1.2), cx, 1.45, c.maxZ + 0.02, 3.6, 2.2, { ry: 0 });
  b.plane(M.glass, cx, 1.45, c.maxZ + 0.05, 3.6, 2.3, { ry: 0 });
  faceWindows(ctx, c.minX, c.minZ, c.maxX, c.maxZ, 'px', 4.9, 3, 1.3, 1.2, { litP: 0.8 });
  faceWindows(ctx, c.minX, c.minZ, c.maxX, c.maxZ, 'pz', 4.9, 2, 1.2, 1.1, { litP: 0.8 });
  // menu A-board + plants
  b.box(M.woodDark, c.maxX + 0.9, PAVE, -12.2, 0.5, 0.9, 0.06, { rx: 0.15, ry: Math.PI / 2 });
  ctx.plants = ctx.plants || [];
  ctx.plants.push([c.maxX + 0.35, -20.4], [c.maxX + 0.35, -11.45, 1.1]);
}

function buildCar(ctx, x, z, ry, color) {
  const { batch: b, mats: M } = ctx;
  const body = std({ color, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.2 });
  const g = boxGeo(3.4, 0.75, 1.48);
  b.add(body, g, { x, y: 0.55, z, ry });
  const cab = boxGeo(1.9, 0.62, 1.36);
  b.add(body, cab, { x: x + Math.sin(ry) * -0.2, y: 1.22, z: z + Math.cos(ry) * -0.2, ry });
  b.add(M.glassDark, boxGeo(1.92, 0.5, 1.38), { x: x + Math.sin(ry) * -0.2, y: 1.24, z: z + Math.cos(ry) * -0.2, ry });
  for (const [a, c2] of [[1.1, 0.7], [-1.1, 0.7], [1.1, -0.7], [-1.1, -0.7]]) {
    const wx = x + Math.sin(ry) * a + Math.cos(ry) * c2, wz = z + Math.cos(ry) * a - Math.sin(ry) * c2;
    b.add(M.black, new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateX(Math.PI / 2), { x: wx, y: 0.3, z: wz, ry });
  }
  ctx.coll.addRect(x, z, Math.abs(Math.sin(ry)) > 0.5 ? 3.4 : 1.5, Math.abs(Math.sin(ry)) > 0.5 ? 1.5 : 3.4);
}

function buildSkyline(ctx) {
  const { root } = ctx;
  const R2 = rng(99);
  const mats = [1, 2, 3, 4].map((s) => {
    const m = new THREE.MeshBasicMaterial({ map: T.windowGrid('far', s + 20, 8, 8), fog: false });
    m.color.setRGB(0.13, 0.15, 0.22);
    return m;
  });
  const groups = mats.map(() => []);
  const red = [];
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + R2() * 0.05;
    const dist = 95 + R2() * 60;
    const x = Math.sin(a) * dist - 8, z = Math.cos(a) * dist - 8;
    const w = 10 + R2() * 18, d = 10 + R2() * 18, h = 14 + Math.pow(R2(), 1.6) * 70;
    const g = boxGeo(w, h, d, [25.6, 24]); // 8 windows per texture: 3.2 m x 3 m bays
    g.applyMatrix4(trs({ x, y: h / 2, z, ry: R2() * 0.4 }));
    groups[i % 4].push(g);
    if (h > 50) red.push([x, h + 1, z]);
  }
  groups.forEach((gs, i) => {
    const m = new THREE.Mesh(mergeGeometries(gs, false), mats[i]);
    m.matrixAutoUpdate = false;
    root.add(m);
    gs.forEach((g) => g.dispose());
  });
  if (red.length) {
    const rg = new THREE.SphereGeometry(0.6, 8, 6);
    const rm = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.3), fog: false }), red.length);
    red.forEach(([x, y, z], k) => rm.setMatrixAt(k, trs({ x, y, z })));
    root.add(rm);
    ctx.updaters.push((dt, t) => { rm.visible = Math.sin(t * 2.2) > -0.2; });
  }
}

/** instanced bikes + potted plants collected from every module (call last) */
export function buildProps(ctx) {
  const { mats: M, root } = ctx;
  // ------------------------------------------------ instanced props
  const bikeGeo = bikeGeometry();
  const bikeMat = std({ color: 0xffffff, roughness: 0.4, metalness: 0.5 });
  const allBikes = ctx.bikes || [];
  const bm = new THREE.InstancedMesh(bikeGeo, bikeMat, allBikes.length);
  allBikes.forEach(([x, z, ry, c, y = PAVE], i) => {
    bm.setMatrixAt(i, trs({ x, y, z, ry }));
    bm.setColorAt(i, new THREE.Color(c));
  });
  bm.castShadow = true;
  root.add(bm);

  const allPlants = ctx.plants || [];
  const potG = new THREE.CylinderGeometry(0.22, 0.16, 0.38, 10).translate(0, 0.19, 0);
  const leafG = new THREE.IcosahedronGeometry(0.36, 1).translate(0, 0.62, 0);
  const pm = new THREE.InstancedMesh(potG, M.pot, allPlants.length);
  const lm = new THREE.InstancedMesh(leafG, M.plant, allPlants.length);
  allPlants.forEach(([x, z, s = 1, y = PAVE], i) => {
    const sc = s * (0.8 + R() * 0.5);
    pm.setMatrixAt(i, trs({ x, y, z, sx: sc, sy: sc, sz: sc }));
    lm.setMatrixAt(i, trs({ x, y, z, sx: sc, sy: sc * (0.8 + R() * 0.6), sz: sc, ry: R() * 6 }));
    lm.setColorAt(i, new THREE.Color().setHSL(0.27 + R() * 0.08, 0.45, 0.22 + R() * 0.12));
  });
  pm.castShadow = lm.castShadow = true;
  root.add(pm, lm);
}
