/**
 * Meshes for items, props and chalk marks. Geometries are shared (never
 * disposed); materials are per-object so they can carry the baked brightness
 * of their location, and are disposed with the chunk (userData.ownMat).
 */
import * as THREE from 'three';
import { ITEMS, type ItemId } from '../items/itemDefs';
import type { Prop } from './chunkData';
import type { ChalkMark } from './deltas';
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
  return patchMaterial(new THREE.MeshBasicMaterial({ color: c, map, ...opts }));
}

function part(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.userData.sharedGeo = true;
  mesh.userData.ownMat = true;
  return mesh;
}

const LABEL: Partial<Record<ItemId, string>> = {
  almond_water: 'label-almond',
  almond_water_blue: 'label-blue',
  expired_water: 'label-expired',
  aero_water: 'label-aero',
};

/** Build a small world model for an item. `light` is the baked brightness at its spot. */
export function buildItemMesh(id: ItemId, light: number): THREE.Group {
  const def = ITEMS[id];
  const b = Math.min(1.25, 0.35 + light * 0.9);
  const g = new THREE.Group();
  switch (def.shape) {
    case 'bottle': {
      const tex = LABEL[id] ? getTexture(LABEL[id]!).texture : undefined;
      g.add(part(geo('bottle', () => new THREE.CylinderGeometry(0.038, 0.04, 0.2, 12)), mat(0xffffff, b, tex), 0, 0.1, 0));
      g.add(part(geo('neck', () => new THREE.CylinderGeometry(0.016, 0.03, 0.05, 10)), mat(def.color, b), 0, 0.225, 0));
      g.add(part(geo('cap', () => new THREE.CylinderGeometry(0.017, 0.017, 0.02, 10)), mat(0x2a6ab0, b), 0, 0.26, 0));
      break;
    }
    case 'can':
      g.add(part(geo('can', () => new THREE.CylinderGeometry(0.042, 0.042, 0.1, 14)), mat(def.color, b), 0, 0.05, 0));
      break;
    case 'bar':
      g.add(part(geo('bar', () => new THREE.BoxGeometry(0.13, 0.025, 0.045)), mat(def.color, b), 0, 0.013, 0));
      break;
    case 'flashlight': {
      const body = part(geo('fl', () => new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10)), mat(def.color, b), 0, 0.025, 0);
      body.rotation.z = Math.PI / 2;
      const head = part(geo('flh', () => new THREE.CylinderGeometry(0.035, 0.024, 0.05, 10)), mat(0x3a3f46, b), 0.11, 0.035, 0);
      head.rotation.z = Math.PI / 2;
      g.add(body, head);
      break;
    }
    case 'battery':
      g.add(part(geo('bat', () => new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8)), mat(def.color, b), 0, 0.025, 0));
      g.add(part(geo('bat', () => new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8)), mat(def.color, b), 0.035, 0.025, 0.01));
      break;
    case 'chalk':
      g.add(part(geo('chalk', () => new THREE.BoxGeometry(0.08, 0.015, 0.015)), mat(def.color, b), 0, 0.008, 0));
      break;
    case 'stick': {
      const s = part(geo('stick', () => new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8)), mat(def.color, 0.9), 0, 0.012, 0);
      s.rotation.z = Math.PI / 2;
      g.add(s);
      break;
    }
    case 'box':
      g.add(part(geo('kit', () => new THREE.BoxGeometry(0.2, 0.08, 0.14)), mat(def.color, b), 0, 0.04, 0));
      g.add(part(geo('kitx', () => new THREE.BoxGeometry(0.1, 0.002, 0.03)), mat(0xc02020, b), 0, 0.081, 0));
      g.add(part(geo('kitz', () => new THREE.BoxGeometry(0.03, 0.002, 0.1)), mat(0xc02020, b), 0, 0.081, 0));
      break;
    case 'paper': {
      const p = part(geo('paper', () => new THREE.PlaneGeometry(0.15, 0.2)), mat(def.color, b, undefined, { side: THREE.DoubleSide }), 0, 0.004, 0);
      p.rotation.x = -Math.PI / 2;
      g.add(p);
      break;
    }
    default:
      g.add(part(geo('tool', () => new THREE.BoxGeometry(0.12, 0.05, 0.08)), mat(def.color, b), 0, 0.025, 0));
  }
  return g;
}

/** Build a prop. The prop's front faces +Z before rotation. */
export function buildPropMesh(p: Prop, light: number): THREE.Group {
  const g = new THREE.Group();
  const b = Math.min(1.1, 0.3 + light);
  if (p.kind === 'exit-door') {
    const door = part(geo('door', () => new THREE.BoxGeometry(1.0, 2.1, 0.05)), mat(0xffffff, b, getTexture('metal-door').texture), 0, 1.05, 0.025);
    const frame = part(geo('doorframe', () => new THREE.BoxGeometry(1.14, 2.18, 0.03)), mat(0x3b443e, b), 0, 1.09, 0.012);
    const bar = part(geo('pushbar', () => new THREE.BoxGeometry(0.7, 0.05, 0.05)), mat(0xb8bcb8, b), 0, 1.0, 0.07);
    const sign = part(geo('exitsign', () => new THREE.BoxGeometry(0.46, 0.22, 0.04)), mat(0xffffff, 1.1, getTexture('exit-sign').texture), 0, 2.4, 0.03);
    sign.userData.glow = true;
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
  }
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.rotY;
  g.userData.propUid = p.uid;
  return g;
}

export function buildChalkMark(m: ChalkMark): THREE.Mesh {
  const tex = getTexture('chalk-mark-' + (m.kind % 3)).texture;
  const mesh = part(
    geo('chalkmark', () => new THREE.PlaneGeometry(0.5, 0.5)),
    patchMaterial(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })),
    m.x + m.nx * 0.005,
    m.y + m.ny * 0.005,
    m.z + m.nz * 0.005,
  );
  mesh.lookAt(mesh.position.x + m.nx, mesh.position.y + m.ny, mesh.position.z + m.nz);
  mesh.rotateZ(m.rot);
  return mesh;
}
