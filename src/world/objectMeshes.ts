/**
 * Meshes for items and props. Geometries are shared (never disposed);
 * materials are per-object so they can carry the baked brightness of their
 * location, and are disposed with the chunk (userData.ownMat).
 */
import * as THREE from 'three';
import type { ItemId } from '../items/itemDefs';
import type { Prop } from './chunkData';
import { getTexture } from '../proc-tex/textures';
import { patchMaterial } from '../systems/lighting';

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

function mat(color: number | THREE.Color, brightness: number, map?: THREE.Texture, opts: Partial<THREE.MeshBasicMaterialParameters> = {}) {
  const c = new THREE.Color(color).multiplyScalar(brightness);
  return patchMaterial(new THREE.MeshBasicMaterial({ color: c, ...(map ? { map } : {}), ...opts }));
}

function part(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.userData.sharedGeo = true;
  mesh.userData.ownMat = true;
  return mesh;
}

/** PET bottle profile (radius, height) for a LatheGeometry, ~0.26m tall. */
function bottleGeometry(): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [
    [0.0, 0.0],
    [0.03, 0.0],
    [0.036, 0.006],
    [0.037, 0.02],
    [0.036, 0.03],
    [0.037, 0.04],
    [0.037, 0.15],
    [0.036, 0.165],
    [0.03, 0.19],
    [0.02, 0.205],
    [0.0135, 0.215],
    [0.0135, 0.225],
    [0.0, 0.225],
  ];
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
}

/** Build a small world model for an item. `light` is the baked brightness at its spot. */
export function buildItemMesh(id: ItemId, light: number): THREE.Group {
  void id; // only almond water exists for now (SPEC §17)
  const b = Math.min(1.3, 0.45 + light * 0.9);
  const g = new THREE.Group();
  // Clear plastic body with a faint tint.
  const body = part(
    geo('pet-body', bottleGeometry),
    mat(0xd8ecf2, b, undefined, { transparent: true, opacity: 0.55, depthWrite: false }),
  );
  // Water inside, slightly smaller.
  const water = part(
    geo('pet-water', () => new THREE.CylinderGeometry(0.034, 0.034, 0.15, 16)),
    mat(0xf0ecd8, b * 0.95, undefined, { transparent: true, opacity: 0.6, depthWrite: false }),
    0,
    0.083,
    0,
  );
  const label = part(
    geo('pet-label', () => new THREE.CylinderGeometry(0.0385, 0.0385, 0.07, 20, 1, true)),
    mat(0xffffff, b, getTexture('label-almond').texture),
    0,
    0.095,
    0,
  );
  const cap = part(geo('pet-cap', () => new THREE.CylinderGeometry(0.016, 0.016, 0.022, 14)), mat(0x2f78c8, b), 0, 0.236, 0);
  g.add(water, label, body, cap);
  // Lay some bottles on their side? Keep upright: easier to spot.
  return g;
}

function doorMesh(color: number, b: number, window: boolean): THREE.Group {
  const g = new THREE.Group();
  const hex = color.toString(16).padStart(6, '0');
  const tex = getTexture(`door:${hex}:${window ? 1 : 0}`).texture;
  g.add(part(geo('door-frame', () => new THREE.BoxGeometry(1.12, 2.16, 0.04)), mat(new THREE.Color(color).multiplyScalar(0.55), b), 0, 1.08, 0.015));
  g.add(part(geo('door-slab', () => new THREE.BoxGeometry(0.96, 2.05, 0.05)), mat(0xffffff, b, tex), 0, 1.03, 0.04));
  g.add(part(geo('door-knob', () => new THREE.SphereGeometry(0.035, 10, 8)), mat(0xc8c0a0, b), 0.36, 1.0, 0.09));
  return g;
}

/** Build a prop. The prop's front faces +Z before rotation. */
export function buildPropMesh(p: Prop, light: number): THREE.Group {
  let g = new THREE.Group();
  const b = Math.min(1.1, 0.3 + light);
  if (p.kind === 'exit-door') {
    const door = part(geo('door', () => new THREE.BoxGeometry(1.0, 2.1, 0.05)), mat(0xffffff, b, getTexture('metal-door').texture), 0, 1.05, 0.025);
    const frame = part(geo('doorframe', () => new THREE.BoxGeometry(1.14, 2.18, 0.03)), mat(0x3b443e, b), 0, 1.09, 0.012);
    const bar = part(geo('pushbar', () => new THREE.BoxGeometry(0.7, 0.05, 0.05)), mat(0xb8bcb8, b), 0, 1.0, 0.07);
    const sign = part(geo('exitsign', () => new THREE.BoxGeometry(0.46, 0.22, 0.04)), mat(0xffffff, 1.1, getTexture('exit-sign').texture), 0, 2.4, 0.03);
    g.add(frame, door, bar, sign);
  } else if (p.kind === 'glass-door') {
    const fm = () => mat(0xa8b0b4, b);
    const frameTop = part(geo('gf-top', () => new THREE.BoxGeometry(1.9, 0.08, 0.08)), fm(), 0, 2.24, 0.04);
    const frameL = part(geo('gf-side', () => new THREE.BoxGeometry(0.08, 2.28, 0.08)), fm(), -0.95, 1.14, 0.04);
    const frameR = part(geo('gf-side', () => new THREE.BoxGeometry(0.08, 2.28, 0.08)), fm(), 0.95, 1.14, 0.04);
    const frameM = part(geo('gf-mid', () => new THREE.BoxGeometry(0.05, 2.2, 0.1)), fm(), 0.05, 1.1, 0.05);
    const glassTex = getTexture('frosted-green').texture;
    const pane = () => mat(0xffffff, 0.95, glassTex);
    const l = part(geo('gpane', () => new THREE.BoxGeometry(0.88, 2.16, 0.02)), pane(), -0.46, 1.1, 0.03);
    const r = part(geo('gpane', () => new THREE.BoxGeometry(0.88, 2.16, 0.02)), pane(), 0.46, 1.1, 0.06);
    const handle = part(geo('ghandle', () => new THREE.BoxGeometry(0.03, 0.3, 0.03)), fm(), -0.1, 1.05, 0.06);
    g.add(frameTop, frameL, frameR, frameM, l, r, handle);
  } else if (p.kind === 'metal-door') {
    g = doorMesh(p.color ?? 0x5d6b62, b, true);
  } else if (p.kind === 'white-door') {
    // Unnaturally white and slightly self-lit.
    g = doorMesh(0xffffff, 1.15, false);
  } else {
    g = doorMesh(p.color ?? 0x8a8f94, b, false);
  }
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.rotY;
  g.userData.propUid = p.uid;
  return g;
}

/** The "return anchor" (SPEC §5.4.4): a softly glowing doorway back to where you came from. */
export function buildReturnAnchor(): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xd8d4c4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), frameMat);
  top.position.y = 2.2;
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), frameMat);
  l.position.set(-0.6, 1.1, 0);
  const r = l.clone();
  r.position.x = 0.6;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 2.16), glowMat);
  glow.position.y = 1.08;
  glow.userData.glow = true;
  g.add(top, l, r, glow);
  return g;
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.userData.sharedGeo) m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
  o.removeFromParent();
}
