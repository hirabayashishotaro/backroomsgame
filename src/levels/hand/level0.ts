/**
 * Level 0 — The Lobby.
 * Yellow wallpaper maze built with the edge-hash method (SPEC §3.2):
 * every cell edge decides "wall / wall with doorway / open" from a hash of its
 * global coordinates, so neighbouring chunks always agree on shared edges.
 *
 * Set pieces (SPEC §3.5) are placed with feature cells of 4x4 chunks. Each set
 * piece lives strictly inside one chunk (cells 1..6), so every edge it touches
 * is owned by that chunk and chunk borders stay consistent.
 */
import { hash01, hashInts } from '../../core/rng';
import type { Box, CeilingRect, ChunkData, ItemSpawn, LightPanel, Prop, Zone, ZoneKind } from '../../world/chunkData';
import type { GenContext, LevelDefinition, LightSampler, SpawnPoint } from '../levelDefinition';
import { ALMOND_ONLY, pickLoot } from '../../items/lootTables';
import type { ItemId } from '../../items/itemDefs';

export const CELL = 4; // metres per maze cell
export const CELLS_PER_CHUNK = 8; // 32m chunk
export const WALL_T = 0.2; // wall thickness
export const FEATURE_CELL = 4; // chunks per feature cell side
export const HIGH_CEILING = 9;
const H0 = 3; // normal ceiling height
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
  Feature = 18,
  Loot = 19,
  LootPos = 20,
  PieceDoor = 21,
  Thin = 22,
  Arrival = 23,
  ThinFloor = 24,
}

export type EdgeKind = 0 | 1 | 2; // open | wall | wall with doorway

// ---------------------------------------------------------------------------
// Set pieces
// ---------------------------------------------------------------------------

export type PieceKind = Exclude<ZoneKind, 'spawn' | 'thin-floor' | 'piece' | 'gate'>;

export interface Piece {
  kind: PieceKind;
  /** Global cell rectangle (inclusive). */
  gx0: number;
  gz0: number;
  gx1: number;
  gz1: number;
  /** Which border side holds the entrance: 0=N(-z) 1=E(+x) 2=S(+z) 3=W(-x). */
  door: number;
  /** Position along the entrance side (cell offset). */
  doorAt: number;
}

const PIECE_KINDS: PieceKind[] = ['manila', 'high-hall', 'light-corridor', 'chalk-room', 'exit-door', 'glass-door'];
const PIECE_WEIGHTS = [3, 2, 2, 2, 2, 1.5];
const PIECE_SIZE: Record<PieceKind, [number, number]> = {
  manila: [2, 2],
  'high-hall': [4, 4],
  'light-corridor': [1, 5],
  'chalk-room': [3, 2],
  'exit-door': [1, 1],
  'glass-door': [1, 1],
};

const pieceCache = new Map<string, Piece | null>();

/** The set piece hosted by chunk (cx,cz), if any. Deterministic and cached. */
export function pieceForChunk(seed: number, cx: number, cz: number): Piece | null {
  const key = seed + ':' + cx + ',' + cz;
  const hit = pieceCache.get(key);
  if (hit !== undefined) return hit;
  if (pieceCache.size > 4096) pieceCache.clear();

  const fx = Math.floor(cx / FEATURE_CELL);
  const fz = Math.floor(cz / FEATURE_CELL);
  const count = 1 + (hash01(seed, Salt.Feature, fx, fz) < 0.5 ? 1 : 0);
  const n = FEATURE_CELL * FEATURE_CELL;
  // Distinct host chunks and distinct kinds within the feature cell.
  const slotA = Math.floor(hash01(seed, Salt.Feature, fx, fz, 1) * n);
  const slotB = (slotA + 1 + Math.floor(hash01(seed, Salt.Feature, fx, fz, 2) * (n - 1))) % n;
  const local = (cx - fx * FEATURE_CELL) * FEATURE_CELL + (cz - fz * FEATURE_CELL);
  let which = -1;
  if (local === slotA) which = 0;
  else if (count > 1 && local === slotB) which = 1;
  let piece: Piece | null = null;
  if (which >= 0) {
    const kindA = weightedKind(hash01(seed, Salt.Feature, fx, fz, 3));
    let kind = kindA;
    if (which === 1) {
      kind = weightedKind(hash01(seed, Salt.Feature, fx, fz, 4));
      if (kind === kindA) kind = PIECE_KINDS[(PIECE_KINDS.indexOf(kind) + 1) % PIECE_KINDS.length];
    }
    let [w, d] = PIECE_SIZE[kind];
    if (hash01(seed, Salt.Feature, cx, cz, 5) < 0.5) [w, d] = [d, w];
    // Keep inside cells 1..6 of the chunk.
    const ix = 1 + Math.floor(hash01(seed, Salt.Feature, cx, cz, 6) * (6 - w + 1));
    const iz = 1 + Math.floor(hash01(seed, Salt.Feature, cx, cz, 7) * (6 - d + 1));
    const gx0 = cx * CELLS_PER_CHUNK + ix;
    const gz0 = cz * CELLS_PER_CHUNK + iz;
    const door = Math.floor(hash01(seed, Salt.PieceDoor, cx, cz) * 4);
    const sideLen = door === 0 || door === 2 ? w : d;
    piece = {
      kind,
      gx0,
      gz0,
      gx1: gx0 + w - 1,
      gz1: gz0 + d - 1,
      door,
      doorAt: Math.floor(hash01(seed, Salt.PieceDoor, cx, cz, 1) * sideLen),
    };
  }
  pieceCache.set(key, piece);
  return piece;
}

function weightedKind(u: number): PieceKind {
  const total = PIECE_WEIGHTS.reduce((a, b) => a + b, 0);
  let x = u * total;
  for (let i = 0; i < PIECE_KINDS.length; i++) {
    x -= PIECE_WEIGHTS[i];
    if (x < 0) return PIECE_KINDS[i];
  }
  return PIECE_KINDS[0];
}

function chunkOfCell(g: number): number {
  return Math.floor(g / CELLS_PER_CHUNK);
}

function inRect(p: Piece, gx: number, gz: number): boolean {
  return gx >= p.gx0 && gx <= p.gx1 && gz >= p.gz0 && gz <= p.gz1;
}

/**
 * Edge override from a set piece. Returns undefined when the piece does not
 * affect this edge. `axis` 'x' = wallX(gx,gz) (west edge of cell gx,gz).
 */
function pieceEdge(p: Piece, axis: 'x' | 'z', gx: number, gz: number): EdgeKind | undefined {
  if (axis === 'x') {
    if (gz < p.gz0 || gz > p.gz1 || gx < p.gx0 || gx > p.gx1 + 1) return undefined;
    const west = gx === p.gx0;
    const east = gx === p.gx1 + 1;
    if (!west && !east) return 0; // interior
    const side = west ? 3 : 1;
    return borderEdge(p, side, gz - p.gz0);
  } else {
    if (gx < p.gx0 || gx > p.gx1 || gz < p.gz0 || gz > p.gz1 + 1) return undefined;
    const north = gz === p.gz0;
    const south = gz === p.gz1 + 1;
    if (!north && !south) return 0;
    const side = north ? 0 : 2;
    return borderEdge(p, side, gx - p.gx0);
  }
}

function borderEdge(p: Piece, side: number, at: number): EdgeKind | undefined {
  switch (p.kind) {
    case 'manila':
    case 'chalk-room':
      return side === p.door && at === p.doorAt ? 2 : 1;
    case 'high-hall':
      return undefined; // open hall blends into the maze
    case 'light-corridor':
      // Long sides closed; one short end open, the other a dead end.
      return side === corridorOpenSide(p) ? 0 : 1;
    case 'exit-door':
    case 'glass-door':
      // The door is mounted on a solid wall on the `door` side.
      return side === p.door ? 1 : undefined;
  }
}

/** The open end of a light corridor (one of its two short sides). */
export function corridorOpenSide(p: Piece): number {
  const thinX = p.gx1 === p.gx0; // 1 cell wide in x => short sides are N/S
  const shorts = thinX ? [0, 2] : [1, 3];
  return shorts[p.door % 2];
}

function edge(seed: number, salt: Salt, gx: number, gz: number, epoch = 0): EdgeKind {
  const r = regionType(seed, gx, gz);
  const p = r === 'maze' ? 0.55 : r === 'open' ? 0.08 : 0.32;
  // Non-Euclidean drift (SPEC §3.4): later epochs reshuffle the walls of newly
  // generated chunks. Every edge is still built by exactly one chunk, so chunk
  // borders always agree; region types (density) stay the same.
  const h = epoch ? hash01(seed, salt, gx, gz, epoch) : hash01(seed, salt, gx, gz);
  if (h >= p) return 0;
  const doorP = r === 'maze' ? 0.45 : 0.3;
  return h < p * doorP ? 2 : 1;
}

/** Region type for a 4x4 block of cells: shapes the local maze density. */
export function regionType(seed: number, gx: number, gz: number): 'maze' | 'normal' | 'open' {
  const h = hash01(seed, Salt.Region, Math.floor(gx / 4), Math.floor(gz / 4));
  if (h < 0.22) return 'open';
  if (h < 0.55) return 'maze';
  return 'normal';
}

/** Edge on the line x = gx*CELL, spanning cell row gz (west edge of cell gx,gz). */
export function wallX(seed: number, gx: number, gz: number, epoch = 0): EdgeKind {
  const p = pieceForChunk(seed, chunkOfCell(gx), chunkOfCell(gz));
  if (p) {
    const o = pieceEdge(p, 'x', gx, gz);
    if (o !== undefined) return o;
  }
  return edge(seed, Salt.WallX, gx, gz, epoch);
}
/** Edge on the line z = gz*CELL, spanning cell column gx (north edge of cell gx,gz). */
export function wallZ(seed: number, gx: number, gz: number, epoch = 0): EdgeKind {
  const p = pieceForChunk(seed, chunkOfCell(gx), chunkOfCell(gz));
  if (p) {
    const o = pieceEdge(p, 'z', gx, gz);
    if (o !== undefined) return o;
  }
  return edge(seed, Salt.WallZ, gx, gz, epoch);
}

function pieceAtCell(seed: number, gx: number, gz: number): Piece | null {
  const p = pieceForChunk(seed, chunkOfCell(gx), chunkOfCell(gz));
  return p && inRect(p, gx, gz) ? p : null;
}

export function hasPillar(seed: number, gx: number, gz: number): boolean {
  const p = pieceAtCell(seed, gx, gz);
  if (p) {
    // Four tall columns inside the high hall.
    if (p.kind === 'high-hall') return (gx - p.gx0 === 1 || gx - p.gx0 === 3) && (gz - p.gz0 === 1 || gz - p.gz0 === 3);
    return false;
  }
  // Corner pillar at (gx,gz) must not poke into a neighbouring piece.
  if (pieceAtCell(seed, gx - 1, gz - 1) || pieceAtCell(seed, gx - 1, gz) || pieceAtCell(seed, gx, gz - 1)) return false;
  return regionType(seed, gx, gz) === 'open' && hash01(seed, Salt.Pillar, gx, gz) < 0.35;
}

export interface CellLight {
  state: 0 | 1 | 2 | 3;
  intensity: number;
  y: number;
}

/** Ceiling light at the centre of cell (gx,gz), or null for no fixture. */
export function cellLight(seed: number, gx: number, gz: number): CellLight | null {
  const p = pieceAtCell(seed, gx, gz);
  if (p) {
    switch (p.kind) {
      case 'manila':
        // A single dim, orange light for the whole room.
        return gx === p.gx0 && gz === p.gz0 ? { state: 3, intensity: 0.75, y: H0 } : null;
      case 'high-hall':
        return (gx + gz) % 2 === 0 ? { state: 1, intensity: 6, y: HIGH_CEILING } : null;
      case 'light-corridor':
        return { state: 1, intensity: 1.5, y: H0 };
      case 'chalk-room':
        return gx === p.gx0 + 1 && gz === p.gz0 ? { state: 2, intensity: 0.8, y: H0 } : null;
      default:
        break;
    }
  }
  if (hash01(seed, Salt.Light, gx, gz) >= 0.42) return null;
  const s = hash01(seed, Salt.LightState, gx, gz);
  if (s < 0.06) return { state: 0, intensity: 0, y: H0 };
  if (s < 0.1) return { state: 2, intensity: 0.6, y: H0 };
  return { state: 1, intensity: 1, y: H0 };
}

// ---------------------------------------------------------------------------
// Chunk generation
// ---------------------------------------------------------------------------

function pushWallSegment(
  out: Box[],
  axis: 'x' | 'z',
  line: number,
  from: number,
  to: number,
  height: number,
  kind: EdgeKind,
  mat = 'wall',
  thick = WALL_T,
  thin = false,
): void {
  const t = thick / 2;
  const e = WALL_T / 2;
  const mk = (a: number, b: number, y0: number, y1: number): Box =>
    axis === 'x'
      ? { minX: line - t, maxX: line + t, minZ: a, maxZ: b, minY: y0, maxY: y1, mat }
      : { minZ: line - t, maxZ: line + t, minX: a, maxX: b, minY: y0, maxY: y1, mat };
  if (kind === 1) {
    const b = mk(from - e, to + e, 0, height);
    if (thin) {
      b.thin = true;
      b.mat = 'wall-thin';
    }
    out.push(b);
    return;
  }
  const mid = (from + to) / 2;
  out.push(mk(from - e, mid - DOOR_W / 2, 0, height));
  out.push(mk(mid + DOOR_W / 2, to + e, 0, height));
  out.push(mk(mid - DOOR_W / 2, mid + DOOR_W / 2, DOOR_H, height));
}

/** Thin inner lining along a piece's border (gives rooms their own wallpaper). */
function pushLining(out: Box[], seed: number, p: Piece, ox: number, oz: number, mat: string): void {
  const off = WALL_T / 2 + 0.012;
  const thick = 0.02;
  const x0 = p.gx0 * CELL - ox;
  const x1 = (p.gx1 + 1) * CELL - ox;
  const z0 = p.gz0 * CELL - oz;
  const z1 = (p.gz1 + 1) * CELL - oz;
  for (let gz = p.gz0; gz <= p.gz1; gz++) {
    const a = gz * CELL - oz;
    const k1 = wallX(seed, p.gx0, gz);
    if (k1) pushWallSegment(out, 'x', x0 + off, a + off, a + CELL - off, H0, k1, mat, thick);
    const k2 = wallX(seed, p.gx1 + 1, gz);
    if (k2) pushWallSegment(out, 'x', x1 - off, a + off, a + CELL - off, H0, k2, mat, thick);
  }
  for (let gx = p.gx0; gx <= p.gx1; gx++) {
    const a = gx * CELL - ox;
    const k1 = wallZ(seed, gx, p.gz0);
    if (k1) pushWallSegment(out, 'z', z0 + off, a + off, a + CELL - off, H0, k1, mat, thick);
    const k2 = wallZ(seed, gx, p.gz1 + 1);
    if (k2) pushWallSegment(out, 'z', z1 - off, a + off, a + CELL - off, H0, k2, mat, thick);
  }
}

/** Centre of a piece's door side wall and the inward-facing rotation. */
function doorWall(p: Piece, ox: number, oz: number): { x: number; z: number; rotY: number } {
  const cxm = ((p.gx0 + p.gx1 + 1) / 2) * CELL - ox;
  const czm = ((p.gz0 + p.gz1 + 1) / 2) * CELL - oz;
  const f = WALL_T / 2 + 0.02;
  switch (p.door) {
    case 0:
      return { x: cxm, z: p.gz0 * CELL - oz + f, rotY: 0 }; // faces +Z
    case 1:
      return { x: (p.gx1 + 1) * CELL - ox - f, z: czm, rotY: -Math.PI / 2 }; // faces -X
    case 2:
      return { x: cxm, z: (p.gz1 + 1) * CELL - oz - f, rotY: Math.PI }; // faces -Z
    default:
      return { x: p.gx0 * CELL - ox + f, z: czm, rotY: Math.PI / 2 }; // faces +X
  }
}

/** A floor patch that gives way (SPEC §5.2 floor), never inside set pieces. */
export function isThinFloor(seed: number, gx: number, gz: number): boolean {
  return !pieceAtCell(seed, gx, gz) && hash01(seed, Salt.ThinFloor, gx, gz) < 0.006;
}

export function isThinWall(seed: number, axis: number, gx: number, gz: number): boolean {
  return hash01(seed, Salt.Thin, axis, gx, gz) < 0.012;
}

export function generateLevel0(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const H = ctx.level.ceilingHeight;
  const S = ctx.level.chunkSize;
  const solids: Box[] = [];
  const decor: Box[] = [];
  const lights: LightPanel[] = [];
  const items: ItemSpawn[] = [];
  const props: Prop[] = [];
  const zones: Zone[] = [];
  const ceilings: CeilingRect[] = [];
  const gx0 = cx * CELLS_PER_CHUNK;
  const gz0 = cz * CELLS_PER_CHUNK;
  const ox = cx * S;
  const oz = cz * S;
  const piece = pieceForChunk(seed, cx, cz);

  for (let i = 0; i < CELLS_PER_CHUNK; i++) {
    for (let j = 0; j < CELLS_PER_CHUNK; j++) {
      const gx = gx0 + i;
      const gz = gz0 + j;
      const lx = i * CELL;
      const lz = j * CELL;
      const wx = wallX(seed, gx, gz, ctx.epoch ?? 0);
      const wz = wallZ(seed, gx, gz, ctx.epoch ?? 0);
      // Thin walls (noclip, SPEC §5.2) only in the plain maze, never on set pieces.
      const thinX = !piece && wx === 1 && isThinWall(seed, 0, gx, gz);
      const thinZ = !piece && wz === 1 && isThinWall(seed, 1, gx, gz);
      if (wx) pushWallSegment(solids, 'x', lx, lz, lz + CELL, H, wx, 'wall', WALL_T, thinX);
      if (wz) pushWallSegment(solids, 'z', lz, lx, lx + CELL, H, wz, 'wall', WALL_T, thinZ);

      if (wx === 1 && !piece && hash01(seed, Salt.Outlet, gx, gz) < 0.12) {
        const side = hashInts(seed, Salt.Outlet, gz, gx) & 1 ? 1 : -1;
        const z = lz + CELL * 0.3;
        const x = lx + side * (WALL_T / 2 + 0.01);
        decor.push({ minX: x - 0.01, maxX: x + 0.01, minY: 0.3, maxY: 0.42, minZ: z - 0.04, maxZ: z + 0.04, mat: 'outlet' });
      }

      if (hasPillar(seed, gx, gz)) {
        const tall = piece?.kind === 'high-hall' && inRect(piece, gx, gz);
        const s = tall ? 0.45 : 0.35;
        solids.push({ minX: lx - s, maxX: lx + s, minZ: lz - s, maxZ: lz + s, minY: 0, maxY: tall ? HIGH_CEILING : H, mat: 'pillar' });
      }

      const L = cellLight(seed, gx, gz);
      if (L) {
        if (piece?.kind === 'light-corridor' && inRect(piece, gx, gz)) {
          // Tubes packed end to end along the corridor.
          const alongX = piece.gz0 === piece.gz1;
          for (const o of [-1.3, 0, 1.3])
            lights.push({
              x: lx + CELL / 2 + (alongX ? o : 0),
              y: L.y - 0.02,
              z: lz + CELL / 2 + (alongX ? 0 : o),
              w: alongX ? 1.2 : 0.6,
              d: alongX ? 0.6 : 1.2,
              state: L.state,
            });
        } else lights.push({ x: lx + CELL / 2, y: L.y - 0.02, z: lz + CELL / 2, w: 0.6, d: 1.2, state: L.state });
      }

      if (isThinFloor(seed, gx, gz)) {
        const fx = lx + CELL / 2;
        const fz = lz + CELL / 2;
        decor.push({ minX: fx - 0.9, maxX: fx + 0.9, minY: 0.002, maxY: 0.008, minZ: fz - 0.9, maxZ: fz + 0.9, mat: 'floor-thin' });
        zones.push({ kind: 'thin-floor', x0: fx - 0.9, z0: fz - 0.9, x1: fx + 0.9, z1: fz + 0.9 });
      }

      // Loot (not inside set pieces; those get curated items below).
      if (!(piece && inRect(piece, gx, gz)) && hash01(seed, Salt.Loot, gx, gz) < ctx.level.lootTable.perCell) {
        const id = pickLoot(ctx.level.lootTable.rules, hash01(seed, Salt.Loot, gx, gz, 1));
        items.push({
          uid: `${i},${j}`,
          id,
          x: lx + 0.8 + hash01(seed, Salt.LootPos, gx, gz) * (CELL - 1.6),
          y: 0,
          z: lz + 0.8 + hash01(seed, Salt.LootPos, gx, gz, 1) * (CELL - 1.6),
          rot: hash01(seed, Salt.LootPos, gx, gz, 2) * Math.PI * 2,
        });
      }
    }
  }

  // Ceiling: whole chunk, minus a raised section over a high hall.
  if (piece?.kind === 'high-hall') {
    const x0 = piece.gx0 * CELL - ox;
    const x1 = (piece.gx1 + 1) * CELL - ox;
    const z0 = piece.gz0 * CELL - oz;
    const z1 = (piece.gz1 + 1) * CELL - oz;
    ceilings.push({ x0: 0, z0: 0, x1: S, z1: z0, y: H });
    ceilings.push({ x0: 0, z0: z1, x1: S, z1: S, y: H });
    ceilings.push({ x0: 0, z0, x1: x0, z1, y: H });
    ceilings.push({ x0: x1, z0, x1: S, z1, y: H });
    ceilings.push({ x0, z0, x1, z1, y: HIGH_CEILING });
    // Upper walls of the shaft (above the normal ceiling).
    const t = WALL_T / 2;
    const y0 = H - 0.01;
    solids.push({ minX: x0 - t, maxX: x1 + t, minZ: z0 - t, maxZ: z0 + t, minY: y0, maxY: HIGH_CEILING, mat: 'wall' });
    solids.push({ minX: x0 - t, maxX: x1 + t, minZ: z1 - t, maxZ: z1 + t, minY: y0, maxY: HIGH_CEILING, mat: 'wall' });
    solids.push({ minX: x0 - t, maxX: x0 + t, minZ: z0, maxZ: z1, minY: y0, maxY: HIGH_CEILING, mat: 'wall' });
    solids.push({ minX: x1 - t, maxX: x1 + t, minZ: z0, maxZ: z1, minY: y0, maxY: HIGH_CEILING, mat: 'wall' });
  } else {
    ceilings.push({ x0: 0, z0: 0, x1: S, z1: S, y: H });
  }

  if (piece) {
    const rect = {
      x0: piece.gx0 * CELL - ox,
      z0: piece.gz0 * CELL - oz,
      x1: (piece.gx1 + 1) * CELL - ox,
      z1: (piece.gz1 + 1) * CELL - oz,
    };
    zones.push({ kind: piece.kind, ...rect });
    const midX = (rect.x0 + rect.x1) / 2;
    const midZ = (rect.z0 + rect.z1) / 2;
    const uid = (n: number) => `p${n}`;
    const put = (id: ItemId, x: number, z: number, n: number) =>
      items.push({ uid: uid(n), id, x, y: 0, z, rot: hash01(seed, Salt.LootPos, cx, cz, n) * 6.28 });
    switch (piece.kind) {
      case 'manila':
        pushLining(decor, seed, piece, ox, oz, 'wall-manila');
        break;
      case 'chalk-room':
        pushLining(decor, seed, piece, ox, oz, 'chalk-graffiti');
        put('almond_water', midX, midZ, 1);
        break;
      case 'light-corridor': {
        // Reward at the dead end.
        const w = doorWall({ ...piece, door: (corridorOpenSide(piece) + 2) % 4 }, ox, oz);
        const back = { x: midX - w.x, z: midZ - w.z };
        const bl = Math.hypot(back.x, back.z) || 1;
        put('almond_water', w.x + (back.x / bl) * 1.2, w.z + (back.z / bl) * 1.2, 1);
        break;
      }
      case 'high-hall':
        put('almond_water', midX + 1.5, midZ + 0.5, 1);
        break;
      case 'exit-door':
      case 'glass-door': {
        const w = doorWall(piece, ox, oz);
        props.push({ uid: uid(0), kind: piece.kind, x: w.x, y: 0, z: w.z, rotY: w.rotY });
        break;
      }
    }
  }

  return { levelId: ctx.level.id, cx, cz, size: S, solids, decor, lights, floors: [{ x0: 0, z0: 0, x1: S, z1: S, y: 0 }], ceilings, items, props, zones };
}

/** Baked lighting from the ceiling panels around a chunk (cached grid lookup). */
export function level0LightSampler(ctx: GenContext, cx: number, cz: number): LightSampler {
  const seed = ctx.levelSeed;
  const pad = 2;
  const n = CELLS_PER_CHUNK + pad * 2;
  const gx0 = cx * CELLS_PER_CHUNK - pad;
  const gz0 = cz * CELLS_PER_CHUNK - pad;
  const gridI = new Float32Array(n * n);
  const gridY = new Float32Array(n * n);
  // Enclosed rooms (manila, chalk room) neither receive nor leak light.
  const room = new Int32Array(n * n);
  const roomIds = new Map<Piece, number>();
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const L = cellLight(seed, gx0 + i, gz0 + j);
      gridI[i * n + j] = L ? L.intensity : 0;
      gridY[i * n + j] = L ? L.y : 0;
      const p = pieceAtCell(seed, gx0 + i, gz0 + j);
      if (p && (p.kind === 'manila' || p.kind === 'chalk-room')) {
        if (!roomIds.has(p)) roomIds.set(p, roomIds.size + 1);
        room[i * n + j] = roomIds.get(p)!;
      }
    }
  const roomOf = (wx: number, wz: number) => {
    const i = Math.floor(wx / CELL) - gx0;
    const j = Math.floor(wz / CELL) - gz0;
    return i < 0 || j < 0 || i >= n || j >= n ? 0 : room[i * n + j];
  };
  const amb = ctx.level.palette.ambient;
  return (wx, wy, wz, nx, ny, nz) => {
    const cgx = Math.floor(wx / CELL);
    const cgz = Math.floor(wz / CELL);
    // Points exactly on a room wall: decide by the side the normal faces.
    const myRoom = roomOf(wx + nx * 0.2, wz + nz * 0.2);
    let sum = 0;
    for (let di = -2; di <= 2; di++)
      for (let dj = -2; dj <= 2; dj++) {
        const gi = cgx + di - gx0;
        const gj = cgz + dj - gz0;
        if (gi < 0 || gj < 0 || gi >= n || gj >= n) continue;
        const I = gridI[gi * n + gj];
        if (!I || room[gi * n + gj] !== myRoom) continue;
        const lx = (gi + gx0) * CELL + CELL / 2;
        const lz = (gj + gz0) * CELL + CELL / 2;
        const dx = lx - wx;
        const dy = gridY[gi * n + gj] - 0.05 - wy;
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

/** Arrival at a maze cell centre chosen from the entry hash, outside set pieces. */
export function level0Arrival(ctx: GenContext, entryHash: number): SpawnPoint {
  const seed = ctx.levelSeed;
  const range = 40; // cells
  let gx = Math.floor(hash01(seed, Salt.Arrival, entryHash, 1) * (range * 2 + 1)) - range;
  const gz = Math.floor(hash01(seed, Salt.Arrival, entryHash, 2) * (range * 2 + 1)) - range;
  while (pieceAtCell(seed, gx, gz) || isThinFloor(seed, gx, gz)) gx++;
  return {
    x: gx * CELL + CELL / 2,
    y: 0,
    z: gz * CELL + CELL / 2,
    yaw: Math.floor(hash01(seed, Salt.Arrival, entryHash, 3) * 4) * (Math.PI / 2),
  };
}

export const level0: LevelDefinition = {
  id: '0',
  title: 'Level 0',
  name: 'ロビー',
  subtitle: 'The Lobby',
  threatClass: 1,
  chunkSize: CELL * CELLS_PER_CHUNK,
  ceilingHeight: H0,
  palette: {
    wallTex: 'wallpaper-yellow',
    floorTex: 'carpet-damp',
    ceilingTex: 'ceiling-tile',
    lightColor: 0xfffbe6,
    fogColor: 0x2a2614,
    fogDensity: 0.045,
    ambient: 0.1,
    lightTint: [1.0, 0.97, 0.82],
  },
  generator: generateLevel0,
  lightSampler: level0LightSampler,
  setPieces: [
    { id: 'manila', name: 'マニラ・ルーム', desc: '照明がひとつだけの、オレンジがかった薄暗い部屋。長居すると、どこか別の場所に立っている。' },
    { id: 'high-hall', name: '天井の高い広間', desc: '天井が突然高くなる広間。太い柱が並び、足音がよく響く。' },
    { id: 'light-corridor', name: '蛍光灯の行き止まり', desc: '蛍光灯だけがびっしり並んだ、まぶしい行き止まりの通路。' },
    { id: 'chalk-room', name: '落書きの部屋', desc: '壁一面にチョークの矢印や記号が書かれた部屋。誰が書いたのかは分からない。' },
    { id: 'exit-door', name: '壁の非常口', desc: '緑の表示灯がついた非常口。開くと、階段の匂いがした。' },
    { id: 'glass-door', name: 'ガラスの引き戸', desc: '温室のような、曇りガラスの引き戸。向こう側がぼんやり緑に光っている。' },
  ],
  lootTable: { perCell: 0.014, rules: ALMOND_ONLY },
  exits: [
    { kind: 'walk', distance: 1500, targets: [{ levelId: '1', weight: 1 }], discovery: '長いあいだ歩き続けると、壁紙がコンクリートに変わっていった。' },
    {
      kind: 'special',
      zone: 'manila',
      seconds: 10,
      targets: [
        { levelId: '1', weight: 1 },
        { levelId: '2', weight: 1 },
      ],
      discovery: 'オレンジ色の部屋に長くいたら、気づくと別の場所にいた。',
    },
    {
      kind: 'wall',
      push: 2.5,
      targets: [
        { levelId: '139', weight: 8 },
        { levelId: '1', weight: 1 },
      ],
      discovery: '色の薄い壁に体を押しつけ続けたら、すり抜けた。',
    },
    {
      kind: 'floor',
      targets: [
        { levelId: '27', weight: 9 },
        { levelId: 'void', weight: 1 },
      ],
      discovery: '色の違う床に立っていたら、床が沈んで落ちていった。',
    },
    {
      kind: 'door',
      prop: 'exit-door',
      targets: [
        { levelId: '14', weight: 6 },
        { levelId: '5', weight: 1 },
      ],
      discovery: '壁に埋まった非常口は、本当に開いた。',
    },
    {
      kind: 'door',
      prop: 'glass-door',
      targets: [{ levelId: '13', weight: 1 }],
      discovery: '曇りガラスの引き戸の向こうは温室だった。',
    },
  ],
  drainMul: 1,
  hallucination: 1.6,
  footstep: 'carpet',
  ambience: { humFreq: 60, humGain: 0.12, noiseGain: 0.025, noiseCutoff: 900 },
  environment: 'enclosed',
  kindLabel: '屋内迷路(手作り)',
  spawn: { x: CELL / 2, y: 0, z: CELL / 2, yaw: 0 },
  arrival: level0Arrival,
};
