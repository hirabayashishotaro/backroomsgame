/**
 * Procedural weapon models (replaceable by models/weapon_<id>.glb).
 * Origin at the grip, barrel pointing -Z, a child named 'muzzle' marks the muzzle.
 */
import * as THREE from 'three';
import type { WeaponId } from './weaponDefs';
import { swapInGLB } from '../world/glbModels';

const mat = (c: number) => new THREE.MeshBasicMaterial({ color: c });

function b(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function cyl(g: THREE.Group, r: number, len: number, x: number, y: number, z: number, color: number, seg = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat(color));
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

export function buildWeaponModel(id: WeaponId, shade = 1): THREE.Group {
  const g = new THREE.Group();
  const k = (c: number) => new THREE.Color(c).multiplyScalar(shade).getHex();
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  switch (id) {
    case 'pistol':
      b(g, 0.032, 0.11, 0.05, 0, -0.04, 0.01, k(0x1e1f22)); // grip
      b(g, 0.036, 0.04, 0.2, 0, 0.035, -0.05, k(0x2a2c30)); // slide
      b(g, 0.03, 0.025, 0.17, 0, 0.005, -0.04, k(0x1a1b1d)); // frame
      b(g, 0.006, 0.012, 0.006, 0, 0.062, -0.14, k(0xd8d8d0)); // front sight
      b(g, 0.02, 0.012, 0.006, 0, 0.062, 0.035, k(0xd8d8d0)); // rear sight
      b(g, 0.008, 0.02, 0.03, 0, -0.012, -0.005, k(0x111111)); // trigger guard
      muzzle.position.set(0, 0.035, -0.155);
      break;
    case 'magnum':
      b(g, 0.036, 0.12, 0.055, 0, -0.045, 0.02, k(0x5a3a24)); // wooden grip
      cyl(g, 0.034, 0.06, 0, 0.03, -0.02, k(0x6e7378), 12); // cylinder
      cyl(g, 0.014, 0.24, 0, 0.045, -0.17, k(0x8a8f94)); // barrel
      b(g, 0.03, 0.02, 0.24, 0, 0.065, -0.15, k(0x7a7f84)); // rib
      b(g, 0.006, 0.014, 0.008, 0, 0.082, -0.27, k(0xe8a030)); // front sight
      b(g, 0.022, 0.012, 0.008, 0, 0.078, -0.03, k(0x2a2a2a)); // rear notch
      muzzle.position.set(0, 0.045, -0.29);
      break;
    case 'kunai': {
      b(g, 0.018, 0.018, 0.11, 0, 0, 0.04, k(0x2a1c14)); // wrapped handle
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), mat(k(0xb8bcc0)));
      blade.rotation.x = -Math.PI / 2;
      blade.position.set(0, 0, -0.095);
      g.add(blade);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), mat(k(0x6a6e72)));
      ring.position.set(0, 0, 0.105);
      g.add(ring);
      muzzle.position.set(0, 0, -0.18);
      break;
    }
    case 'rocket': {
      // Olive tube on the shoulder, grip and sight below/left, warhead peeking out.
      cyl(g, 0.055, 0.78, 0, 0.07, -0.2, k(0x4f5a3a), 14); // tube
      cyl(g, 0.062, 0.06, 0, 0.07, -0.58, k(0x3a4230), 14); // muzzle ring
      cyl(g, 0.062, 0.06, 0, 0.07, 0.18, k(0x3a4230), 14); // rear ring
      b(g, 0.03, 0.1, 0.045, 0, -0.02, -0.08, k(0x1e1f22)); // grip
      b(g, 0.03, 0.08, 0.04, 0, -0.01, -0.3, k(0x1e1f22)); // front grip
      b(g, 0.02, 0.05, 0.08, -0.07, 0.12, -0.2, k(0x22262a)); // sight
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10), mat(k(0x9a3a26)));
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 0.07, -0.62);
      g.add(tip);
      muzzle.position.set(0, 0.07, -0.66);
      break;
    }
    case 'axe':
      cyl(g, 0.016, 0.62, 0, 0, -0.2, k(0x6a4628)); // handle along -z
      b(g, 0.02, 0.17, 0.12, 0, 0.06, -0.47, k(0x9aa0a6)); // head
      b(g, 0.021, 0.04, 0.12, 0, -0.04, -0.47, k(0x8a9096));
      b(g, 0.012, 0.2, 0.02, 0, 0.04, -0.54, k(0xd8dce0)); // edge
      muzzle.position.set(0, 0.05, -0.55);
      break;
  }
  g.add(muzzle);
  muzzle.userData.keep = true;
  swapInGLB(g, 'weapon_' + id);
  return g;
}
