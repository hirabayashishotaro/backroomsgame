/** Procedural stand-in models for entities (replaceable by models/<kind>.glb). */
import * as THREE from 'three';
import type { EntityKind } from './entityDefs';
import { swapInGLB } from '../world/glbModels';

function m(color: number, opts: Partial<THREE.MeshBasicMaterialParameters> = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, ...opts });
}

function part(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name?: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  g.add(mesh);
  return mesh;
}

/** Humanoid silhouette: legs, torso, arms, head. */
function humanoid(g: THREE.Group, body: THREE.Material, h = 1.8, thin = 1): void {
  const s = h / 1.8;
  part(g, new THREE.BoxGeometry(0.16 * thin, 0.85 * s, 0.18), body, -0.12, 0.43 * s, 0, 'legL');
  part(g, new THREE.BoxGeometry(0.16 * thin, 0.85 * s, 0.18), body, 0.12, 0.43 * s, 0, 'legR');
  part(g, new THREE.BoxGeometry(0.46 * thin, 0.62 * s, 0.24), body, 0, 1.17 * s, 0, 'torso');
  part(g, new THREE.BoxGeometry(0.12 * thin, 0.7 * s, 0.14), body, -0.32 * thin, 1.1 * s, 0, 'armL');
  part(g, new THREE.BoxGeometry(0.12 * thin, 0.7 * s, 0.14), body, 0.32 * thin, 1.1 * s, 0, 'armR');
  part(g, new THREE.SphereGeometry(0.15 * s, 12, 10), body, 0, 1.62 * s, 0, 'head');
}

export function buildEntityMesh(kind: EntityKind): THREE.Group {
  const g = new THREE.Group();
  g.name = 'entity:' + kind;
  switch (kind) {
    case 'smiler': {
      // Only a grin and two eyes floating in a dark shape.
      const dark = m(0x020202, { opacity: 0.85 });
      part(g, new THREE.SphereGeometry(0.55, 12, 10), dark, 0, 1.7, 0, 'head');
      const glow = m(0xfffff0);
      part(g, new THREE.SphereGeometry(0.07, 8, 6), glow, -0.17, 1.8, -0.5, 'eyeL');
      part(g, new THREE.SphereGeometry(0.07, 8, 6), glow, 0.17, 1.8, -0.5, 'eyeR');
      const grin = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 20, Math.PI), glow);
      grin.position.set(0, 1.62, -0.48);
      grin.rotation.z = Math.PI;
      grin.name = 'grin';
      g.add(grin);
      break;
    }
    case 'hound': {
      const body = m(0x161210);
      part(g, new THREE.BoxGeometry(0.42, 0.45, 1.25), body, 0, 0.75, 0, 'torso');
      part(g, new THREE.BoxGeometry(0.3, 0.32, 0.45), body, 0, 1.0, -0.75, 'head');
      for (const [x, z] of [
        [-0.16, -0.45],
        [0.16, -0.45],
        [-0.16, 0.45],
        [0.16, 0.45],
      ])
        part(g, new THREE.BoxGeometry(0.1, 0.6, 0.1), body, x, 0.3, z, z < 0 ? 'legF' : 'legB');
      const eye = m(0xffd040);
      part(g, new THREE.SphereGeometry(0.035, 6, 5), eye, -0.08, 1.05, -0.98);
      part(g, new THREE.SphereGeometry(0.035, 6, 5), eye, 0.08, 1.05, -0.98);
      break;
    }
    case 'duller':
      humanoid(g, m(0x6a6a6a), 1.85);
      break;
    case 'faceling': {
      humanoid(g, m(0x1a1a1e), 1.8);
      // Smooth, featureless pale face.
      part(g, new THREE.SphereGeometry(0.152, 12, 10), m(0xd8cfc4), 0, 1.62, -0.01, 'face');
      break;
    }
    case 'skinstealer': {
      // Looks almost human: clothes, a pale face... a little too tall and too thin.
      humanoid(g, m(0x3a4a5a), 2.0, 0.8);
      part(g, new THREE.SphereGeometry(0.165, 12, 10), m(0xd8b8a0), 0, 1.8, -0.01, 'face');
      break;
    }
    case 'bloater': {
      // A swollen, sack-like body on stubby legs, glowing seams.
      const skin = m(0xb3ab8a);
      const sack = part(g, new THREE.SphereGeometry(0.58, 16, 12), skin, 0, 0.92, 0, 'torso');
      sack.scale.set(1, 1.15, 0.92);
      part(g, new THREE.BoxGeometry(0.16, 0.42, 0.18), skin, -0.2, 0.21, 0, 'legL');
      part(g, new THREE.BoxGeometry(0.16, 0.42, 0.18), skin, 0.2, 0.21, 0, 'legR');
      part(g, new THREE.BoxGeometry(0.1, 0.55, 0.12), skin, -0.62, 0.95, 0, 'armL');
      part(g, new THREE.BoxGeometry(0.1, 0.55, 0.12), skin, 0.62, 0.95, 0, 'armR');
      part(g, new THREE.SphereGeometry(0.17, 10, 8), skin, 0, 1.65, -0.05, 'head');
      const seam = m(0xff8a2a);
      for (const [y, ry, w] of [
        [1.15, 0.3, 0.7],
        [0.8, -0.5, 0.8],
        [0.55, 0.9, 0.5],
      ]) {
        const c = part(g, new THREE.BoxGeometry(w, 0.035, 0.02), seam, 0, y, -0.52, 'seam');
        c.rotation.z = ry;
      }
      break;
    }
    case 'giant': {
      // A towering, stooped figure about 6.5 m tall.
      humanoid(g, m(0x3a3631), 1.8, 1);
      const k = 6.5 / 1.8;
      for (const c of g.children) {
        c.position.multiplyScalar(k);
        c.scale.setScalar(k);
        if (c.name === 'armL' || c.name === 'armR') {
          c.scale.y = k * 1.35;
          c.position.y -= 0.5;
        }
      }
      const eye = m(0xd8e0ff);
      part(g, new THREE.SphereGeometry(0.07, 8, 6), eye, -0.17, 5.92, -0.5);
      part(g, new THREE.SphereGeometry(0.07, 8, 6), eye, 0.17, 5.92, -0.5);
      break;
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.userData.keep = false) : undefined));
  swapInGLB(g, 'entity_' + kind);
  return g;
}

/** Set overall opacity (fade in/out). */
export function setEntityAlpha(g: THREE.Group, a: number): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (!mat.userData.base) mat.userData.base = mat.opacity;
      mat.opacity = a * (mat.userData.base as number);
    }
  });
}

/** Simple walk cycle for procedural models (GLB models play their own clip). */
export function animateEntity(g: THREE.Group, kind: EntityKind, phase: number, speed: number, hitFlash: number, dt: number): void {
  const mixer = g.userData.mixer as THREE.AnimationMixer | undefined;
  if (mixer) {
    mixer.update(dt * Math.max(0.2, speed / 2));
    return;
  }
  const sw = Math.sin(phase) * Math.min(1, speed / 3) * 0.6;
  for (const c of g.children) {
    if (c.name === 'legL' || c.name === 'legF') c.rotation.x = sw;
    if (c.name === 'legR' || c.name === 'legB') c.rotation.x = -sw;
    if (c.name === 'armL') c.rotation.x = -sw * 0.7;
    if (c.name === 'armR') c.rotation.x = sw * 0.7;
    if (kind === 'smiler' && c.name === 'grin') c.scale.setScalar(1 + Math.sin(phase * 0.3) * 0.05);
  }
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (!mat.userData.col) mat.userData.col = mat.color.clone();
    mat.color.copy(mat.userData.col as THREE.Color).lerp(new THREE.Color(0xff2020), Math.min(1, hitFlash));
  });
}

export function disposeEntityMesh(g: THREE.Group): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  g.removeFromParent();
}
