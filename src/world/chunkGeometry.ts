/**
 * Chunk geometry as plain typed arrays with baked vertex lighting (pure, no
 * three.js) so it can be built in a Web Worker (SPEC §3.1 / Phase 10).
 */
import type { Box, ChunkData } from './chunkData';
import type { LightSampler, Palette } from '../levels/levelDefinition';
import { materialTable, matMetres } from './materialTable';

export interface MeshArrays {
  mat: string;
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
}

export interface ChunkArrays {
  meshes: MeshArrays[];
  /** Light panel triangles by state (0 off, 1 on, 2 flicker, 3 warm). */
  panels: Float32Array[];
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

  /** Subdivided quad: origin o, edge vectors a (u) and b (v), normal n. */
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

  toArrays(mat: string): MeshArrays | null {
    if (!this.idx.length) return null;
    return {
      mat,
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      uv: new Float32Array(this.uv),
      col: new Float32Array(this.col),
      idx: new Uint32Array(this.idx),
    };
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
  gb.quad([b.maxX, b.minY, b.maxZ], [0, 0, -d], [0, h, 0], [1, 0, 0], segs(d), sh, (_x, y, z) => [-uz(z), y / m]);
  gb.quad([b.minX, b.minY, b.minZ], [0, 0, d], [0, h, 0], [-1, 0, 0], segs(d), sh, (_x, y, z) => [uz(z), y / m]);
  gb.quad([b.minX, b.minY, b.maxZ], [w, 0, 0], [0, h, 0], [0, 0, 1], segs(w), sh, (x, y) => [ux(x), y / m]);
  gb.quad([b.maxX, b.minY, b.minZ], [-w, 0, 0], [0, h, 0], [0, 0, -1], segs(w), sh, (x, y) => [-ux(x), y / m]);
  if (!(structural && b.maxY >= H - 0.01))
    gb.quad([b.minX, b.maxY, b.minZ], [w, 0, 0], [0, 0, d], [0, 1, 0], segs(w), segs(d), (x, _y, z) => [ux(x), uz(z)]);
  if (b.minY > 0.01 || b.minY < -0.01)
    gb.quad([b.minX, b.minY, b.minZ], [w, 0, 0], [0, 0, d], [0, -1, 0], segs(w), segs(d), (x, _y, z) => [ux(x), uz(z)]);
}

export function buildChunkArrays(data: ChunkData, palette: Palette, H: number, sampler: LightSampler): ChunkArrays {
  const table = materialTable(palette);
  const S = data.size;
  const ox = data.cx * S;
  const oz = data.cz * S;
  const tint = palette.lightTint;
  const builders = new Map<string, GeoBuilder>();
  const gbFor = (key: string) => {
    let gb = builders.get(key);
    if (!gb) builders.set(key, (gb = new GeoBuilder(sampler, ox, oz, tint)));
    return gb;
  };
  {
    const m = matMetres(table, 'floor');
    const offx = fmod(ox, m);
    const offz = fmod(oz, m);
    for (const f of data.floors) {
      const w = f.x1 - f.x0;
      const d = f.z1 - f.z0;
      if (w <= 0 || d <= 0) continue;
      gbFor('floor').quad([f.x0, f.y, f.z0], [0, 0, d], [w, 0, 0], [0, 1, 0], segs(d), segs(w), (x, _y, z) => [(x + offx) / m, (z + offz) / m]);
    }
  }
  {
    const m = matMetres(table, 'ceiling');
    const offx = fmod(ox, m);
    const offz = fmod(oz, m);
    for (const c of data.ceilings) {
      const w = c.x1 - c.x0;
      const d = c.z1 - c.z0;
      if (w <= 0 || d <= 0) continue;
      gbFor('ceiling').quad([c.x0, c.y, c.z0], [w, 0, 0], [0, 0, d], [0, -1, 0], segs(w), segs(d), (x, _y, z) => [(x + offx) / m, (z + offz) / m]);
    }
  }
  for (const b of data.solids) {
    const m = matMetres(table, b.mat);
    addBox(gbFor(b.mat), b, H, m, fmod(ox, m), fmod(oz, m));
  }
  for (const b of data.decor) addBox(gbFor(b.mat), b, H, matMetres(table, b.mat), 0, 0);

  const meshes: MeshArrays[] = [];
  for (const [key, gb] of builders) {
    const a = gb.toArrays(key);
    if (a) meshes.push(a);
  }
  const panelLists: number[][] = [[], [], [], []];
  for (const l of data.lights) {
    const x0 = l.x - l.w / 2;
    const x1 = l.x + l.w / 2;
    const z0 = l.z - l.d / 2;
    const z1 = l.z + l.d / 2;
    panelLists[l.state].push(x0, l.y, z0, x1, l.y, z0, x1, l.y, z1, x0, l.y, z0, x1, l.y, z1, x0, l.y, z1);
  }
  return { meshes, panels: panelLists.map((a) => new Float32Array(a)) };
}

/** Typed-array buffers to transfer to the main thread without copying. */
export function transferables(a: ChunkArrays): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const m of a.meshes) out.push(m.pos.buffer as ArrayBuffer, m.nrm.buffer as ArrayBuffer, m.uv.buffer as ArrayBuffer, m.col.buffer as ArrayBuffer, m.idx.buffer as ArrayBuffer);
  for (const p of a.panels) out.push(p.buffer as ArrayBuffer);
  return out;
}
