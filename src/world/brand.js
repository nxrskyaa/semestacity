// User brand images (public/brand/*): the giant "Rialo Builder Hub" banner on the
// tower east of the HQ plaza, and the Semesta logo as halo-lit signs (city gate
// over the main street + a rooftop sign on Kopi Rialo facing the spawn).
import * as THREE from 'three';
import { PAVE } from './layout.js';
import { glow, std, signMat } from './mats.js';
import * as T from './textures.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
export const BRAND_URL = {
  banner: `${BASE}brand/rialohub-banner.png`,
  logo: `${BASE}brand/semesta-logo.png`,
};
export const BANNER_ASPECT = 1920 / 1080;
export const LOGO_ASPECT = 1318 / 539;

/**
 * Pixel-art friendly texture: mipmapped + trilinear when minified (smooth far away),
 * nearest when magnified (crisp pixels up close), max anisotropy for grazing views.
 * premultiply: upload with premultiplied alpha (kills the white fringe of transparent PNGs).
 */
export function loadPixelArt(url, renderer, { premultiply = false } = {}) {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
  tex.premultiplyAlpha = premultiply;
  return tex;
}

/** unlit material for a premultiplied-alpha texture (ONE, ONE_MINUS_SRC_ALPHA) */
function premulSignMat(map, k) {
  return new THREE.MeshBasicMaterial({
    map, color: new THREE.Color(k, k, k), fog: false,
    transparent: true, depthWrite: false, alphaTest: 0.02,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    premultipliedAlpha: false,
  });
}

function haloMat(color, k) {
  return new THREE.MeshBasicMaterial({
    map: T.radialGlow(), color: new THREE.Color(color).multiplyScalar(k), fog: false,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/** add a mesh with a world transform, no shadows (sign faces) */
function place(parent, geo, mat, { x = 0, y = 0, z = 0, ry = 0, rx = 0 } = {}, order = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  m.renderOrder = order;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- giant banner
/**
 * Billboard on the west face (x = wallX) of the tower east of the HQ plaza.
 * Faces -X toward the plaza / main street; visible from the spawn over the konbini.
 */
export function buildHubBanner(ctx, { wallX = 15.6, cz = -30.1, W = 17.2, y0 = 7.6 } = {}) {
  const { batch: b, mats: M, glows, root, renderer } = ctx;
  const H = W / BANNER_ASPECT; // never stretched: 16:9
  const cy = y0 + H / 2;
  const ry = -Math.PI / 2;
  const faceX = wallX - 0.62; // banner face plane
  const steel = std({ color: 0x23272e, roughness: 0.42, metalness: 0.75, envMapIntensity: 1.0 });
  const frameMat = std({ color: 0x3a404a, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.1 });

  // backing cabinet (light box) bolted to the wall
  b.box(steel, wallX - 0.3, y0 - 0.35, cz, 0.6, H + 0.7, W + 0.7);
  // bezel: four bars proud of the face
  const bz = 0.22, bd = 0.2;
  b.box(frameMat, faceX - 0.05, y0 + H, cz, bd, bz, W + 2 * bz);            // top
  b.box(frameMat, faceX - 0.05, y0 - bz, cz, bd, bz, W + 2 * bz);           // bottom
  for (const s of [-1, 1]) b.box(frameMat, faceX - 0.05, y0 - bz, cz + s * (W / 2 + bz / 2), bd, H + 2 * bz, bz);
  // corner bolts / rivets along the bezel (small boxes)
  for (let i = 0; i <= 12; i++) {
    const z = cz - W / 2 + (W * i) / 12;
    for (const y of [y0 + H + bz / 2, y0 - bz / 2]) b.box(M.metalGrey, faceX - 0.16, y - 0.03, z, 0.03, 0.06, 0.06);
  }
  // LED strip along the top + a fainter one along the bottom (bloom a little)
  const led = glow(0xcfe9ff, 2.6);
  const ledSoft = glow(0x8fc8ff, 1.5);
  b.box(led, faceX - 0.17, y0 + H + 0.02, cz, 0.04, 0.05, W + 0.3, { cast: false });
  b.box(ledSoft, faceX - 0.17, y0 - 0.07, cz, 0.04, 0.04, W + 0.3, { cast: false });
  // spotlight arms along the top, pointing back down onto the face
  const lens = glow(0xfff4dc, 3.2);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const z = cz - W / 2 + W * (i + 0.5) / n;
    b.box(steel, faceX - 0.55, y0 + H + 0.32, z, 1.0, 0.07, 0.07);
    b.box(steel, faceX - 0.12, y0 + H + 0.1, z, 0.07, 0.3, 0.07);
    // housing tilted toward the banner
    b.box(steel, faceX - 1.05, y0 + H + 0.12, z, 0.32, 0.24, 0.26, { rz: 0.6 });
    b.plane(lens, faceX - 0.98, y0 + H + 0.03, z, 0.2, 0.18, { rx: Math.PI / 2, ry, cast: false });
  }
  // service catwalk (ledge) under the banner with a pipe railing + brackets
  const cw = 1.1;
  b.box(steel, faceX - cw / 2 + 0.1, y0 - 0.55, cz, cw, 0.08, W + 1.0);
  b.box(M.metalGrey, faceX - cw + 0.12, y0 - 0.47, cz, 0.04, 0.12, W + 1.0);
  for (const y of [0.55, 1.0]) b.box(M.railWhite, faceX - cw + 0.13, y0 - 0.47 + y, cz, 0.04, 0.04, W + 1.0);
  for (let i = 0; i <= 10; i++) {
    const z = cz - (W + 1.0) / 2 + ((W + 1.0) * i) / 10;
    b.box(M.railWhite, faceX - cw + 0.13, y0 - 0.47, z, 0.04, 1.02, 0.04);
  }
  for (let i = 0; i <= 4; i++) {
    const z = cz - W / 2 + (W * i) / 4;
    const ax = wallX, ay = y0 - 1.9, bx = faceX - cw + 0.25, by = y0 - 0.55;
    const len = Math.hypot(bx - ax, by - ay);
    b.box(steel, (ax + bx) / 2, (ay + by) / 2 - len / 2, z, 0.08, len, 0.08, { rz: Math.atan2(-(bx - ax), by - ay) });
  }

  // the banner itself (own mesh: unlit backlit LED panel, fog off so it never washes out)
  const tex = loadPixelArt(BRAND_URL.banner, renderer);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.1, 1.1, 1.1), fog: false });
  mat.name = 'hubBanner';
  const mesh = place(root, new THREE.PlaneGeometry(W, H), mat, { x: faceX, y: cy, z: cz, ry });
  mesh.name = 'hubBanner';

  // reflections of the lightbox on the wet plaza + soft spill at its foot
  glows.streak(faceX - 0.6, cz - W * 0.3, 4.5, 16, 0x6fa8ff, 0.32, PAVE + 0.02);
  glows.streak(faceX - 0.6, cz + W * 0.3, 4.5, 16, 0x9fd0ff, 0.32, PAVE + 0.02);
  glows.pool(faceX - 1.5, PAVE + 0.02, cz, 6.5, 0x6f9fff, 0.12);
  return { mesh, material: mat, texture: tex, W, H, center: new THREE.Vector3(faceX, cy, cz), normal: new THREE.Vector3(-1, 0, 0) };
}

// ---------------------------------------------------------------- Semesta logo signs
/**
 * Halo-lit cut-out logo: dark backing panel, additive halo glow on the panel,
 * premultiplied-alpha logo in front. Two-sided signs use a second, non-mirrored logo.
 */
function logoSign(ctx, parts, { x, y, z, ry = 0, W, twoSided = false, panelPad = [0.5, 0.45], haloColor = 0x6fb4ff }) {
  const { batch: b } = ctx;
  const H = W / LOGO_ASPECT;
  const panel = parts.panel ||= std({ color: 0x10142a, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.9 });
  const pw = W + panelPad[0] * 2, ph = H + panelPad[1] * 2, pd = 0.22;
  b.box(panel, x, y - ph / 2, z, pw, ph, pd, { ry });
  // thin gold trim around the panel
  const trim = parts.trim ||= glow(0xffcf6a, 1.6);
  const sides = twoSided ? [1, -1] : [1];
  for (const s of sides) {
    const off = s * (pd / 2 + 0.012);
    const ox = Math.sin(ry) * off, oz = Math.cos(ry) * off;
    for (const dy of [ph / 2 - 0.05, -ph / 2 + 0.05]) b.box(trim, x + ox, y + dy - 0.02, z + oz, pw - 0.1, 0.04, 0.02, { ry, cast: false });
    for (const dx of [pw / 2 - 0.05, -pw / 2 + 0.05]) {
      b.box(trim, x + ox + Math.cos(ry) * dx, y - ph / 2 + 0.05, z + oz - Math.sin(ry) * dx, 0.04, ph - 0.1, 0.02, { ry, cast: false });
    }
    // halo on the panel, logo floating in front of it
    const hOff = s * (pd / 2 + 0.03), lOff = s * (pd / 2 + 0.16);
    const fr = s > 0 ? ry : ry + Math.PI;
    parts.halos.push({ x: x + Math.sin(ry) * hOff, y, z: z + Math.cos(ry) * hOff, ry: fr, w: W * 1.18, h: H * 1.55, color: haloColor });
    parts.logos.push({ x: x + Math.sin(ry) * lOff, y, z: z + Math.cos(ry) * lOff, ry: fr, w: W, h: H });
  }
  return { W, H, pw, ph };
}

export function buildSemestaSigns(ctx) {
  const { batch: b, mats: M, coll, glows, root, renderer } = ctx;
  const parts = { halos: [], logos: [] };

  // ------------------------------------------------ city gate over the main street (two-sided)
  const gz = 7.2, postH = 9.6;
  const gateMetal = std({ color: 0x1b1f2a, roughness: 0.4, metalness: 0.7, envMapIntensity: 1.0 });
  const capGlow = glow(0xffd36a, 2.5), postGlow = glow(0x7fd8ff, 1.8), upLens = glow(0xfff0d0, 3);
  for (const s of [-1, 1]) {
    const px = s * 5.4;
    b.box(M.concreteDark, px, PAVE, gz, 0.7, 0.5, 0.7);
    b.cyl(gateMetal, px, PAVE + 0.5, gz, 0.15, 0.18, postH - 0.5, 12);
    b.cyl(capGlow, px, postH + PAVE, gz, 0.2, 0.2, 0.18, 12, { cast: false });
    b.box(postGlow, px, PAVE + 0.6, gz + 0.19, 0.04, postH - 1.4, 0.02, { cast: false });
    b.box(postGlow, px, PAVE + 0.6, gz - 0.19, 0.04, postH - 1.4, 0.02, { cast: false });
    coll.addCircle(px, gz, 0.3);
  }
  b.box(gateMetal, 0, postH - 0.2, gz, 11.2, 0.16, 0.18);
  const gate = logoSign(ctx, parts, { x: 0, y: 7.15, z: gz, W: 7.6, twoSided: true });
  // welcome plate under the logo (two single-sided planes, never mirrored)
  const welcome = signMat(T.paintTex('semestaWelcome', 1024, 96, (x, w, h) => {
    x.fillStyle = '#0d1430'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#ffcf6a'; x.lineWidth = 4; x.strokeRect(4, 4, w - 8, h - 8);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff'; x.shadowColor = '#7fd8ff'; x.shadowBlur = 10;
    T.fitText(x, 'ようこそ セメスタ市へ  ·  WELCOME TO SEMESTA CITY', w * 0.9, 50, 800, T.LATIN);
    x.fillText('ようこそ セメスタ市へ  ·  WELCOME TO SEMESTA CITY', w / 2, h * 0.54);
  }), 1.6);
  const plateY = 7.15 - gate.ph / 2 - 0.42;
  b.box(gateMetal, 0, plateY - 0.33, gz, 6.6, 0.66, 0.12);
  b.plane(welcome, 0, plateY, gz + 0.07, 6.4, 0.6);
  b.plane(welcome, 0, plateY, gz - 0.07, 6.4, 0.6, { ry: Math.PI });
  for (const s of [-1, 1]) b.box(gateMetal, s * 2.6, plateY + 0.3, gz, 0.06, 7.15 - gate.ph / 2 - plateY - 0.3, 0.06);
  glows.streak(0, gz + 0.6, 5, 16, 0x7fb8ff, 0.45);
  glows.streak(0, gz - 0.6, 5, 16, 0x7fb8ff, 0.45);
  glows.pool(0, 0.02, gz, 5.5, 0x8fb0ff, 0.18);

  // ------------------------------------------------ rooftop sign on Kopi Rialo, turned toward the spawn
  const rx0 = -9.2, rz0 = -19.9, rry = 0.35, roofY = 7.55;
  const rW = 6.4;
  const rH = rW / LOGO_ASPECT;
  const ry0 = roofY + 1.5 + (rH + 0.9) / 2; // sign centre height
  const roof = logoSign(ctx, parts, { x: rx0, y: ry0, z: rz0, ry: rry, W: rW, haloColor: 0x7fc4ff });
  // lattice legs + braces behind the panel
  const back = -0.45;
  for (const t of [-0.36, -0.03, 0.3]) {
    const ox = Math.cos(rry) * roof.pw * t, oz = -Math.sin(rry) * roof.pw * t;
    const bx = rx0 + ox + Math.sin(rry) * back, bzz = rz0 + oz + Math.cos(rry) * back;
    b.box(gateMetal, rx0 + ox, roofY, rz0 + oz, 0.14, ry0 - roofY, 0.14, { ry: rry });
    b.box(gateMetal, bx, roofY, bzz, 0.1, ry0 - roofY + roof.ph * 0.3, 0.1, { ry: rry });
    b.box(gateMetal, (rx0 + ox + bx) / 2, roofY + 0.6, (rz0 + oz + bzz) / 2, 0.06, 1.6, 0.06, { ry: rry, rx: 0.55 });
  }
  b.box(gateMetal, rx0 + Math.sin(rry) * back, ry0 + roof.ph * 0.3 - 0.1, rz0 + Math.cos(rry) * back, roof.pw * 0.8, 0.08, 0.08, { ry: rry });
  // two small uplights on the roof edge washing the panel
  for (const t of [-0.3, 0.3]) {
    const ux = rx0 + Math.cos(rry) * roof.pw * t + Math.sin(rry) * 0.9, uz = rz0 - Math.sin(rry) * roof.pw * t + Math.cos(rry) * 0.9;
    b.box(gateMetal, ux, roofY, uz, 0.25, 0.18, 0.25, { ry: rry });
    b.plane(upLens, ux, roofY + 0.19, uz, 0.18, 0.18, { rx: -Math.PI / 2, ry: rry, cast: false });
  }

  // ------------------------------------------------ shared logo + halo meshes (2 draw calls)
  const logoTex = loadPixelArt(BRAND_URL.logo, renderer, { premultiply: true });
  const logoMat = premulSignMat(logoTex, 1.22);
  logoMat.name = 'semestaLogo';
  const halo = haloMat(0x6fb4ff, 1.0);
  const hGeo = [], lGeo = [];
  for (const h of parts.halos) {
    const g = new THREE.PlaneGeometry(h.w, h.h);
    const c = new THREE.Color(h.color).multiplyScalar(0.9);
    const col = [];
    for (let i = 0; i < 4; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(h.x, h.y, h.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h.ry, 0)), new THREE.Vector3(1, 1, 1)));
    hGeo.push(g);
  }
  for (const l of parts.logos) {
    const g = new THREE.PlaneGeometry(l.w, l.h);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(l.x, l.y, l.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, l.ry, 0)), new THREE.Vector3(1, 1, 1)));
    lGeo.push(g);
  }
  halo.vertexColors = true;
  halo.color.setRGB(1, 1, 1);
  const merge = (gs) => {
    const out = gs.length === 1 ? gs[0] : mergeSimple(gs);
    return out;
  };
  const haloMesh = place(root, merge(hGeo), halo, {}, 1);
  const logoMesh = place(root, merge(lGeo), logoMat, {}, 2);
  haloMesh.name = 'semestaHalo';
  logoMesh.name = 'semestaLogo';
  ctx.updaters.push((dt, t) => {
    // slow breathing of the halo (letters themselves stay constant + crisp)
    const k = 0.92 + Math.sin(t * 1.3) * 0.08;
    halo.color.setRGB(k, k, k);
  });
  return { logoMesh, haloMesh, material: logoMat };
}

function mergeSimple(gs) {
  // all PlaneGeometry: same attribute layout, indexed
  let nv = 0, ni = 0;
  for (const g of gs) { nv += g.attributes.position.count; ni += g.index.count; }
  const hasCol = !!gs[0].attributes.color;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = hasCol ? new Float32Array(nv * 3) : null;
  const idx = new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of gs) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (col) col.set(g.attributes.color.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count; io += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
