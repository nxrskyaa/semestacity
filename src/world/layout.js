// Shared layout constants for the Semesta City block (metres, Y up).
// Main street runs along Z toward the Rialo HQ at -Z; the arcade is west (-X),
// the konbini sits on the north-east corner of the T-junction near spawn.
export const PAVE = 0.15; // pavement / plaza / arcade / konbini floor height

export const L = {
  bounds: { minX: -44.5, minZ: -36, maxX: 26.3, maxZ: 25.8 },
  road: { minX: -4, maxX: 4, minZ: -22, maxZ: 27 },
  cross: { minX: 4, maxX: 26.5, minZ: -6, maxZ: 1 },
  plaza: { minX: -15, maxX: 15, minZ: -36, maxZ: -22 },
  hq: { minX: -13, maxX: 13, minZ: -60, maxZ: -36 },
  arcade: { minX: -44, maxX: -12.5, minZ: -9.5, maxZ: 4.5, roofY: 7.4 },
  holo: { x: -28, z: -2.5 },
  konbini: { minX: 7.5, maxX: 19.5, minZ: -21, maxZ: -9 },
  cafe: { minX: -12.5, maxX: -7, minZ: -21, maxZ: -9 },
  spawn: { x: 0.6, z: -11, rotY: Math.PI },
};

/** rects (x/z) where the ground is road level (y = 0) */
export const ROADS = [L.road, L.cross];

/** facing helper: rotY so local +Z points from (x,z) toward (tx,tz) */
export const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
