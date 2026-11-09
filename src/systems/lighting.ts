/**
 * Dynamic lights layered on top of baked vertex lighting.
 * World materials are MeshBasicMaterial (cheap, baked light in vertex colours);
 * this patch adds a flashlight spot and a few point lights (glowsticks etc.)
 * multiplied by the surface albedo. Uniforms are shared by all patched materials.
 */
import * as THREE from 'three';

export const MAX_POINT_LIGHTS = 4;

export const dynamicLights = {
  uFlashOn: { value: 0 },
  uFlashPos: { value: new THREE.Vector3() },
  uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
  uFlashColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
  uFlashRange: { value: 22 },
  uPointPos: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Vector3()) },
  uPointColor: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  uPointRange: { value: Array.from({ length: MAX_POINT_LIGHTS }, () => 6) },
};

export function patchMaterial<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, dynamicLights);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vDynPos;\nvarying vec3 vDynNormal;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvDynPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDynNormal = normalize(mat3(modelMatrix) * normal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDynPos;
varying vec3 vDynNormal;
uniform float uFlashOn;
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform vec3 uFlashColor;
uniform float uFlashRange;
uniform vec3 uPointPos[${MAX_POINT_LIGHTS}];
uniform vec3 uPointColor[${MAX_POINT_LIGHTS}];
uniform float uPointRange[${MAX_POINT_LIGHTS}];
vec3 dynamicLight() {
  vec3 n = normalize(vDynNormal);
  vec3 acc = vec3(0.0);
  if (uFlashOn > 0.0) {
    vec3 L = uFlashPos - vDynPos;
    float d = length(L);
    vec3 l = L / max(d, 1e-4);
    float cosA = dot(-l, uFlashDir);
    float cone = smoothstep(0.80, 0.93, cosA);
    float hot = smoothstep(0.95, 0.995, cosA) * 0.6;
    float att = clamp(1.0 - d / uFlashRange, 0.0, 1.0);
    att = att * att * 1.2 / (1.0 + 0.04 * d * d);
    float ndl = max(dot(n, l), 0.0) * 0.8 + 0.2;
    acc += uFlashColor * (cone + hot) * att * ndl * uFlashOn;
  }
  for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
    vec3 L = uPointPos[i] - vDynPos;
    float d = length(L);
    float att = clamp(1.0 - d / uPointRange[i], 0.0, 1.0);
    float ndl = max(dot(n, L / max(d, 1e-4)), 0.0) * 0.7 + 0.3;
    acc += uPointColor[i] * att * att * ndl;
  }
  return acc;
}`,
      )
      .replace(
        '#include <color_fragment>',
        'vec3 dynAlbedo = diffuseColor.rgb;\n#include <color_fragment>\ndiffuseColor.rgb += dynAlbedo * dynamicLight();',
      );
  };
  mat.customProgramCacheKey = () => 'dynlights1';
  return mat;
}
