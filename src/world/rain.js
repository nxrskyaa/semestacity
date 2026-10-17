// GPU rain: instanced camera-facing streaks that fall in a box wrapped around
// the camera, plus instanced ground splash rings. Both skip covered `roofs`.
import * as THREE from 'three';

const MAX_RECTS = 16;

function rectUniform(list) {
  const arr = [];
  for (let i = 0; i < MAX_RECTS; i++) {
    const r = list[i];
    arr.push(r ? new THREE.Vector4(r.minX, r.minZ, r.maxX, r.maxZ) : new THREE.Vector4(1e6, 1e6, 1e6, 1e6));
  }
  return arr;
}

const RECT_FN = /* glsl */`
  uniform vec4 uRoofs[${MAX_RECTS}];
  bool inRects(vec2 p){
    for (int i = 0; i < ${MAX_RECTS}; i++) {
      vec4 r = uRoofs[i];
      if (p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w) return true;
    }
    return false;
  }`;

/**
 * createRain(scene, { area, roofs, roads, count, roofHeight })
 * roads: rects where the ground is at y=0 (elsewhere splashes sit on +0.15 pavements)
 */
export function createRain(scene, { area = null, roofs = [], roads = [], count = 8000, splashes = 1400, roofHeight = 9 } = {}) {
  const group = new THREE.Group();
  group.name = 'rain';
  const box = new THREE.Vector3(36, 22, 36);
  const wind = new THREE.Vector3(1.6, -13.5, 0.7);

  // ------------------------------------------------ streaks
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
  sGeo.setIndex([0, 1, 2, 2, 1, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random();
    seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = Math.random();
  }
  sGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  sGeo.instanceCount = count;

  const uniforms = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box },
    uVel: { value: wind }, uLen: { value: 0.75 }, uWidth: { value: 0.017 },
    uIntensity: { value: 1 }, uColor: { value: new THREE.Color(0.36, 0.42, 0.55) },
    uRoofs: { value: rectUniform(roofs) }, uRoofH: { value: roofHeight },
  };
  const sMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uLen, uWidth, uIntensity, uRoofH;
      uniform vec3 uCam, uBox, uVel;
      varying float vA; varying vec2 vUv;
      ${RECT_FN}
      void main(){
        float spd = 0.85 + aSeed.w * 0.35;
        vec3 vel = uVel * spd;
        vec3 origin = vec3(uCam.x - uBox.x * 0.5, -1.0, uCam.z - uBox.z * 0.5);
        vec3 p = aSeed.xyz * uBox + vel * uTime;
        p = origin + mod(p - origin, uBox);
        float a = step(aSeed.w, uIntensity);
        if (p.y < 0.0) a = 0.0;
        if (p.y < uRoofH && inRects(p.xz)) a = 0.0;
        vec3 dir = normalize(vel);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(dir, toCam));
        vec3 w = p + side * position.x * uWidth * (1.0 + aSeed.x) - dir * position.y * uLen * spd;
        float dc = distance(p, cameraPosition);
        a *= smoothstep(1.2, 4.0, dc) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(p.xz - uCam.xz)));
        vA = a * (0.35 + aSeed.y * 0.65);
        vUv = position.xy + vec2(0.5, 0.0);
        gl_Position = a > 0.001 ? projectionMatrix * viewMatrix * vec4(w, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA; varying vec2 vUv;
      void main(){
        float x = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float y = sin(vUv.y * 3.14159);
        gl_FragColor = vec4(uColor * vA * x * y, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const streaks = new THREE.Mesh(sGeo, sMat);
  streaks.frustumCulled = false;
  streaks.renderOrder = 10;
  group.add(streaks);

  // ------------------------------------------------ splashes
  const pGeo = new THREE.InstancedBufferGeometry();
  pGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5], 3));
  pGeo.setIndex([0, 2, 1, 1, 2, 3]);
  const pSeeds = new Float32Array(splashes * 4);
  for (let i = 0; i < splashes; i++) {
    pSeeds[i * 4] = Math.random(); pSeeds[i * 4 + 1] = Math.random();
    pSeeds[i * 4 + 2] = Math.random(); pSeeds[i * 4 + 3] = Math.random();
  }
  pGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(pSeeds, 4));
  pGeo.instanceCount = splashes;
  const pUniforms = {
    uTime: uniforms.uTime, uCam: uniforms.uCam, uIntensity: uniforms.uIntensity,
    uRoofs: uniforms.uRoofs, uRoads: { value: rectUniform(roads) },
    uArea: { value: 26 }, uColor: { value: new THREE.Color(0.2, 0.23, 0.3) },
  };
  const pMat = new THREE.ShaderMaterial({
    uniforms: pUniforms,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uArea, uIntensity;
      uniform vec3 uCam;
      uniform vec4 uRoads[${MAX_RECTS}];
      varying vec2 vUv; varying float vPh; varying float vA;
      ${RECT_FN}
      bool inRoads(vec2 p){
        for (int i = 0; i < ${MAX_RECTS}; i++) {
          vec4 r = uRoads[i];
          if (p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w) return true;
        }
        return false;
      }
      vec2 hash22(vec2 p){
        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }
      void main(){
        float t = uTime * (1.6 + aSeed.w) + aSeed.z * 10.0;
        float cyc = floor(t);
        vPh = fract(t);
        vec2 r = hash22(aSeed.xy * 113.7 + cyc * 7.31);
        vec2 c = floor(uCam.xz) - uArea * 0.5 + r * uArea;
        float y = inRoads(c) ? 0.02 : 0.17;
        float a = step(aSeed.w, uIntensity);
        if (inRects(c)) a = 0.0;
        float s = 0.08 + aSeed.y * 0.16;
        vec3 p = vec3(c.x + position.x * s, y, c.y + position.z * s);
        vUv = position.xz * 2.0;
        vA = a * (1.0 - smoothstep(uArea * 0.3, uArea * 0.5, length(c - uCam.xz)));
        gl_Position = vA > 0.001 ? projectionMatrix * viewMatrix * vec4(p, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying vec2 vUv; varying float vPh; varying float vA;
      void main(){
        float d = length(vUv);
        float ring = smoothstep(0.08, 0.0, abs(d - vPh * 0.95)) * (1.0 - vPh) * (1.0 - vPh);
        float dot0 = smoothstep(0.25, 0.0, d) * smoothstep(0.25, 0.0, vPh) * 1.5;
        gl_FragColor = vec4(uColor * (ring + dot0) * vA, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const splash = new THREE.Mesh(pGeo, pMat);
  splash.frustumCulled = false;
  splash.renderOrder = 9;
  group.add(splash);

  scene.add(group);
  let intensity = 1;

  return {
    group,
    update(dt, time, camera) {
      uniforms.uTime.value = time;
      if (camera) uniforms.uCam.value.copy(camera.position);
    },
    setIntensity(v) {
      intensity = Math.max(0, Math.min(1, v));
      uniforms.uIntensity.value = intensity;
      group.visible = intensity > 0.001;
    },
    setRoofs(list) { uniforms.uRoofs.value = rectUniform(list); },
    dispose() {
      scene.remove(group);
      sGeo.dispose(); sMat.dispose(); pGeo.dispose(); pMat.dispose();
    },
  };
}
