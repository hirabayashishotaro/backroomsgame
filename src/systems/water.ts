/**
 * Animated water: gently moving waves (vertex displacement on top faces),
 * Fresnel reflection of the surroundings, a sun/lamp glint and shimmering
 * caustic light. Cheap: no render-to-texture, everything is analytic.
 */
import * as THREE from 'three';

/** Shared clock for every water material. */
export const waterTime = { value: 0 };

const VERT = `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
uniform float uWave;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  if (vN.y > 0.5) {
    wp.y += uWave * (0.6 * sin(wp.x * 1.3 + uTime * 1.6) + 0.5 * sin(wp.z * 1.7 - uTime * 1.3) + 0.3 * sin((wp.x + wp.z) * 2.3 + uTime * 2.1));
  }
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform vec3 uReflect;
uniform float uOpacity;
uniform float uTime;
uniform float uWave;
varying vec3 vWorld;
varying vec3 vN;
float h(vec2 p) {
  return 0.6 * sin(p.x * 1.3 + uTime * 1.6) + 0.5 * sin(p.y * 1.7 - uTime * 1.3) + 0.3 * sin((p.x + p.y) * 2.3 + uTime * 2.1)
       + 0.15 * sin(p.x * 5.1 - p.y * 3.7 + uTime * 3.0) + 0.12 * sin(p.y * 6.3 + p.x * 2.1 - uTime * 2.6);
}
void main() {
  vec3 n = normalize(vN);
  if (n.y > 0.5) {
    vec2 p = vWorld.xz;
    float e = 0.05;
    float dx = (h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0))) / (2.0 * e);
    float dz = (h(p + vec2(0.0, e)) - h(p - vec2(0.0, e))) / (2.0 * e);
    n = normalize(vec3(-dx * uWave * 4.0, 1.0, -dz * uWave * 4.0));
  }
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 r = reflect(-v, n);
  // Reflected surroundings: brighter toward the sky/ceiling lights.
  vec3 refl = mix(uColor * 0.7, uReflect, smoothstep(-0.1, 0.6, r.y));
  float spec = pow(max(dot(r, normalize(vec3(0.35, 1.0, 0.25))), 0.0), 90.0) * 1.4;
  // Caustic shimmer: bright crossing lines that drift.
  vec2 q = vWorld.xz * 1.6;
  float c1 = abs(sin(q.x + sin(q.y * 1.3 + uTime) * 1.2 + uTime * 0.7));
  float c2 = abs(sin(q.y + sin(q.x * 1.1 - uTime * 0.8) * 1.2 - uTime * 0.6));
  float caus = pow(1.0 - min(c1, c2), 6.0) * 0.35;
  vec3 col = mix(uColor * (1.0 + caus), refl, fres * 0.85) + spec;
  float a = mix(uOpacity, min(1.0, uOpacity + 0.45), fres);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

export function makeWaterMaterial(color: number, opacity: number, reflect: THREE.Color, wave = 0.025): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uColor: { value: new THREE.Color(color) },
        uReflect: { value: reflect.clone() },
        uOpacity: { value: opacity },
        uWave: { value: wave },
      },
    ]),
  });
}

/** Hook the shared clock into a material (after creation, since merge() clones uniforms). */
export function bindWaterClock(m: THREE.ShaderMaterial): THREE.ShaderMaterial {
  m.uniforms.uTime = waterTime;
  return m;
}
