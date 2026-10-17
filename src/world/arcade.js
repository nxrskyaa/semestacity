// "Robo-dori" covered shopping arcade: checkerboard floor, shutters and lit
// shops, lanterns, a big light bar, vending machines, post box, manga wall,
// and the holo-table pedestal in a clear 12 x 12 m plaza.
import * as THREE from 'three';
import { L, PAVE } from './layout.js';
import { Batch, boxGeo, trs } from './builder.js';
import { glow, signMat, std } from './mats.js';
import { rng } from '../core/util.js';
import * as T from './textures.js';

const SHOPS_N = [
  { t: '雨宮書店', s: 'AMAMIYA BOOKS', bg: '#f4efe2', fg: '#1d3a6b', open: null },
  { t: 'ラーメン 一番', s: 'RAMEN ICHIBAN', bg: '#c8261c', fg: '#fff', open: 'ramen', noren: 'らーめん', norenBg: '#7a1410' },
  { t: '喫茶 ルナ', s: 'KISSA LUNA', bg: '#2b1a12', fg: '#f2d39a', open: 'cafe' },
  { t: 'ゲーム ロボ堂', s: 'ROBODO GAMES', bg: '#141a3a', fg: '#5fe0ff', open: null, glow: '#5fe0ff' },
  { t: 'たこ焼き', s: 'TAKOYAKI', bg: '#ffcf2a', fg: '#c8261c', open: 'tako', noren: 'たこ焼', norenBg: '#c8261c' },
  { t: '時計・メガネ', s: 'WATCH & GLASSES', bg: '#e9e9e9', fg: '#222', open: null },
];
const SHOPS_S = [
  { t: 'ドラッグ ミドリ', s: 'DRUG MIDORI', bg: '#18a34a', fg: '#fff', open: 'drug' },
  { t: '花屋 さくら', s: 'FLOWERS SAKURA', bg: '#ffe6ef', fg: '#c2185b', open: null },
  { t: '居酒屋 灯', s: 'IZAKAYA AKARI', bg: '#1a1410', fg: '#ffcf6a', open: 'izakaya', noren: '居酒屋', norenBg: '#2a2a50', glow: '#ffb040' },
  { t: 'まんが堂', s: 'MANGA-DO', bg: '#e62a3a', fg: '#fff', open: 'manga' },
  { t: '電器 ヒカリ', s: 'HIKARI DENKI', bg: '#1b4fa0', fg: '#fff', open: null },
  { t: '和菓子 月', s: 'WAGASHI TSUKI', bg: '#f3ead6', fg: '#5a2a10', open: null },
];

export function buildArcade(ctx) {
  const R = rng(77);
  const { batch: b, mats: M, coll, glows, root } = ctx;
  const A = L.arcade;
  const H = A.roofY;
  const len = A.maxX - A.minX;
  const midX = (A.minX + A.maxX) / 2, midZ = (A.minZ + A.maxZ) / 2;

  // ------------------------------------------------ floor
  const floorMat = std({ map: T.checker(), roughness: 0.22, envMapIntensity: 1.1 });
  b.box(M.curb, midX, -0.02, midZ, len, PAVE + 0.01, A.maxZ - A.minZ, { cast: false });
  b.floor(floorMat, A.minX, A.minZ, A.maxX, A.maxZ, PAVE, { uv: 1.0 });

  // ------------------------------------------------ shop rows
  const unitW = len / 6;
  const shutterMats = [1, 2, 4].map((s) => std({ map: T.shutter(s), roughness: 0.4, metalness: 0.55, envMapIntensity: 0.9 }));
  const pillarMat = std({ map: T.concrete('#b7ad9b', 'arcpillar'), roughness: 0.6 });
  const bodyMats = [M.plasterA, M.plasterB, M.plasterC, M.sidingB];
  const rows = [
    { shops: SHOPS_N, front: A.minZ, dir: 1, back: A.minZ - 6 },
    { shops: SHOPS_S, front: A.maxZ, dir: -1, back: A.maxZ + 6 },
  ];
  const ry0 = (dir) => (dir > 0 ? 0 : Math.PI);
  for (const row of rows) {
    const { front, dir } = row;
    const ry = ry0(dir);
    const zmin = Math.min(front, row.back), zmax = Math.max(front, row.back);
    coll.addBox(A.minX - 1, dir > 0 ? zmin : front - 0.2, A.maxX, dir > 0 ? front + 0.2 : zmax, { tag: 'shops' });
    row.shops.forEach((s, i) => {
      const x1 = A.maxX - unitW * i, x0 = x1 - unitW, cx = (x0 + x1) / 2;
      const body = bodyMats[(i + (dir > 0 ? 0 : 2)) % 4];
      b.box(body, cx, 0, (zmin + zmax) / 2, unitW, 8.6 + (i % 3) * 0.8, 6, { uv: 1.5 });
      const fz = front + dir * 0.02;
      const ow = unitW - 0.7;
      if (s.open) {
        const tex = s.open === 'manga' ? T.mangaWall() : T.shopInterior(s.open, i + 1);
        const k = s.open === 'drug' ? 1.7 : s.open === 'manga' ? 1.8 : 1.35;
        b.plane(signMat(tex, k), cx, PAVE + 1.45, fz, ow, 2.7, { ry });
        // counter / display shelf in the opening
        b.box(s.open === 'drug' ? M.railWhite : M.woodDark, cx, PAVE, front + dir * 0.35, ow * 0.85, 0.9, 0.6);
        coll.addBox(x0 + 0.35, Math.min(front, front + dir * 0.7), x1 - 0.35, Math.max(front, front + dir * 0.7), { maxY: 1, tag: 'counter' });
        const warm = { drug: 0xd8ffe8, manga: 0xfff1d8, ramen: 0xffc070, cafe: 0xffb870, izakaya: 0xff9a50, tako: 0xffc860 }[s.open];
        glows.pool(cx, PAVE + 0.01, front + dir * 1.6, 3.0, warm, 0.28);
        glows.streak(cx, front + dir * 0.6, ow * 0.8, 10, warm, 0.55, PAVE + 0.02);
        if (s.noren) {
          const nm = std({ map: T.norenTex(s.noren, s.norenBg), roughness: 0.8, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: T.norenTex(s.noren, s.norenBg), emissiveIntensity: 0.25 });
          b.plane(nm, cx, PAVE + 2.55, front + dir * 0.08, ow * 0.7, 0.8, { ry, cast: false });
        }
      } else {
        b.plane(shutterMats[i % 3], cx, PAVE + 1.45, fz, ow, 2.9, { ry, uv: 1 });
        b.box(M.metalGrey, cx, PAVE + 2.9, front + dir * 0.15, ow, 0.32, 0.3);
      }
      // signboard (lit)
      b.box(M.black, cx, 3.3, front + dir * 0.18, unitW - 0.5, 0.95, 0.35);
      const sm = signMat(T.signTex('arc' + s.t, 768, 160, { bg: s.bg, fg: s.fg, text: s.t, sub: s.s, glow: s.glow, border: 'rgba(0,0,0,0.25)' }), 1.75);
      b.plane(sm, cx, 3.77, front + dir * 0.36, unitW - 0.6, (unitW - 0.6) * 160 / 768, { ry });
      glows.streak(cx, front + dir * 0.4, unitW * 0.6, 9, new THREE.Color(s.bg).getHex(), 0.35, PAVE + 0.02);
      // upper floor windows
      for (const o of [-1.2, 1.2]) {
        b.plane(R() < 0.55 ? M.winLit[(i + (o > 0 ? 1 : 3)) % 6] : M.winDark, cx + o, 5.6, front + dir * 0.03, 1.4, 1.2, { ry });
        b.box(M.concrete, cx + o, 4.92, front + dir * 0.08, 1.55, 0.06, 0.16, { cast: false });
      }
      // pillar
      b.box(pillarMat, x1 - 0.18, 0, front + dir * 0.12, 0.36, H, 0.4, { uv: 1 });
      if (i === 5) b.box(pillarMat, x0 + 0.18, 0, front + dir * 0.12, 0.36, H, 0.4, { uv: 1 });
      // projecting blade sign on every other unit
      if (i % 2 === 0) {
        const bm = signMat(T.signTex('blade' + s.t, 128, 512, { bg: s.bg, fg: s.fg, text: s.t.replace(/[ ・]/g, ''), vertical: true, glow: s.glow, border: 'rgba(0,0,0,0.3)' }), 1.9);
        const bx = x1 - 0.5, bz = front + dir * 0.75;
        b.box(M.metalDark, bx, 6.55, front + dir * 0.4, 0.05, 0.05, 0.8);
        b.plane(bm, bx + 0.03, 5.3, bz, 0.62, 2.3, { ry: Math.PI / 2 });
        b.plane(bm, bx - 0.03, 5.3, bz, 0.62, 2.3, { ry: -Math.PI / 2 });
      }
    });
  }
  // end wall: battle poster + Semesta mark
  b.box(M.plasterB, A.minX - 0.5, 0, midZ, 1, 9.2, A.maxZ - A.minZ + 12, { uv: 1.5 });
  coll.addBox(A.minX - 1.5, A.minZ - 1, A.minX, A.maxZ + 1, { tag: 'arcade-end' });
  b.plane(signMat(T.battlePoster(), 1.5), A.minX + 0.03, PAVE + 3.3, midZ - 3.2, 3.6, 5.4, { ry: Math.PI / 2 });
  b.plane(signMat(T.mangaWall(), 1.4), A.minX + 0.03, PAVE + 2.0, midZ + 2.6, 5.4, 2.7, { ry: Math.PI / 2 });
  glows.streak(A.minX + 0.5, midZ - 3.2, 2.6, 12, 0xff4fa0, 0.55, PAVE + 0.02);
  glows.streak(A.minX + 0.5, midZ + 2.6, 3.5, 10, 0xfff0d8, 0.5, PAVE + 0.02);

  // ------------------------------------------------ roof structure
  const steel = std({ color: 0x3a3f48, roughness: 0.45, metalness: 0.7 });
  const roofPanel = std({ color: 0x1c2230, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  const span = A.maxZ - A.minZ;
  for (let x = A.maxX - 0.2; x > A.minX; x -= 3.5) b.box(steel, x, H - 0.35, midZ, 0.22, 0.35, span + 0.6);
  for (const z of [A.minZ + 0.1, A.maxZ - 0.1]) b.box(steel, midX, H - 0.4, z, len, 0.4, 0.25);
  // shallow gable roof panels + raised skylight ridge
  const rise = 1.1, half = span / 2;
  const ang = Math.atan2(rise, half);
  const slope = Math.hypot(rise, half);
  for (const s of [1, -1]) {
    b.add(roofPanel, boxGeo(len, 0.06, slope), { x: midX, y: H + rise / 2, z: midZ + s * half / 2, rx: s * ang }, { cast: true, receive: false });
  }
  for (let x = A.maxX - 0.2; x > A.minX; x -= 3.5) for (const s of [1, -1]) {
    b.add(steel, boxGeo(0.14, 0.2, slope), { x, y: H + rise / 2 - 0.12, z: midZ + s * half / 2, rx: s * ang });
  }
  ctx.roofs.push({ minX: A.minX - 1, minZ: A.minZ - 0.6, maxX: A.maxX + 0.2, maxZ: A.maxZ + 0.6 });

  // big emissive light bar along the ridge + cross lights
  const barMat = glow(0xf4f8ff, 3.4);
  b.box(steel, midX, H + 0.55, midZ, len - 1, 0.18, 0.7, { cast: false });
  b.box(barMat, midX, H + 0.42, midZ, len - 1.2, 0.12, 0.5, { cast: false });
  const sideBar = glow(0xfff0d8, 2.2);
  for (let x = A.maxX - 0.2 - 1.75; x > A.minX + 1; x -= 7) {
    b.box(sideBar, x, H - 0.48, midZ, 0.14, 0.06, span - 2.5, { cast: false });
  }
  for (let x = A.maxX - 2; x > A.minX + 1; x -= 4.2) glows.pool(x, PAVE + 0.01, midZ, 4.4, 0xe8f0ff, 0.1);
  glows.streak(midX, midZ, 1.4, 22, 0xe8f0ff, 0.25, PAVE + 0.02);

  // ------------------------------------------------ entrance gate sign
  const gx = A.maxX - 0.15;
  const gate = signMat(T.signTex('robodori', 1024, 256, { grad: ['#1a2050', '#0a0e26'], fg: '#ffffff', text: 'ロボ通り商店街', sub: 'ROBO-DORI  SHOPPING ARCADE', glow: '#7fd8ff', subFg: '#ffd36a', border: '#ffd36a' }), 2.0);
  b.box(M.metalDark, gx, H - 1.95, midZ, 0.35, 1.9, span - 0.6);
  b.plane(gate, gx + 0.19, H - 1.0, midZ, 7.2, 1.8, { ry: Math.PI / 2 });
  b.plane(gate, gx - 0.19, H - 1.0, midZ, 7.2, 1.8, { ry: -Math.PI / 2 });
  for (const z of [A.minZ + 0.3, A.maxZ - 0.3]) {
    b.box(M.metalDark, gx, 0, z, 0.4, H, 0.4);
    coll.addCircle(gx, z, 0.3);
  }
  glows.streak(gx + 1, midZ, 5, 14, 0x9fd8ff, 0.4);

  // ------------------------------------------------ lanterns
  const lanternPos = [];
  for (const z of [A.minZ + 0.75, A.maxZ - 0.75]) for (let x = A.maxX - 1.6; x > A.minX + 1; x -= 2.62) lanternPos.push([x, 4.55, z]);
  const lathePts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; lathePts.push(new THREE.Vector2(0.06 + Math.sin(t * Math.PI) * 0.2, -0.28 + t * 0.56)); }
  const lg = new THREE.LatheGeometry(lathePts, 14);
  const ltex = T.lanternTex('祭');
  const lmat = std({ map: ltex, emissive: 0xffffff, emissiveMap: ltex, emissiveIntensity: 1.8, roughness: 0.6 });
  const lan = new THREE.InstancedMesh(lg, lmat, lanternPos.length);
  const capG = new THREE.CylinderGeometry(0.09, 0.09, 0.07, 10);
  const caps = new THREE.InstancedMesh(capG, M.black, lanternPos.length * 2);
  lanternPos.forEach(([x, y, z], k) => {
    lan.setMatrixAt(k, trs({ x, y, z, ry: k * 0.7 }));
    caps.setMatrixAt(k * 2, trs({ x, y: y + 0.3, z }));
    caps.setMatrixAt(k * 2 + 1, trs({ x, y: y - 0.3, z }));
    b.box(M.cable, x, y + 0.33, z, 0.01, 4.85 - y - 0.33 + 0.4, 0.01, { cast: false });
  });
  root.add(lan, caps);
  for (const z of [A.minZ + 0.75, A.maxZ - 0.75]) {
    b.box(M.cable, midX, 5.2, z, len - 1, 0.02, 0.02, { cast: false });
    glows.streak(midX, z + (z < midZ ? 0.6 : -0.6), 1.2, 14, 0xff4a30, 0.3, PAVE + 0.02);
  }

  // ------------------------------------------------ vending machine row (north side by the entrance)
  const vz = A.minZ;
  const vMats = [0, 1, 2, 0].map((v) => signMat(T.vendingFront(v), 1.6));
  const vBody = [std({ color: 0xc8202a, roughness: 0.35, metalness: 0.3 }), std({ color: 0xe8e8e8, roughness: 0.35, metalness: 0.3 }), std({ color: 0x1f5fd8, roughness: 0.35, metalness: 0.3 })];
  for (let k = 0; k < 4; k++) {
    const x = A.maxX - 1.2 - k * 1.02;
    b.box(vBody[[0, 1, 2, 0][k]], x, PAVE, vz + 0.42, 0.98, 1.85, 0.78);
    b.plane(vMats[k], x, PAVE + 0.95, vz + 0.815, 0.9, 1.78, { ry: 0 });
  }
  const vx0 = A.maxX - 1.2 - 3 * 1.02 - 0.5, vx1 = A.maxX - 0.7;
  coll.addBox(vx0, vz, vx1, vz + 0.85, { tag: 'vending' });
  glows.pool((vx0 + vx1) / 2, PAVE + 0.01, vz + 1.6, 3.2, 0xe8f2ff, 0.55);
  glows.streak((vx0 + vx1) / 2, vz + 1.0, 3.6, 8, 0xe8f2ff, 0.7, PAVE + 0.02);
  // recycle bins next to the machines
  const binMat = std({ color: 0x2f7fd8, roughness: 0.4 });
  for (const k of [0, 1]) b.box(binMat, vx0 - 0.3 - k * 0.5, PAVE, vz + 0.3, 0.45, 0.9, 0.45);
  ctx.interactables.push({ id: 'vending', x: (vx0 + vx1) / 2, z: vz + 1.35, radius: 1.7, label: 'Vending machine' });
  ctx.npcSpots.vendor = { x: A.maxX + 0.6, z: vz + 1.6, rotY: Math.PI / 2 };

  // red post box near the entrance (south side)
  const red = std({ color: 0xd0201a, roughness: 0.35, metalness: 0.2 });
  const px = A.maxX - 1.0, pz = A.maxZ - 0.75;
  b.box(red, px, PAVE, pz, 0.5, 1.2, 0.42);
  b.add(red, new THREE.CylinderGeometry(0.25, 0.25, 0.42, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), { x: px, y: PAVE + 1.2, z: pz });
  b.box(M.black, px, PAVE + 0.95, pz - 0.215, 0.3, 0.04, 0.01);
  b.plane(signMat(T.signTex('post', 128, 64, { bg: '#d0201a', fg: '#fff', text: '〒 POST' }), 1.0), px, PAVE + 0.65, pz - 0.215, 0.36, 0.18, { ry: Math.PI });
  coll.addCircle(px, pz, 0.35);

  // benches along the walls (outside the arena)
  for (const x of [A.minX + 4, A.minX + 7, A.maxX - 7]) {
    b.box(M.wood, x, PAVE + 0.4, A.maxZ - 1.5, 1.8, 0.08, 0.45);
    b.box(M.metalDark, x, PAVE, A.maxZ - 1.5, 1.6, 0.4, 0.08);
    coll.addRect(x, A.maxZ - 1.5, 1.8, 0.5, { maxY: 0.5 });
  }

  // ------------------------------------------------ holo-table pedestal
  // own batch + group so battle mode can hide it (the arena replaces it)
  const pb = new Batch();
  const hx = L.holo.x, hz = L.holo.z;
  const ped = std({ color: 0x1c2028, roughness: 0.3, metalness: 0.8, envMapIntensity: 1.2 });
  const top = std({ color: 0x0b1018, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.6 });
  const cyan = glow(0x38e1ff, 2.6);
  const cyanSoft = glow(0x38e1ff, 1.0);
  pb.cyl(ped, hx, PAVE, hz, 1.18, 1.3, 0.85, 8, { ry: Math.PI / 8 });
  pb.cyl(top, hx, PAVE + 0.85, hz, 1.24, 1.24, 0.06, 8, { ry: Math.PI / 8 });
  for (const y of [PAVE + 0.06, PAVE + 0.82]) pb.cyl(cyan, hx, y, hz, 1.3 - (y - PAVE) * 0.13 + 0.02, 1.3 - (y - PAVE) * 0.13 + 0.025, 0.035, 8, { ry: Math.PI / 8, open: true, cast: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const r = 1.26;
    pb.box(cyan, hx + Math.sin(a) * r, PAVE + 0.06, hz + Math.cos(a) * r, 0.035, 0.76, 0.035, { ry: a, rx: 0.07 * 0, cast: false });
  }
  pb.cyl(cyanSoft, hx, PAVE + 0.005, hz, 1.9, 1.9, 0.004, 32, { cast: false });
  pb.cyl(ped, hx, PAVE + 0.006, hz, 1.75, 1.75, 0.006, 32, { cast: false });
  const pedGroup = new THREE.Group();
  pb.flush(pedGroup);
  root.add(pedGroup);
  ctx.arenaDecor.push(pedGroup);
  coll.addCircle(hx, hz, 1.3, { tag: 'holo-table' });
  glows.pool(hx, PAVE + 0.02, hz, 3.2, 0x38e1ff, 0.5);
  ctx.updaters.push((dt, t) => {
    const p = 2.2 + Math.sin(t * 2.4) * 0.6;
    cyan.color.setRGB(0.22 * p, 0.88 * p, 1.0 * p);
  });

  // decor inside the arena square (no colliders, hidden in battle mode)
  const decor = new THREE.Group();
  const board = new THREE.Mesh(boxGeo(0.62, 0.95, 0.05), std({ color: 0x2a1a10 }));
  const bt = signMat(T.signTex('holoboard', 256, 384, { bg: '#0a1530', fg: '#38e1ff', text: 'ホロバトル', sub: 'HOLO BATTLE · 受付中', glow: '#38e1ff' }), 1.5);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.84), bt);
  face.position.z = 0.03;
  const face2 = face.clone(); face2.rotation.y = Math.PI; face2.position.z = -0.03;
  const sb = new THREE.Group(); sb.add(board, face, face2);
  sb.position.set(hx + 4.2, PAVE + 0.5, hz + 3.6);
  sb.rotation.set(0, -0.6, 0);
  decor.add(sb);
  const crate = std({ color: 0x2f8a4a, roughness: 0.6 });
  for (const [x, z, r] of [[hx - 4.6, hz - 4.2, 0.2], [hx - 4.1, hz - 4.5, 0.6]]) {
    const c = new THREE.Mesh(boxGeo(0.5, 0.32, 0.36), crate);
    c.position.set(x, PAVE + 0.16, z); c.rotation.y = r; c.castShadow = true;
    decor.add(c);
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), std({ color: 0xff7a1a, roughness: 0.5 }));
  cone.position.set(hx + 5, PAVE + 0.25, hz - 4.6);
  decor.add(cone);
  root.add(decor);
  ctx.arenaDecor.push(decor);

  // lights
  const plazaLight = ctx.addLight(0xffe2c0, 20, 18, hx, 5.8, hz);
  const entryLight = ctx.addLight(0xffd8b0, 18, 13, A.maxX - 4, 5.5, midZ);
  ctx.battleHooks.push((on) => {
    barMat.color.setRGB(0.96, 0.97, 1).multiplyScalar(on ? 1.4 : 3.4);
    sideBar.color.set(0xfff0d8).multiplyScalar(on ? 0.9 : 2.2);
    lmat.emissiveIntensity = on ? 0.9 : 1.8;
    if (plazaLight) { plazaLight.color.set(on ? 0x7fd8ff : 0xffe2c0); plazaLight.intensity = on ? 10 : 20; }
    if (entryLight) entryLight.intensity = on ? 10 : 18;
    if (glows.poolMesh) glows.poolMesh.material.opacity = on ? 0.6 : 1;
  });
}
