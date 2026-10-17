// Hand props: transparent ribbed umbrella, phone, broom.
import * as THREE from 'three';
import { toonMat } from '../gfx/toon.js';
import { ribbonTube, limb, loft, charMat, merge, hullMesh } from './geom.js';
import { makeCanvas, canvasTex } from '../core/util.js';
import { makeRialoTexture, RIALO_CREAM, RIALO_INK } from '../gfx/rialoLogo.js';

const addOutline = (m, t) => hullMesh(m, t);

function starryTexture(color) {
  const [c, x] = makeCanvas(512, 512);
  const g = x.createRadialGradient(256, 256, 20, 256, 256, 256);
  g.addColorStop(0, new THREE.Color(color).lerp(new THREE.Color('#8a8cff'), 0.25).getStyle()); g.addColorStop(1, new THREE.Color(color).multiplyScalar(0.45).getStyle());
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(255,255,${200 + r() * 55},${0.4 + r() * 0.6})`; x.beginPath(); x.arc(r() * 512, r() * 512, r() * 1.8 + 0.4, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#fff6c8';
  for (let i = 0; i < 18; i++) {
    const cx = r() * 512, cy = r() * 512, R = 5 + r() * 8;
    x.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? R * 0.42 : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fill();
  }
  const t = canvasTex(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** clear plastic umbrella. Local frame: grip at origin, shaft along +Y. */
export function createUmbrella(color = '#dff3ff', style = 'clear') {
  const g = new THREE.Group();
  g.name = 'umbrella';
  const R = 0.56, TOP = 0.92, DROP = 0.24, RIBS = 8;
  // canopy
  const rings = 7, segs = RIBS * 4;
  const pos = [], idx = [];
  pos.push(0, TOP, 0);
  for (let i = 1; i <= rings; i++) {
    const rho = i / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const s = (1 - Math.cos(a * RIBS)) / 2; // 0 at ribs, 1 mid-panel
      const r = R * rho * (1 - 0.07 * s * rho);
      const y = TOP - DROP * Math.pow(rho, 1.7) + (rho > 0.92 ? 0.022 * s * (rho - 0.92) / 0.08 : 0) - 0.012 * s * Math.sin(Math.PI * rho);
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs);
      const c = 1 + i * segs + ((j + 1) % segs), d = 1 + i * segs + j;
      idx.push(a, d, c, a, c, b);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // planar top-down UVs: seen from above the print reads correctly (u = +X, v = -Z)
  const uvs = [];
  for (let i = 0; i < pos.length; i += 3) uvs.push(0.5 + pos[i] / (2 * R), 0.5 - pos[i + 2] / (2 * R));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  cg.setIndex(idx);
  cg.computeVertexNormals();
  const opaque = style === 'starry' || style === 'rialo';
  let canopyMat, under = null, map = null;
  if (style === 'rialo') {
    map = makeRialoTexture(512, 512, { bg: RIALO_CREAM, fg: RIALO_INK, margin: 0.17 });
  } else if (style === 'starry') {
    map = starryTexture(color || '#3a3d8f');
  }
  if (opaque) {
    canopyMat = toonMat('#ffffff', { unique: true, map, side: THREE.FrontSide });
    canopyMat.emissive = new THREE.Color(style === 'starry' ? 0x6a6aa0 : 0x3a3830); canopyMat.emissiveMap = map; canopyMat.emissiveIntensity = style === 'starry' ? 1.2 : 0.5;
    canopyMat.transparent = true; canopyMat.opacity = 1;
    under = new THREE.Mesh(cg, toonMat(style === 'starry' ? '#22244a' : '#cfc9b8', { unique: true, side: THREE.BackSide }));
    under.material.transparent = true;
  } else {
    canopyMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
      shininess: 90, specular: new THREE.Color(0x99aabb), emissive: new THREE.Color(color).multiplyScalar(style === 'neon' ? 0.35 : 0.06),
    });
  }
  const canopy = new THREE.Mesh(cg, canopyMat);
  canopy.renderOrder = 2;
  canopy.name = 'canopy';
  g.add(canopy);
  if (under) { under.name = 'canopy-under'; g.add(under); }
  if (style === 'neon') {
    // glowing rim (blooms)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.995, 0.007, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3.2) }));
    rim.rotation.x = Math.PI / 2; rim.position.y = TOP - DROP + 0.004;
    rim.castShadow = false;
    g.add(rim);
  }
  g.userData.opaque = opaque;
  g.userData.underMat = under ? under.material : null;
  // ribs + rim (white-ish plastic)
  const ribMat = charMat('#e9eef2');
  const ribGeos = [];
  for (let k = 0; k < RIBS; k++) {
    const a = (k / RIBS) * Math.PI * 2;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const rho = i / 6;
      pts.push(V(Math.sin(a) * R * rho, TOP - DROP * Math.pow(rho, 1.7) - 0.004, Math.cos(a) * R * rho));
    }
    ribGeos.push(ribbonTube(pts, { width: 0.0028, thick: 0.0028, segs: 8, sides: 4, profile: () => [1, 1], closedTip: false }));
    const tip = new THREE.SphereGeometry(0.007, 6, 4);
    tip.translate(Math.sin(a) * R, TOP - DROP - 0.004, Math.cos(a) * R);
    tip.deleteAttribute('uv');
    ribGeos.push(tip);
    // stretcher from the runner to mid-rib
    const s0 = V(0, TOP - 0.3, 0), s1 = V(Math.sin(a) * R * 0.5, TOP - DROP * Math.pow(0.5, 1.7) - 0.006, Math.cos(a) * R * 0.5);
    ribGeos.push(ribbonTube([s0, s0.clone().lerp(s1, 0.5), s1], { width: 0.0018, thick: 0.0018, segs: 3, sides: 4, profile: () => [1, 1], closedTip: false }));
  }
  for (const gg of ribGeos) { for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal') gg.deleteAttribute(k); }
  for (const gg of ribGeos) if (gg.index === null) gg.setIndex([...Array(gg.getAttribute('position').count).keys()]);
  g.add(new THREE.Mesh(merge(ribGeos), ribMat));
  // shaft, runner, tip
  const shaftMat = charMat('#c9d3da');
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, TOP + 0.06, 8), shaftMat);
  shaft.position.y = (TOP + 0.06) / 2 - 0.04;
  g.add(shaft);
  const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 8), shaftMat);
  runner.position.y = TOP - 0.3;
  g.add(runner);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.06, 8), shaftMat);
  tip.position.y = TOP + 0.03;
  g.add(tip);
  // J handle (clear tinted plastic) below the grip
  const hpts = [V(0, -0.02, 0), V(0, -0.1, 0), V(0, -0.15, 0.012), V(0, -0.168, 0.045), V(0, -0.15, 0.075), V(0, -0.12, 0.08)];
  const handleGeo = ribbonTube(hpts, { width: 0.011, thick: 0.011, segs: 12, sides: 8, profile: () => [1, 1], closedTip: false, rootCap: true });
  const handle = new THREE.Mesh(handleGeo, toonMat('#3b4652'));
  addOutline(handle, 0.003);
  g.add(handle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o !== canopy; o.receiveShadow = false; } });
  g.userData.canopyMat = canopyMat;
  return g;
}

/** smartphone with a glowing screen; local frame: grip at origin, screen faces +Z */
export function createPhone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(loft([
    { y: -0.07, rx: 0.034, rz: 0.0045, n: 6 }, { y: -0.068, rx: 0.036, rz: 0.005, n: 6 }, { y: 0.068, rx: 0.036, rz: 0.005, n: 6 }, { y: 0.07, rx: 0.034, rz: 0.0045, n: 6 },
  ], 16), toonMat('#1b1d24'));
  addOutline(body, 0.002);
  g.add(body);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe9ff).multiplyScalar(2.4) }));
  scr.position.z = 0.0052;
  g.add(scr);
  g.userData.screen = scr;
  return g;
}

/** broom; local frame: grip at origin, stick along -Y/+Y */
export function createBroom() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(limb(1.15, 0.012, 0.012, { segs: 8, rings: 2, capRings: 2 }), toonMat('#a87a4a'));
  stick.position.y = 0.4;
  addOutline(stick, 0.003);
  g.add(stick);
  const head = new THREE.Mesh(loft([
    { y: -0.18, rx: 0.12, rz: 0.03, n: 3 }, { y: -0.08, rx: 0.08, rz: 0.03, n: 3 }, { y: 0.0, rx: 0.04, rz: 0.025, n: 3 },
  ], 14), toonMat('#d8b863'));
  head.position.y = -0.75;
  addOutline(head, 0.004);
  g.add(head);
  return g;
}

/** small folded cleaning cloth for the 'counter' idle; local frame: grip at origin */
export function createRag() {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(loft([
    { y: -0.03, rx: 0.03, rz: 0.012, n: 3 }, { y: 0.0, rx: 0.036, rz: 0.016, n: 3 }, { y: 0.028, rx: 0.03, rz: 0.012, n: 3 },
  ], 12), toonMat('#7fc8d8'));
  addOutline(cloth, 0.002);
  cloth.rotation.set(0.2, 0, Math.PI / 2);
  g.add(cloth);
  return g;
}
