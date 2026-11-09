/**
 * Turns pure ChunkData into three.js meshes with baked vertex lighting.
 * Geometries are per-chunk (disposed with the chunk); materials and textures
 * are shared per level (disposed on level change via LevelMaterials.dispose()).
 */
import * as THREE from 'three';
import type { Box, ChunkData } from './chunkData';
import type { GenContext, LightSampler } from '../levels/levelDefinition';
import { getTexture } from '../proc-tex/textures';
import { patchMaterial } from '../systems/lighting';

export class LevelMaterials {
  readonly byKey = new Map<string, { mat: THREE.Material; metres: number }>();
  readonly lightOn: THREE.MeshBasicMaterial;
  readonly lightFlicker: THREE.MeshBasicMaterial;
  readonly lightOff: THREE.MeshBasicMaterial;
  readonly lightWarm: THREE.MeshBasicMaterial;
  /** Materials of noclippable walls/floors; the game pulses their colour. */
  thinMats: THREE.MeshBasicMaterial[] = [];
  thinBase: THREE.Color[] = [];

  constructor(private ctx: GenContext) {
    const p = ctx.level.palette;
    const mk = (texKey: string, transparent = false) => {
      const t = getTexture(texKey);
      const mat = patchMaterial(
        new THREE.MeshBasicMaterial({ map: t.texture, vertexColors: true, transparent, depthWrite: !transparent }),
      );
      return { mat, metres: t.metres };
    };
    this.byKey.set('wall', mk(p.wallTex));
    this.byKey.set('pillar', mk(p.wallTex));
    this.byKey.set('floor', mk(p.floorTex));
    this.byKey.set('ceiling', mk(p.ceilingTex));
    this.byKey.set('outlet', mk('outlet'));
    this.byKey.set('wall-manila', mk('wallpaper-manila'));
    this.byKey.set('chalk-graffiti', mk('chalk-graffiti', true));
    // Thin (noclippable) walls: same wallpaper, very slightly paler.
    const thin = mk(p.wallTex);
    (thin.mat as THREE.MeshBasicMaterial).color.setRGB(1.16, 1.1, 0.92);
    this.byKey.set('wall-thin', thin);
    this.byKey.set('pipe', mk('gen:metal:6a6560:77'));
    this.byKey.set('stone', mk('gen:concrete:9a968c:79'));
    this.byKey.set('dark', mk('gen:concrete:2a2826:80'));
    this.byKey.set('wood-dark', mk('gen:wood:4a3420:81'));
    this.byKey.set('tile-white', mk('gen:tile:dfe6e8:82'));
    this.byKey.set('tile-blue', mk('gen:tile:5fa8c8:83'));
    this.byKey.set('shelf', mk('gen:wood:7a5a36:84'));
    this.byKey.set('metal', mk('gen:metal:8a8e92:85'));
    this.byKey.set('fabric', mk('gen:carpet:5a3a3a:86'));
    // Outdoor / special worlds
    this.byKey.set('hedge', mk('gen:leaves:3f6a2e:90'));
    this.byKey.set('path', mk('gen:paving:a49c88:91'));
    this.byKey.set('bark', mk('bark'));
    this.byKey.set('leaves-green', mk('gen:leaves:4f8a3a:92'));
    this.byKey.set('leaves-dark', mk('gen:leaves:2f5a2a:93'));
    this.byKey.set('leaves-autumn', mk('gen:leaves:c8742e:94'));
    this.byKey.set('leaves-pink', mk('gen:leaves:f0a8c0:95'));
    this.byKey.set('leaves-lime', mk('gen:leaves:8fd14f:96'));
    this.byKey.set('flowers-0', mk('gen:flowers:e84a5a:97'));
    this.byKey.set('flowers-1', mk('gen:flowers:f4d24a:98'));
    this.byKey.set('flowers-2', mk('gen:flowers:a87ae8:99'));
    this.byKey.set('flowers-3', mk('gen:flowers:3cc8e8:100'));
    this.byKey.set('aero-white', mk('aero-tile'));
    this.byKey.set('road-x', mk('road:x'));
    this.byKey.set('road-z', mk('road:z'));
    this.byKey.set('grate', mk('grate'));
    this.byKey.set('shoji', mk('shoji'));
    this.byKey.set('tatami', mk('tatami'));
    this.byKey.set('wood-red', mk('gen:panel:b8382a:101'));
    this.byKey.set('sign-green', { mat: new THREE.MeshBasicMaterial({ color: 0x1f7a4a }), metres: 1 });
    this.byKey.set('lantern', { mat: new THREE.MeshBasicMaterial({ color: 0xffc070 }), metres: 1 });
    this.byKey.set('exit-sign', { mat: new THREE.MeshBasicMaterial({ map: getTexture('exit-sign').texture }), metres: 0.5 });
    this.byKey.set('daylight', { mat: new THREE.MeshBasicMaterial({ color: 0xfafcff }), metres: 1 });
    // Transparent and self-lit materials.
    const clear = (color: number, opacity: number) => ({
      mat: patchMaterial(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })),
      metres: 1,
    });
    this.byKey.set('water', clear(0x4fb6d0, 0.55));
    this.byKey.set('glass', clear(0x9fd8f0, 0.22));
    this.byKey.set('water-dark', clear(0x0c1c26, 0.85));
    this.byKey.set('water-shallow', clear(0x7fd0e0, 0.4));
    this.byKey.set('glow', { mat: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), metres: 1 });
    this.byKey.set('glow-blue', { mat: new THREE.MeshBasicMaterial({ color: 0x8fe0ff }), metres: 1 });
    // Floor that gives way: the floor texture, slightly cooler and pulsing (animated by the game).
    const thinFloor = mk(p.floorTex);
    (thinFloor.mat as THREE.MeshBasicMaterial).color.setRGB(0.8, 0.9, 1.08);
    this.byKey.set('floor-thin', thinFloor);
    this.thinMats = [thin.mat as THREE.MeshBasicMaterial, thinFloor.mat as THREE.MeshBasicMaterial];
    this.thinBase = this.thinMats.map((m) => m.color.clone());
    this.byKey.set('crate', mk('gen:wood:8a6a3e:78'));
    this.lightOn = new THREE.MeshBasicMaterial({ color: p.lightColor });
    this.lightFlicker = new THREE.MeshBasicMaterial({ color: p.lightColor });
    this.lightOff = new THREE.MeshBasicMaterial({ color: 0x5a5648 });
    this.lightWarm = new THREE.MeshBasicMaterial({ color: 0xffa860 });
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

class GeoBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  constructor(
    private light: LightSampler,
    private ox: number,
    private oz: number,
    private tint: [number, number, number],
  ) {}

  /**
   * Subdivided quad: origin o, edge vectors a (u) and b (v), normal n.
   * uvFn maps local position -> uv.
   */
  quad(
    o: [number, number, number],
    a: [number, number, number],
    b: [number, number, number],
    n: [number, number, number],
    segA: number,
    segB: number,
    uvFn: (x: number, y: number, z: number) => [number, number],
  ): void {
    const base = this.pos.length / 3;
    for (let i = 0; i <= segA; i++)
      for (let j = 0; j <= segB; j++) {
        const s = i / segA;
        const t = j / segB;
        const x = o[0] + a[0] * s + b[0] * t;
        const y = o[1] + a[1] * s + b[1] * t;
        const z = o[2] + a[2] * s + b[2] * t;
        this.pos.push(x, y, z);
        this.nrm.push(n[0], n[1], n[2]);
        const [u, v] = uvFn(x, y, z);
        this.uv.push(u, v);
        const L = this.light(x + this.ox + n[0] * 0.05, y + n[1] * 0.05, z + this.oz + n[2] * 0.05, n[0], n[1], n[2]);
        this.col.push(L * this.tint[0], L * this.tint[1], L * this.tint[2]);
      }
    // Winding: (a x b) must point along n for front faces.
    const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    const row = segB + 1;
    for (let i = 0; i < segA; i++)
      for (let j = 0; j < segB; j++) {
        const p0 = base + i * row + j;
        const p1 = base + (i + 1) * row + j;
        const p2 = base + (i + 1) * row + j + 1;
        const p3 = base + i * row + j + 1;
        if (!flip) this.idx.push(p0, p1, p2, p0, p2, p3);
        else this.idx.push(p0, p2, p1, p0, p3, p2);
      }
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const segs = (len: number, per = 1) => Math.max(1, Math.round(len / per));
const fmod = (a: number, m: number) => ((a % m) + m) % m;

function addBox(gb: GeoBuilder, b: Box, H: number, m: number, oxm: number, ozm: number): void {
  const structural = b.mat.startsWith('wall') || b.mat === 'pillar';
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const d = b.maxZ - b.minZ;
  const sh = segs(h, 1.2);
  const ux = (x: number) => (x + oxm) / m;
  const uz = (z: number) => (z + ozm) / m;
  // +X face
  gb.quad([b.maxX, b.minY, b.maxZ], [0, 0, -d], [0, h, 0], [1, 0, 0], segs(d), sh, (_x, y, z) => [-uz(z), y / m]);
  // -X face
  gb.quad([b.minX, b.minY, b.minZ], [0, 0, d], [0, h, 0], [-1, 0, 0], segs(d), sh, (_x, y, z) => [uz(z), y / m]);
  // +Z face
  gb.quad([b.minX, b.minY, b.maxZ], [w, 0, 0], [0, h, 0], [0, 0, 1], segs(w), sh, (x, y) => [ux(x), y / m]);
  // -Z face
  gb.quad([b.maxX, b.minY, b.minZ], [-w, 0, 0], [0, h, 0], [0, 0, -1], segs(w), sh, (x, y) => [-ux(x), y / m]);
  if (!(structural && b.maxY >= H - 0.01))
    gb.quad([b.minX, b.maxY, b.minZ], [w, 0, 0], [0, 0, d], [0, 1, 0], segs(w), segs(d), (x, _y, z) => [ux(x), uz(z)]);
  if (b.minY > 0.01 || b.minY < -0.01)
    gb.quad([b.minX, b.minY, b.minZ], [w, 0, 0], [0, 0, d], [0, -1, 0], segs(w), segs(d), (x, _y, z) => [ux(x), uz(z)]);
}

export function buildChunkMesh(data: ChunkData, mats: LevelMaterials, sampler: LightSampler): THREE.Group {
  const ctx = mats.context;
  const level = ctx.level;
  const H = level.ceilingHeight;
  const S = data.size;
  const ox = data.cx * S;
  const oz = data.cz * S;
  const tint = level.palette.lightTint;
  const group = new THREE.Group();
  group.name = 'chunk ' + data.cx + ',' + data.cz;
  group.userData.cx = data.cx;
  group.userData.cz = data.cz;

  const builders = new Map<string, GeoBuilder>();
  const gbFor = (key: string) => {
    let gb = builders.get(key);
    if (!gb) builders.set(key, (gb = new GeoBuilder(sampler, ox, oz, tint)));
    return gb;
  };

  {
    const m = mats.get('floor').metres;
    const offx = fmod(ox, m);
    const offz = fmod(oz, m);
    for (const f of data.floors) {
      const w = f.x1 - f.x0;
      const d = f.z1 - f.z0;
      if (w <= 0 || d <= 0) continue;
      gbFor('floor').quad([f.x0, f.y, f.z0], [0, 0, d], [w, 0, 0], [0, 1, 0], segs(d), segs(w), (x, _y, z) => [
        (x + offx) / m,
        (z + offz) / m,
      ]);
    }
  }
  {
    const m = mats.get('ceiling').metres;
    const offx = fmod(ox, m);
    const offz = fmod(oz, m);
    for (const c of data.ceilings) {
      const w = c.x1 - c.x0;
      const d = c.z1 - c.z0;
      if (w <= 0 || d <= 0) continue;
      gbFor('ceiling').quad([c.x0, c.y, c.z0], [w, 0, 0], [0, 0, d], [0, -1, 0], segs(w), segs(d), (x, _y, z) => [
        (x + offx) / m,
        (z + offz) / m,
      ]);
    }
  }
  for (const b of data.solids) {
    const m = mats.get(b.mat).metres;
    addBox(gbFor(b.mat), b, H, m, fmod(ox, m), fmod(oz, m));
  }
  for (const b of data.decor) {
    const m = mats.get(b.mat).metres;
    addBox(gbFor(b.mat), b, H, m, 0, 0);
  }
  for (const [key, gb] of builders) {
    const geo = gb.build();
    if (geo) group.add(new THREE.Mesh(geo, mats.get(key).mat));
  }

  // Light panels: emissive quads, grouped by state.
  const panelGeo: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const l of data.lights) {
    const arr = panelGeo[l.state];
    const x0 = l.x - l.w / 2;
    const x1 = l.x + l.w / 2;
    const z0 = l.z - l.d / 2;
    const z1 = l.z + l.d / 2;
    arr.push(x0, l.y, z0, x1, l.y, z0, x1, l.y, z1, x0, l.y, z0, x1, l.y, z1, x0, l.y, z1);
  }
  const panelMats = [mats.lightOff, mats.lightOn, mats.lightFlicker, mats.lightWarm];
  for (const s of [0, 1, 2, 3]) {
    if (!panelGeo[s].length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(panelGeo[s], 3));
    g.computeBoundingSphere();
    // Faces point down: winding above is CCW seen from below? Render both sides to be safe.
    const mesh = new THREE.Mesh(g, panelMats[s]);
    group.add(mesh);
  }
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
