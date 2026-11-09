/**
 * Optional Blender models (glTF .glb). If `public/models/<name>.glb` exists it
 * replaces the procedural stand-in; otherwise the procedural model is used.
 * Model convention: 1 unit = 1 m, facing -Z, origin at the feet / grip.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map<string, Promise<GLTF | null>>();
const loader = new GLTFLoader();

export function loadGLB(name: string): Promise<GLTF | null> {
  let p = cache.get(name);
  if (!p) {
    p = new Promise((resolve) => {
      loader.load(
        `./models/${name}.glb`,
        (g) => resolve(g),
        undefined,
        () => resolve(null), // no file: use the procedural model
      );
    });
    cache.set(name, p);
  }
  return p;
}

/** Replace a procedural group's children with the .glb scene once it loads. */
export function swapInGLB(target: THREE.Group, name: string): void {
  void loadGLB(name).then((g) => {
    if (!g) return;
    const clone = g.scene.clone(true);
    for (const c of [...target.children]) if (!c.userData.keep) c.removeFromParent();
    target.add(clone);
    target.userData.glb = g;
    if (g.animations.length) {
      const mixer = new THREE.AnimationMixer(clone);
      target.userData.mixer = mixer;
      target.userData.clips = g.animations;
      mixer.clipAction(g.animations[0]).play();
    }
  });
}
