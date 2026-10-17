// Shared anime/toon material helpers. Characters & robots use toon shading;
// the city uses MeshStandardMaterial (wet PBR look) — see docs/ARCHITECTURE.md.
import * as THREE from 'three';

let _gradient = null;
/** 4-step gradient map for MeshToonMaterial (soft anime shading) */
export function toonGradient() {
  if (_gradient) return _gradient;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  _gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  _gradient.minFilter = _gradient.magFilter = THREE.NearestFilter;
  _gradient.needsUpdate = true;
  return _gradient;
}

const _cache = new Map();
/** cached toon material by color (+ optional emissive). Pass {unique:true} to get a fresh one you can recolor. */
export function toonMat(color, { emissive = 0x000000, emissiveIntensity = 1, unique = false, map = null, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  const key = `${color}|${emissive}|${emissiveIntensity}|${transparent}|${opacity}|${side}`;
  if (!unique && !map && _cache.has(key)) return _cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: toonGradient(), emissive, emissiveIntensity, map, transparent, opacity, side,
  });
  if (!unique && !map) _cache.set(key, m);
  return m;
}

/** inverted-hull outline for a mesh (adds a back-faced, slightly inflated black copy as a child). */
const _outlineMat = new THREE.MeshBasicMaterial({ color: 0x14121c, side: THREE.BackSide });
export function addOutline(mesh, thickness = 0.012) {
  const o = new THREE.Mesh(mesh.geometry, _outlineMat);
  o.name = 'outline';
  o.raycast = () => {};
  o.castShadow = false;
  o.receiveShadow = false;
  // inflate in local units relative to geometry size
  mesh.geometry.computeBoundingSphere();
  const r = mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.radius : 0.1;
  const s = 1 + thickness / Math.max(r, 0.02);
  o.scale.setScalar(s);
  mesh.add(o);
  return o;
}
