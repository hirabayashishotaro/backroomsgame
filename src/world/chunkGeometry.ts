/**
 * Chunk geometry as plain typed arrays with baked vertex lighting (pure, no
 * three.js) so it can be built in a Web Worker (SPEC §3.1 / Phase 10).
 */
import type { Box, ChunkData } from './chunkData';
import type { LightSampler, Palette } from '../levels/levelDefinition';
import { materialTable, matMetres } from './materialTable';
import { terrainAt } from './terrain';

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

  /** Append one prebuilt vertex; returns its index. */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, r: number, g: number, b: number): number {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(r, g, b);
    return this.pos.length / 3 - 1;
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

let detail = 1;
const segs = (len: number, per = 1) => Math.max(1, Math.min(32, Math.round(len / (per * detail))));
const fmod = (a: number, m: number) => ((a % m) + m) % m;

function addBox(gb: GeoBuilder, b: Box, H: number, m: number, oxm: number, ozm: number, fit = false): void {
  const structural = b.mat.startsWith('wall') || b.mat === 'pillar';
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const d = b.maxZ - b.minZ;
  const sh = segs(h, 1.2);
  if (fit) {
    // A picture (mural, painting): stretched once over each side face, not tiled.
    const fy = (y: number) => (y - b.minY) / (h || 1);
    gb.quad([b.maxX, b.minY, b.maxZ], [0, 0, -d], [0, h, 0], [1, 0, 0], segs(d), sh, (_x, y, z) => [(b.maxZ - z) / (d || 1), fy(y)]);
    gb.quad([b.minX, b.minY, b.minZ], [0, 0, d], [0, h, 0], [-1, 0, 0], segs(d), sh, (_x, y, z) => [(z - b.minZ) / (d || 1), fy(y)]);
    gb.quad([b.minX, b.minY, b.maxZ], [w, 0, 0], [0, h, 0], [0, 0, 1], segs(w), sh, (x, y) => [(x - b.minX) / (w || 1), fy(y)]);
    gb.quad([b.maxX, b.minY, b.minZ], [-w, 0, 0], [0, h, 0], [0, 0, -1], segs(w), sh, (x, y) => [(b.maxX - x) / (w || 1), fy(y)]);
    return;
  }
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

export function buildChunkArrays(data: ChunkData, palette: Palette, H: number, sampler: LightSampler, meshDetail = 1): ChunkArrays {
  detail = meshDetail;
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
  if (data.terrain) {
    // Smooth ground: per-vertex normals from the apron, triangles split by slope into two materials.
    const t = data.terrain;
    const st = t.step;
    const N = t.n;
    const w = N + 1;
    const vx: number[] = [];
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const y = terrainAt(t, i, j);
        let nx = (terrainAt(t, i - 1, j) - terrainAt(t, i + 1, j)) / (2 * st);
        let nz = (terrainAt(t, i, j - 1) - terrainAt(t, i, j + 1)) / (2 * st);
        let ny = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const L = sampler(i * st + ox, y + 0.05, j * st + oz, nx, ny, nz);
        vx.push(i * st, y, j * st, nx, ny, nz, L);
      }
    const limit = 1 / Math.sqrt(1 + t.steepAt * t.steepAt);
    const maps = new Map<string, Map<number, number>>();
    const put = (mat: string, k: number) => {
      const gb = gbFor(mat);
      let m = maps.get(mat);
      if (!m) maps.set(mat, (m = new Map()));
      let idx = m.get(k);
      if (idx === undefined) {
        const o = k * 7;
        const mm = matMetres(table, mat);
        idx = gb.vertex(vx[o], vx[o + 1], vx[o + 2], vx[o + 3], vx[o + 4], vx[o + 5], (vx[o] + fmod(ox, mm)) / mm, (vx[o + 2] + fmod(oz, mm)) / mm, vx[o + 6] * tint[0], vx[o + 6] * tint[1], vx[o + 6] * tint[2]);
        m.set(k, idx);
      }
      return idx;
    };
    const tri = (a: number, b: number, c: number) => {
      // Face normal y-component decides the material.
      const ax = vx[a * 7], ay = vx[a * 7 + 1], az = vx[a * 7 + 2];
      const ux = vx[b * 7] - ax, uy = vx[b * 7 + 1] - ay, uz = vx[b * 7 + 2] - az;
      const wx = vx[c * 7] - ax, wy = vx[c * 7 + 1] - ay, wz = vx[c * 7 + 2] - az;
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      const ny = Math.abs(cy) / (Math.hypot(cx, cy, cz) || 1);
      const mat = ny < limit ? t.steep : t.flat;
      gbFor(mat).idx.push(put(mat, a), put(mat, b), put(mat, c));
    };
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const p00 = i * w + j;
        const p10 = (i + 1) * w + j;
        const p01 = i * w + j + 1;
        const p11 = (i + 1) * w + j + 1;
        // Counter-clockwise seen from above (+y), split along 00-11 like sampleTerrain.
        tri(p00, p11, p10);
        tri(p00, p01, p11);
      }
  }
  for (const b of data.solids) {
    const m = matMetres(table, b.mat);
    addBox(gbFor(b.mat), b, H, m, fmod(ox, m), fmod(oz, m), table[b.mat]?.fit);
  }
  for (const b of data.decor) addBox(gbFor(b.mat), b, H, matMetres(table, b.mat), 0, 0, table[b.mat]?.fit);

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
