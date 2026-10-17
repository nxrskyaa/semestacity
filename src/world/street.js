// Streets: wet asphalt, pavements, markings, utility poles + cables, lamps,
// signals, signs, guardrails, railway crossing, river edge, Semesta gate.
import * as THREE from 'three';
import { L, PAVE } from './layout.js';
import { cableGeo, boxGeo } from './builder.js';
import { glow, signMat, std } from './mats.js';
import * as T from './textures.js';

export function buildStreet(ctx) {
  const { batch: b, mats: M, coll, glows } = ctx;

  // ------------------------------------------------ ground
  b.floor(M.dirt, -160, -160, 160, 160, -0.03, { uv: 8 });
  b.floor(M.asphalt, L.road.minX, L.road.minZ, L.road.maxX, L.road.maxZ, 0, { uv: 6 });
  b.floor(M.asphalt, L.cross.minX, L.cross.minZ, L.cross.maxX, L.cross.maxZ, 0, { uv: 6 });

  const pave = (minX, minZ, maxX, maxZ, top = M.sidewalk, uv = 1.2) => {
    const w = maxX - minX, d = maxZ - minZ;
    b.box(M.curb, minX + w / 2, -0.02, minZ + d / 2, w, PAVE + 0.01, d, { uv: 1, cast: false });
    b.floor(top, minX, minZ, maxX, maxZ, PAVE, { uv });
  };
  // main street pavements
  pave(-7.2, -22, -4, 26);
  pave(4, -22, 7.5, -6);
  pave(4, 1, 7.5, 26);
  // cross street pavements
  pave(7.5, -9, 26.5, -6);
  pave(7.5, 1, 26.5, 4);
  // arcade forecourt (between cafe and south corner building)
  pave(-12.5, -9.5, -7.2, 4.5);
  // curb stones (slightly lighter, a touch higher) along road edges
  const curb = (minX, minZ, maxX, maxZ) => b.box(M.curb, (minX + maxX) / 2, 0, (minZ + maxZ) / 2, maxX - minX, PAVE + 0.012, maxZ - minZ, { uv: 0.6, cast: false });
  curb(-4.2, -22, -4, 26); curb(4, -22, 4.2, -6); curb(4, 1, 4.2, 26);
  curb(4.2, -6.2, 26.5, -6); curb(4.2, 1, 26.5, 1.2);
  curb(-4, -22.2, 4, -22);

  // tactile guide strips + warning pads at crossings
  const tac = (minX, minZ, maxX, maxZ) => b.floor(M.tactile, minX, minZ, maxX, maxZ, PAVE + 0.004, { uv: 0.3 });
  tac(-5.95, -21.5, -5.65, 25.5);
  tac(5.65, -21.5, 5.95, -6.6);
  tac(5.65, 1.6, 5.95, 25.5);
  tac(-4.9, 2.4, -4.3, 6.0); tac(4.3, 2.4, 4.9, 6.0);
  tac(7.6, -8.6, 10.6, -8.3); tac(7.6, 1.6, 10.6, 1.9);
  tac(5.95, -6.0, 6.25, -21.5 + 15.5 - 0.6); // short spur near the corner

  // ------------------------------------------------ road markings
  const mark = (mat, minX, minZ, maxX, maxZ) => b.floor(mat, minX, minZ, maxX, maxZ, 0.006, { uv: [0.5, 2], receive: true });
  // yellow centre line (no-passing), broken through the junction/crosswalk
  mark(M.paintY, -0.08, -21.4, 0.08, -6.6);
  mark(M.paintY, -0.08, 6.6, 0.08, 25.5);
  // white edge lines
  for (const s of [-1, 1]) {
    mark(M.paintW, s * 3.55 - 0.07, -21.4, s * 3.55 + 0.07, s > 0 ? -6.4 : 2.0);
    mark(M.paintW, s * 3.55 - 0.07, 6.4, s * 3.55 + 0.07, 25.5);
  }
  mark(M.paintW, -3.55 - 0.07, -5.0, -3.55 + 0.07, 2.0);
  // zebra crossing across main street (south of junction)
  for (let x = -3.4; x < 3.5; x += 0.9) mark(M.paintW, x, 2.6, x + 0.45, 5.8);
  // zebra across the cross street (konbini corner)
  for (let z = -5.6; z < 0.8; z += 0.9) mark(M.paintW, 7.8, z, 10.6, z + 0.45);
  // stop line + 止まれ for westbound traffic (drives on the left => +Z half)
  mark(M.paintW, 11.2, -2.5, 11.65, 0.8);
  mark(M.paintY, 4.2, -2.58, 26.4, -2.42);
  const tomare = new THREE.MeshStandardMaterial({ map: T.roadText('止まれ'), transparent: true, roughness: 0.35, envMapIntensity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  b.plane(tomare, 14.6, 0.008, -0.85, 2.4, 4.6, { rx: -Math.PI / 2, ry: Math.PI / 2 });
  // 止まれ + stop lines on the main street (left-hand traffic)
  b.plane(tomare, -2.0, 0.008, 10.6, 2.4, 4.6, { rx: -Math.PI / 2, ry: 0 });
  mark(M.paintW, -3.5, 6.45, -0.15, 6.9);
  b.plane(tomare, 2.0, 0.008, -15.6, 2.4, 4.6, { rx: -Math.PI / 2, ry: Math.PI });
  mark(M.paintW, 0.15, -7.4, 3.5, -6.95);
  // diamond "crosswalk ahead" marks
  for (const z of [11.5, 14.5]) {
    const g = boxGeo(0.9, 0.001, 0.12);
    for (const [dx, dz, a] of [[-0.3, -0.6, 0.45], [0.3, -0.6, -0.45], [-0.3, 0.6, -0.45], [0.3, 0.6, 0.45]]) {
      b.add(M.paintW, g, { x: -1.8 + dx, y: 0.007, z: z + dz, ry: a + Math.PI / 2 }, { cast: false });
    }
    g.dispose();
  }

  // ------------------------------------------------ utility poles + cables
  const poles = {
    west: [[-6.75, -19.5], [-6.75, -7.6], [-6.75, 8.4], [-6.75, 20.5]],
    east: [[6.85, -19.8], [6.85, -7.2], [6.85, 8.0], [6.85, 20.2]],
    cross: [[15.5, -8.6], [24.5, -8.6]],
    crossS: [[16.5, 3.6], [25.2, 3.6]],
  };
  const allPoles = [...poles.west, ...poles.east, ...poles.cross, ...poles.crossS];
  const sleeve = std({ color: 0xe0b020, roughness: 0.5 });
  const sleeveB = std({ color: 0x15161a, roughness: 0.5 });
  const insul = std({ color: 0xd8d4c8, roughness: 0.3 });
  const plate = signMat(T.signTex('addr', 256, 96, { bg: '#1b4f9c', fg: '#fff', text: 'セメスタ町 1丁目', sub: 'Semesta 1-chome', weight: 700 }), 0.9);
  const pTop = 10.4;
  allPoles.forEach(([x, z], i) => {
    b.cyl(M.poleConcrete, x, 0, z, 0.13, 0.17, pTop, 10);
    // striped guard sleeve
    for (let k = 0; k < 4; k++) b.cyl(k % 2 ? sleeveB : sleeve, x, 0.3 + k * 0.35, z, 0.18, 0.18, 0.35, 10, { cast: false });
    const ry = Math.abs(x) < 10 ? 0 : Math.PI / 2;
    for (const [y, w] of [[pTop - 0.4, 1.7], [pTop - 1.2, 1.3]]) {
      b.box(M.metalDark, x, y, z, w, 0.09, 0.09, { ry });
      for (const o of [-0.7, -0.25, 0.25, 0.7]) if (Math.abs(o) < w / 2) {
        const dx = ry ? 0 : o, dz = ry ? o : 0;
        b.cyl(insul, x + dx, y + 0.09, z + dz, 0.04, 0.05, 0.12, 6, { cast: false });
      }
    }
    if (i % 3 === 0) { // transformer
      const ox = ry ? 0.32 : 0, oz = ry ? 0 : 0.32;
      b.cyl(M.metalGrey, x + ox, 7.0, z + oz, 0.26, 0.26, 0.9, 10);
      b.cyl(M.metalDark, x + ox, 7.9, z + oz, 0.27, 0.27, 0.06, 10);
    }
    // address plate
    const face = Math.abs(x) < 10 ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
    const off = 0.19;
    b.plane(plate, x + Math.sin(face) * off, 2.6, z + Math.cos(face) * off, 0.32, 0.12 * 3.3 * 0.36, { ry: face });
    coll.addCircle(x, z, 0.24, { tag: 'pole' });
  });

  const cables = [];
  const span = (a, b2, hs = [[9.95, 0.5], [9.15, 0.65], [8.3, 0.85], [7.4, 1.0]], spread = 0.6) => {
    hs.forEach(([h, sag], k) => {
      const o = (k - 1.5) * spread / 3;
      const dx = b2[0] - a[0], dz = b2[1] - a[1];
      const len = Math.hypot(dx, dz);
      const nx = -dz / len * o, nz = dx / len * o;
      cables.push(cableGeo(new THREE.Vector3(a[0] + nx, h, a[1] + nz), new THREE.Vector3(b2[0] + nx, h - 0.05, b2[1] + nz), sag + (k % 2) * 0.15, k === 3 ? 0.03 : 0.016));
    });
  };
  for (const side of ['west', 'east']) {
    const p = poles[side];
    for (let i = 0; i < p.length - 1; i++) span(p[i], p[i + 1]);
    span(p[0], [p[0][0], -36], [[9.9, 0.4], [9.1, 0.5]]);
  }
  span(poles.east[1], poles.cross[0]); span(poles.cross[0], poles.cross[1]);
  span(poles.east[2], poles.crossS[0]); span(poles.crossS[0], poles.crossS[1]);
  // across-street spans (tangled)
  span(poles.west[1], poles.east[1], [[9.6, 0.7], [8.7, 0.9], [7.9, 1.2]], 0.3);
  span(poles.west[2], poles.east[2], [[9.4, 0.8], [8.0, 1.1]], 0.3);
  span(poles.west[3], poles.east[3], [[9.8, 0.6], [8.9, 0.9], [7.6, 1.3]], 0.4);
  // service drops to houses
  for (const [p, t] of [[poles.west[2], [-9, 7.0, 13]], [poles.west[3], [-8.2, 6.5, 23]], [poles.east[2], [10, 5.6, 10]], [poles.east[3], [10, 5.6, 18]], [poles.east[0], [8.2, 3.8, -18]], [poles.west[0], [-7.6, 6.0, -17]]]) {
    cables.push(cableGeo(new THREE.Vector3(p[0], 7.2, p[1]), new THREE.Vector3(t[0], t[1], t[2]), 0.5, 0.012));
    cables.push(cableGeo(new THREE.Vector3(p[0], 7.0, p[1]), new THREE.Vector3(t[0], t[1] - 0.2, t[2] + 0.3), 0.6, 0.012));
  }
  for (const g of cables) { b.add(M.cable, g, null, { cast: false, receive: false }); g.dispose(); }

  // ------------------------------------------------ street lamps on poles
  const lampPoles = [...poles.west, ...poles.east, poles.cross[0], poles.crossS[0]];
  lampPoles.forEach(([x, z], i) => {
    const inner = Math.abs(x) < 10;
    const dir = inner ? (x < 0 ? 1 : -1) : 0;
    const dz = inner ? 0 : (z < 0 ? 1 : -1);
    const ax = x + dir * 0.75, az = z + dz * 0.75;
    b.box(M.metalDark, x + dir * 0.4, 5.85, z + dz * 0.4, inner ? 0.9 : 0.06, 0.06, inner ? 0.06 : 0.9);
    b.box(M.metalDark, ax + dir * 0.2, 5.78, az + dz * 0.2, inner ? 0.62 : 0.24, 0.12, inner ? 0.24 : 0.62);
    b.plane(M.lampHead, ax + dir * 0.2, 5.71, az + dz * 0.2, inner ? 0.55 : 0.18, inner ? 0.18 : 0.55, { rx: Math.PI / 2 });
    const lx = ax + dir * 0.2, lz = az + dz * 0.2;
    glows.pool(lx, PAVE + 0.02, lz, 4.2, 0xffd9a0, 0.55);
    glows.streak(lx, lz + 0.01, 0.9, 9, 0xffd29a, 0.75);
    if ([1, 5, 2].includes(i)) ctx.addLight(0xffcf96, 26, 16, lx, 5.4, lz);
  });

  // ------------------------------------------------ traffic signals + signs
  const lensOff = std({ color: 0x1a1c20, roughness: 0.3 });
  const lensGeo = new THREE.CircleGeometry(0.15, 16);
  const signalHead = (x, y, z, ry, litIdx = 0) => {
    b.box(M.metalDark, x, y, z, 1.25, 0.42, 0.28, { ry });
    const cols = [0x22e0b8, 0xffb020, 0xff2a2a];
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * 0.4;
      const px = x + Math.cos(ry) * off, pz = z - Math.sin(ry) * off;
      const lit = k === litIdx;
      const mat = lit ? glow(cols[k], 3.2) : lensOff;
      b.add(mat, lensGeo, { x: px + Math.sin(ry) * 0.145, y: y + 0.21, z: pz + Math.cos(ry) * 0.145, ry }, { cast: false });
      if (lit) {
        glows.streak(px, pz + 2, 0.7, 10, cols[k], 0.7);
      }
    }
  };
  // signal pole at NE corner with arm over the main road (faces southbound... traffic toward HQ)
  b.cyl(M.metalGrey, 4.6, 0, -6.7, 0.1, 0.12, 6.0, 10);
  coll.addCircle(4.6, -6.7, 0.18);
  b.box(M.metalGrey, 2.4, 5.6, -6.7, 4.4, 0.1, 0.1);
  signalHead(1.6, 5.15, -6.7, 0, 0);
  // signal for westbound cross street traffic
  signalHead(4.9, 5.15, -4.4, Math.PI / 2, 2);
  b.box(M.metalGrey, 4.75, 5.6, -5.5, 0.1, 0.1, 2.4);
  // pedestrian signals at the zebra
  const ped = signMat(T.pedSignalTex(), 2.0);
  const pedPole = (x, z, ry) => {
    b.cyl(M.metalGrey, x, 0, z, 0.06, 0.07, 3.1, 8);
    coll.addCircle(x, z, 0.14);
    b.box(M.metalDark, x, 2.3, z, 0.42, 0.74, 0.22, { ry });
    b.plane(ped, x + Math.sin(ry) * 0.115, 2.67, z + Math.cos(ry) * 0.115, 0.36, 0.68, { ry });
    glows.streak(x + Math.sin(ry) * 0.3, z + Math.cos(ry) * 0.3, 0.5, 5, 0x40ffc0, 0.6);
  };
  pedPole(4.55, 6.3, -Math.PI / 2);
  pedPole(-4.55, 2.3, Math.PI / 2);

  const signBack = std({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 });
  const signMats = {};
  const signPost = (x, z, ry, kind, y = 2.4, s = 0.75, extra = null) => {
    b.cyl(M.metalGrey, x, 0, z, 0.04, 0.045, y + s * 0.4, 8);
    coll.addCircle(x, z, 0.1);
    const mat = signMats[kind] ||= new THREE.MeshStandardMaterial({ map: T.trafficSign(kind), alphaTest: 0.4, roughness: 0.3, emissive: 0xffffff, emissiveMap: T.trafficSign(kind), emissiveIntensity: 0.35 });
    b.plane(mat, x + Math.sin(ry) * 0.05, y, z + Math.cos(ry) * 0.05, s, s, { ry });
    b.add(signBack, new THREE.CircleGeometry(s * 0.47, 20), { x: x + Math.sin(ry) * 0.04, y, z: z + Math.cos(ry) * 0.04, ry: ry + Math.PI }, { cast: false });
    if (extra) extra();
  };
  signPost(11.9, 1.55, Math.PI / 2, 'tomare', 2.3, 0.8);
  signPost(4.6, 6.6, 0, 'ped', 2.6, 0.7);
  signPost(-4.6, 2.0, Math.PI, 'ped', 2.6, 0.7);
  signPost(-4.6, 15.5, 0, 'speed20', 2.5, 0.65);
  signPost(-4.6, -21.6, 0, 'pedonly', 2.4, 0.65);
  signPost(4.6, -21.6, 0, 'pedonly', 2.4, 0.65);

  // ------------------------------------------------ guardrails (white pipe railings)
  const rail = (x0, z0, x1, z1, h = 0.85, collide = true) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const y of [h, h * 0.55]) b.add(M.railWhite, new THREE.CylinderGeometry(0.035, 0.035, len, 6).rotateX(Math.PI / 2), { x: cx, y: PAVE + y, z: cz, ry }, { cast: true });
    const n = Math.max(2, Math.round(len / 1.8) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      b.cyl(M.railWhite, x0 + (x1 - x0) * t, PAVE, z0 + (z1 - z0) * t, 0.04, 0.04, h + 0.04, 6);
    }
    if (collide) {
      const minX = Math.min(x0, x1) - 0.06, maxX = Math.max(x0, x1) + 0.06;
      const minZ = Math.min(z0, z1) - 0.06, maxZ = Math.max(z0, z1) + 0.06;
      coll.addBox(minX, minZ, maxX, maxZ, { maxY: 1.1, tag: 'rail' });
    }
  };
  rail(-4.35, 8.2, -4.35, 13.2);
  rail(-4.35, 17.0, -4.35, 23.8);
  rail(4.35, 8.6, 4.35, 14.6);
  rail(4.35, 18.4, 4.35, 24.2);
  rail(4.35, -20.6, 4.35, -15.2);
  rail(-4.35, -19.0, -4.35, -16.0);
  // river railing at the end of the cross street
  rail(26.35, -9.0, 26.35, 4.0, 1.05);
  ctx.railing = rail;

  // ------------------------------------------------ railway crossing (south end)
  const zr = 28.6;
  b.box(M.gravel, 0, -0.03, zr, 120, 0.12, 4.4, { uv: 2, cast: false });
  const sleeperGeo = boxGeo(2.4, 0.08, 0.22);
  for (let x = -60; x < 60; x += 0.6) b.add(M.woodDark, sleeperGeo, { x, y: 0.12, z: zr - 0.9 }, { cast: false });
  sleeperGeo.dispose();
  for (const o of [-0.72, 0.72]) b.box(M.metalGrey, 0, 0.16, zr - 0.9 + o, 120, 0.1, 0.07, { cast: false });
  // crossing plate across the road
  b.box(M.black, 0, 0, zr - 0.9, 8, 0.15, 2.6, { cast: false });
  const crossSign = new THREE.MeshStandardMaterial({ map: T.trafficSign('crossing'), transparent: true, alphaTest: 0.4, roughness: 0.4, emissive: 0xffffff, emissiveMap: T.trafficSign('crossing'), emissiveIntensity: 0.25 });
  ctx.crossingLamps = [glow(0xff2a1a, 3.5), glow(0xff2a1a, 3.5)];
  const armTex = T.paintTex('gatearm', 256, 16, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#111' : '#f5c400'; x.fillRect(i * 32, 0, 32, h); } });
  const arm = std({ map: armTex, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const px = s * 4.9, pz = 26.6;
    b.cyl(M.railWhite, px, 0, pz, 0.08, 0.09, 3.6, 10);
    b.plane(crossSign, px, 3.3, pz - 0.1, 1.0, 1.0, { ry: Math.PI });
    b.plane(crossSign, px, 3.3, pz + 0.1, 1.0, 1.0, { ry: 0 });
    b.box(M.metalDark, px, 2.35, pz - 0.12, 0.9, 0.08, 0.08);
    for (const k of [0, 1]) {
      const lx = px + (k ? 0.36 : -0.36);
      b.add(ctx.crossingLamps[k], new THREE.CircleGeometry(0.13, 16), { x: lx, y: 2.35, z: pz - 0.18, ry: Math.PI }, { cast: false });
      b.add(M.black, new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12, 1, true).rotateX(Math.PI / 2), { x: lx, y: 2.35, z: pz - 0.2 });
    }
    b.box(M.metalDark, px - s * 0.25, 0, pz + 0.3, 0.4, 1.1, 0.4);
    // lowered barrier arm across the lane
    b.box(arm, px - s * 2.4, 0.95, pz + 0.3, 4.6, 0.09, 0.09, { uv: [4.6, 0.09] });
    coll.addCircle(px, pz, 0.2);
  }
  ctx.updaters.push((dt, t) => {
    const on = Math.floor(t * 1.6) % 2;
    ctx.crossingLamps[0].color.setRGB(on ? 3.5 : 0.25, on ? 0.6 : 0.05, on ? 0.35 : 0.03);
    ctx.crossingLamps[1].color.setRGB(on ? 0.25 : 3.5, on ? 0.05 : 0.6, on ? 0.03 : 0.35);
  });
  glows.streak(-4.9, 26.3, 0.8, 7, 0xff3020, 0.7);
  glows.streak(4.9, 26.3, 0.8, 7, 0xff3020, 0.7);
  // fence along the tracks
  for (const [x0, x1] of [[-44, -5.6], [5.6, 26.3]]) {
    const len = x1 - x0;
    b.box(M.metalGrey, (x0 + x1) / 2, 0, 26.2, len, 1.2, 0.04, { cast: false });
  }

  // ------------------------------------------------ river (east end of cross street)
  b.box(M.concreteDark, 26.6, -3, -2.5, 0.5, 3 + PAVE, 120, { uv: 2 });
  b.floor(M.water, 26.8, -60, 44, 60, -2.2, { uv: 6 });
  b.box(M.concreteDark, 44, -3, -2.5, 0.6, 3.2, 120, { uv: 2 });
  ctx.glows.streak(36, -8, 2.5, 18, 0xffb070, 0.5, -2.18);
  ctx.glows.streak(31, 6, 1.8, 14, 0x7fd0ff, 0.4, -2.18);

  // ------------------------------------------------ SEMESTA gate over the main street: see brand.js (real logo)

  // ------------------------------------------------ notice board near spawn (on the cafe wall)
  const nb = signMat(T.noticeBoardTex(), 0.8);
  const nx = L.cafe.maxX + 0.04, nz = -10.25;
  b.box(M.woodDark, nx + 0.03, PAVE + 0.9, nz, 0.08, 1.15, 1.8);
  b.plane(nb, nx + 0.08, PAVE + 1.47, nz, 1.66, 1.04, { ry: Math.PI / 2 });
  b.box(M.roofTile, nx + 0.25, PAVE + 2.12, nz, 0.5, 0.06, 2.0, { rz: 0.25 });
  b.plane(M.lampWarm, nx + 0.4, PAVE + 2.02, nz, 0.5, 0.05, { rx: Math.PI / 2 });
  glows.pool(nx + 0.6, PAVE + 0.01, nz, 1.5, 0xffc080, 0.35);
  ctx.interactables.push({ id: 'notice', x: nx + 0.9, z: nz, radius: 1.5, label: 'Notice board' });

  // ------------------------------------------------ boundary walls (invisible)
  const B = L.bounds;
  coll.addBox(B.minX - 2, B.minZ - 2, B.maxX + 2, B.minZ, { tag: 'bound' });
  coll.addBox(B.minX - 2, B.maxZ, B.maxX + 2, B.maxZ + 2, { tag: 'bound' });
  coll.addBox(B.minX - 2, B.minZ, B.minX, B.maxZ, { tag: 'bound' });
  coll.addBox(B.maxX, B.minZ, B.maxX + 2, B.maxZ, { tag: 'bound' });
}
