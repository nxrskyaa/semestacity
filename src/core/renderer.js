// Renderer + post-processing chain:
//   SceneInkPass (scene -> HDR target w/ depth, then depth-based ink outlines)
//   -> UnrealBloom -> Grade (split-tone, vignette, chroma aberration, grain) -> Output (ACES + sRGB)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

const InkShader = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
    cameraNear: { value: 0.1 }, cameraFar: { value: 400 }, uInk: { value: new THREE.Color(0x0d1020) }, uStrength: { value: 0.8 },
  },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uTexel;
    uniform float cameraNear; uniform float cameraFar; uniform vec3 uInk; uniform float uStrength;
    varying vec2 vUv;
    float vz(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
    void main(){
      vec4 c = texture2D(tColor, vUv);
      // sanitize HDR: a single NaN/Inf pixel would smear across the whole frame in bloom
      if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c = vec4(0.0, 0.0, 0.0, 1.0);
      c.rgb = clamp(c.rgb, 0.0, 48.0);
      float d0 = vz(vUv);
      if (d0 > cameraFar * 0.85 || uStrength <= 0.0) { gl_FragColor = c; return; }
      float dl = vz(vUv - vec2(uTexel.x, 0.0)), dr = vz(vUv + vec2(uTexel.x, 0.0));
      float dd = vz(vUv - vec2(0.0, uTexel.y)), du = vz(vUv + vec2(0.0, uTexel.y));
      float sil = max(max(dl - d0, dr - d0), max(du - d0, dd - d0)) / d0;
      float w0 = 1.0 / d0;
      float lap = abs(1.0/dl + 1.0/dr + 1.0/du + 1.0/dd - 4.0*w0) / w0;
      float e = max(smoothstep(0.04, 0.09, sil), smoothstep(0.014, 0.04, lap) * 0.7);
      e *= 1.0 - smoothstep(16.0, 40.0, d0);
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      e *= 1.0 - smoothstep(1.2, 3.0, lum); // never ink over glowing neon
      c.rgb = mix(c.rgb, uInk * (0.3 + 0.25 * c.rgb), clamp(e * uStrength, 0.0, 1.0));
      gl_FragColor = c;
    }`,
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uCA: { value: 0.006 }, uFade: { value: 0 }, uFlash: { value: 0 }, uSat: { value: 1.08 } },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uCA, uFade, uFlash, uSat;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float ca = dot(d,d) * uCA;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d*ca).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = mix(c * vec3(0.9, 1.0, 1.16), c * vec3(1.07, 1.0, 0.93), smoothstep(0.02, 0.9, l));
      c *= clamp(1.0 - dot(d,d) * uVig * 2.4, 0.0, 1.0);
      c += (h(vUv * 1000.0 + uTime) - 0.5) * 0.012;
      c = mix(c, vec3(1.0), uFlash);
      c *= 1.0 - uFade;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

class SceneInkPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.needsSwap = true;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(1, 1);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(InkShader.uniforms), vertexShader: InkShader.vertexShader, fragmentShader: InkShader.fragmentShader, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    this.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const u = this.mat.uniforms;
    u.tColor.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.cameraNear.value = this.camera.near; u.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); }
}

export const QUALITY = {
  low: { dpr: 0.75, shadows: false, bloom: true, ink: false, shadowSize: 1024 },
  medium: { dpr: 1.0, shadows: true, bloom: true, ink: true, shadowSize: 1024 },
  high: { dpr: 1.35, shadows: true, bloom: true, ink: true, shadowSize: 2048 },
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2a4f);
  scene.fog = new THREE.FogExp2(0x1d2a4f, 0.022);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  const inkPass = new SceneInkPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.48, 0.45, 0.9);
  const grade = new ShaderPass(GradeShader);
  const output = new OutputPass();
  composer.addPass(inkPass);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);

  const api = {
    renderer, scene, camera, composer, bloom, grade, inkPass,
    quality: 'medium',
    setQuality(q) {
      const Q = QUALITY[q] || QUALITY.medium;
      api.quality = q;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.dpr * (devicePixelRatio > 1 ? 1.25 : 1)));
      renderer.shadowMap.enabled = Q.shadows;
      bloom.enabled = Q.bloom;
      inkPass.mat.uniforms.uStrength.value = Q.ink ? 0.8 : 0;
      api.shadowSize = Q.shadowSize;
      api.resize();
      scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
    },
    resize() {
      const w = innerWidth, h = innerHeight;
      renderer.setSize(w, h);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render(time) {
      grade.uniforms.uTime.value = time;
      composer.render();
    },
    /** render another scene/camera through the full post chain */
    renderScene(s, c, time) {
      const ps = inkPass.scene, pc = inkPass.camera;
      inkPass.scene = s; inkPass.camera = c;
      grade.uniforms.uTime.value = time;
      composer.render();
      inkPass.scene = ps; inkPass.camera = pc;
    },
    /** render an arbitrary scene/camera straight to screen (used by the creator) */
    renderDirect(s, c) {
      renderer.setRenderTarget(null);
      renderer.render(s, c);
    },
  };
  addEventListener('resize', () => api.resize());
  api.setQuality('medium');
  return api;
}
