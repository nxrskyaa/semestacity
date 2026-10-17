// "Rialo Playground" standing terminal on the HQ forecourt (under the canopy,
// beside the doors). Screen = dark testnet UI in the style of the playground page.
import * as THREE from 'three';
import { PAVE } from './layout.js';
import { glow, signMat, std } from './mats.js';
import * as T from './textures.js';
import { paintRialoMark, RIALO_CREAM, RIALO_INK } from '../gfx/rialoLogo.js';

const MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, Consolas, "Courier New", monospace';
const TEAL = '#7fd6cf';

function rr(x, X, Y, W, H, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.lineTo(X + W - r, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + r);
  x.lineTo(X + W, Y + H - r); x.quadraticCurveTo(X + W, Y + H, X + W - r, Y + H);
  x.lineTo(X + r, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - r);
  x.lineTo(X, Y + r); x.quadraticCurveTo(X, Y, X + r, Y);
  x.closePath();
}

function letter(x, text, px, py, spacing) {
  for (const ch of text) { x.fillText(ch, px, py); px += x.measureText(ch).width + spacing; }
  return px;
}

export function playgroundScreenTex() {
  return T.paintTex('playgroundScreen', 640, 1024, (x, w, h) => {
    x.fillStyle = '#060606'; x.fillRect(0, 0, w, h);
    // faint column grid like the page background
    x.strokeStyle = 'rgba(255,255,255,0.05)'; x.lineWidth = 1;
    for (let i = 20; i < w; i += 80) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 70); x.stroke(); }
    // top bar: mark + "Playground" + TESTNET pill
    paintRialoMark(x, 52, { x: 28, y: 22, bg: null, fg: RIALO_CREAM });
    x.fillStyle = '#ece8dc'; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.font = `600 30px ${T.LATIN}`; x.fillText('Rialo Playground', 94, 49);
    x.font = `600 15px ${MONO}`;
    const tw = 112;
    rr(x, w - tw - 26, 32, tw, 34, 17); x.strokeStyle = TEAL; x.lineWidth = 2; x.stroke();
    x.fillStyle = TEAL; x.beginPath(); x.arc(w - tw - 6, 49, 5, 0, 7); x.fill();
    letter(x, 'TESTNET', w - tw + 8, 50, 2.5);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, 92, w, 2);

    const panel = (y, ph, sec, title) => {
      rr(x, 24, y, w - 48, ph, 18);
      x.fillStyle = '#0f0f0f'; x.fill();
      x.strokeStyle = '#262626'; x.lineWidth = 2; x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(26, y + 66, w - 52, 2);
      x.font = `500 15px ${MONO}`; x.fillStyle = TEAL;
      const ex = letter(x, sec, 52, y + 34, 2.6);
      x.font = `700 23px ${T.LATIN}`; x.fillStyle = '#ece8dc';
      x.fillText(title, ex + 16, y + 34);
    };
    const row = (y, label, value, mono = false) => {
      x.font = `500 14px ${MONO}`; x.fillStyle = '#8a8170';
      letter(x, label, 52, y, 2.4);
      x.font = mono ? `500 18px ${MONO}` : `500 20px ${T.LATIN}`;
      x.fillStyle = mono ? '#c9c4b8' : '#ece8dc';
      x.fillText(value, 210, y);
    };
    let y = 116;
    panel(y, 236, '§ 01 / SESSION', 'Identity');
    row(y + 106, 'EMAIL', 'builder@semesta.city');
    row(y + 152, 'USER ID', '7c1e2b9a-41d0-4f6e…', true);
    row(y + 198, 'NAME', 'Semesta Builder');
    y += 262;
    panel(y, 300, '§ 02 / KEYPAIR', 'Custodial wallet');
    row(y + 106, 'PUBLIC KEY', '4JPSCxe92rgBW5Dz…XvHY', true);
    row(y + 152, 'BALANCE', '5 $RIALO');
    x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(52, y + 186, w - 104, 2);
    rr(x, 52, y + 212, 196, 56, 10); x.fillStyle = '#a9ddd6'; x.fill();
    x.fillStyle = '#0d1a18'; x.font = `600 19px ${T.LATIN}`; x.fillText('Request $RIALO', 72, y + 241);
    rr(x, 264, y + 212, 196, 56, 10); x.strokeStyle = '#3a3a3a'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#ece8dc'; x.fillText('Browse apps →', 286, y + 241);
    y += 326;
    panel(y, 190, '§ 03 / POINTS', 'Join with this wallet');
    row(y + 110, 'SLOT', '#18 204 991', true);
    row(y + 152, 'NETWORK', 'Rialo Testnet', false);
    // footer prompt
    x.textAlign = 'center';
    x.font = `600 17px ${MONO}`; x.fillStyle = TEAL;
    letter(x, '', 0, 0, 0);
    x.fillText('[ E ]  OPEN PLAYGROUND', w / 2, h - 52);
    x.fillStyle = 'rgba(232,227,213,0.4)'; x.font = `500 13px ${MONO}`;
    x.fillText('rialo.io · simulated testnet · no real funds', w / 2, h - 24);
  });
}

/** standing terminal at (x,z) facing rotY; returns { root, screen, spot } */
export function buildPlaygroundKiosk(ctx, { x = 3.6, z = -34.3, rotY = -0.4 } = {}) {
  const { batch: b, coll, glows, interactables } = ctx;
  const ink = std({ color: 0x141414, roughness: 0.3, metalness: 0.55, envMapIntensity: 1.1 });
  const creamSolid = std({ color: 0xe8e3d5, roughness: 0.4, emissive: 0xe8e3d5, emissiveIntensity: 0.08 });
  const edge = glow(RIALO_CREAM, 2.0);
  const tealGlow = glow(0x7fd6cf, 1.8);
  const sn = Math.sin(rotY), cs = Math.cos(rotY);
  // local (lx, lz) -> world
  const W = (lx, lz) => [x + cs * lx + sn * lz, z - sn * lx + cs * lz];
  const box = (mat, lx, y0, lz, w, h, d, o = {}) => { const [wx, wz] = W(lx, lz); b.box(mat, wx, y0, wz, w, h, d, { ry: rotY, ...o }); };
  const plane = (mat, lx, y, lz, w, h, o = {}) => { const [wx, wz] = W(lx, lz); b.plane(mat, wx, y, wz, w, h, { ry: rotY, ...o }); };

  // plinth + slim column
  box(ink, 0, PAVE, 0, 0.92, 0.1, 0.62);
  box(edge, 0, PAVE + 0.1, 0.3, 0.86, 0.015, 0.015, { cast: false });
  box(ink, 0, PAVE + 0.1, -0.05, 0.3, 0.95, 0.22);
  box(creamSolid, 0, PAVE + 0.1, 0.065, 0.04, 0.95, 0.01);
  // tilted screen head (portrait), tilted back ~10°
  const tilt = -0.17;
  const sw = 0.78, sh = sw * 1024 / 640;
  const hy = PAVE + 1.05 + sh / 2 + 0.1, hz = -0.05; // head pivot
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // offset (dy, dz) from the pivot, rotated by the tilt -> [y, lz]
  const P = (dy, dz) => [hy + dy * ct - dz * st, hz + dy * st + dz * ct];
  const tbox = (mat, dy, dz, w, h, d, o = {}) => { const [y, lz] = P(dy, dz); box(mat, 0, y - h / 2, lz, w, h, d, { rx: tilt, ...o }); };
  const tplane = (mat, dy, dz, w, h, ox = 0) => { const [y, lz] = P(dy, dz); plane(mat, ox, y, lz, w, h, { rx: tilt }); };
  tbox(ink, 0, 0, sw + 0.12, sh + 0.16, 0.12);
  tplane(signMat(playgroundScreenTex(), 1.05), 0, 0.062, sw, sh);
  // cream light edges on the bezel sides + teal status bar under the screen
  for (const s of [-1, 1]) { const [y, lz] = P(0, 0); box(edge, s * (sw / 2 + 0.065), y - (sh + 0.04) / 2, lz, 0.012, sh + 0.04, 0.13, { rx: tilt, cast: false }); }
  tbox(tealGlow, -sh / 2 - 0.045, 0.062, 0.5, 0.02, 0.012, { cast: false });
  // header plate with the official wordmark on top
  // canvas sized like rialoHQ's wordmark() so the helper's content is centred (never stretched)
  const mctx = document.createElement('canvas').getContext('2d');
  mctx.font = `600 ${Math.round(256 * 0.56)}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  const asp = ((256 * 0.98 + mctx.measureText('rialo').width) / 0.92) / 256;
  const wm = T.rialoWordmark('kiosk', Math.round(256 * asp), 256, { bg: null, fg: RIALO_CREAM, withMark: true, glow: null });
  tbox(ink, sh / 2 + 0.2, -0.02, sw + 0.12, 0.26, 0.1);
  tplane(signMat(wm, 1.6, { transparent: true, depthWrite: false }), sh / 2 + 0.2, 0.034, 0.19 * asp, 0.19);
  // small TESTNET tag on the column front
  plane(signMat(T.signTex('kioskTag', 256, 64, { bg: '#0f0f0f', fg: '#7fd6cf', text: 'PLAYGROUND · TESTNET', weight: 600, family: MONO, border: '#2a2a2a' }), 1.1), 0, PAVE + 0.75, 0.064, 0.28, 0.07);
  // a tiny mark on the plinth face
  plane(signMat(T.rialoMark('kioskMark', 128, 128, { bg: RIALO_INK, fg: RIALO_CREAM, margin: 0.18 }), 1.1), 0, PAVE + 0.05, 0.312, 0.09, 0.09);

  coll.addCircle(x, z, 0.5, { tag: 'kiosk' });
  const [px, pz] = W(0, 0.55);
  glows.pool(px, PAVE + 0.02, pz, 1.4, 0x9fe8e0, 0.35);
  const [ix, iz] = W(0, 1.05);
  const spot = { x: ix, z: iz };
  interactables.push({ id: 'playground', x: ix, z: iz, radius: 1.5, label: 'Rialo Playground' });
  return { spot, position: { x, z, rotY } };
}
