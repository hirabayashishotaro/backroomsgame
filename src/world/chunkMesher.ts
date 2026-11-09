/**
 * Turns chunk geometry arrays into three.js meshes. Geometries are per-chunk
 * (disposed with the chunk); materials and textures are shared per level
 * (disposed on level change via LevelMaterials.dispose()).
 */
import * as THREE from 'three';
import type { ChunkData } from './chunkData';
import type { GenContext, LightSampler } from '../levels/levelDefinition';
import { getTexture } from '../proc-tex/textures';
import { patchMaterial } from '../systems/lighting';
import { materialTable, matMetres, type MatDef } from './materialTable';
import { buildChunkArrays, type ChunkArrays } from './chunkGeometry';

export class LevelMaterials {
  readonly byKey = new Map<string, { mat: THREE.Material; metres: number }>();
  readonly lightOn: THREE.MeshBasicMaterial;
  readonly lightFlicker: THREE.MeshBasicMaterial;
  readonly lightOff: THREE.MeshBasicMaterial;
  readonly lightWarm: THREE.MeshBasicMaterial;
  /** Materials of noclippable walls/floors; the game pulses their colour. */
  thinMats: THREE.MeshBasicMaterial[] = [];
  thinBase: THREE.Color[] = [];
  private table: Record<string, MatDef>;

  constructor(private ctx: GenContext) {
    const p = ctx.level.palette;
    this.table = materialTable(p);
    for (const [key, d] of Object.entries(this.table)) this.byKey.set(key, { mat: this.make(d), metres: matMetres(this.table, key) });
    this.thinMats = ['wall-thin', 'floor-thin'].map((k) => this.byKey.get(k)!.mat as THREE.MeshBasicMaterial);
    this.thinBase = this.thinMats.map((m) => m.color.clone());
    this.lightOn = new THREE.MeshBasicMaterial({ color: p.lightColor });
    this.lightFlicker = new THREE.MeshBasicMaterial({ color: p.lightColor });
    this.lightOff = new THREE.MeshBasicMaterial({ color: 0x5a5648 });
    this.lightWarm = new THREE.MeshBasicMaterial({ color: 0xffa860 });
  }

  private make(d: MatDef): THREE.Material {
    switch (d.kind) {
      case 'lit':
      case 'lit-transparent': {
      const transparent = d.kind === 'lit-transparent';
        const m = new THREE.MeshBasicMaterial({ map: getTexture(d.tex!).texture, vertexColors: true, transparent, depthWrite: !transparent });
        if (d.tint) m.color.setRGB(...d.tint);
        return patchMaterial(m);
      }
      case 'clear':
        return patchMaterial(new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: d.opacity, depthWrite: false, side: THREE.DoubleSide }));
      case 'basic-tex':
        return new THREE.MeshBasicMaterial({ map: getTexture(d.tex!).texture });
      default:
        return new THREE.MeshBasicMaterial({ color: d.color });
    }
  }

  get(key: string) {
    return this.byKey.get(key) ?? this.byKey.get('wall')!;
  }

  dispose(): void {
    for (const { mat } of this.byKey.values()) mat.dispose();
    this.lightOn.dispose();
    this.lightFlicker.dispose();
    this.lightOff.dispose();
    this.lightWarm.dispose();
    // Textures are cached globally and reused across levels; not disposed here.
  }

  get context(): GenContext {
    return this.ctx;
  }
}

/** Build meshes for a chunk on the main thread (sync path). */
export function buildChunkMesh(data: ChunkData, mats: LevelMaterials, sampler: LightSampler): THREE.Group {
  const level = mats.context.level;
  return arraysToGroup(data, buildChunkArrays(data, level.palette, level.ceilingHeight, sampler), mats);
}

/** Wrap prebuilt arrays (possibly from the worker) into a group of meshes. */
export function arraysToGroup(data: ChunkData, arrays: ChunkArrays, mats: LevelMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'chunk ' + data.cx + ',' + data.cz;
  group.userData.cx = data.cx;
  group.userData.cz = data.cz;
  for (const m of arrays.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, mats.get(m.mat).mat));
  }
  const panelMats = [mats.lightOff, mats.lightOn, mats.lightFlicker, mats.lightWarm];
  arrays.panels.forEach((arr, s) => {
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, panelMats[s]));
  });
  primeUpload(group);
  return group;
}

/**
 * three.js uploads geometry to the GPU the first time a mesh is drawn. If that
 * happens when the camera turns towards an already-built chunk, the upload
 * causes a hitch while looking around. Draw each new mesh once regardless of
 * the frustum (in the frame it is built, under the chunk time budget), then
 * restore normal culling.
 */
function primeUpload(group: THREE.Group): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false;
    m.onAfterRender = () => {
      m.frustumCulled = true;
      m.onAfterRender = () => {};
    };
  });
}

export function disposeChunkMesh(group: THREE.Group): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.userData.sharedGeo) m.geometry.dispose();
    if (m.userData.ownMat) (m.material as THREE.Material).dispose();
  });
  group.removeFromParent();
}
