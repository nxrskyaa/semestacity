// THE official Rialo mark. Path taken verbatim from rialo.io brand assets
// (Group-14449.svg, viewBox 0 0 180 180).
// Do NOT edit these coordinates and NEVER redraw the mark by hand: always
// paint it with Path2D(RIALO_PATH) scaled uniformly (never stretched).
import * as THREE from 'three';

export const RIALO_PATH = 'M106.125 100.655C103.236 100.493 100.39 99.3801 98.4586 97.1916C95.7725 94.2692 94.8217 89.5202 96.4506 85.8339C98.4818 81.0683 103.412 79.0425 108.395 79.3912C112.108 79.3912 120.536 79.3912 124.854 79.3912C126.267 79.3713 127.504 79.4576 128.764 79.2982C131.666 78.9927 134.708 77.0831 136.26 74.5392C139.212 70.0692 138.095 63.5335 133.627 60.4782C131.849 59.1831 129.711 58.5953 127.52 58.4292C126.426 58.3196 125.326 58.1967 124.289 57.8812C121.008 56.9016 118.401 54.371 117.321 51.143C116.729 49.4626 116.753 47.6394 116.45 45.8992C115.752 41.7081 112.511 38.4934 108.299 37.5403C107.338 37.3145 106.427 37.1484 105.536 37.1418C95.327 37.1086 77.3698 37.0122 73.5268 37.0023C68.4239 36.896 63.5503 40.5092 62.6561 45.6169C61.6156 50.5685 64.6108 55.8621 69.3414 57.5259C71.0136 58.1502 72.3766 58.2864 74.1983 58.2665C79.7766 58.3196 80.9358 58.4525 83.9909 58.4823C87.9203 58.3561 92.1921 60.269 94.0903 63.776C98.2358 71.4308 92.3384 79.5838 83.8911 79.2849C73.4426 79.3082 67.4166 79.2716 54.8771 79.2816C52.7195 79.2982 51.0573 79.1587 49.0129 79.7067C43.132 81.0882 39.5583 87.8763 41.7491 93.5286C43.0655 97.2547 46.5528 99.9447 50.4889 100.426C55.4023 100.745 66.2055 100.463 78.6121 100.552C81.4677 100.552 83.5587 100.552 84.3898 100.552C85.191 100.546 85.9423 100.639 86.8066 100.811C92.0791 101.698 95.6794 106.832 95.3769 112.036C95.3769 115.547 95.3769 126.297 95.3769 131.653C95.3669 133.583 95.7126 135.569 96.7099 137.445C99.5656 143.008 107.265 144.781 112.288 140.975C116.084 138.189 116.906 134.134 116.689 129.74C116.683 125.274 116.696 117.649 116.689 112.704C117.118 106.138 112.906 100.928 106.194 100.669L106.128 100.662L106.125 100.655Z';

/** official brand colors */
export const RIALO_CREAM = '#e8e3d5';
export const RIALO_INK = '#141414';

/**
 * Paint the mark into a square region of ctx.
 * @param ctx 2d context
 * @param size side length in px of the square region
 * @param opts.x,y top-left of the square; opts.bg fill (null = transparent); opts.fg glyph color;
 *        opts.margin fraction of size kept empty around the glyph's 180-box (0 = official tight box)
 */
export function paintRialoMark(ctx, size = 128, { x = 0, y = 0, bg = RIALO_CREAM, fg = RIALO_INK, margin = 0 } = {}) {
  ctx.save();
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, size, size); }
  const inner = size * (1 - margin * 2);
  ctx.translate(x + size * margin, y + size * margin);
  ctx.scale(inner / 180, inner / 180);
  ctx.fillStyle = fg;
  ctx.fill(new Path2D(RIALO_PATH));
  ctx.restore();
}

/**
 * Canvas texture of the mark centered (never stretched) on a w×h canvas.
 * glow: draws a soft neon halo (for emissive signs).
 */
export function makeRialoTexture(w = 512, h = 512, { bg = RIALO_CREAM, fg = RIALO_INK, margin = 0.06, glow = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  const s = Math.min(w, h);
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = s * 0.06; }
  paintRialoMark(ctx, s, { x: (w - s) / 2, y: (h - s) / 2, bg: null, fg, margin });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** "rialo" wordmark texture (lowercase, as the brand writes it) next to/under the mark. */
export function makeRialoWordmarkTexture(w = 1024, h = 256, { bg = null, fg = RIALO_CREAM, withMark = true, glow = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = h * 0.12; }
  let x = w * 0.04;
  if (withMark) {
    paintRialoMark(ctx, h * 0.92, { x, y: h * 0.04, bg: null, fg });
    x += h * 0.98;
  }
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(h * 0.56)}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('rialo', x, h * 0.53);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** data URL of the mark for DOM use (menus, HUD, dialog portraits) */
export function rialoMarkDataURL(size = 128, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paintRialoMark(c.getContext('2d'), size, opts);
  return c.toDataURL('image/png');
}
