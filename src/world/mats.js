// Shared city materials (created once per buildCity call).
import * as THREE from 'three';
import * as T from './textures.js';

export function std(o = {}) {
  return new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, envMapIntensity: 0.6, ...o });
}

/** unlit glowing material; c > 1 blooms */
export function glow(color, k = 2, o = {}) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), ...o });
  return m;
}

/** unlit textured sign; k multiplies brightness */
export function signMat(map, k = 1.6, o = {}) {
  return new THREE.MeshBasicMaterial({ map, color: new THREE.Color(k, k, k), ...o });
}

/** "self-lit" lit-interior material: standard + emissive copy of the map */
export function selfLit(map, color = 0xffffff, e = 0.6, o = {}) {
  return std({ map, color, emissive: color, emissiveMap: map, emissiveIntensity: e, roughness: 0.55, ...o });
}

export function makeMats() {
  const a = T.asphalt();
  const sw = T.sidewalk();
  const m = {
    asphalt: std({ map: a.map, roughnessMap: a.rough, normalMap: a.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, envMapIntensity: 1.25, color: 0xd8d8dc }),
    sidewalk: std({ map: sw.map, roughnessMap: sw.rough, roughness: 0.9, envMapIntensity: 0.9 }),
    curb: std({ map: T.concrete('#a3a29c', 'curb'), roughness: 0.45, envMapIntensity: 0.8 }),
    tactile: std({ map: T.tactile(), roughness: 0.4, envMapIntensity: 0.7 }),
    paintW: std({ map: T.paintTexW(), color: 0xd8d8d2, roughness: 0.35, envMapIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    paintY: std({ map: T.paintTexW(), color: 0xe0a21c, roughness: 0.35, envMapIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    dirt: std({ color: 0x1c1d20, roughness: 0.6, envMapIntensity: 0.6 }),
    concrete: std({ map: T.concrete('#8c8b86'), roughness: 0.8 }),
    concreteDark: std({ map: T.concrete('#5c5d61', 'cdark'), roughness: 0.75 }),
    block: std({ map: T.blockWall(), roughness: 0.85 }),
    poleConcrete: std({ map: T.concrete('#9a9890', 'pole'), roughness: 0.6 }),
    metalDark: std({ color: 0x2a2d33, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.8 }),
    metalGrey: std({ color: 0x7c828a, roughness: 0.4, metalness: 0.7, envMapIntensity: 0.9 }),
    railWhite: std({ color: 0xe6e6e2, roughness: 0.35, metalness: 0.3, envMapIntensity: 0.8 }),
    cable: new THREE.MeshBasicMaterial({ color: 0x0b0c10 }),
    black: std({ color: 0x111215, roughness: 0.6 }),
    wood: std({ color: 0x6b4a30, roughness: 0.7 }),
    woodDark: std({ color: 0x3e2a1c, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb6d0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, envMapIntensity: 1.5, depthWrite: false }),
    glassDark: std({ color: 0x0c1220, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.6 }),
    roofTile: std({ map: T.roofTile('#3b4352'), roughness: 0.45, envMapIntensity: 0.9 }),
    roofTileB: std({ map: T.roofTile('#5a3d36'), roughness: 0.45, envMapIntensity: 0.9 }),
    roofTileC: std({ map: T.roofTile('#2f4a45'), roughness: 0.45, envMapIntensity: 0.9 }),
    sidingA: std({ map: T.siding('#b9ae9c'), roughness: 0.75 }),
    sidingB: std({ map: T.siding('#8f9aa3'), roughness: 0.75 }),
    sidingC: std({ map: T.siding('#c9b48d'), roughness: 0.75 }),
    plasterA: std({ map: T.concrete('#c7bfae', 'plA'), roughness: 0.85 }),
    plasterB: std({ map: T.concrete('#a69c8d', 'plB'), roughness: 0.85 }),
    plasterC: std({ map: T.concrete('#d8d2c4', 'plC'), roughness: 0.85 }),
    plant: std({ color: 0x2f5a2a, roughness: 0.8 }),
    pot: std({ color: 0x9a4f2e, roughness: 0.7 }),
    water: std({ color: 0x0a1222, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.8 }),
    gravel: std({ map: T.concrete('#4a4844', 'gravel'), roughness: 0.9 }),
    winDark: signMat(T.houseWindow(0, false), 1.0),
    lampHead: glow(0xfff1d6, 3.2),
    lampWarm: glow(0xffc27a, 2.6),
  };
  m.winLit = [0, 1, 2, 3, 4, 5].map((v) => signMat(T.houseWindow(v, true), 1.15));
  return m;
}
