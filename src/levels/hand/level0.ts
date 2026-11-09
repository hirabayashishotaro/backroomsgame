/**
 * Level 0 — The Lobby.
 * Yellow wallpaper maze built with the edge-hash method (SPEC §3.2):
 * every cell edge decides "wall / wall with doorway / open" from a hash of its
 * global coordinates, so neighbouring chunks always agree on shared edges.
 */
import { hash01, hashInts } from '../../core/rng';
import type { Box, ChunkData, LightPanel } from '../../world/chunkData';
import type { GenContext, LevelDefinition, LightSampler } from '../levelDefinition';

export const CELL = 4; // metres per maze cell
export const CELLS_PER_CHUNK = 8; // 32m chunk
export const WALL_T = 0.2; // wall thickness
const DOOR_W = 1.3;
const DOOR_H = 2.2;

const enum Salt {
  WallX = 11,
  WallZ = 12,
  Region = 13,
  Pillar = 14,
  Light = 15,
  LightState = 16,
  Outlet = 17,
}

export type EdgeKind = 0 | 1 | 2; // open | wall | wall with doorway

/** Region type for a 4x4 block of cells: shapes the local maze density. */
export function regionType(seed: number, gx: number, gz: number): 'maze' | 'normal' | 'open' {
  const rx = Math.floor(gx / 4);
  const rz = Math.floor(gz / 4);
  const h = hash01(seed, Salt.Region, rx, rz);
  if (h < 0.22) return 'open';
  if (h < 0.55) return 'maze';
  return 'normal';
}

function edge(seed: number, salt: Salt, gx: number, gz: number): EdgeKind {
  const r = regionType(seed, gx, gz);
  const p = r === 'maze' ? 0.55 : r === 'open' ? 0.08 : 0.32;
  const h = hash01(seed, salt, gx, gz);
  if (h >= p) return 0;
  // Doorways are more common in mazes so they stay walkable.
  const doorP = r === 'maze' ? 0.45 : 0.3;
  return h < p * doorP ? 2 : 1;
}

/** Edge on the line x = gx*CELL, spanning cell row gz (west edge of cell gx,gz). */
export function wallX(seed: number, gx: number, gz: number): EdgeKind {
  return edge(seed, Salt.WallX, gx, gz);
}
/** Edge on the line z = gz*CELL, spanning cell column gx (north edge of cell gx,gz). */
export function wallZ(seed: number, gx: number, gz: number): EdgeKind {
  return edge(seed, Salt.WallZ, gx, gz);
}

export function hasPillar(seed: number, gx: number, gz: number): boolean {
  return regionType(seed, gx, gz) === 'open' && hash01(seed, Salt.Pillar, gx, gz) < 0.35;
}

/** Ceiling light at the centre of cell (gx,gz): 0 none/off, 1 on, 2 flicker. */
export function lightState(seed: number, gx: number, gz: number): 0 | 1 | 2 | -1 {
  if (hash01(seed, Salt.Light, gx, gz) >= 0.42) return -1; // no fixture
  const s = hash01(seed, Salt.LightState, gx, gz);
  if (s < 0.06) return 0; // dead tube
  if (s < 0.1) return 2;
  return 1;
}

function pushWallSegment(
  out: Box[],
  axis: 'x' | 'z',
  line: number,
  from: number,
  to: number,
  height: number,
  kind: EdgeKind,
): void {
  const t = WALL_T / 2;
  const mk = (a: number, b: number, y0: number, y1: number): Box =>
    axis === 'x'
      ? { minX: line - t, maxX: line + t, minZ: a, maxZ: b, minY: y0, maxY: y1, mat: 'wall' }
      : { minZ: line - t, maxZ: line + t, minX: a, maxX: b, minY: y0, maxY: y1, mat: 'wall' };
  if (kind === 1) {
    out.push(mk(from - t, to + t, 0, height));
    return;
  }
  const mid = (from + to) / 2;
  out.push(mk(from - t, mid - DOOR_W / 2, 0, height));
  out.push(mk(mid + DOOR_W / 2, to + t, 0, height));
  out.push(mk(mid - DOOR_W / 2, mid + DOOR_W / 2, DOOR_H, height));
}

export function generateLevel0(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const H = ctx.level.ceilingHeight;
  const solids: Box[] = [];
  const decor: Box[] = [];
  const lights: LightPanel[] = [];
  const gx0 = cx * CELLS_PER_CHUNK;
  const gz0 = cz * CELLS_PER_CHUNK;

  for (let i = 0; i < CELLS_PER_CHUNK; i++) {
    for (let j = 0; j < CELLS_PER_CHUNK; j++) {
      const gx = gx0 + i;
      const gz = gz0 + j;
      const lx = i * CELL;
      const lz = j * CELL;
      // West edge of this cell (owned by this chunk).
      const wx = wallX(seed, gx, gz);
      if (wx) pushWallSegment(solids, 'x', lx, lz, lz + CELL, H, wx);
      // North edge.
      const wz = wallZ(seed, gx, gz);
      if (wz) pushWallSegment(solids, 'z', lz, lx, lx + CELL, H, wz);

      // Wall outlets: a small plate low on a wall (decor only).
      if (wx === 1 && hash01(seed, Salt.Outlet, gx, gz) < 0.12) {
        const side = hashInts(seed, Salt.Outlet, gz, gx) & 1 ? 1 : -1;
        const z = lz + CELL * 0.3;
        const x = lx + side * (WALL_T / 2 + 0.01);
        decor.push({ minX: x - 0.01, maxX: x + 0.01, minY: 0.3, maxY: 0.42, minZ: z - 0.04, maxZ: z + 0.04, mat: 'outlet' });
      }

      // Pillars at the cell's north-west corner in open halls.
      if (hasPillar(seed, gx, gz)) {
        const s = 0.35;
        solids.push({ minX: lx - s, maxX: lx + s, minZ: lz - s, maxZ: lz + s, minY: 0, maxY: H, mat: 'pillar' });
      }

      const ls = lightState(seed, gx, gz);
      if (ls >= 0) {
        lights.push({ x: lx + CELL / 2, y: H - 0.02, z: lz + CELL / 2, w: 0.6, d: 1.2, state: ls as 0 | 1 | 2 });
      }
    }
  }

  return { levelId: ctx.level.id, cx, cz, size: ctx.level.chunkSize, solids, decor, lights, floor: true, ceiling: true };
}

/** Baked lighting from the ceiling panels around a chunk (cached grid lookup). */
export function level0LightSampler(ctx: GenContext, cx: number, cz: number): LightSampler {
  const seed = ctx.levelSeed;
  const H = ctx.level.ceilingHeight;
  const pad = 2;
  const n = CELLS_PER_CHUNK + pad * 2;
  const gx0 = cx * CELLS_PER_CHUNK - pad;
  const gz0 = cz * CELLS_PER_CHUNK - pad;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const s = lightState(seed, gx0 + i, gz0 + j);
      grid[i * n + j] = s === 1 ? 1 : s === 2 ? 0.6 : 0;
    }
  const amb = ctx.level.palette.ambient;
  return (wx, wy, wz, nx, ny, nz) => {
    const cgx = Math.floor(wx / CELL);
    const cgz = Math.floor(wz / CELL);
    let sum = 0;
    for (let di = -2; di <= 2; di++)
      for (let dj = -2; dj <= 2; dj++) {
        const gi = cgx + di - gx0;
        const gj = cgz + dj - gz0;
        if (gi < 0 || gj < 0 || gi >= n || gj >= n) continue;
        const I = grid[gi * n + gj];
        if (!I) continue;
        const lx = (gi + gx0) * CELL + CELL / 2;
        const lz = (gj + gz0) * CELL + CELL / 2;
        const dx = lx - wx;
        const dy = H - 0.05 - wy;
        const dz = lz - wz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(d2) || 1;
        let ndl = (nx * dx + ny * dy + nz * dz) / d;
        if (ny < -0.5) ndl = 0.35; // ceiling: soft bounce
        if (ndl <= 0) continue;
        sum += (I * ndl * 9) / (d2 + 3);
      }
    return Math.min(1.25, amb + sum);
  };
}

export const level0: LevelDefinition = {
  id: '0',
  name: 'ロビー',
  subtitle: 'The Lobby',
  threatClass: 1,
  chunkSize: CELL * CELLS_PER_CHUNK,
  ceilingHeight: 3,
  palette: {
    wallTex: 'wallpaper-yellow',
    floorTex: 'carpet-damp',
    ceilingTex: 'ceiling-tile',
    lightColor: 0xfffbe6,
    fogColor: 0x2a2614,
    fogDensity: 0.045,
    ambient: 0.12,
    lightTint: [1.0, 0.97, 0.82],
  },
  generator: generateLevel0,
  lightSampler: level0LightSampler,
  setPieces: [],
  ambience: { humFreq: 60, humGain: 0.12, noiseGain: 0.025, noiseCutoff: 900 },
  environment: 'enclosed',
  spawn: { x: CELL / 2, y: 0, z: CELL / 2, yaw: 0 },
};
