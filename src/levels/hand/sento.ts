/**
 * The endless Showa bathhouse (user request), original layout. Every 32 m
 * chunk is one room; a doorway in the middle of each wall joins it to its
 * neighbours, and some neighbouring halls merge into one big hall (2 x 1,
 * 1 x 2, L-shapes). Rooms come in kinds, each laid out at random:
 *
 *  - Bath hall: white tiles and pale aqua paint, a painted mountain mural
 *    over one doorway, 1-4 baths of different sizes and waters (hot, milky,
 *    herb, cold), washing places in rows or islands, a random ceiling height.
 *  - Open-air bath (rotenburo): rock-edged pools of steaming water under the
 *    sky, a board fence, trees, stone lanterns, a little roof, a bench.
 *  - Sauna: a big cedar room with three tiers of benches lit from beneath, a
 *    caged stove, a glass wall.
 *  - Cold bath and jet baths in aqua tile.
 *  - Changing room: wooden lockers, baskets, benches, a milk fridge.
 *
 * Somewhere a washbowl is set down on the tiles: ka-poon.
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { ChunkData } from '../../world/chunkData';
import type { LevelDefinition } from '../levelDefinition';
import { ALMOND_ONLY } from '../../items/lootTables';
import { box, emptyOut, sampler, toChunk, type Light, type Out } from '../shapes/kit';

const S = 32;
const MID = 16;
/** Half-width of the doorways and of the free cross-shaped passage through every room. */
const DOOR = 1.2;
const LANE = 1.6;
export const SENTO_H = 7;
const T = 0.15; // half a shared wall

type Kind = 'hall' | 'rotenburo' | 'sauna' | 'cold' | 'changing';

// ---------------------------------------------------------------------------
// Pieces (also used by the random generator's feature library)
// ---------------------------------------------------------------------------

/**
 * A row of washing places along a line: a low tiled counter, a tap pair and a
 * mirror per place, a shower head, stools and washbowls. `dir` = which way
 * the bathers face (+1: toward +x, the counter on the -x side). Local coords.
 */
export function washRow(o: Out, x: number, z0: number, z1: number, dir: 1 | -1, seed: number, y = 0, back = true): void {
  const cx0 = dir === 1 ? x : x - 0.6;
  const cx1 = dir === 1 ? x + 0.6 : x;
  box(o.solids, cx0, y, z0, cx1, y + 0.55, z1, 'sento-tile');
  if (back) box(o.solids, dir === 1 ? x - 0.12 : x, y, z0, dir === 1 ? x : x + 0.12, y + 1.9, z1, 'sento-tile');
  let k = 0;
  for (let z = z0 + 0.8; z < z1 - 0.5; z += 1.5, k++) {
    box(o.solids, x + dir * 0.02 - 0.03, y + 0.72, z - 0.25, x + dir * 0.18 + 0.03, y + 0.8, z - 0.15, 'metal');
    box(o.solids, x + dir * 0.02 - 0.03, y + 0.72, z + 0.15, x + dir * 0.18 + 0.03, y + 0.8, z + 0.25, 'metal');
    box(o.decor, Math.min(x + dir * 0.005, x + dir * 0.015), y + 1.05, z - 0.3, Math.max(x + dir * 0.005, x + dir * 0.015), y + 1.6, z + 0.3, 'mirror');
    box(o.solids, x + dir * 0.02 - 0.03, y + 1.75, z - 0.04, x + dir * 0.22 + 0.03, y + 1.82, z + 0.04, 'metal');
    const r = hash01(seed, 5201, k, Math.round(x * 10));
    const sx = x + dir * 1.1;
    if (r < 0.75) box(o.solids, sx - 0.18, y, z - 0.18, sx + 0.18, y + 0.32, z + 0.18, r < 0.4 ? 'stool-white' : 'oke-yellow');
    if (r > 0.25) {
      const bx = r > 0.6 ? x + dir * 0.3 : sx + dir * 0.45;
      const by = r > 0.6 ? y + 0.55 : y;
      box(o.solids, bx - 0.16, by, z - 0.16, bx + 0.16, by + 0.17, z + 0.16, 'oke-yellow');
    }
  }
}

/** The same row running along x (bathers face +z or -z). */
function washRowX(o: Out, z: number, x0: number, x1: number, dir: 1 | -1, seed: number): void {
  const t = emptyOut();
  washRow(t, 0, x0, x1, dir, seed, 0, false);
  // Rotate: local (x, z) -> (z, x) maps the row onto the x axis.
  for (const list of [t.solids, t.decor] as const) {
    const dst = list === t.solids ? o.solids : o.decor;
    for (const b of list) dst.push({ ...b, minX: b.minZ, maxX: b.maxZ, minZ: z + b.minX, maxZ: z + b.maxX });
  }
}

/** A tiled bath (rim low enough to step over) of the given water. Local coords. */
export function bathTub(o: Out, x0: number, z0: number, x1: number, z1: number, y = 0, water = 'hot-spring', rim = 'sento-tile'): void {
  const r = 0.3;
  const h = 0.42;
  box(o.solids, x0, y, z0, x1, y + h, z0 + r, rim);
  box(o.solids, x0, y, z1 - r, x1, y + h, z1, rim);
  box(o.solids, x0, y, z0 + r, x0 + r, y + h, z1 - r, rim);
  box(o.solids, x1 - r, y, z0 + r, x1, y + h, z1 - r, rim);
  box(o.solids, x0 + r, y, z0 + r, x1 - r, y + 0.2, z0 + r + 0.5, rim);
  box(o.decor, x0 + r, y + 0.34, z0 + r, x1 - r, y + 0.38, z1 - r, water);
  o.zones.push({ kind: 'water', x0: x0 + r, z0: z0 + r, x1: x1 - r, z1: z1 - r });
}

/** A freestanding wall with the bathhouse mountain mural on both faces. Local coords, along x. */
export function muralWall(o: Out, x0: number, x1: number, z: number, evening: boolean, y = 0, h = 4.2): void {
  box(o.solids, x0, y, z - 0.1, x1, y + 1.6, z + 0.1, 'sento-tile');
  box(o.solids, x0, y + 1.6, z - 0.1, x1, y + h, z + 0.1, evening ? 'fuji-mural-evening' : 'fuji-mural');
}

/**
 * An open-air rock pool: an elliptical bath ringed with boulders of different
 * heights (some low enough to sit on), steaming water inside. Local coords.
 */
export function rockPool(o: Out, cx: number, cz: number, rx: number, rz: number, seed: number, y = 0, water = 'hot-spring'): void {
  // Water: strips approximating the ellipse
  const n = Math.max(3, Math.round(rz * 2));
  for (let i = 0; i < n; i++) {
    const z0 = cz - rz + (i / n) * 2 * rz;
    const z1 = cz - rz + ((i + 1) / n) * 2 * rz;
    const zm = (z0 + z1) / 2 - cz;
    const hw = rx * Math.sqrt(Math.max(0, 1 - (zm / rz) ** 2));
    if (hw < 0.4) continue;
    box(o.decor, cx - hw, y + 0.32, z0, cx + hw, y + 0.36, z1, water);
  }
  o.zones.push({ kind: 'water', x0: cx - rx * 0.7, z0: cz - rz * 0.7, x1: cx + rx * 0.7, z1: cz + rz * 0.7 });
  // Boulders around the edge
  const per = Math.PI * (rx + rz);
  const m = Math.max(8, Math.round(per / 1.3));
  for (let k = 0; k < m; k++) {
    const a = (k / m) * Math.PI * 2 + hash01(seed, 5301, k) * 0.2;
    const bx = cx + Math.cos(a) * rx;
    const bz = cz + Math.sin(a) * rz;
    const s = 0.5 + hash01(seed, 5302, k) * 0.55;
    const h = hash01(seed, 5303, k) < 0.25 ? 0.9 + hash01(seed, 5304, k) * 0.9 : 0.35 + hash01(seed, 5305, k) * 0.25;
    box(o.solids, bx - s, y, bz - s, bx + s, y + h, bz + s, hash01(seed, 5306, k) < 0.3 ? 'onsen-rock-red' : 'onsen-rock');
  }
}

/**
 * Sauna tiers: three wide cedar steps rising toward a wall (along x, rising
 * toward +z when `dir` = 1), each lip lit from beneath. Local coords.
 */
export function saunaTiers(o: Out, x0: number, x1: number, zWall: number, dir: 1 | -1, y = 0, step = 1.15): void {
  for (let i = 0; i < 3; i++) {
    const front = zWall - dir * (step * 3 + 0.15 - i * step);
    const za = Math.min(front, zWall);
    const zb = Math.max(front, zWall);
    box(o.solids, x0, y, za, x1, y + 0.45 * (i + 1), zb, 'cedar');
    // Warm light strip under the lip
    box(o.decor, x0, y + 0.45 * i + 0.02, Math.min(front, front - dir * 0.02), x1, y + 0.45 * i + 0.08, Math.max(front, front - dir * 0.02), 'sauna-glow');
  }
}

/** A sauna stove: stones heaped in a metal cage, glowing at the bottom. */
export function saunaStove(o: Out, x: number, z: number, lights: Light[], y = 0): void {
  for (const [dx, dz] of [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ])
    box(o.solids, x + dx - 0.03, y, z + dz - 0.03, x + dx + 0.03, y + 1.3, z + dz + 0.03, 'metal');
  box(o.solids, x - 0.6, y + 1.25, z - 0.6, x + 0.6, y + 1.32, z + 0.6, 'metal');
  box(o.solids, x - 0.42, y, z - 0.42, x + 0.42, y + 1.0, z + 0.42, 'onsen-rock');
  box(o.decor, x - 0.44, y + 0.1, z - 0.44, x + 0.44, y + 0.3, z + 0.44, 'sauna-glow');
  lights.push({ x, y: y + 1, z, I: 3 });
}

/** A bank of wooden lockers against a wall along x (doors facing +z when dir = 1). */
export function lockers(o: Out, x0: number, x1: number, zWall: number, dir: 1 | -1, y = 0): void {
  const zf = zWall + dir * 0.55;
  box(o.solids, x0, y, Math.min(zWall, zf), x1, y + 2.1, Math.max(zWall, zf), 'wood-dark');
  for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.6)
    for (const yy of [0.5, 1.2, 1.9]) box(o.decor, x - 0.05, y + yy - 0.05, Math.min(zf, zf + dir * 0.01), x + 0.05, y + yy + 0.05, Math.max(zf, zf + dir * 0.01), 'locker-tag');
}

// ---------------------------------------------------------------------------
// The map: which edges are open, what kind each room is
// ---------------------------------------------------------------------------

/** Is the wall between chunk (cx, cz) and (cx + 1, cz) removed (one big hall)? */
function openX(seed: number, cx: number, cz: number): boolean {
  return cx % 2 === 0 && hash01(seed, 5310, cx, cz) < 0.32;
}
/** Is the wall between chunk (cx, cz) and (cx, cz + 1) removed? */
function openZ(seed: number, cx: number, cz: number): boolean {
  return ((cz % 2) + 2) % 2 === 0 && hash01(seed, 5311, cx, cz) < 0.25;
}

function kindOf(seed: number, cx: number, cz: number): Kind {
  if (openX(seed, cx, cz) || openX(seed, cx - 1, cz) || openZ(seed, cx, cz) || openZ(seed, cx, cz - 1)) return 'hall';
  const r = hash01(seed, 5312, cx, cz);
  return r < 0.42 ? 'hall' : r < 0.62 ? 'rotenburo' : r < 0.78 ? 'sauna' : r < 0.89 ? 'cold' : 'changing';
}

/** The four quadrants beside the cross-shaped passage: [x0, z0, x1, z1]. */
const QUADS: Array<[number, number, number, number]> = [
  [0.4, 0.4, MID - LANE, MID - LANE],
  [MID + LANE, 0.4, S - 0.4, MID - LANE],
  [0.4, MID + LANE, MID - LANE, S - 0.4],
  [MID + LANE, MID + LANE, S - 0.4, S - 0.4],
];

interface Room {
  o: Out;
  lights: Light[];
}

/** The four walls of a room (each chunk builds its own half of a shared wall), doorways in the middle. */
function walls(o: Out, seed: number, cx: number, cz: number, H: number, mat: { low: string; high: string }, fence = false): void {
  const open = [openX(seed, cx - 1, cz), openX(seed, cx, cz), openZ(seed, cx, cz - 1), openZ(seed, cx, cz)]; // west, east, north, south
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    if (fence) {
      box(o.solids, x0, 0, z0, x1, 3, z1, 'fence-board');
      return;
    }
    box(o.solids, x0, 0, z0, x1, Math.min(2, H), z1, mat.low);
    if (H > 2) box(o.solids, x0, 2, z0, x1, H, z1, mat.high);
  };
  const lintel = (x0: number, z0: number, x1: number, z1: number) => {
    if (!fence && H > 2.4) box(o.solids, x0, 2.4, z0, x1, H, z1, mat.high);
  };
  // West / east (x = 0 / 32)
  for (const [isOpen, a, b] of [
    [open[0], 0, T],
    [open[1], S - T, S],
  ] as Array<[boolean, number, number]>) {
    if (isOpen) continue;
    seg(a, 0, b, MID - DOOR);
    seg(a, MID + DOOR, b, S);
    lintel(a, MID - DOOR, b, MID + DOOR);
  }
  for (const [isOpen, a, b] of [
    [open[2], 0, T],
    [open[3], S - T, S],
  ] as Array<[boolean, number, number]>) {
    if (isOpen) continue;
    seg(0, a, MID - DOOR, b);
    seg(MID + DOOR, a, S, b);
    lintel(MID - DOOR, a, MID + DOOR, b);
  }
}

/** Which walls of the chunk exist (for murals and windows): 'w' | 'e' | 'n' | 's'. */
function closedSides(seed: number, cx: number, cz: number): Array<'w' | 'e' | 'n' | 's'> {
  const out: Array<'w' | 'e' | 'n' | 's'> = [];
  if (!openX(seed, cx - 1, cz)) out.push('w');
  if (!openX(seed, cx, cz)) out.push('e');
  if (!openZ(seed, cx, cz - 1)) out.push('n');
  if (!openZ(seed, cx, cz)) out.push('s');
  return out;
}

const WATERS = ['hot-spring', 'hot-spring', 'hot-spring', 'milky-water', 'herb-water', 'cold-water', 'pool-water-mint'];

function bathHall(seed: number, cx: number, cz: number): Room {
  const o = emptyOut();
  const lights: Light[] = [];
  const rng = new Rng(hashInts(seed, 5320, cx, cz));
  const sides = closedSides(seed, cx, cz);
  const merged = sides.length < 4;
  const H = merged ? 7.5 : 5.5 + rng.float() * 3.5;
  walls(o, seed, cx, cz, H, { low: 'sento-tile', high: 'sento-paint' });
  o.floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
  // Ceiling: flat, or with a raised lantern down the middle.
  if (!merged && rng.chance(0.5)) {
    const R = H + 1.6;
    o.ceilings.push({ x0: 0, z0: 0, x1: 9, z1: S, y: H }, { x0: 23, z0: 0, x1: S, z1: S, y: H }, { x0: 9, z0: 0, x1: 23, z1: S, y: R });
    box(o.solids, 8.8, H, 0, 9, R, S, 'sento-paint');
    box(o.solids, 23, H, 0, 23.2, R, S, 'sento-paint');
    for (let z = 1.5; z < S - 2; z += 3.4) {
      box(o.decor, 9.01, H + 0.3, z, 9.03, R - 0.25, z + 2.6, 'daylight');
      box(o.decor, 22.97, H + 0.3, z, 22.99, R - 0.25, z + 2.6, 'daylight');
    }
    lights.push({ x: 16, y: R - 1, z: 10, I: 6 }, { x: 16, y: R - 1, z: 24, I: 6 });
  } else {
    o.ceilings.push({ x0: 0, z0: 0, x1: S, z1: S, y: H });
    lights.push({ x: 16, y: H - 1, z: 16, I: 5 });
  }
  for (const [x, z] of [
    [8, 8],
    [24, 8],
    [8, 24],
    [24, 24],
  ])
    o.panels.push({ x, y: H - 0.02, z, w: 0.3, d: 1.4, state: 1 });
  const muralSide = sides.length && H > 5 ? sides[rng.int(0, sides.length - 1)] : null;
  // High windows on the side walls that exist (not over the mural)
  for (const sd of sides.filter((q) => q !== muralSide))
    for (let u = 1.5; u < S - 2; u += 3.4) {
      if (Math.abs(u + 1.3 - MID) < 2.5) continue;
      const y0 = H - 2.2;
      const y1 = H - 0.5;
      if (y0 < 3) continue;
      if (sd === 'w') box(o.decor, T + 0.01, y0, u, T + 0.03, y1, u + 2.6, 'daylight');
      if (sd === 'e') box(o.decor, S - T - 0.03, y0, u, S - T - 0.01, y1, u + 2.6, 'daylight');
      if (sd === 'n') box(o.decor, u, y0, T + 0.01, u + 2.6, y1, T + 0.03, 'daylight');
      if (sd === 's') box(o.decor, u, y0, S - T - 0.03, u + 2.6, y1, S - T - 0.01, 'daylight');
    }
  // The mural over one doorway (its wall picked at random).
  if (muralSide) {
    const sd = muralSide;
    const mat = rng.chance(0.3) ? 'fuji-mural-evening' : 'fuji-mural';
    const y1 = Math.min(H - 0.4, 6.8);
    const w0 = 4 + rng.float() * 3;
    const w1 = S - w0;
    if (sd === 'n') box(o.decor, w0, 2.6, T + 0.005, w1, y1, T + 0.025, mat);
    if (sd === 's') box(o.decor, w0, 2.6, S - T - 0.025, w1, y1, S - T - 0.005, mat);
    if (sd === 'w') box(o.decor, T + 0.005, 2.6, w0, T + 0.025, y1, w1, mat);
    if (sd === 'e') box(o.decor, S - T - 0.025, 2.6, w0, S - T - 0.005, y1, w1, mat);
    o.zones.push({ kind: 'piece', name: 'mural', x0: 6, z0: 6, x1: 26, z1: 26 });
  }
  // Fill the quadrants: at least one bath and one row of washing places.
  const plan: string[] = ['bath', 'wash'];
  for (let i = 0; i < 2; i++) plan.push(rng.pick(['bath', 'bath', 'wash', 'wash', 'twin', 'island', 'oke']));
  // Shuffle
  for (let i = plan.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  QUADS.forEach(([x0, z0, x1, z1], qi) => {
    const what = plan[qi];
    const qw = x1 - x0;
    const qd = z1 - z0;
    const wallX = qi % 2 === 0 ? (sides.includes('w') ? x0 - 0.25 + T : null) : sides.includes('e') ? x1 + 0.25 - T : null;
    if (what === 'bath' || what === 'twin') {
      const n = what === 'twin' ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = (n === 1 ? 6 + rng.float() * (qw - 7) : (qw - 2) / 2) * 1;
        const d = 4 + rng.float() * (qd - 5.5);
        const bx = x0 + 0.6 + (n === 1 ? rng.float() * (qw - w - 1.2) : k * (w + 0.8));
        const bz = z0 + 0.6 + rng.float() * (qd - d - 1.2);
        bathTub(o, bx, bz, bx + w, bz + d, 0, rng.pick(WATERS));
        if (rng.chance(0.5)) box(o.solids, bx + w / 2 - 0.15, 0.9, bz - 0.05, bx + w / 2 + 0.15, 1.05, bz + 0.6, 'metal');
      }
      o.zones.push({ kind: 'piece', name: 'bath', x0, z0, x1, z1 });
    } else if (what === 'wash' && wallX !== null) {
      washRow(o, wallX, z0 + 0.5, z1 - 0.5, qi % 2 === 0 ? 1 : -1, hashInts(seed, cx, cz, qi));
      o.zones.push({ kind: 'piece', name: 'wash-row', x0, z0, x1, z1 });
    } else if (what === 'wash' || what === 'island') {
      // A tiled island with washing places on both faces, along x or along z.
      if (rng.chance(0.5)) {
        const xm = (x0 + x1) / 2;
        box(o.solids, xm - 0.15, 0, z0 + 1, xm + 0.15, 1.9, z1 - 1, 'sento-tile');
        washRow(o, xm - 0.15, z0 + 1, z1 - 1, -1, hashInts(seed, cx, cz, qi, 1), 0, false);
        washRow(o, xm + 0.15, z0 + 1, z1 - 1, 1, hashInts(seed, cx, cz, qi, 2), 0, false);
      } else {
        const zm = (z0 + z1) / 2;
        box(o.solids, x0 + 1, 0, zm - 0.15, x1 - 1, 1.9, zm + 0.15, 'sento-tile');
        washRowX(o, zm - 0.15, x0 + 1, x1 - 1, -1, hashInts(seed, cx, cz, qi, 3));
        washRowX(o, zm + 0.15, x0 + 1, x1 - 1, 1, hashInts(seed, cx, cz, qi, 4));
      }
      o.zones.push({ kind: 'piece', name: 'wash-row', x0, z0, x1, z1 });
    } else {
      // Washbowls and stools stacked by a bench, a potted palm
      box(o.solids, x0 + 1, 0, z0 + 1, x0 + 4, 0.45, z0 + 1.6, 'cedar');
      for (let i = 0; i < 6; i++) box(o.solids, x0 + 5 + (i % 3) * 0.45, Math.floor(i / 3) * 0.17, z0 + 1.2, x0 + 5.35 + (i % 3) * 0.45, Math.floor(i / 3) * 0.17 + 0.17, z0 + 1.55, i % 2 ? 'oke-yellow' : 'stool-white');
      box(o.solids, x1 - 1.6, 0, z1 - 1.6, x1 - 0.8, 0.7, z1 - 0.8, 'onsen-rock');
      box(o.decor, x1 - 2.2, 0.7, z1 - 2.2, x1 - 0.2, 1.8, z1 - 0.2, 'leaves-green');
    }
  });
  if (rng.chance(0.6)) o.items.push({ uid: 'sb', id: 'almond_water', x: MID + 0.6, y: 0, z: 3 + rng.float() * 8, rot: 0 });
  return { o, lights };
}

function rotenburo(seed: number, cx: number, cz: number): Room {
  const o = emptyOut();
  const lights: Light[] = [];
  const rng = new Rng(hashInts(seed, 5330, cx, cz));
  walls(o, seed, cx, cz, 3, { low: 'fence-board', high: 'fence-board' }, true);
  o.floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
  // Stone paving over the whole yard, stepping-stone paths along the passage.
  box(o.decor, 0, 0.004, 0, S, 0.012, S, 'path');
  // One big pool across two or three quadrants, or several smaller ones.
  if (rng.chance(0.5)) {
    const left = rng.chance(0.5);
    const xc = left ? (QUADS[0][0] + QUADS[0][2]) / 2 : (QUADS[1][0] + QUADS[1][2]) / 2;
    rockPool(o, xc, 7.5, 6.2, 6.2, hashInts(seed, cx, cz, 1), 0, rng.pick(['hot-spring', 'hot-spring', 'milky-water']));
    rockPool(o, left ? 24.6 : 7.4, 24.6, 4.4 + rng.float(), 4.4 + rng.float(), hashInts(seed, cx, cz, 2), 0, rng.pick(['hot-spring', 'herb-water', 'milky-water']));
  } else {
    for (let q = 0; q < 4; q++) {
      if (!rng.chance(0.65)) continue;
      const [x0, z0, x1, z1] = QUADS[q];
      rockPool(o, (x0 + x1) / 2, (z0 + z1) / 2, 3 + rng.float() * 2.4, 3 + rng.float() * 2.4, hashInts(seed, cx, cz, q + 3), 0, rng.pick(WATERS));
    }
  }
  // Trees along the fence, big boulders in corners, a stone lantern, a little roof, a bench, a bamboo spout.
  for (let k = 0; k < 6; k++) {
    const a = rng.int(0, 3);
    const u = 2 + rng.float() * 28;
    if (Math.abs(u - MID) < 3) continue;
    const x = a === 0 ? 1.2 : a === 1 ? S - 1.2 : u;
    const z = a === 2 ? 1.2 : a === 3 ? S - 1.2 : u;
    const h = 5 + rng.float() * 5;
    box(o.solids, x - 0.18, 0, z - 0.18, x + 0.18, h, z + 0.18, 'bark');
    const leaves = rng.pick(['leaves-green', 'leaves-green', 'leaves-lime', 'leaves-autumn']);
    box(o.decor, x - 2.4, h - 2.2, z - 2.4, x + 2.4, h - 0.6, z + 2.4, leaves);
    box(o.decor, x - 1.6, h - 0.6, z - 1.6, x + 1.6, h + 0.6, z + 1.6, leaves);
  }
  const lanX = MID + LANE + 0.6;
  const lanZ = MID + LANE + 0.6;
  box(o.solids, lanX - 0.25, 0, lanZ - 0.25, lanX + 0.25, 0.8, lanZ + 0.25, 'stone');
  box(o.solids, lanX - 0.4, 0.8, lanZ - 0.4, lanX + 0.4, 1.2, lanZ + 0.4, 'stone');
  box(o.decor, lanX - 0.2, 0.85, lanZ - 0.2, lanX + 0.2, 1.15, lanZ + 0.2, 'lantern');
  box(o.solids, lanX - 0.55, 1.2, lanZ - 0.55, lanX + 0.55, 1.38, lanZ + 0.55, 'stone');
  lights.push({ x: lanX, y: 1, z: lanZ, I: 1.5 });
  if (rng.chance(0.6)) {
    // A small roof over part of the yard
    const rx = rng.chance(0.5) ? 4 : 20;
    const rz = rng.chance(0.5) ? 2 : 20;
    for (const [dx, dz] of [
      [0, 0],
      [8, 0],
      [0, 8],
      [8, 8],
    ])
      box(o.solids, rx + dx - 0.12, 0, rz + dz - 0.12, rx + dx + 0.12, 3.2, rz + dz + 0.12, 'wood-dark');
    box(o.solids, rx - 0.6, 3.2, rz - 0.6, rx + 8.6, 3.45, rz + 8.6, 'wood-dark');
    o.zones.push({ kind: 'piece', name: 'azumaya', x0: rx, z0: rz, x1: rx + 8, z1: rz + 8 });
  }
  box(o.solids, MID - LANE - 1.6, 0, MID + LANE + 0.6, MID - LANE - 0.2, 0.45, MID + LANE + 1.2, 'cedar');
  o.zones.push({ kind: 'piece', name: 'rotenburo', x0: 0, z0: 0, x1: S, z1: S });
  if (rng.chance(0.6)) o.items.push({ uid: 'rb', id: 'almond_water', x: MID - LANE - 0.9, y: 0.45, z: MID + LANE + 0.9, rot: 0 });
  return { o, lights };
}

function sauna(seed: number, cx: number, cz: number): Room {
  const o = emptyOut();
  const lights: Light[] = [];
  const rng = new Rng(hashInts(seed, 5340, cx, cz));
  const H = 3.6 + rng.float() * 0.8;
  walls(o, seed, cx, cz, H, { low: 'cedar', high: 'cedar' });
  o.floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
  box(o.decor, 0, 0.004, 0, S, 0.012, S, 'cedar-dark');
  // Cedar ceiling (a solid slab: it blocks jumps like any ceiling)
  box(o.solids, 0, H, 0, S, H + 0.2, S, 'cedar');
  // Deep tiers along the back wall (rising toward +z) on both sides of the aisle...
  const step = 1.3 + rng.float() * 0.4;
  saunaTiers(o, 0.4, MID - LANE, S - 0.4, 1, 0, step);
  saunaTiers(o, MID + LANE, S - 0.4, S - 0.4, 1, 0, step);
  // ...and facing them across the room, or a glass wall to look out of.
  const glassEast = rng.chance(0.5);
  saunaTiers(o, 0.4, MID - LANE, 0.4, -1, 0, step);
  if (glassEast) box(o.decor, MID + DOOR + 0.5, 0.3, T + 0.02, S - 0.5, H - 0.3, T + 0.04, 'glass');
  else saunaTiers(o, MID + LANE, S - 0.4, 0.4, -1, 0, step);
  // One or two caged stoves between the tiers, warm wall lamps.
  const zs = MID + LANE + 2.2;
  saunaStove(o, 7, zs, lights);
  if (rng.chance(0.5)) saunaStove(o, 25, zs, lights);
  for (const x of [4, 12, 20, 28])
    for (const z of [S - T - 0.04, T + 0.01]) {
      box(o.decor, x - 0.12, H - 0.9, z, x + 0.12, H - 0.65, z + 0.03, 'sauna-glow');
      lights.push({ x, y: H - 0.9, z: z < MID ? 1 : S - 1, I: 1 });
    }
  // A sand timer on the wall by the aisle
  box(o.decor, MID + LANE + 0.3, 1.6, S - 0.4 - step * 3 - 0.2, MID + LANE + 0.6, 2.1, S - 0.4 - step * 3 - 0.17, 'sauna-glow');
  o.zones.push({ kind: 'piece', name: 'sauna', x0: 0, z0: 0, x1: S, z1: S });
  return { o, lights };
}

function coldRoom(seed: number, cx: number, cz: number): Room {
  const o = emptyOut();
  const lights: Light[] = [];
  const rng = new Rng(hashInts(seed, 5350, cx, cz));
  const H = 5;
  walls(o, seed, cx, cz, H, { low: 'tile-aqua', high: 'sento-paint' });
  o.floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
  o.ceilings.push({ x0: 0, z0: 0, x1: S, z1: S, y: H });
  for (const [x, z] of [
    [8, 8],
    [24, 8],
    [8, 24],
    [24, 24],
  ])
    o.panels.push({ x, y: H - 0.02, z, w: 0.3, d: 1.4, state: 1 });
  lights.push({ x: 16, y: 4, z: 16, I: 5 });
  // A deep-blue cold plunge, a row of jet baths, a standing shower or two
  const q = QUADS[rng.int(0, 3)];
  bathTub(o, q[0] + 1, q[1] + 1, q[0] + 7, q[1] + 7, 0, 'cold-water', 'tile-aqua');
  const r = QUADS[(QUADS.indexOf(q) + 1 + rng.int(0, 2)) % 4];
  for (let k = 0; k < 3; k++) {
    bathTub(o, r[0] + 0.6 + k * 4.4, r[1] + 1, r[0] + 4.4 + k * 4.4, r[1] + 5, 0, k === 1 ? 'milky-water' : 'hot-spring');
    box(o.solids, r[0] + 2.3 + k * 4.4, 0.25, r[1] + 4.7, r[0] + 2.7 + k * 4.4, 0.5, r[1] + 4.75, 'metal');
  }
  o.zones.push({ kind: 'piece', name: 'cold-bath', x0: q[0], z0: q[1], x1: q[2], z1: q[3] });
  return { o, lights };
}

function changingRoom(seed: number, cx: number, cz: number): Room {
  const o = emptyOut();
  const lights: Light[] = [];
  const rng = new Rng(hashInts(seed, 5360, cx, cz));
  const H = 3.6;
  walls(o, seed, cx, cz, H, { low: 'cedar-dark', high: 'sento-paint' });
  o.floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
  box(o.decor, 0, 0.004, 0, S, 0.012, S, 'tatami');
  o.ceilings.push({ x0: 0, z0: 0, x1: S, z1: S, y: H });
  for (const [x, z] of [
    [8, 8],
    [24, 8],
    [8, 24],
    [24, 24],
  ])
    o.panels.push({ x, y: H - 0.02, z, w: 0.6, d: 1.2, state: 1 });
  lights.push({ x: 16, y: 3, z: 16, I: 4 });
  // Lockers along the walls, baskets on a shelf, benches, a milk fridge, a scale.
  lockers(o, 0.4, MID - LANE, T, 1);
  lockers(o, MID + LANE, S - 0.4, T, 1);
  if (rng.chance(0.6)) lockers(o, 0.4, 8, S - T, -1);
  box(o.solids, MID + LANE, 0, S - 1.2, S - 0.4, 1.0, S - 0.4, 'shelf');
  for (let x = MID + LANE + 0.5; x < S - 0.8; x += 0.9) box(o.solids, x - 0.3, 1.0, S - 1.1, x + 0.3, 1.3, S - 0.5, 'crate');
  box(o.solids, 4, 0, 10, 12, 0.45, 10.6, 'cedar');
  box(o.solids, 20, 0, 22, 28, 0.45, 22.6, 'cedar');
  box(o.solids, 26, 0, 7, 27.2, 1.9, 7.8, 'tile-white');
  box(o.decor, 26.1, 0.4, 6.98, 27.1, 1.8, 7.0, 'daylight');
  lights.push({ x: 26.6, y: 1.2, z: 6.5, I: 1.2 });
  box(o.solids, 3, 0, 22, 3.6, 0.08, 22.5, 'metal');
  o.zones.push({ kind: 'piece', name: 'changing-room', x0: 0, z0: 0, x1: S, z1: S });
  if (rng.chance(0.7)) o.items.push({ uid: 'cb', id: 'almond_water', x: 6, y: 0.45, z: 10.3, rot: 0 });
  // A sliding glass door out (the way to somewhere else)
  o.props.push({ uid: 'sd', kind: 'glass-door', x: 11, y: 0, z: S - T - 0.22, rotY: Math.PI });
  return { o, lights };
}

function room(seed: number, cx: number, cz: number): Room {
  switch (kindOf(seed, cx, cz)) {
    case 'rotenburo':
      return rotenburo(seed, cx, cz);
    case 'sauna':
      return sauna(seed, cx, cz);
    case 'cold':
      return coldRoom(seed, cx, cz);
    case 'changing':
      return changingRoom(seed, cx, cz);
    default:
      return bathHall(seed, cx, cz);
  }
}

function makeSento(): LevelDefinition {
  return {
    id: 'sento',
    title: 'Level 1965',
    name: '終わらない銭湯',
    subtitle: 'The Endless Bathhouse',
    threatClass: 1,
    chunkSize: S,
    ceilingHeight: SENTO_H,
    palette: {
      wallTex: 'sento-tile',
      floorTex: 'sento-floor',
      ceilingTex: 'sento-ceiling',
      lightColor: 0xf4fbff,
      fogColor: 0xdff2f4,
      fogDensity: 0.016, // steam
      ambient: 0.75,
      lightTint: [0.98, 1.02, 1.04],
    },
    generator: (ctx, cx, cz): ChunkData => toChunk(ctx, cx, cz, 0, S, room(ctx.levelSeed, cx, cz).o),
    lightSampler: (ctx, cx, cz) => {
      const lights = room(ctx.levelSeed, cx, cz).lights.map((l) => ({ ...l, x: l.x + cx * S, z: l.z + cz * S }));
      return sampler(0.8, [0.3, 0.9, 0.2], lights);
    },
    setPieces: [
      { id: 'mural', name: '富士の壁画', desc: '壁いっぱいに、雪をかぶった山と青い海の絵。どの浴場にも同じ絵がある。' },
      { id: 'wash-row', name: '洗い場', desc: '蛇口と鏡が並ぶ洗い場。黄色い桶と、白い腰掛け。' },
      { id: 'bath', name: '湯船', desc: 'タイル張りの湯船。熱い湯、白い湯、緑の薬湯、冷たい水。' },
      { id: 'rotenburo', name: '露天風呂', desc: '岩に囲まれた湯。木々と板塀の向こうに、空が見える。' },
      { id: 'sauna', name: 'サウナ', desc: '杉の板で囲まれた広いサウナ室。三段の腰掛けが下から光っている。' },
      { id: 'cold-bath', name: '水風呂', desc: '青いタイルの水風呂と、泡の出る湯船。' },
      { id: 'changing-room', name: '脱衣所', desc: '木のロッカーと籠、牛乳の冷蔵庫。曇りガラスの戸がある。' },
    ],
    lootTable: { perCell: 0, rules: ALMOND_ONLY },
    exits: [
      { kind: 'door', prop: 'glass-door', targets: [{ levelId: '37', weight: 1 }, { levelId: 'memphis', weight: 1 }, { levelId: String(200 + 13), weight: 1 }, { levelId: '0', weight: 1 }], discovery: '脱衣所の引き戸を開けると、湯気の向こうは別の場所だった。' },
      { kind: 'walk', distance: 1300, targets: [{ levelId: '37', weight: 1 }, { levelId: '37.2', weight: 1 }, { levelId: String(500 + 7), weight: 1 }], discovery: '浴場から浴場へ歩き続けると、タイルの色が変わっていた。' },
    ],
    drainMul: 0.7,
    hallucination: 0.5,
    footstep: 'tile',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.012, noiseCutoff: 1800 },
    soundscape: 'sento',
    // Open-air baths need the sky; indoor rooms have ceilings over them.
    environment: 'open-sky',
    sky: { kind: 'day' },
    kindLabel: '昭和の銭湯(手作り)',
    spawn: { x: MID, y: 0, z: MID + 4, yaw: 0 },
    // In the free passage through the middle of a room.
    arrival: (ctx, h) => {
      const cx = Math.floor((hash01(ctx.levelSeed, 5203, h) - 0.5) * 60);
      const cz = Math.floor((hash01(ctx.levelSeed, 5204, h) - 0.5) * 60);
      return { x: cx * S + MID, y: 0, z: cz * S + MID + 4, yaw: 0 };
    },
  };
}

export const levelSento = makeSento();
