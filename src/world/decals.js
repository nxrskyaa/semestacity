// Fake lighting decals: flat additive light pools and camera-facing wet-ground
// reflection streaks (the cheap trick that sells a rainy street at night).
import * as THREE from 'three';
import { radialGlow } from './textures.js';

export class Glows {
  constructor() {
    this.pools = [];   // {x,y,z,r,color,i}
    this.streaks = []; // {x,y,z,w,len,color,i}
    this.meshes = [];
  }

  pool(x, y, z, r, color = 0xffc98a, i = 1) { this.pools.push({ x, y, z, r, color: new THREE.Color(color), i }); return this; }

  /** reflection streak on the ground below a bright source (x,z), pointing toward the camera */
  streak(x, z, w, len, color = 0xffc98a, i = 1, y = 0.02) { this.streaks.push({ x, y, z, w, len, color: new THREE.Color(color), i }); return this; }

  build(parent) {
    if (this.pools.length) {
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        map: radialGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, this.pools.length);
      const m = new THREE.Matrix4();
      this.pools.forEach((p, k) => {
        m.makeScale(p.r * 2, 1, p.r * 2).setPosition(p.x, p.y, p.z);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, p.color.clone().multiplyScalar(p.i));
      });
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      parent.add(mesh);
      this.meshes.push(mesh);
      this.poolMesh = mesh;
    }
    if (this.streaks.length) {
      const n = this.streaks.length;
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
      geo.setIndex([0, 1, 2, 2, 1, 3]);
      const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
      this.streaks.forEach((s, k) => {
        a.set([s.x, s.y, s.z, s.w], k * 4);
        b.set([s.color.r * s.i, s.color.g * s.i, s.color.b * s.i, s.len], k * 4);
      });
      geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(a, 4));
      geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(b, 4));
      geo.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uFog: { value: 0.022 }, uFogColor: { value: new THREE.Color(0x1d2a4f) }, uGain: { value: 1.5 } },
        vertexShader: /* glsl */`
          attribute vec4 aPos; attribute vec4 aCol;
          varying vec2 vUv; varying vec3 vCol; varying float vFogDepth;
          void main(){
            vec2 to = cameraPosition.xz - aPos.xz;
            float d = length(to);
            vec2 dir = d > 0.001 ? to / d : vec2(0.0, 1.0);
            vec2 side = vec2(-dir.y, dir.x);
            float len = min(aCol.w, d * 0.85);
            vec3 p = vec3(aPos.x, aPos.y, aPos.z);
            p.xz += side * position.x * aPos.w + dir * (position.y - 0.08) * len;
            vUv = position.xy + vec2(0.5, 0.0);
            vCol = aCol.rgb;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            vFogDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          uniform float uFog; uniform vec3 uFogColor; uniform float uGain;
          varying vec2 vUv; varying vec3 vCol; varying float vFogDepth;
          void main(){
            float x = abs(vUv.x - 0.5) * 2.0;
            float across = exp(-x * x * 4.0);
            float vy = clamp(vUv.y, 0.0, 1.0);
            float along = smoothstep(0.0, 0.08, vy) * pow(1.0 - vy, 1.6);
            float f = 1.0 - exp(-uFog * uFog * vFogDepth * vFogDepth);
            vec3 c = vCol * across * along * uGain * (1.0 - f);
            gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      parent.add(mesh);
      this.meshes.push(mesh);
      this.streakMat = mat;
    }
  }

  dispose() {
    for (const m of this.meshes) { m.geometry.dispose(); m.material.dispose(); }
  }
}
