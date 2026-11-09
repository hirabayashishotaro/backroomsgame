/**
 * Generic grid-based level generator (edge-hash method, SPEC §3.2), shared by
 * Level 1, Level 2 and procedurally generated levels. Pure (no three.js).
 */
import { hash01 } from '../core/rng';
import type { Box, CeilingRect, ChunkData, ItemSpawn, LightPanel, Prop, PropKind, Zone } from '../world/chunkData';
import type { GenContext, LightSampler, SpawnPoint } from './levelDefinition';
import { pickLoot } from '../items/lootTables';
import { buildGridPiece, gridPieceAtCell, gridPieceEdge, gridPieceForChunk } from './gridPieces';

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
  /** Set piece ids from gridPieces.ts used by this level. */
  pieces?: string[];
  /** Chance of a second piece per feature cell. */
  pieceRate?: number;
  /** Chance per cell of a floor patch that gives way. */
  thinFloorP?: number;
  /** Feature cell size in chunks for set pieces (default 3). */
  featureCell?: number;
  /** No ceiling at all: walls under the open sky (ruins). */
  noCeiling?: boolean;
  /** A layer of shallow water over the whole floor at this height (Level 37). */
  waterY?: number;
  /** Chance of a glowing green exit sign on a cell's north wall (Level 14). */
  signP?: number;
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
  ThinFloor = 43,
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

function pieceOverride(seed: number, p: GridParams, axis: 'x' | 'z', gx: number, gz: number): EdgeKind | undefined {
  const N = p.cellsPerChunk;
  // The edge is owned by cell (gx,gz); a piece inside that cell's chunk may override it.
  const piece = gridPieceForChunk(seed, p, Math.floor(gx / N), Math.floor(gz / N));
  return piece ? gridPieceEdge(piece, axis, gx, gz) : undefined;
}

export function gridWallX(seed: number, p: GridParams, gx: number, gz: number): EdgeKind {
  return pieceOverride(seed, p, 'x', gx, gz) ?? edge(seed, p, Salt.WallX, gx, gz);
}
export function gridWallZ(seed: number, p: GridParams, gx: number, gz: number): EdgeKind {
  return pieceOverride(seed, p, 'z', gx, gz) ?? edge(seed, p, Salt.WallZ, gx, gz);
}

/** Thin floor patch (falls through) at the centre of a cell. */
export function gridThinFloor(seed: number, p: GridParams, gx: number, gz: number): boolean {
  return (p.thinFloorP ?? 0) > 0 && !gridPieceAtCell(seed, p, gx, gz) && hash01(seed, Salt.ThinFloor, gx, gz) < (p.thinFloorP ?? 0);
}

export function gridCellLight(seed: number, p: GridParams, gx: number, gz: number): { state: 0 | 1 | 2; I: number } | null {
  if (hash01(seed, Salt.Light, gx, gz) >= p.lightP) return null;
  if (gridPieceAtCell(seed, p, gx, gz)) return null; // pieces bring their own lighting
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
  const ceilings: CeilingRect[] = [];
  const floors: CeilingRect[] = [];
  const zones: Zone[] = [];
  const gx0 = cx * N;
  const gz0 = cz * N;
  const t = p.wallT / 2;
  const piece = gridPieceForChunk(seed, p, cx, cz);
  const inPiece = (gx: number, gz: number) => !!piece && gx >= piece.gx0 && gx <= piece.gx1 && gz >= piece.gz0 && gz <= piece.gz1;

  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const gx = gx0 + i;
      const gz = gz0 + j;
      const lx = i * C;
      const lz = j * C;
      const wx = gridWallX(seed, p, gx, gz);
      const wz = gridWallZ(seed, p, gx, gz);
      const thinX = wx === 1 && !piece && isThin(seed, p, 0, gx, gz);
      const thinZ = wz === 1 && !piece && isThin(seed, p, 1, gx, gz);
      const here = inPiece(gx, gz);
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

      const nearPiece =
        here || gridPieceAtCell(seed, p, gx - 1, gz) || gridPieceAtCell(seed, p, gx, gz - 1) || gridPieceAtCell(seed, p, gx - 1, gz - 1);
      if (!nearPiece && p.pillarP > 0 && hash01(seed, Salt.Pillar, gx, gz) < p.pillarP) {
        const s = p.pillarHalf;
        solids.push({ minX: lx - s, maxX: lx + s, minZ: lz - s, maxZ: lz + s, minY: 0, maxY: H, mat: 'pillar' });
      }

      const L = gridCellLight(seed, p, gx, gz);
      if (L) lights.push({ x: lx + C / 2, y: H - 0.02, z: lz + C / 2, w: p.lightW, d: p.lightD, state: L.state });

      // Crates in cell corners (never in the centre, which stays walkable).
      if (!here && p.crateP > 0 && hash01(seed, Salt.Crate, gx, gz) < p.crateP) {
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

      if (!here && wz === 1 && p.signP && hash01(seed, Salt.Door, gx, gz, 7) < p.signP) {
        const sx = lx + C / 2;
        const sz = lz + t + 0.03;
        decor.push({ minX: sx - 0.25, maxX: sx + 0.25, minY: Math.min(2.2, H - 0.4), maxY: Math.min(2.2, H - 0.4) + 0.24, minZ: sz, maxZ: sz + 0.04, mat: 'exit-sign' });
      }

      // Door prop on the inner face of this cell's north wall.
      if (!here && !piece && wz === 1 && !thinZ && hash01(seed, Salt.Door, gx, gz) < p.doorP) {
        const dk = pickDoor(p.doorKinds, hash01(seed, Salt.Door, gx, gz, 1));
        props.push({ uid: `d${i},${j}`, kind: dk.kind, x: lx + C / 2, y: 0, z: lz + t + 0.02, rotY: 0, color: dk.color });
      }

      if (gridThinFloor(seed, p, gx, gz)) {
        const r = Math.min(0.9, C / 2 - t - 0.2);
        const fx = lx + C / 2;
        const fz = lz + C / 2;
        decor.push({ minX: fx - r, maxX: fx + r, minY: 0.002, maxY: 0.008, minZ: fz - r, maxZ: fz + r, mat: 'floor-thin' });
        zones.push({ kind: 'thin-floor', x0: fx - r, z0: fz - r, x1: fx + r, z1: fz + r });
      }

      if (!here && hash01(seed, Salt.Loot, gx, gz) < p.lootP) {
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

  // Ceilings and floors, with the set piece's raised ceiling and floor holes.
  if (piece) {
    const out = buildGridPiece(seed, p, piece);
    const x0 = (piece.gx0 - gx0) * C;
    const z0 = (piece.gz0 - gz0) * C;
    const x1 = (piece.gx1 + 1 - gx0) * C;
    const z1 = (piece.gz1 + 1 - gz0) * C;
    const top = piece.def.ceiling(H);
    if (piece.def.open) {
      ceilings.push(...frame(S, x0, z0, x1, z1, H));
    } else if (top > H + 0.01) {
      ceilings.push(...frame(S, x0, z0, x1, z1, H), { x0, z0, x1, z1, y: top });
      const y0 = H - 0.01;
      solids.push({ minX: x0 - t, maxX: x1 + t, minZ: z0 - t, maxZ: z0 + t, minY: y0, maxY: top, mat: 'wall' });
      solids.push({ minX: x0 - t, maxX: x1 + t, minZ: z1 - t, maxZ: z1 + t, minY: y0, maxY: top, mat: 'wall' });
      solids.push({ minX: x0 - t, maxX: x0 + t, minZ: z0, maxZ: z1, minY: y0, maxY: top, mat: 'wall' });
      solids.push({ minX: x1 - t, maxX: x1 + t, minZ: z0, maxZ: z1, minY: y0, maxY: top, mat: 'wall' });
    } else ceilings.push({ x0: 0, z0: 0, x1: S, z1: S, y: H });
    if (out.holes.length) {
      const h = out.holes[0];
      floors.push(...frame(S, h.x0, h.z0, h.x1, h.z1, 0));
    } else floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
    floors.push(...out.floors);
    solids.push(...out.solids);
    decor.push(...out.decor);
    lights.push(...out.panels);
    items.push(...out.items);
    props.push(...out.props);
    zones.push({ kind: 'piece', name: piece.def.id, x0, z0, x1, z1 });
  } else {
    ceilings.push({ x0: 0, z0: 0, x1: S, z1: S, y: H });
    floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
  }

  if (p.noCeiling) ceilings.length = 0;
  if (p.waterY !== undefined) decor.push({ minX: 0, maxX: S, minY: p.waterY - 0.01, maxY: p.waterY, minZ: 0, maxZ: S, mat: 'water-shallow' });
  return { levelId: ctx.level.id, cx, cz, size: S, solids, decor, lights, floors, ceilings, items, props, zones };
}

/** The chunk square minus an inner rectangle, as four rectangles at height y. */
function frame(S: number, x0: number, z0: number, x1: number, z1: number, y: number): CeilingRect[] {
  return [
    { x0: 0, z0: 0, x1: S, z1: z0, y },
    { x0: 0, z0: z1, x1: S, z1: S, y },
    { x0: 0, z0, x1: x0, z1, y },
    { x0: x1, z0, x1: S, z1, y },
  ];
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
  // Point lights contributed by set pieces in this and neighbouring chunks (world coords).
  const extra: Array<{ x: number; y: number; z: number; I: number }> = [];
  const S = C * p.cellsPerChunk;
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const piece = gridPieceForChunk(seed, p, cx + dx, cz + dz);
      if (!piece) continue;
      for (const l of buildGridPiece(seed, p, piece).lights) extra.push({ x: l.x + (cx + dx) * S, y: l.y, z: l.z + (cz + dz) * S, I: l.I });
    }
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
    for (const l of extra) {
      const dx = l.x - wx;
      const dy = l.y - wy;
      const dz = l.z - wz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 900) continue;
      const d = Math.sqrt(d2) || 1;
      let ndl = (nx * dx + ny * dy + nz * dz) / d;
      if (ny < -0.5) ndl = Math.max(ndl, 0.35);
      if (ndl <= 0) continue;
      sum += (l.I * ndl * 9) / (d2 + 3);
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
  let gx = cx * p.cellsPerChunk + i;
  const gz = cz * p.cellsPerChunk + j;
  while (gridPieceAtCell(seed, p, gx, gz) || gridThinFloor(seed, p, gx, gz)) gx++;
  return {
    x: gx * C + C / 2,
    y: 0,
    z: gz * C + C / 2,
    yaw: Math.floor(hash01(seed, Salt.Arrival, entryHash, 5) * 4) * (Math.PI / 2),
  };
}
