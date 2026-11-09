/**
 * Optional full-screen pass (SPEC §9.1, §10.2): brightness, gamma, film grain
 * and chromatic aberration. When every effect is at its neutral value the
 * scene renders straight to the screen (no extra cost).
 */
import * as THREE from 'three';

const FRAG = `
uniform sampler2D tDiffuse;
uniform float uBrightness;
uniform float uGamma;
uniform float uGrain;
uniform float uCA;
uniform float uTime;
varying vec2 vUv;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec4 c;
  if (uCA > 0.0) {
    vec2 d = (uv - 0.5) * uCA;
    c = vec4(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b, 1.0);
  } else c = texture2D(tDiffuse, uv);
  c.rgb *= uBrightness;
  c.rgb = pow(max(c.rgb, 0.0), vec3(1.0 / uGamma));
  if (uGrain > 0.0) c.rgb += (rand(uv * 1000.0 + uTime) - 0.5) * uGrain;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

export interface PostSettings {
  brightness: number;
  gamma: number;
  filmGrain: boolean;
  chromaticAberration: boolean;
  multisample: boolean;
}

export class PostFX {
  private rt: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  enabled = false;
  private samples = 0;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uBrightness: { value: 1 },
        uGamma: { value: 1 },
        uGrain: { value: 0 },
        uCA: { value: 0 },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  configure(s: PostSettings): void {
    const u = this.mat.uniforms;
    u.uBrightness.value = s.brightness;
    u.uGamma.value = s.gamma;
    u.uGrain.value = s.filmGrain ? 0.06 : 0;
    u.uCA.value = s.chromaticAberration ? 0.006 : 0;
    this.enabled = s.brightness !== 1 || s.gamma !== 1 || s.filmGrain || s.chromaticAberration;
    const samples = s.multisample ? 4 : 0;
    if (samples !== this.samples) {
      this.samples = samples;
      this.rt?.dispose();
      this.rt = null;
    }
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    if (!this.enabled) {
      renderer.render(scene, camera);
      return;
    }
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.rt || this.rt.width !== size.x || this.rt.height !== size.y) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.samples });
    }
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    this.mat.uniforms.tDiffuse.value = this.rt.texture;
    this.mat.uniforms.uTime.value = time % 100;
    renderer.render(this.scene, this.cam);
  }
}
