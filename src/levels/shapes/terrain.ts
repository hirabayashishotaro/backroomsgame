/**
 * Terrain worlds built from 2 m columns (pure): the snowy mountain (diagonal:
 * it climbs forever), the mushroom swamp, the volcano (narrow ridges over a
 * lava sea), the eternal island, and the floating end islands.
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { GenContext, LightSampler, SpawnPoint } from '../levelDefinition';
import type { ChunkData } from '../../world/chunkData';
import { box, emptyOut, fbm2, sampler, toChunk, neighbourLights, type Out } from './kit';

const CS = 2; // column size
const N = 16; // columns per 32 m chunk
export const TERRAIN_S = CS * N;

type HeightFn = (x: number, z: number) => number | null;

/** Columns for a height function (null = no ground). Sides reach down to the lowest neighbour. */
function columns(o: Out, cx: number, cz: number, h: HeightFn, mat: (top: number, steep: number, x: number, z: number) => string, depth = 0.6): void {
  const ox = cx * TERRAIN_S;
  const oz = cz * TERRAIN_S;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const wx = ox + i * CS + CS / 2;
      const wz = oz + j * CS + CS / 2;
      const top = h(wx, wz);
      if (top === null) continue;
      let low = top;
      let steep = 0;
      for (const [dx, dz] of [
        [CS, 0],
        [-CS, 0],
        [0, CS],
        [0, -CS],
      ]) {
        const n = h(wx + dx, wz + dz);
        const nn = n === null ? top - 3 : n;
        low = Math.min(low, nn);
        steep = Math.max(steep, top - nn);
      }
      box(o.solids, i * CS, low - depth, j * CS, i * CS + CS, top, j * CS + CS, mat(top, steep, wx, wz));
    }
}

// ---------------------------------------------------------------------------
// Snowy mountain (Level 303): climbs forever along +x (diagonal expansion).
// ---------------------------------------------------------------------------

export interface MountainParams {
  slope: number;
  rough: number;
  snowMat: string;
  cliffMat: string;
  treeMat: string;
}

const pathZ = (x: number) => 30 * Math.sin(x / 80) + 12 * Math.sin(x / 23);

export function mountainHeight(seed: number, p: MountainParams, x: number, z: number): number {
  const base = x * p.slope;
  const dz = Math.abs(z - pathZ(x));
  const smooth = base + 3 * fbm2(seed, 401, x / 40, 0.5, 2);
  if (dz < 3) return Math.round(smooth / 0.4) * 0.4; // the climbable path: steps of 0.4 m
  const wild = base + p.rough * fbm2(seed, 402, x / 55, z / 55) + (p.rough / 2.5) * fbm2(seed, 403, x / 14, z / 14) - p.rough * 0.3;
  const k = Math.min(1, (dz - 3) / 10);
  return Math.round((smooth * (1 - k) + wild * k) / 0.4) * 0.4;
}

export function generateMountain(ctx: GenContext, p: MountainParams, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  const h = (x: number, z: number) => mountainHeight(seed, p, x, z);
  columns(o, cx, cz, h, (_t, steep) => (steep > 1.6 ? p.cliffMat : p.snowMat), 1.5);
  const ox = cx * TERRAIN_S;
  const oz = cz * TERRAIN_S;
  for (let i = 0; i < N; i += 2)
    for (let j = 0; j < N; j += 2) {
      const wx = ox + i * CS + 1;
      const wz = oz + j * CS + 1;
      const onPath = Math.abs(wz - pathZ(wx)) < 4;
      const y = h(wx, wz);
      const r = hash01(seed, 404, wx, wz);
      if (!onPath && r < 0.07) {
        // A pine: trunk and three tiers
        box(o.solids, i * CS + 0.8, y, j * CS + 0.8, i * CS + 1.2, y + 1.2, j * CS + 1.2, 'bark');
        box(o.decor, i * CS - 0.4, y + 1.2, j * CS - 0.4, i * CS + 2.4, y + 2.6, j * CS + 2.4, p.treeMat);
        box(o.decor, i * CS + 0.1, y + 2.6, j * CS + 0.1, i * CS + 1.9, y + 3.8, j * CS + 1.9, p.treeMat);
        box(o.decor, i * CS + 0.6, y + 3.8, j * CS + 0.6, i * CS + 1.4, y + 4.8, j * CS + 1.4, p.treeMat);
      } else if ((onPath && r < 0.06) || (r > 0.07 && r < 0.085)) {
        o.items.push({ uid: `i${i},${j}`, id: 'almond_water', x: i * CS + 1, y, z: j * CS + 1, rot: 0 });
      }
    }
  // A mountain hut on the path every ~5 chunks, a stone gate every 8.
  const hutCx = ((cx % 5) + 5) % 5 === 2;
  const pz = pathZ(ox + 16) - oz;
  if (pz > 4 && pz < 28) {
    const y = h(ox + 16, oz + pz);
    if (hutCx) {
      const hz = pz + 6;
      if (hz < 30) {
        const hy = h(ox + 16, oz + hz);
        box(o.solids, 12, hy - 2, hz, 20, hy + 2.6, hz + 0.2, 'wood-dark');
        box(o.solids, 11.5, hy + 2.6, hz - 0.6, 20.5, hy + 2.9, hz + 4, 'wood-dark');
        o.props.push({ uid: 'hut', kind: 'plain-door', x: 16, y: hy, z: hz - 0.03, rotY: Math.PI, color: 0x6a4a2a });
        o.zones.push({ kind: 'piece', name: 'hut', x0: 12, z0: hz - 2, x1: 20, z1: hz + 1 });
        o.lights.push({ x: 16, y: hy + 2.4, z: hz - 0.6, I: 1.5 });
      }
    }
    if (((cx % 8) + 8) % 8 === 5) {
      box(o.solids, 14, y, pz - 2.6, 15, y + 4, pz - 2, 'stone');
      box(o.solids, 14, y, pz + 2, 15, y + 4, pz + 2.6, 'stone');
      box(o.solids, 13.6, y + 4, pz - 3, 15.4, y + 4.6, pz + 3, 'stone');
      box(o.decor, 14.2, y + 0.02, pz - 1.8, 14.8, y + 0.05, pz + 1.8, 'glow');
      o.zones.push({ kind: 'gate', x0: 14, z0: pz - 1.8, x1: 15, z1: pz + 1.8 });
      o.zones.push({ kind: 'piece', name: 'stone-gate', x0: 12, z0: pz - 3, x1: 17, z1: pz + 3 });
      o.lights.push({ x: 14.5, y: y + 1, z: pz, I: 2.5 });
    }
  }
  return toChunk(ctx, cx, cz, 0, TERRAIN_S, o);
}

export function mountainArrival(ctx: GenContext, p: MountainParams, h: number): SpawnPoint {
  const x = (Math.floor(hash01(ctx.levelSeed, 405, h) * 40) - 20) * 32 + 17; // a column centre
  const z = Math.floor(pathZ(x) / 2) * 2 + 1;
  return { x, y: mountainHeight(ctx.levelSeed, p, x, z), z, yaw: -Math.PI / 2 };
}

// ---------------------------------------------------------------------------
// Mushroom swamp (Level 77): rugged dark forest with oversized mushrooms.
// ---------------------------------------------------------------------------

export interface SwampParams {
  capMats: string[];
  amp: number;
}

const WATER = 0.4;

function swampH(seed: number, p: SwampParams, x: number, z: number): number {
  const v = p.amp * fbm2(seed, 410, x / 25, z / 25) + (p.amp / 2) * fbm2(seed, 411, x / 7, z / 7) - p.amp * 0.4;
  return Math.max(-0.6, Math.round(v / 0.4) * 0.4);
}

interface Shroom {
  x: number;
  z: number;
  tall: number;
  w: number;
  cap: string;
  r0: number;
  stump: boolean;
}

/** Giant mushrooms of a chunk (shared by the generator and the light sampler). */
function shroomsOf(seed: number, p: SwampParams, cx: number, cz: number): Shroom[] {
  const rng = new Rng(hashInts(seed, 412, cx, cz));
  const n = rng.int(0, 2);
  const out: Shroom[] = [];
  for (let k = 0; k < n; k++)
    out.push({
      x: 4 + rng.float() * 24,
      z: 4 + rng.float() * 24,
      tall: 9 + rng.float() * 16,
      w: 1.2 + rng.float() * 1.2,
      cap: p.capMats[rng.int(0, p.capMats.length - 1)],
      r0: 4 + rng.float() * 4,
      stump: rng.chance(0.3),
    });
  return out;
}

export function generateSwamp(ctx: GenContext, p: SwampParams, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  const h = (x: number, z: number) => swampH(seed, p, x, z);
  columns(o, cx, cz, h, (t) => (t <= WATER ? 'rock' : 'moss'), 1);
  box(o.decor, 0, WATER - 0.02, 0, TERRAIN_S, WATER, TERRAIN_S, 'water-dark');
  const ox = cx * TERRAIN_S;
  const oz = cz * TERRAIN_S;
  const rng = new Rng(hashInts(seed, 415, cx, cz));
  shroomsOf(seed, p, cx, cz).forEach((m, k) => {
    const { x, z, tall, w, cap, r0 } = m;
    const y = h(ox + x, oz + z);
    box(o.solids, x - w / 2, y, z - w / 2, x + w / 2, y + tall, z + w / 2, 'pages');
    box(o.solids, x - r0, y + tall, z - r0, x + r0, y + tall + 1.2, z + r0, cap);
    box(o.solids, x - r0 * 0.7, y + tall + 1.2, z - r0 * 0.7, x + r0 * 0.7, y + tall + 2.3, z + r0 * 0.7, cap);
    box(o.solids, x - r0 * 0.35, y + tall + 2.3, z - r0 * 0.35, x + r0 * 0.35, y + tall + 3, z + r0 * 0.35, cap);
    box(o.decor, x - r0 + 0.3, y + tall - 0.04, z - r0 + 0.3, x + r0 - 0.3, y + tall - 0.01, z + r0 - 0.3, 'gill-glow');
    o.zones.push({ kind: 'piece', name: 'giant-mushroom', x0: x - r0, z0: z - r0, x1: x + r0, z1: z + r0 });
    if (m.stump) {
      box(o.solids, x + w / 2, y, z - 1, x + w / 2 + 1.6, y + 2.6, z + 1, 'bark');
      o.props.push({ uid: 'stump' + k, kind: 'plain-door', x: x + w / 2 + 1.62, y, z, rotY: Math.PI / 2, color: 0x4a3420 });
      o.zones.push({ kind: 'piece', name: 'stump-door', x0: x + w / 2, z0: z - 1.5, x1: x + w / 2 + 3, z1: z + 1.5 });
    }
  });
  // Small glowing mushrooms
  for (let k = 0; k < 6; k++) {
    const x = rng.float() * 30 + 1;
    const z = rng.float() * 30 + 1;
    const y = h(ox + x, oz + z);
    if (y <= WATER) continue;
    box(o.decor, x - 0.05, y, z - 0.05, x + 0.05, y + 0.4, z + 0.05, 'pages');
    box(o.decor, x - 0.25, y + 0.4, z - 0.25, x + 0.25, y + 0.55, z + 0.25, rng.chance(0.5) ? 'gill-glow' : 'gem-pink');
  }
  for (let k = 0; k < 2; k++)
    if (rng.chance(0.4)) {
      const x = 7 + k * 16;
      const z = 7 + rng.int(0, 2) * 8;
      o.items.push({ uid: 'b' + k, id: 'almond_water', x, y: Math.max(WATER, h(ox + x, oz + z)), z, rot: 0 });
    }
  if (rng.chance(0.25)) {
    const x = rng.float() * 26 + 3;
    const z = rng.float() * 26 + 3;
    const y = h(ox + x, oz + z);
    if (y > WATER) {
      box(o.decor, x - 0.9, y + 0.002, z - 0.9, x + 0.9, y + 0.01, z + 0.9, 'floor-thin');
      o.zones.push({ kind: 'thin-floor', x0: x - 0.9, z0: z - 0.9, x1: x + 0.9, z1: z + 0.9 });
    }
  }
  o.zones.push({ kind: 'water', x0: 0, z0: 0, x1: TERRAIN_S, z1: TERRAIN_S });
  return toChunk(ctx, cx, cz, 0, TERRAIN_S, o);
}

export function swampSampler(ctx: GenContext, p: SwampParams, cx: number, cz: number): LightSampler {
  const lights = neighbourLights(TERRAIN_S, cx, cz, (a, b) =>
    shroomsOf(ctx.levelSeed, p, a, b).map((m) => ({ x: m.x, y: swampH(ctx.levelSeed, p, a * TERRAIN_S + m.x, b * TERRAIN_S + m.z) + m.tall - 0.6, z: m.z, I: 3 })),
  );
  return sampler(0.07, null, lights);
}

export function swampArrival(ctx: GenContext, p: SwampParams, h: number): SpawnPoint {
  for (let k = 0; k < 50; k++) {
    const x = Math.floor(((hash01(ctx.levelSeed, 413, h, k) - 0.5) * 600) / 2) * 2 + 1;
    const z = Math.floor(((hash01(ctx.levelSeed, 414, h, k) - 0.5) * 600) / 2) * 2 + 1;
    const y = swampH(ctx.levelSeed, p, x, z);
    if (y > WATER + 0.4) return { x, y, z, yaw: 0 };
  }
  return { x: 1, y: 3, z: 1, yaw: 0 };
}

// ---------------------------------------------------------------------------
// Volcano (Level 666): narrow basalt ridges over a lava sea.
// ---------------------------------------------------------------------------

export const LAVA_Y = 0;

function volcanoH(seed: number, x: number, z: number): number | null {
  const r = Math.abs(fbm2(seed, 420, x / 38, z / 38, 3) * 2 - 1); // ridged: lines where r ~ 0
  const island = fbm2(seed, 421, x / 60, z / 60, 2);
  if (r > 0.07 && island < 0.72) return null;
  return 0.8 + Math.round(1.6 * fbm2(seed, 422, x / 9, z / 9, 2) / 0.4) * 0.4;
}

export function generateVolcano(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  columns(o, cx, cz, (x, z) => volcanoH(seed, x, z), (_t, steep) => (steep > 1.5 ? 'rock' : 'basalt'), 1.4);
  box(o.decor, 0, LAVA_Y - 0.05, 0, TERRAIN_S, LAVA_Y, TERRAIN_S, 'lava');
  o.zones.push({ kind: 'lava', x0: 0, z0: 0, x1: TERRAIN_S, z1: TERRAIN_S });
  const ox = cx * TERRAIN_S;
  const oz = cz * TERRAIN_S;
  const rng = new Rng(hashInts(seed, 423, cx, cz));
  // Things on solid ground: an obsidian door, a vent (gate), a bottle.
  for (let k = 0; k < 16; k++) {
    const x = 1 + rng.int(0, 15) * 2;
    const z = 1 + rng.int(0, 15) * 2;
    const y = volcanoH(seed, ox + x, oz + z);
    if (y === null) continue;
    const roll = rng.float();
    if (roll < 0.12) {
      box(o.solids, x - 0.7, y, z - 0.2, x + 0.7, y + 2.6, z + 0.2, 'obsidian');
      o.props.push({ uid: 'od' + k, kind: 'plain-door', x, y, z: z + 0.22, rotY: 0, color: 0x1a1020 });
      o.zones.push({ kind: 'piece', name: 'obsidian-door', x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1 });
    } else if (roll < 0.2) {
      box(o.solids, x - 1, y, z - 1, x + 1, y + 0.6, z - 0.7, 'basalt');
      box(o.solids, x - 1, y, z + 0.7, x + 1, y + 0.6, z + 1, 'basalt');
      box(o.decor, x - 0.7, y + 0.02, z - 0.7, x + 0.7, y + 0.05, z + 0.7, 'portal');
      o.zones.push({ kind: 'gate', x0: x - 0.6, z0: z - 0.6, x1: x + 0.6, z1: z + 0.6 });
      o.zones.push({ kind: 'piece', name: 'vent', x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1 });
    } else if (roll < 0.32) o.items.push({ uid: 'v' + k, id: 'almond_water', x, y, z, rot: 0 });
  }
  return toChunk(ctx, cx, cz, 0, TERRAIN_S, o);
}

export function volcanoArrival(ctx: GenContext, h: number): SpawnPoint {
  for (let k = 0; k < 400; k++) {
    const x = Math.floor((hash01(ctx.levelSeed, 424, h, k) - 0.5) * 400 / 2) * 2 + 1;
    const z = Math.floor((hash01(ctx.levelSeed, 425, h, k) - 0.5) * 400 / 2) * 2 + 1;
    const y = volcanoH(ctx.levelSeed, x, z);
    if (y !== null && volcanoH(ctx.levelSeed, x + 2, z) !== null && volcanoH(ctx.levelSeed, x - 2, z) !== null) return { x, y, z, yaw: 0 };
  }
  return { x: 1, y: 2, z: 1, yaw: 0 };
}

// ---------------------------------------------------------------------------
// Eternal island (Level 808): a small island in an endless sea.
// ---------------------------------------------------------------------------

export const ISLAND_R = 16;
export const SEA_R = 24;

function islandH(seed: number, x: number, z: number): number | null {
  const d = Math.hypot(x, z);
  if (d > SEA_R) return null;
  if (d > ISLAND_R) return -0.5;
  return Math.round((1.4 * (1 - (d / ISLAND_R) ** 2) + 0.5 * fbm2(seed, 430, x / 6, z / 6, 2)) / 0.2) * 0.2;
}

export function generateIsland(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  box(o.decor, 0, 0.0, 0, TERRAIN_S, 0.05, TERRAIN_S, 'ocean');
  if (Math.abs(cx + 0.5) <= 1.5 && Math.abs(cz + 0.5) <= 1.5) {
    columns(o, cx, cz, (x, z) => islandH(seed, x, z), (t) => (t < 0 ? 'sand' : 'sand'), 0.8);
    const ox = cx * TERRAIN_S;
    const oz = cz * TERRAIN_S;
    // Invisible current: a ring of clear walls you cannot pass.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const x = Math.cos(a) * (SEA_R - 0.5) - ox;
      const z = Math.sin(a) * (SEA_R - 0.5) - oz;
      if (x < -2 || x > 34 || z < -2 || z > 34) continue;
      box(o.solids, x - 2, -1, z - 2, x + 2, 6, z + 2, 'invisible');
    }
    const palms: Array<[number, number]> = [
      [-6, -4],
      [5, -7],
      [8, 5],
      [-3, 9],
    ];
    for (const [px, pz] of palms) {
      const x = px - ox;
      const z = pz - oz;
      if (x < 0 || x >= 32 || z < 0 || z >= 32) continue;
      const y = islandH(seed, px, pz) ?? 0;
      box(o.solids, x - 0.2, y, z - 0.2, x + 0.2, y + 5, z + 0.2, 'bark');
      box(o.decor, x - 2.2, y + 4.8, z - 0.5, x + 2.2, y + 5.2, z + 0.5, 'leaves-green');
      box(o.decor, x - 0.5, y + 4.8, z - 2.2, x + 0.5, y + 5.2, z + 2.2, 'leaves-green');
      if (px < 6) o.items.push({ uid: `palm${px}`, id: 'almond_water', x: x + 0.8, y, z: z + 0.5, rot: 0 });
    }
    // Campfire, a wrecked boat, a bottle or two
    const fx = 0 - ox;
    const fz = 2 - oz;
    if (fx >= 0 && fx < 32 && fz >= 0 && fz < 32) {
      const y = islandH(seed, 0, 2) ?? 0;
      box(o.decor, fx - 0.5, y, fz - 0.5, fx + 0.5, y + 0.15, fz + 0.5, 'stone');
      box(o.decor, fx - 0.2, y + 0.15, fz - 0.2, fx + 0.2, y + 0.5, fz + 0.2, 'lava');
      o.lights.push({ x: fx, y: y + 0.6, z: fz, I: 2.5 });
      o.zones.push({ kind: 'piece', name: 'campfire', x0: fx - 2, z0: fz - 2, x1: fx + 2, z1: fz + 2 });
      o.items.push({ uid: 'c', id: 'almond_water', x: fx + 1.2, y, z: fz, rot: 0 });
    }
    const bx = -11 - ox;
    const bz = 8 - oz;
    if (bx >= 0 && bx < 32 && bz >= 0 && bz < 32) {
      const y = islandH(seed, -11, 8) ?? 0;
      box(o.solids, bx - 2.5, y, bz - 1, bx + 2.5, y + 0.8, bz - 0.8, 'wood-dark');
      box(o.solids, bx - 2.5, y, bz + 0.8, bx + 2.5, y + 0.8, bz + 1, 'wood-dark');
      box(o.solids, bx - 2.7, y, bz - 1, bx - 2.5, y + 0.8, bz + 1, 'wood-dark');
      o.zones.push({ kind: 'piece', name: 'wreck', x0: bx - 3, z0: bz - 1.5, x1: bx + 3, z1: bz + 1.5 });
      o.items.push({ uid: 'wreck', id: 'almond_water', x: bx, y, z: bz, rot: 0 });
    }
    const sx = 6 - ox;
    const sz = -2 - oz;
    if (sx >= 0 && sx < 32 && sz >= 0 && sz < 32) {
      const y = islandH(seed, 6, -2) ?? 0;
      box(o.decor, sx - 0.9, y + 0.002, sz - 0.9, sx + 0.9, y + 0.01, sz + 0.9, 'floor-thin');
      o.zones.push({ kind: 'thin-floor', x0: sx - 0.9, z0: sz - 0.9, x1: sx + 0.9, z1: sz + 0.9 });
    }
    o.zones.push({ kind: 'water', x0: 0, z0: 0, x1: 32, z1: 32 });
  }
  return toChunk(ctx, cx, cz, 0, TERRAIN_S, o);
}

export function islandArrival(ctx: GenContext): SpawnPoint {
  return { x: 1, y: islandH(ctx.levelSeed, 1, -1) ?? 1, z: -1, yaw: 0 };
}

// ---------------------------------------------------------------------------
// Floating end islands (Level 9999): pale islands in a dark void, tall dark
// pillars with glowing crystals, stepped bridges between neighbours.
// ---------------------------------------------------------------------------

interface Isle {
  x: number;
  z: number;
  r: number;
  y: number;
}

function isleOf(seed: number, cx: number, cz: number): Isle | null {
  if (hash01(seed, 440, cx, cz) > 0.75) return null;
  return {
    x: 16 + (hash01(seed, 441, cx, cz) - 0.5) * 8,
    z: 16 + (hash01(seed, 442, cx, cz) - 0.5) * 8,
    r: 6 + hash01(seed, 443, cx, cz) * 5,
    y: Math.round((fbm2(seed, 444, cx / 4, cz / 4, 2) - 0.5) * 24),
  };
}

export function generateEnd(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  const I = isleOf(seed, cx, cz);
  if (I) {
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const x = i * CS + 1;
        const z = j * CS + 1;
        const d = Math.hypot(x - I.x, z - I.z);
        const rr = I.r * (0.85 + 0.3 * fbm2(seed, 445, (cx * 32 + x) / 6, (cz * 32 + z) / 6, 2));
        if (d > rr) continue;
        const top = I.y + Math.round(0.8 * fbm2(seed, 446, x / 5, z / 5, 2) / 0.4) * 0.4;
        const bottom = top - 1.5 - 7 * (1 - d / rr);
        box(o.solids, i * CS, bottom, j * CS, i * CS + CS, top, j * CS + CS, 'endstone');
      }
    const rng = new Rng(hashInts(seed, 447, cx, cz));
    if (rng.chance(0.7)) {
      const ph = 10 + rng.float() * 22;
      const w = 1 + rng.float() * 0.8;
      box(o.solids, I.x - w, I.y, I.z - w, I.x + w, I.y + ph, I.z + w, 'obsidian');
      box(o.decor, I.x - 0.5, I.y + ph, I.z - 0.5, I.x + 0.5, I.y + ph + 1, I.z + 0.5, 'crystal-purple');
      o.lights.push({ x: I.x, y: I.y + ph + 0.5, z: I.z, I: 5 });
      o.zones.push({ kind: 'piece', name: 'obsidian-pillar', x0: I.x - 2, z0: I.z - 2, x1: I.x + 2, z1: I.z + 2 });
    }
    if (rng.chance(0.18)) {
      const px = I.x + I.r * 0.5;
      box(o.solids, px - 1.8, I.y, I.z - 1.8, px + 1.8, I.y + 0.5, I.z - 1.3, 'obsidian');
      box(o.solids, px - 1.8, I.y, I.z + 1.3, px + 1.8, I.y + 0.5, I.z + 1.8, 'obsidian');
      box(o.decor, px - 1.3, I.y + 0.02, I.z - 1.3, px + 1.3, I.y + 0.05, I.z + 1.3, 'portal');
      o.zones.push({ kind: 'gate', x0: px - 1.2, z0: I.z - 1.2, x1: px + 1.2, z1: I.z + 1.2 });
      o.zones.push({ kind: 'piece', name: 'void-portal', x0: px - 2, z0: I.z - 2, x1: px + 2, z1: I.z + 2 });
    }
    if (rng.chance(0.7)) o.items.push({ uid: 'e', id: 'almond_water', x: I.x + 1.5, y: I.y + 0.4, z: I.z + 1.5, rot: 0 });
    if (rng.chance(0.15)) {
      o.props.push({ uid: 'ed', kind: 'plain-door', x: I.x - 2, y: I.y + 0.4, z: I.z, rotY: Math.PI / 2, color: 0x1a1024 });
      o.zones.push({ kind: 'piece', name: 'void-door', x0: I.x - 3, z0: I.z - 1, x1: I.x - 1, z1: I.z + 1 });
    }
    // Stepped bridges: each island builds the half toward its east/south neighbour; neighbours build theirs.
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const J = isleOf(seed, cx + dx, cz + dz);
      if (!J) continue;
      const linkSalt = dx + dz > 0 ? hash01(seed, 448, cx, cz, dx) : hash01(seed, 448, cx + dx, cz + dz, -dx);
      if (linkSalt > 0.75) continue;
      const jx = J.x + dx * 32;
      const jz = J.z + dz * 32;
      const mx = (I.x + jx) / 2;
      const mz = (I.z + jz) / 2;
      const my = (I.y + J.y) / 2;
      const len = Math.hypot(mx - I.x, mz - I.z);
      const steps = Math.max(2, Math.ceil(len / 1.2));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const x = I.x + (mx - I.x) * t;
        const z = I.z + (mz - I.z) * t;
        if (Math.hypot(x - I.x, z - I.z) < I.r * 0.8) continue;
        const y = I.y + (my - I.y) * t;
        box(o.solids, x - 0.8, y - 0.4, z - 0.8, x + 0.8, y, z + 0.8, 'endstone');
      }
    }
  }
  return toChunk(ctx, cx, cz, 0, TERRAIN_S, o);
}

export function endSampler(ctx: GenContext, cx: number, cz: number): LightSampler {
  const lights = neighbourLights(TERRAIN_S, cx, cz, (a, b) => {
    const I = isleOf(ctx.levelSeed, a, b);
    if (!I) return [];
    const rng = new Rng(hashInts(ctx.levelSeed, 447, a, b));
    if (!rng.chance(0.7)) return [];
    const ph = 10 + rng.float() * 22;
    return [{ x: I.x, y: I.y + ph + 0.5, z: I.z, I: 5 }];
  });
  return sampler(0.35, [0.2, 1, 0.3], lights);
}

export function endArrival(ctx: GenContext, h: number): SpawnPoint {
  for (let k = 0; k < 200; k++) {
    const cx = Math.floor(hash01(ctx.levelSeed, 449, h, k) * 20) - 10;
    const cz = Math.floor(hash01(ctx.levelSeed, 450, h, k) * 20) - 10;
    const I = isleOf(ctx.levelSeed, cx, cz);
    if (I) {
      // stand on a column centre inside the island core
      // away from the central pillar (half-width up to 1.8 m)
      const x = Math.floor((I.x - Math.max(3.6, I.r * 0.5)) / 2) * 2 + 1;
      const z = Math.floor(I.z / 2) * 2 + 1;
      const top = I.y + Math.round(0.8 * fbm2(ctx.levelSeed, 446, x / 5, z / 5, 2) / 0.4) * 0.4;
      return { x: cx * 32 + x, y: top, z: cz * 32 + z, yaw: 0 };
    }
  }
  return { x: 16, y: 0, z: 16, yaw: 0 };
}
