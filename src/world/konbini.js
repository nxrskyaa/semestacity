// ハレマート / Semesta Mart convenience store: glass front with an automatic
// sliding door, fluorescent interior, shelves of instanced products, drinks
// fridge wall, counter + register, ATM, magazine rack.
import * as THREE from 'three';
import { rng, damp } from '../core/util.js';
import { L, PAVE } from './layout.js';
import { boxGeo, trs } from './builder.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, signMat, std, selfLit } from './mats.js';
import * as T from './textures.js';

export function buildKonbini(ctx) {
  const { batch: b, mats: M, coll, glows, root } = ctx;
  const K = L.konbini;
  const R = rng(321);
  const H = 4.4, ceil = PAVE + 3.0;
  const cx = (K.minX + K.maxX) / 2, cz = (K.minZ + K.maxZ) / 2;
  const w = K.maxX - K.minX, d = K.maxZ - K.minZ;
  const door = { x: K.minX, z: -12, w: 2.0 };

  // ------------------------------------------------ shell
  const white = selfLit(T.concrete('#f4f4f0', 'kwall'), 0xcfd2d4, 0.07, { roughness: 0.6 });
  const floorMat = selfLit(T.floorTile(), 0xd8d8d4, 0.05, { roughness: 0.2, envMapIntensity: 0.8 });
  b.floor(floorMat, K.minX, K.minZ, K.maxX, K.maxZ, PAVE + 0.003, { uv: 0.9 });
  b.box(M.plasterC, cx, ceil, cz, w, H - 3.0, d, { uv: 1.5 });              // roof slab
  b.box(M.plasterC, cx, 0, K.minZ + 0.1, w, ceil, 0.2, { uv: 1.5 });       // north wall
  b.box(M.plasterC, K.maxX - 0.1, 0, cz, 0.2, ceil, d, { uv: 1.5 });       // east wall
  b.box(M.plasterC, 16.75, 0, K.maxZ - 0.1, 5.5, ceil, 0.2, { uv: 1.5 });  // south solid part
  b.plane(white, cx, PAVE + 1.5, K.minZ + 0.21, w - 0.4, 3.0, { ry: 0, uv: 2 });
  b.plane(white, 16.75, PAVE + 1.5, K.maxZ - 0.21, 5.5, 3.0, { ry: Math.PI, uv: 2 });
  const ceilMat = selfLit(T.concrete('#e8e8e4', 'kceil'), 0xc8c8c4, 0.1);
  b.plane(ceilMat, cx, ceil - 0.01, cz, w, d, { rx: Math.PI / 2, uv: 2 });
  coll.addBox(K.minX, K.minZ - 0.1, K.maxX, K.minZ + 0.22, { tag: 'konbini' });
  coll.addBox(K.maxX - 0.22, K.minZ, K.maxX + 0.1, K.maxZ, { tag: 'konbini' });
  coll.addBox(K.minX, K.maxZ - 0.22, K.maxX, K.maxZ + 0.08, { tag: 'konbini' });

  // ceiling light panels
  const panel = glow(0xf4fbff, 1.7);
  for (let x = 9.2; x < 19; x += 2.2) for (let z = -19.6; z < -9.5; z += 3.2) b.box(panel, x, ceil - 0.05, z, 1.4, 0.04, 0.2, { cast: false });

  // glass front (west) with the door gap, glass along the south corner
  const frame = std({ color: 0x9aa1aa, roughness: 0.3, metalness: 0.8 });
  const gl = M.glass;
  const glassRun = (axis, a0, a1, fixed) => {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    if (axis === 'z') {
      b.plane(gl, fixed, PAVE + 1.5, mid, len, 3.0, { ry: -Math.PI / 2, cast: false });
      b.box(frame, fixed, PAVE, mid, 0.12, 0.25, len);
      for (let z = a0; z <= a1 + 0.01; z += len / Math.max(1, Math.round(len / 2))) b.box(frame, fixed, PAVE, z, 0.1, 3.0, 0.08);
      coll.addBox(fixed - 0.12, a0, fixed + 0.12, a1, { tag: 'konbini-glass' });
    } else {
      b.plane(gl, mid, PAVE + 1.5, fixed, len, 3.0, { ry: 0, cast: false });
      b.box(frame, mid, PAVE, fixed, len, 0.25, 0.12);
      for (let x = a0; x <= a1 + 0.01; x += len / Math.max(1, Math.round(len / 2))) b.box(frame, x, PAVE, fixed, 0.08, 3.0, 0.1);
      coll.addBox(a0, fixed - 0.12, a1, fixed + 0.12, { tag: 'konbini-glass' });
    }
  };
  glassRun('z', K.minZ, door.z - door.w / 2, K.minX);
  glassRun('z', door.z + door.w / 2, K.maxZ, K.minX);
  glassRun('x', K.minX, 14.0, K.maxZ);
  b.box(frame, K.minX, PAVE + 2.45, door.z, 0.22, 0.55, door.w + 0.2); // door header / sensor
  b.box(glow(0x60ff9a, 2), K.minX - 0.12, PAVE + 2.6, door.z, 0.02, 0.06, 0.2, { cast: false });

  // ------------------------------------------------ fascia (green/white stripes + logo)
  const stripe = T.paintTex('kstripe', 128, 128, (x, ww, hh) => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, ww, hh);
    for (const [c, y0, h0] of [['#13a35a', 0, 0.16], ['#f2a51a', 0.24, 0.07], ['#13a35a', 0.84, 0.16]]) { x.fillStyle = c; x.fillRect(0, y0 * hh, ww, h0 * hh); }
  });
  stripe.wrapS = THREE.RepeatWrapping;
  const stripeMat = signMat(stripe, 1.5);
  const logoMat = signMat(T.konbiniFascia(), 1.6);
  const fy = ceil + 0.75, fh = 1.15;
  b.box(M.plasterC, K.minX - 0.15, ceil + 0.1, cz, 0.3, H - 3.0, d + 0.3);
  b.box(M.plasterC, cx, ceil + 0.1, K.maxZ + 0.15, w + 0.3, H - 3.0, 0.3);
  b.plane(stripeMat, K.minX - 0.31, fy, cz, d + 0.3, fh, { ry: -Math.PI / 2, uv: [1.15, fh] });
  b.plane(stripeMat, cx, fy, K.maxZ + 0.31, w + 0.3, fh, { ry: 0, uv: [1.15, fh] });
  b.plane(logoMat, K.minX - 0.33, fy, cz + 0.6, fh * 8, fh, { ry: -Math.PI / 2 });
  b.plane(logoMat, cx - 0.5, fy, K.maxZ + 0.33, fh * 8, fh, { ry: 0 });
  glows.streak(K.minX - 1, cz, 6, 14, 0x9fffc8, 0.35);
  glows.streak(cx, K.maxZ + 1, 6, 12, 0x9fffc8, 0.35);

  // pole sign at the cross-street corner
  const pole = signMat(T.konbiniPoleSign(), 1.8);
  const psx = 19.0, psz = -7.6;
  b.cyl(M.metalGrey, psx, PAVE, psz, 0.12, 0.14, 5.0, 10);
  b.box(M.railWhite, psx, 5.0, psz, 0.3, 2.6, 1.3);
  b.plane(pole, psx + 0.16, 6.3, psz, 1.2, 2.4, { ry: Math.PI / 2 });
  b.plane(pole, psx - 0.16, 6.3, psz, 1.2, 2.4, { ry: -Math.PI / 2 });
  coll.addCircle(psx, psz, 0.2);

  // light spill on the pavement
  glows.pool(K.minX - 1.6, PAVE + 0.01, cz, 5.5, 0xeaf6ff, 0.55);
  glows.pool(11, PAVE + 0.01, K.maxZ + 1.5, 4.2, 0xeaf6ff, 0.5);
  glows.streak(K.minX - 0.6, -16, 4, 10, 0xeaf6ff, 0.6);
  glows.streak(K.minX - 0.6, -10.5, 2.5, 10, 0xeaf6ff, 0.6);
  // outside bins
  const binCols = [0x2f7fd8, 0xf2a51a, 0x13a35a];
  binCols.forEach((c, k) => b.box(std({ color: c, roughness: 0.4 }), K.minX - 0.45, PAVE, -14.3 - k * 0.55, 0.5, 1.0, 0.5));
  coll.addBox(K.minX - 0.75, -15.9, K.minX, -14.0, { maxY: 1.0 });

  // ------------------------------------------------ interior fittings
  const shelfMat = selfLit(T.concrete('#e9ecef', 'kshelf'), 0xffffff, 0.1, { roughness: 0.4, metalness: 0.2 });
  const products = []; // [x,y,z,w,h,d,color]
  const palette = [0xe8352e, 0xf2a51a, 0x13a35a, 0x1f6fd8, 0xffd84a, 0xff6ec7, 0x8a4fd8, 0xffffff, 0x2bc7d8, 0xff8a3a, 0x6b3b22];
  const fillShelf = (x0, x1, y, z, dz, hMax = 0.28) => {
    let x = x0 + 0.04;
    while (x < x1 - 0.12) {
      const pw = 0.09 + R() * 0.14;
      const ph = 0.1 + R() * hMax;
      const c = palette[Math.floor(R() * palette.length)];
      const rows = 2;
      for (let r = 0; r < rows; r++) products.push([x + pw / 2, y, z + dz * (0.1 + r * 0.17), pw * 0.92, ph, 0.15, c]);
      x += pw;
    }
  };
  const gondola = (x0, x1, zc) => {
    const gw = x1 - x0, gx = (x0 + x1) / 2;
    b.box(shelfMat, gx, PAVE, zc, gw, 0.12, 0.9);
    b.box(shelfMat, gx, PAVE, zc, gw, 1.55, 0.08);
    for (const y of [0.12, 0.5, 0.88, 1.26]) {
      b.box(shelfMat, gx, PAVE + y, zc, gw, 0.03, 0.9, { cast: false });
      fillShelf(x0, x1, PAVE + y + 0.03, zc + 0.05, 1);
      fillShelf(x0, x1, PAVE + y + 0.03, zc - 0.05, -1);
    }
    // end caps
    for (const ex of [x0 - 0.2, x1 + 0.2]) {
      b.box(shelfMat, ex, PAVE, zc, 0.4, 1.2, 0.86);
      for (const y of [0.4, 0.8]) for (let k = 0; k < 3; k++) products.push([ex, PAVE + y + 0.03 + 0.01, zc - 0.26 + k * 0.26, 0.3, 0.22, 0.22, palette[Math.floor(R() * palette.length)]]);
    }
    b.plane(signMat(T.signTex('aisle' + zc, 256, 64, { bg: '#13a35a', fg: '#fff', text: zc > -14.5 ? 'お菓子・パン' : '日用品・雑貨', weight: 700 }), 1.4), gx, PAVE + 2.4, zc, 1.4, 0.35, { ry: Math.PI / 2 });
    b.box(M.cable, gx, PAVE + 2.6, zc, 0.01, 0.4, 0.01, { cast: false });
    coll.addBox(x0 - 0.42, zc - 0.47, x1 + 0.42, zc + 0.47, { tag: 'shelf' });
  };
  gondola(10.8, 16.4, -13.3);
  gondola(10.8, 16.4, -16.0);

  // drinks fridge wall (east)
  const fridgeMat = signMat(T.fridgeTex(), 0.85);
  const fz0 = -20.5, fz1 = -10.0;
  b.box(shelfMat, 18.95, PAVE, (fz0 + fz1) / 2, 0.7, 2.5, fz1 - fz0);
  b.plane(fridgeMat, 18.58, PAVE + 1.12, (fz0 + fz1) / 2, fz1 - fz0, 2.0, { ry: -Math.PI / 2, uv: [3.5, 2.0] });
  b.plane(signMat(T.signTex('drinks', 1024, 96, { bg: '#1f6fd8', fg: '#fff', text: 'ドリンク  COLD DRINKS  冷えてます', weight: 700 }), 1.5), 18.58, PAVE + 2.35, (fz0 + fz1) / 2, 7.5, 0.4, { ry: -Math.PI / 2 });
  coll.addBox(18.55, fz0, K.maxX, fz1, { tag: 'fridge' });
  glows.pool(17.6, PAVE + 0.01, -15.3, 3.6, 0xdff0ff, 0.25);

  // counter, registers, hot snacks, back shelf
  const counterTop = std({ color: 0xf2f0ea, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.08 });
  const counterFront = selfLit(T.signTex('counterfront', 512, 64, { bg: '#13a35a', fg: '#fff', text: 'いらっしゃいませ  Welcome to Semesta Mart', weight: 700 }), 0xffffff, 0.35);
  const CH = 0.64;  // waist height of the ~1.35 m chibi cast (a 1 m counter hid the clerk up to her chin)
  b.box(counterTop, 11.0, PAVE, -19.0, 5.0, CH, 0.8);
  b.plane(counterFront, 11.0, PAVE + CH * 0.5, -18.59, 4.8, 0.5, { ry: 0 });
  coll.addBox(8.5, -19.4, 13.5, -18.6, { tag: 'counter' });
  for (const rx of [10.1, 12.3]) {
    b.box(M.black, rx, PAVE + CH, -19.05, 0.42, 0.12, 0.36);
    b.box(M.black, rx, PAVE + CH + 0.12, -19.15, 0.32, 0.24, 0.06, { rx: -0.25 });
    b.plane(glow(0x7fd0ff, 1.6), rx, PAVE + CH + 0.25, -19.11, 0.27, 0.17, { rx: -0.25 });
  }
  // hot snack case
  b.box(std({ color: 0x222222, roughness: 0.4 }), 8.95, PAVE + CH, -19.0, 0.8, 0.06, 0.6);
  b.box(glow(0xffb050, 1.6), 8.95, PAVE + CH + 0.06, -19.0, 0.76, 0.5, 0.56, { cast: false });
  b.plane(signMat(T.signTex('hot', 256, 64, { bg: '#e8352e', fg: '#fff', text: 'からあげ・肉まん', weight: 900 }), 1.4), 8.95, PAVE + CH + 0.68, -18.85, 0.8, 0.2, { ry: 0 });
  // back shelf (cigarettes / goods)
  b.box(shelfMat, 11.0, PAVE, -20.72, 5.0, 2.3, 0.4);
  for (const y of [1.15, 1.5, 1.85]) {
    let x = 8.65;
    while (x < 13.35) { products.push([x, PAVE + y, -20.48, 0.07, 0.12, 0.06, palette[Math.floor(R() * palette.length)]]); x += 0.085; }
  }
  coll.addBox(8.5, -21, 13.5, -20.5, { tag: 'backshelf' });
  ctx.npcSpots.clerk = { x: 11.0, z: -19.95, rotY: 0 };

  // freezer chest
  b.box(shelfMat, 17.0, PAVE, -19.8, 1.6, 0.85, 0.8);
  b.plane(glow(0xdff6ff, 1.4), 17.0, PAVE + 0.86, -19.8, 1.5, 0.7, { rx: -Math.PI / 2 });
  coll.addBox(16.2, -20.2, 17.8, -19.4, { tag: 'freezer' });

  // magazine rack along the south window (faces into the store)
  b.box(shelfMat, 11.0, PAVE, -9.42, 5.0, 1.1, 0.38);
  b.plane(signMat(T.magazineTex(), 1.25), 11.0, PAVE + 0.75, -9.62, 4.9, 0.62, { ry: Math.PI, uv: [2.45, 0.62] });
  coll.addBox(8.5, -9.7, 13.5, -9.0, { tag: 'magazines' });

  // ATM + copy machine on the west wall north of the door
  const atmBody = std({ color: 0xd8dde4, roughness: 0.35, metalness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.12 });
  b.box(atmBody, 8.0, PAVE, -16.2, 0.7, 1.55, 0.8);
  b.plane(signMat(T.signTex('atm', 256, 192, { bg: '#0e3a7a', fg: '#fff', text: 'ATM', sub: 'Semesta Bank · 24h' }), 1.5), 8.36, PAVE + 1.2, -16.2, 0.55, 0.42, { ry: Math.PI / 2, rx: 0 });
  b.box(M.black, 8.4, PAVE + 0.9, -16.2, 0.12, 0.05, 0.4);
  b.box(atmBody, 8.1, PAVE, -17.5, 0.9, 1.1, 1.0);
  coll.addBox(7.6, -18.05, 8.6, -15.8, { tag: 'atm' });
  ctx.interactables.push({ id: 'atm', x: 8.95, z: -16.2, radius: 1.1, label: 'ATM' });

  // posters on the south solid wall (outside) + interior
  b.plane(signMat(T.signTex('kposter', 512, 256, { bg: '#ffd84a', fg: '#c8261c', text: 'おにぎり 100円', sub: 'ONIGIRI SALE' }), 1.2), 16.75, 1.6, K.maxZ + 0.02, 2.4, 1.2, { ry: 0 });

  // ------------------------------------------------ instanced products
  const pg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const pm = std({ map: T.productTex(), roughness: 0.5, emissive: 0xffffff, emissiveMap: T.productTex(), emissiveIntensity: 0.18 });
  pm.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif');
  };
  const inst = new THREE.InstancedMesh(pg, pm, products.length);
  const col = new THREE.Color();
  products.forEach(([x, y, z, pw, ph, pd, c], i) => {
    inst.setMatrixAt(i, trs({ x, y, z, sx: pw, sy: ph, sz: pd }));
    inst.setColorAt(i, col.set(c));
  });
  root.add(inst);

  // interior light (one point light, cool fluorescent)
  ctx.addLight(0xf0f6ff, 11, 14, 13.5, ceil - 0.3, -15.0);
  ctx.roofs.push({ minX: K.minX - 0.4, minZ: K.minZ - 0.2, maxX: K.maxX + 0.2, maxZ: K.maxZ + 0.4 });

  // ------------------------------------------------ automatic sliding door
  const panelGeo = boxGeo(door.w / 2, 2.7, 0.04);
  const mkPanel = () => {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(panelGeo, gl);
    g.add(glass);
    // the four frame bars merged into one mesh (1 draw call per panel)
    const bars = [[0, 1.33, door.w / 2, 0.06], [0, -1.33, door.w / 2, 0.08], [-door.w / 4 + 0.03, 0, 0.06, 2.7], [door.w / 4 - 0.03, 0, 0.06, 2.7]]
      .map(([fx, fy, fw, fh2]) => boxGeo(fw, fh2, 0.06).translate(fx, fy, 0));
    g.add(new THREE.Mesh(mergeGeometries(bars, false), frame));
    bars.forEach((bg) => bg.dispose());
    g.rotation.y = Math.PI / 2;
    g.position.set(door.x, PAVE + 1.35, 0);
    root.add(g);
    return g;
  };
  const left = mkPanel(), right = mkPanel();
  let open = 0, collider = coll.addBox(door.x - 0.12, door.z - door.w / 2, door.x + 0.12, door.z + door.w / 2, { tag: 'konbini-door' });
  let wasOpen = false;
  const place = () => {
    const off = (door.w / 4) + open * (door.w / 2 - 0.05);
    left.position.z = door.z - off;
    right.position.z = door.z + off;
    left.position.x = door.x + 0.04;
    right.position.x = door.x - 0.04;
  };
  place();
  ctx.updaters.push((dt) => {
    const p = ctx.playerPos;
    const dist = Math.hypot(p.x - door.x, p.z - door.z);
    const target = dist < 2.6 ? 1 : 0;
    open = damp(open, target, 6, dt);
    if (Math.abs(open - target) < 0.002) open = target;
    place();
    const inGap = Math.abs(p.x - door.x) < 0.5 && Math.abs(p.z - door.z) < door.w / 2 + 0.3;
    if (collider && open > 0.7) { coll.remove(collider); collider = null; }
    else if (!collider && open < 0.5 && !inGap) collider = coll.addBox(door.x - 0.12, door.z - door.w / 2, door.x + 0.12, door.z + door.w / 2, { tag: 'konbini-door' });
    if (target && !wasOpen) ctx.emit?.('konbini-door');
    wasOpen = !!target;
  });
}
