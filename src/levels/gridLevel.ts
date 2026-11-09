/**
 * Generic grid-based level generator (edge-hash method, SPEC §3.2), shared by
 * Level 1, Level 2 and procedurally generated levels. Pure (no three.js).
 */
import { hash01 } from '../core/rng';
import type { Box, CeilingRect, ChunkData, ItemSpawn, LightPanel, Prop, PropKind } from '../world/chunkData';
import type { GenContext, LightSampler, SpawnPoint } from './levelDefinition';
import { pickLoot } from '../items/lootTables';

export interface DoorKind {
  kind: PropKind;
  weight: number;
  color?: number;
}

export interface GridParams {
  cell: number;
  cellsPerChunk: number;
  /** Probability that a cell edge has a wall. */
  wallP: number;
  /** Fraction of walls that have a doorway. */
  doorwayP: number;
  /** Mix in open/maze regions like Level 0. */
  regions: boolean;
  ceiling: number;
  wallT: number;
  /** Probability of a pillar at a cell corner, and its half-size. */
  pillarP: number;
  pillarHalf: number;
  /** Ceiling light per cell. */
  lightP: number;
  lightDeadP: number;
  lightFlickerP: number;
  lightW: number;
  lightD: number;
  lightIntensity: number;
  /** Crates stacked in cell corners (Level 1). */
  crateP: number;
  /** Pipes along walls under the ceiling (Level 2). */
  pipes: boolean;
  /** Door props on walls, per cell. */
  doorP: number;
  doorKinds: DoorKind[];
  /** Fraction of full walls that are thin (noclippable). */
  thinP: number;
  /** Items per cell. */
  lootP: number;
}

const enum Salt {
  WallX = 31,
  WallZ = 32,
  Region = 33,
  Pillar = 34,
  Light = 35,
  LightState = 36,
  Crate = 37,
  Door = 38,
  Thin = 39,
  Loot = 40,
  Arrival = 41,
  Pipe = 42,
}

export type EdgeKind = 0 | 1 | 2;

function regionMul(seed: number, p: GridParams, gx: number, gz: number): number {
  if (!p.regions) return 1;
  const h = hash01(seed, Salt.Region, Math.floor(gx / 4), Math.floor(gz / 4));
  return h < 0.25 ? 0.35 : h < 0.55 ? 1.3 : 1;
}

function edge(seed: number, p: GridParams, salt: Salt, gx: number, gz: number): EdgeKind {
  const wp = Math.min(0.7, p.wallP * regionMul(seed, p, gx, gz));
  const h = hash01(seed, salt, gx, gz);
  if (h >= wp) return 0;
  return h < wp * p.doorwayP ? 2 : 1;
}

export const gridWallX = (seed: number, p: GridParams, gx: number, gz: number) => edge(seed, p, Salt.WallX, gx, gz);
export const gridWallZ = (seed: number, p: GridParams, gx: number, gz: number) => edge(seed, p, Salt.WallZ, gx, gz);

export function gridCellLight(seed: number, p: GridParams, gx: number, gz: number): { state: 0 | 1 | 2; I: number } | null {
  if (hash01(seed, Salt.Light, gx, gz) >= p.lightP) return null;
  const s = hash01(seed, Salt.LightState, gx, gz);
  if (s < p.lightDeadP) return { state: 0, I: 0 };
  if (s < p.lightDeadP + p.lightFlickerP) return { state: 2, I: p.lightIntensity * 0.6 };
  return { state: 1, I: p.lightIntensity };
}

function isThin(seed: number, p: GridParams, axis: number, gx: number, gz: number): boolean {
  return hash01(seed, Salt.Thin, axis, gx, gz) < p.thinP;
}

function pushWall(out: Box[], p: GridParams, axis: 'x' | 'z', line: number, from: number, to: number, kind: EdgeKind, thin: boolean): void {
  const t = p.wallT / 2;
  const H = p.ceiling;
  const doorW = Math.min(1.4, (to - from) * 0.45);
  const doorH = Math.min(2.3, H - 0.2);
  const mat = thin ? 'wall-thin' : 'wall';
  const mk = (a: number, b: number, y0: number, y1: number): Box => {
    const box: Box =
      axis === 'x'
        ? { minX: line - t, maxX: line + t, minZ: a, maxZ: b, minY: y0, maxY: y1, mat }
        : { minZ: line - t, maxZ: line + t, minX: a, maxX: b, minY: y0, maxY: y1, mat };
    if (thin) box.thin = true;
    return box;
  };
  if (kind === 1) {
    out.push(mk(from - t, to + t, 0, H));
    return;
  }
  const mid = (from + to) / 2;
  out.push(mk(from - t, mid - doorW / 2, 0, H));
  out.push(mk(mid + doorW / 2, to + t, 0, H));
  out.push(mk(mid - doorW / 2, mid + doorW / 2, doorH, H));
}

function pickDoor(kinds: DoorKind[], u: number): DoorKind {
  const total = kinds.reduce((s, k) => s + k.weight, 0);
  let x = u * total;
  for (const k of kinds) {
    x -= k.weight;
    if (x < 0) return k;
  }
  return kinds[kinds.length - 1];
}

export function generateGrid(ctx: GenContext, p: GridParams, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const C = p.cell;
  const N = p.cellsPerChunk;
  const S = C * N;
  const H = p.ceiling;
  const solids: Box[] = [];
  const decor: Box[] = [];
  const lights: LightPanel[] = [];
  const items: ItemSpawn[] = [];
  const props: Prop[] = [];
  const ceilings: CeilingRect[] = [{ x0: 0, z0: 0, x1: S, z1: S, y: H }];
  const gx0 = cx * N;
  const gz0 = cz * N;
  const t = p.wallT / 2;

  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const gx = gx0 + i;
      const gz = gz0 + j;
      const lx = i * C;
      const lz = j * C;
      const wx = gridWallX(seed, p, gx, gz);
      const wz = gridWallZ(seed, p, gx, gz);
      const thinX = wx === 1 && isThin(seed, p, 0, gx, gz);
      const thinZ = wz === 1 && isThin(seed, p, 1, gx, gz);
      if (wx) pushWall(solids, p, 'x', lx, lz, lz + C, wx, thinX);
      if (wz) pushWall(solids, p, 'z', lz, lx, lx + C, wz, thinZ);

      // Pipes along both faces of full walls.
      if (p.pipes) {
        for (const [k, axis] of [
          [wx, 'x'],
          [wz, 'z'],
        ] as const) {
          if (k !== 1) continue;
          const line = axis === 'x' ? lx : lz;
          const a = axis === 'x' ? lz : lx;
          for (const side of [-1, 1]) {
            const n = Math.floor(hash01(seed, Salt.Pipe, gx * 2 + (axis === 'x' ? 0 : 1), gz, side) * 3);
            for (let q = 0; q < n; q++) {
              const y = H - 0.25 - q * 0.28;
              const r = q === 0 ? 0.11 : 0.07;
              const off = t + r + 0.02;
              const c0 = line + side * off;
              decor.push(
                axis === 'x'
                  ? { minX: c0 - r, maxX: c0 + r, minY: y - r, maxY: y + r, minZ: a, maxZ: a + C, mat: 'pipe' }
                  : { minZ: c0 - r, maxZ: c0 + r, minY: y - r, maxY: y + r, minX: a, maxX: a + C, mat: 'pipe' },
              );
            }
          }
        }
      }

      if (p.pillarP > 0 && hash01(seed, Salt.Pillar, gx, gz) < p.pillarP) {
        const s = p.pillarHalf;
        solids.push({ minX: lx - s, maxX: lx + s, minZ: lz - s, maxZ: lz + s, minY: 0, maxY: H, mat: 'pillar' });
      }

      const L = gridCellLight(seed, p, gx, gz);
      if (L) lights.push({ x: lx + C / 2, y: H - 0.02, z: lz + C / 2, w: p.lightW, d: p.lightD, state: L.state });

      // Crates in cell corners (never in the centre, which stays walkable).
      if (p.crateP > 0 && hash01(seed, Salt.Crate, gx, gz) < p.crateP) {
        const corner = Math.floor(hash01(seed, Salt.Crate, gx, gz, 1) * 4);
        const sx = corner & 1 ? 1 : -1;
        const sz = corner & 2 ? 1 : -1;
        const count = 1 + Math.floor(hash01(seed, Salt.Crate, gx, gz, 2) * 3);
        for (let k = 0; k < count; k++) {
          const size = 0.9 + hash01(seed, Salt.Crate, gx, gz, 3 + k) * 0.5;
          const ccx = lx + C / 2 + sx * (C / 2 - t - 0.75 - (k === 1 ? size : 0));
          const ccz = lz + C / 2 + sz * (C / 2 - t - 0.75 - (k === 2 ? size : 0));
          const y0 = 0;
          solids.push({ minX: ccx - size / 2, maxX: ccx + size / 2, minZ: ccz - size / 2, maxZ: ccz + size / 2, minY: y0, maxY: y0 + size, mat: 'crate' });
          if (k === 0 && hash01(seed, Salt.Crate, gx, gz, 9) < 0.5) {
            const s2 = size * 0.8;
            solids.push({ minX: ccx - s2 / 2, maxX: ccx + s2 / 2, minZ: ccz - s2 / 2, maxZ: ccz + s2 / 2, minY: size, maxY: size + s2, mat: 'crate' });
          }
        }
      }

      // Door prop on the inner face of this cell's north wall.
      if (wz === 1 && !thinZ && hash01(seed, Salt.Door, gx, gz) < p.doorP) {
        const dk = pickDoor(p.doorKinds, hash01(seed, Salt.Door, gx, gz, 1));
        props.push({ uid: `d${i},${j}`, kind: dk.kind, x: lx + C / 2, y: 0, z: lz + t + 0.02, rotY: 0, color: dk.color });
      }

      if (hash01(seed, Salt.Loot, gx, gz) < p.lootP) {
        const id = pickLoot(ctx.level.lootTable.rules, hash01(seed, Salt.Loot, gx, gz, 1));
        items.push({
          uid: `${i},${j}`,
          id,
          x: lx + C / 2 + (hash01(seed, Salt.Loot, gx, gz, 2) - 0.5) * Math.min(1.6, C - 1.6),
          y: 0,
          z: lz + C / 2 + (hash01(seed, Salt.Loot, gx, gz, 3) - 0.5) * Math.min(1.6, C - 1.6),
          rot: hash01(seed, Salt.Loot, gx, gz, 4) * Math.PI * 2,
        });
      }
    }

  return { levelId: ctx.level.id, cx, cz, size: S, solids, decor, lights, floor: true, ceilings, items, props, zones: [] };
}

export function gridLightSampler(ctx: GenContext, p: GridParams, cx: number, cz: number): LightSampler {
  const seed = ctx.levelSeed;
  const C = p.cell;
  const pad = Math.max(2, Math.ceil(8 / C));
  const n = p.cellsPerChunk + pad * 2;
  const gx0 = cx * p.cellsPerChunk - pad;
  const gz0 = cz * p.cellsPerChunk - pad;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) grid[i * n + j] = gridCellLight(seed, p, gx0 + i, gz0 + j)?.I ?? 0;
  const amb = ctx.level.palette.ambient;
  const H = p.ceiling;
  const k = 9 * (C / 4) * (C / 4); // keep brightness comparable across cell sizes
  return (wx, wy, wz, nx, ny, nz) => {
    const cgx = Math.floor(wx / C);
    const cgz = Math.floor(wz / C);
    let sum = 0;
    for (let di = -pad; di <= pad; di++)
      for (let dj = -pad; dj <= pad; dj++) {
        const gi = cgx + di - gx0;
        const gj = cgz + dj - gz0;
        if (gi < 0 || gj < 0 || gi >= n || gj >= n) continue;
        const I = grid[gi * n + gj];
        if (!I) continue;
        const dx = (gi + gx0) * C + C / 2 - wx;
        const dy = H - 0.05 - wy;
        const dz = (gj + gz0) * C + C / 2 - wz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(d2) || 1;
        let ndl = (nx * dx + ny * dy + nz * dz) / d;
        if (ny < -0.5) ndl = 0.35;
        if (ndl <= 0) continue;
        sum += (I * ndl * k) / (d2 + 3);
      }
    return Math.min(1.25, amb + sum);
  };
}

/** Arrival at a cell centre chosen from the entry hash (always free of walls). */
export function gridArrival(ctx: GenContext, p: GridParams, entryHash: number): SpawnPoint {
  const seed = ctx.levelSeed;
  const range = 6;
  const cx = Math.floor(hash01(seed, Salt.Arrival, entryHash, 1) * (range * 2 + 1)) - range;
  const cz = Math.floor(hash01(seed, Salt.Arrival, entryHash, 2) * (range * 2 + 1)) - range;
  const i = Math.floor(hash01(seed, Salt.Arrival, entryHash, 3) * p.cellsPerChunk);
  const j = Math.floor(hash01(seed, Salt.Arrival, entryHash, 4) * p.cellsPerChunk);
  const C = p.cell;
  return {
    x: (cx * p.cellsPerChunk + i) * C + C / 2,
    y: 0,
    z: (cz * p.cellsPerChunk + j) * C + C / 2,
    yaw: Math.floor(hash01(seed, Salt.Arrival, entryHash, 5) * 4) * (Math.PI / 2),
  };
}
