// Semesta City world: builds the whole rainy-night block and exposes the
// World API from docs/ARCHITECTURE.md.
import * as THREE from 'three';
import { disposeTree } from '../core/util.js';
import { Batch } from './builder.js';
import { Glows } from './decals.js';
import { makeMats } from './mats.js';
import { hookFonts, disposeTextures } from './textures.js';
import { L, PAVE, ROADS, faceTo } from './layout.js';
import { buildStreet } from './street.js';
import { buildHouses, buildProps } from './houses.js';
import { buildArcade } from './arcade.js';
import { buildKonbini } from './konbini.js';
import { buildRialoHQ } from './rialoHQ.js';
import { createRain } from './rain.js';
import { buildHubBanner, buildSemestaSigns } from './brand.js';
import { buildGacha } from './gacha.js';
import { buildPlaygroundKiosk } from './playground.js';

const MAX_LIGHTS = 9;

export function buildCity(scene, { collision, renderer = null, quality = 'high' } = {}) {
  hookFonts();
  const root = new THREE.Group();
  root.name = 'city';
  scene.add(root);

  const low = quality === 'low' || quality === 0;
  const lights = [];
  let city = null;
  const ctx = {
    root, scene, renderer, quality,
    emit: (name, data) => city?.onEvent?.(name, data),
    coll: collision,
    batch: new Batch(),
    glows: new Glows(),
    mats: makeMats(),
    updaters: [],
    battleHooks: [],
    interactables: [],
    roofs: [],
    raised: [],
    arenaDecor: [],
    npcSpots: {},
    playerPos: new THREE.Vector3(L.spawn.x, 0, L.spawn.z),
    addLight(color, intensity, distance, x, y, z, decay = 2) {
      if (lights.length >= MAX_LIGHTS) return null;
      const l = new THREE.PointLight(color, intensity, distance, decay);
      l.position.set(x, y, z);
      root.add(l);
      lights.push(l);
      return l;
    },
  };

  buildStreet(ctx);
  buildHouses(ctx);
  buildArcade(ctx);
  buildKonbini(ctx);
  buildRialoHQ(ctx);
  const banner = buildHubBanner(ctx);
  const semestaSigns = buildSemestaSigns(ctx);
  const gacha = buildGacha(ctx);
  const kiosk = buildPlaygroundKiosk(ctx);
  buildProps(ctx);

  ctx.batch.flush(root);
  ctx.glows.build(root);
  root.updateMatrixWorld(true);

  const rain = createRain(scene, {
    roofs: ctx.roofs,
    roads: ROADS,
    count: low ? 4500 : 8000,
    splashes: low ? 700 : 1400,
  });

  const spawn = { ...L.spawn };
  const holoTable = { x: L.holo.x, z: L.holo.z, rotY: Math.PI / 2 };
  const plazaEntry = [0, -21];
  const spot = (x, z, tx = plazaEntry[0], tz = plazaEntry[1]) => ({ x, z, rotY: faceTo(x, z, tx, tz) });
  const npcSpots = {
    guide: spot(-3.2, -25.6),
    engineer: spot(4.4, -28.2),
    agentdev: spot(-6.0, -31.2),
    rwa: spot(7.4, -32.0),
    rival: { x: holoTable.x - 3.4, z: holoTable.z + 0.6, rotY: Math.PI / 2 },
    // mascot NXR: plaza entrance, right under the giant Builder Hub banner, facing the walkway
    nxr: spot(11.6, -23.6, 2.0, -25.0),
    ...ctx.npcSpots,
  };

  // Spider the cat: closed stroll loop (east pavement -> HQ plaza edge -> west pavement ->
  // arcade -> zebra crossing -> back). Every segment keeps >= 0.3 m from colliders.
  const petPath = [
    [5.4, -9.6], [5.4, -15.0], [5.4, -20.6], [5.3, -23.6], [8.8, -25.6], [6.6, -29.8],
    [1.4, -31.0], [-2.0, -31.0], [-4.2, -28.6], [-6.0, -24.6], [-5.6, -21.5], [-5.5, -13.0],
    [-5.4, -6.4], [-9.6, -5.2], [-16.0, -3.6], [-19.0, -0.5], [-14.0, 2.2], [-9.4, 3.6],
    [-5.6, 4.2], [5.6, 4.2], [5.6, -0.2],
  ].map(([x, z]) => ({ x, z }));
  const petHome = { x: gacha.home.x, z: gacha.home.z, rotY: -Math.PI / 2 }; // cat bed under the gacha canopy

  const bounds = { ...L.bounds };

  function heightAt(x, z) {
    for (const r of ROADS) if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return 0;
    return PAVE;
  }

  let battle = false;
  city = {
    root,
    spawn,
    npcSpots,
    holoTable,
    interactables: ctx.interactables,
    roofs: ctx.roofs,
    bounds,
    rain,
    lights,
    heightAt,
    petPath,
    petHome,
    gachaMachine: gacha,   // { root, crank, cranks, spot, center } — core spins crank.rotation.z on a pull
    playground: kiosk,     // { spot, position }
    banner,                // { mesh, material, texture, W, H, center, normal }
    semestaSigns,          // { logoMesh, haloMesh, material }
    onEvent: null, // optional (name, data) callback, e.g. 'konbini-door' when the sliding door opens
    setPlayerPos(v) { ctx.playerPos.copy(v); },
    setBattleMode(on) {
      battle = !!on;
      for (const o of ctx.arenaDecor) o.visible = !battle;
      for (const f of ctx.battleHooks) f(battle);
    },
    update(dt, time, camera) {
      for (const f of ctx.updaters) f(dt, time, camera);
      rain.update(dt, time, camera);
    },
    dispose() {
      rain.dispose();
      ctx.glows.dispose();
      scene.remove(root);
      disposeTree(root);
      disposeTextures();
    },
  };
  return city;
}

/**
 * Emissive "city glow" scene for PMREM (scene.environment): dark sky dome with a
 * light-polluted horizon plus neon / window / konbini panels around the viewer.
 */
export function buildEnvScene() {
  const s = new THREE.Scene();
  const dome = new THREE.SphereGeometry(60, 32, 16);
  const col = [];
  const p = dome.attributes.position;
  const top = new THREE.Color(0x070b18), hor = new THREE.Color(0x3a3f6a), bot = new THREE.Color(0x07080c);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 60;
    if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.55)); else c.copy(hor).lerp(bot, Math.min(1, -y * 4));
    col.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const panels = [
    // [color, k, azimuthDeg, elevation y, dist, w, h]
    [0xffc27a, 2.2, 10, 4, 22, 8, 3], [0xffd9a0, 1.8, 40, 6, 25, 5, 4], [0xff3d7f, 3.0, 75, 5, 20, 3, 1.2],
    [0x38e1ff, 3.0, 110, 4, 22, 4, 1], [0xe8f4ff, 3.2, 150, 2.5, 16, 7, 2.2], [0xffb35c, 2.0, 190, 6, 24, 6, 3],
    [0xe8e3d5, 3.5, 0, 22, 32, 10, 3], [0x7fb0ff, 1.4, 230, 9, 30, 10, 5], [0xff6a3a, 2.4, 260, 3.5, 18, 2, 3],
    [0xffd36a, 2.5, 300, 6, 20, 6, 1], [0xffc890, 1.6, 330, 8, 26, 8, 4], [0x40ffc0, 2.0, 200, 2.8, 14, 0.8, 1.2],
    [0xff2a2a, 2.0, 170, 3, 30, 1, 1], [0xffe7c0, 1.5, 60, 14, 30, 12, 6], [0xbad0ff, 1.2, 280, 16, 34, 14, 6],
  ];
  for (const [color, k, az, y, d, w, h] of panels) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    const a = THREE.MathUtils.degToRad(az);
    m.position.set(Math.sin(a) * d, y, -Math.cos(a) * d);
    m.lookAt(0, y, 0);
    s.add(m);
  }
  return s;
}
