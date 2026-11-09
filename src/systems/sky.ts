/**
 * Sky dome for open-sky levels (SPEC §3.6): a gradient, procedural clouds,
 * stars, a sun/moon disc and an optional sea of clouds below the horizon.
 * Independent of chunks; follows the camera.
 */
import * as THREE from 'three';

import { SKY_PRESETS, type SkyDef } from './skyPresets';
export type { SkyDef, SkyKind } from './skyPresets';
export { SKY_PRESETS } from './skyPresets';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

const FRAG = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform vec3 uSun; uniform vec3 uSunDir; uniform float uSunSize;
uniform float uStars; uniform float uClouds; uniform vec3 uCloudColor;
uniform float uCloudSea; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.4));
  // Stars
  if (uStars > 0.0 && h > -0.05) {
    vec2 sp = vec2(atan(d.z, d.x) * 120.0, h * 160.0);
    vec2 cell = floor(sp);
    float r = hash(cell);
    if (r > 0.985) {
      vec2 c = cell + vec2(hash(cell + 3.1), hash(cell + 7.7));
      float s = smoothstep(0.35, 0.0, length(sp - c));
      float tw = 0.7 + 0.3 * sin(uTime * (1.0 + r * 4.0) + r * 50.0);
      col += vec3(s * tw * uStars * (r - 0.985) * 66.0);
    }
  }
  // Sun / moon
  float sd = dot(d, normalize(uSunDir));
  if (uSunSize > 0.0) {
    col += uSun * smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, sd);
    col += uSun * pow(max(sd, 0.0), 64.0) * 0.35;
  }
  // Clouds above
  if (uClouds > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.01, 0.0);
    float c = smoothstep(1.0 - uClouds * 0.75, 1.0, fbm(uv) + 0.25);
    float lit = 0.75 + 0.25 * pow(max(sd, 0.0), 4.0);
    col = mix(col, uCloudColor * lit, c * smoothstep(0.0, 0.18, h) * 0.9);
  }
  // Sea of clouds below
  if (uCloudSea > 0.0 && h < 0.0) {
    vec2 uv = d.xz / (-h + 0.06) * 0.9 + vec2(uTime * 0.006, uTime * 0.003);
    float c = fbm(uv);
    vec3 sea = mix(uCloudColor * 0.75, uCloudColor * 1.05, c);
    col = mix(col, sea, smoothstep(0.0, 0.12, -h));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  readonly horizon = new THREE.Color();

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSun: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunSize: { value: 0 },
        uStars: { value: 0 },
        uClouds: { value: 0 },
        uCloudColor: { value: new THREE.Color() },
        uCloudSea: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  set(def: SkyDef): void {
    const p = SKY_PRESETS[def.kind];
    const u = this.mat.uniforms;
    u.uTop.value.setHex(p.top);
    u.uHorizon.value.setHex(p.horizon);
    u.uBottom.value.setHex(p.bottom);
    u.uSun.value.setHex(p.sun);
    u.uSunDir.value.set(...p.sunDir).normalize();
    u.uSunSize.value = p.sunSize;
    u.uStars.value = p.stars;
    u.uClouds.value = p.clouds;
    u.uCloudColor.value.setHex(p.cloudColor);
    u.uCloudSea.value = def.cloudSea ? 1 : 0;
    this.horizon.setHex(p.horizon);
  }

  update(camera: THREE.Camera, time: number): void {
    this.mesh.position.copy(camera.position);
    this.mat.uniforms.uTime.value = time;
  }
}
