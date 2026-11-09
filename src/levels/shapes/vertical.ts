/**
 * Vertical worlds (stream slabs above/below): the endless square spiral
 * stairwell, the oesophagus, the endless mansion and the stacked poolrooms.
 * Pure; slab index cy -> y range [cy*slab, (cy+1)*slab).
 */
import { hash01, Rng, hashInts } from '../../core/rng';
import type { GenContext, LightSampler, SpawnPoint } from '../levelDefinition';
import type { ChunkData } from '../../world/chunkData';
import { box, emptyOut, ring, sampler, toChunk, type Light, type Out } from './kit';

// ---------------------------------------------------------------------------
// Endless spiral stairwell (Level 111)
// ---------------------------------------------------------------------------

export interface SpiralParams {
  wallMat: string;
  stepMat: string;
  railMat: string;
  lampEvery: number;
}

export const SPIRAL_SLAB = 6;
const SP0 = 10; // shaft inner square from 10..22 (12 m)
const SP1 = 22;
const SW = 2.4; // stair width

function spiralOut(seed: number, p: SpiralParams, cy: number): Out {
  const o = emptyOut();
  const y0 = cy * SPIRAL_SLAB;
  const y1 = y0 + SPIRAL_SLAB;
  const t = 1;
  // Outer walls
  box(o.solids, SP0 - t, y0, SP0 - t, SP1 + t, y1, SP0, p.wallMat);
  box(o.solids, SP0 - t, y0, SP1, SP1 + t, y1, SP1 + t, p.wallMat);
  box(o.solids, SP0 - t, y0, SP0, SP0, y1, SP1, p.wallMat);
  box(o.solids, SP1, y0, SP0, SP1 + t, y1, SP1, p.wallMat);
  const a = SP0 + SW;
  const b = SP1 - SW;
  const rise = 1.5 / 6;
  const run = (b - a) / 6;
  // NW landing at the start of the revolution
  box(o.solids, SP0, y0 - 0.3, SP0, a, y0, a, p.stepMat);
  for (let k = 0; k < 4; k++) {
    const h0 = y0 + k * 1.5;
    for (let s = 0; s < 6; s++) {
      const top = h0 + (s + 1) * rise;
      const u0 = a + s * run;
      const u1 = u0 + run;
      // k=0: north band going +x; 1: east band +z; 2: south band -x; 3: west band -z
      if (k === 0) box(o.solids, u0, top - 0.3, SP0, u1, top, a, p.stepMat);
      if (k === 1) box(o.solids, b, top - 0.3, u0, SP1, top, u1, p.stepMat);
      if (k === 2) box(o.solids, SP1 - (u1 - SP0), top - 0.3, b, SP1 - (u0 - SP0), top, SP1, p.stepMat);
      if (k === 3) box(o.solids, SP0, top - 0.3, SP1 - (u1 - SP0), a, top, SP1 - (u0 - SP0), p.stepMat);
    }
    const hl = h0 + 1.5;
    // corner landings NE, SE, SW (NW belongs to the next slab)
    if (k === 0) box(o.solids, b, hl - 0.3, SP0, SP1, hl, a, p.stepMat);
    if (k === 1) box(o.solids, b, hl - 0.3, b, SP1, hl, SP1, p.stepMat);
    if (k === 2) box(o.solids, SP0, hl - 0.3, b, a, hl, SP1, p.stepMat);
  }
  // Inner railings with occasional gaps (so you *can* jump into the void).
  const rail = (x0: number, z0: number, x1: number, z1: number, yb: number) => {
    if (hash01(seed, 901, cy, Math.round(x0 + z0)) < 0.2) return;
    box(o.solids, x0, yb, z0, x1, yb + 0.95, z1, p.railMat);
  };
  rail(a, a - 0.08, b, a, y0 + 0.75);
  rail(b, a, b + 0.08, b, y0 + 2.25);
  rail(a, b, b, b + 0.08, y0 + 3.75);
  rail(a - 0.08, a, a, b, y0 + 5.25);
  // A door on the NW landing wall every revolution, lamps
  o.props.push({ uid: 'door', kind: 'plain-door', x: SP0 + 1.2, y: y0, z: SP0 + 0.02, rotY: 0, color: 0x7a6a54 });
  if (cy % p.lampEvery === 0) {
    box(o.decor, SP0 + 0.02, y0 + 2.4, a + 0.5, SP0 + 0.08, y0 + 2.8, a + 1.4, 'glow');
    o.lights.push({ x: SP0 + 1, y: y0 + 2.6, z: a + 1, I: 3 });
  }
  o.lights.push({ x: (SP0 + SP1) / 2, y: y0 + 3, z: (SP0 + SP1) / 2, I: 0.6 });
  if (hash01(seed, 902, cy) < 0.3) o.items.push({ uid: 'i', id: 'almond_water', x: SP1 - 1.2, y: y0 + 1.5, z: SP0 + 1.2, rot: 0 });
  if (hash01(seed, 903, cy) < 0.08) {
    o.decor.push({ minX: b + 0.3, maxX: SP1 - 0.3, minY: y0 + 3.0 - 0.29, maxY: y0 + 3.0 - 0.28, minZ: b + 0.3, maxZ: SP1 - 0.3, mat: 'floor-thin' });
    o.zones.push({ kind: 'thin-floor', x0: b + 0.3, z0: b + 0.3, x1: SP1 - 0.3, z1: SP1 - 0.3 });
  }
  o.zones.push({ kind: 'piece', name: 'landing', x0: SP0, z0: SP0, x1: a, z1: a });
  return o;
}

export function generateSpiral(ctx: GenContext, p: SpiralParams, cx: number, cz: number, cy = 0): ChunkData {
  if (cx !== 0 || cz !== 0) return toChunk(ctx, cx, cz, cy, 32, emptyOut());
  return toChunk(ctx, cx, cz, cy, 32, spiralOut(ctx.levelSeed, p, cy));
}

export function spiralSampler(ctx: GenContext, p: SpiralParams, _cx: number, _cz: number, cy = 0): LightSampler {
  const lights: Light[] = [];
  for (let d = -1; d <= 1; d++) lights.push(...spiralOut(ctx.levelSeed, p, cy + d).lights);
  return sampler(0.08, null, lights);
}

export function spiralArrival(_ctx: GenContext, h: number): SpawnPoint {
  const cy = (h % 7) - 3;
  return { x: SP0 + 1.2, y: cy * SPIRAL_SLAB, z: SP0 + 1.6, yaw: -Math.PI / 2 };
}

// ---------------------------------------------------------------------------
// Oesophagus (Level 313): a fleshy shaft going down forever.
// ---------------------------------------------------------------------------

export const GULLET_SLAB = 10;
const GC = 16;
const GR = 5;

function gulletOut(seed: number, cy: number): Out {
  const o = emptyOut();
  const y0 = cy * GULLET_SLAB;
  const y1 = y0 + GULLET_SLAB;
  ring(o.solids, GC, GC, GR, 14, y0, y1, 1.2, cy % 2 ? 'flesh' : 'flesh-dark');
  const rng = new Rng(hashInts(seed, 910, cy));
  // Ledges on the wall: never more than ~3.4 m apart vertically.
  for (let k = 0; k < 4; k++) {
    const y = y1 - 1 - k * 2.6 + rng.range(-0.4, 0.4);
    const a = rng.float() * Math.PI * 2;
    const depth = rng.range(1.4, 2.6);
    const w = rng.range(1.8, 3);
    const ex = GC + Math.cos(a) * (GR - depth / 2);
    const ez = GC + Math.sin(a) * (GR - depth / 2);
    box(o.solids, ex - w / 2, y - 0.5, ez - w / 2, ex + w / 2, y, ez + w / 2, 'flesh');
    if (rng.chance(0.15)) o.items.push({ uid: 'l' + k, id: 'almond_water', x: ex, y, z: ez, rot: 0 });
  }
  // A sphincter ring every 3 slabs: a platform with a hole in the middle.
  if (((cy % 3) + 3) % 3 === 0) {
    const h = 1.3;
    const yr = y0 + 0.3;
    box(o.solids, GC - GR, yr - 0.6, GC - GR, GC + GR, yr, GC - h, 'flesh-dark');
    box(o.solids, GC - GR, yr - 0.6, GC + h, GC + GR, yr, GC + GR, 'flesh-dark');
    box(o.solids, GC - GR, yr - 0.6, GC - h, GC - h, yr, GC + h, 'flesh-dark');
    box(o.solids, GC + h, yr - 0.6, GC - h, GC + GR, yr, GC + h, 'flesh-dark');
    o.zones.push({ kind: 'piece', name: 'sphincter', x0: GC - GR, z0: GC - GR, x1: GC + GR, z1: GC + GR });
    // A valve door in the wall at the ring
    if (((cy % 6) + 6) % 6 === 0) o.props.push({ uid: 'valve', kind: 'hatch', x: GC, y: yr, z: GC - GR + 0.2, rotY: 0, color: 0x6a2030 });
    if (hash01(seed, 911, cy) < 0.3) {
      box(o.decor, GC + 2, yr + 0.002, GC - 1, GC + 4, yr + 0.01, GC + 1, 'floor-thin');
      o.zones.push({ kind: 'thin-floor', x0: GC + 2, z0: GC - 1, x1: GC + 4, z1: GC + 1 });
    }
  }
  o.lights.push({ x: GC, y: y0 + 5, z: GC, I: 0.9 });
  return o;
}

export function generateGullet(ctx: GenContext, cx: number, cz: number, cy = 0): ChunkData {
  if (cx !== 0 || cz !== 0) return toChunk(ctx, cx, cz, cy, 32, emptyOut());
  return toChunk(ctx, cx, cz, cy, 32, gulletOut(ctx.levelSeed, cy));
}

export function gulletSampler(ctx: GenContext, _cx: number, _cz: number, cy = 0): LightSampler {
  const lights: Light[] = [];
  for (let d = -1; d <= 1; d++) lights.push(...gulletOut(ctx.levelSeed, cy + d).lights);
  return sampler(0.1, null, lights);
}

export function gulletArrival(): SpawnPoint {
  // West side of the top ring (the soft patch, if any, is on the east side).
  return { x: GC - GR + 1.4, y: 0.3, z: GC, yaw: -Math.PI / 2 };
}

// ---------------------------------------------------------------------------
// Endless mansion (Level 512): one floor per slab, corridor along x, rooms on
// both sides, stairwells every other chunk, a night skyline outside.
// ---------------------------------------------------------------------------

export const MANSION_SLAB = 4;
const CZ0 = 14; // corridor z range
const CZ1 = 18;

function mansionOut(seed: number, cx: number, cz: number, cy: number): Out {
  const o = emptyOut();
  const y0 = cy * MANSION_SLAB;
  const H = 3.4;
  if (cz !== 0) {
    // The city: neighbouring towers, drawn slab by slab so they are endless too.
    const rng = new Rng(hashInts(seed, 920, cx, cz));
    const n = 2 + rng.int(0, 2);
    for (let i = 0; i < n; i++) {
      const w = rng.range(7, 14);
      const x = rng.range(0, 32 - w);
      const z = rng.range(0, 32 - w);
      box(o.solids, x, y0, z, x + w, y0 + MANSION_SLAB, z + w, rng.chance(0.5) ? 'windows' : 'brick');
    }
    return o;
  }
  const stair = ((cx % 2) + 2) % 2 === 0;
  // Switchback stairwell in two lanes of the corridor: even floors climb in the
  // north lane (toward -x), odd floors in the south lane (toward +x). The floor
  // only has a hole over the lane the flight from the floor below arrives in,
  // and the ceiling only opens over this floor's own flight.
  const SX0 = 1.5;
  const SX1 = 8;
  const MID = (CZ0 + CZ1) / 2;
  const laneOf = (y: number) => ((((y % 2) + 2) % 2) === 0 ? [CZ0, MID] : [MID, CZ1]);
  const [hz0, hz1] = laneOf(cy - 1);
  const [oz0, oz1] = laneOf(cy);
  if (stair) {
    o.floors.push({ x0: 0, z0: 0, x1: 32, z1: CZ0, y: y0 }, { x0: 0, z0: CZ1, x1: 32, z1: 32, y: y0 });
    o.floors.push({ x0: 0, z0: CZ0, x1: SX0, z1: CZ1, y: y0 }, { x0: SX1, z0: CZ0, x1: 32, z1: CZ1, y: y0 });
    // the other lane between SX0 and SX1 is solid floor
    o.floors.push({ x0: SX0, z0: hz0 === CZ0 ? MID : CZ0, x1: SX1, z1: hz0 === CZ0 ? CZ1 : MID, y: y0 });
    void hz1;
  } else o.floors.push({ x0: 0, z0: 0, x1: 32, z1: 32, y: y0 });
  if (stair) {
    o.ceilings.push({ x0: 0, z0: CZ0, x1: SX0, z1: CZ1, y: y0 + H }, { x0: SX1, z0: CZ0, x1: 32, z1: CZ1, y: y0 + H });
    o.ceilings.push({ x0: SX0, z0: oz0 === CZ0 ? MID : CZ0, x1: SX1, z1: oz0 === CZ0 ? CZ1 : MID, y: y0 + H });
  } else o.ceilings.push({ x0: 0, z0: CZ0, x1: 32, z1: CZ1, y: y0 + H });
  // Corridor walls with room doors every 6 m (some rooms open, most closed doors)
  for (let i = 0; i < 5; i++) {
    const rx = 1 + i * 6.2;
    for (const side of [0, 1]) {
      const zW = side ? CZ1 : CZ0;
      const roll = hash01(seed, 921, cx * 10 + i, cy, side);
      const open = roll < 0.25;
      // wall segment with a doorway gap (1.2 m)
      box(o.solids, rx, y0, zW - 0.1, rx + 2.4, y0 + H, zW + 0.1, 'wall');
      box(o.solids, rx + 3.6, y0, zW - 0.1, rx + 6.2, y0 + H, zW + 0.1, 'wall');
      box(o.solids, rx + 2.4, y0 + 2.2, zW - 0.1, rx + 3.6, y0 + H, zW + 0.1, 'wall');
      if (!open) {
        o.props.push({ uid: `d${i}${side}`, kind: roll < 0.75 ? 'plain-door' : 'locked-door', x: rx + 3, y: y0, z: side ? zW - 0.12 : zW + 0.12, rotY: side ? Math.PI : 0, color: 0x5a3a2a });
        box(o.solids, rx + 2.4, y0, zW - 0.05, rx + 3.6, y0 + 2.2, zW + 0.05, 'wall');
      } else {
        // An open apartment: room walls, a bed, a table and a window to the city.
        const zIn = side ? zW : zW - 8;
        const zOut = side ? zW + 8 : zW;
        box(o.solids, rx - 0.1, y0, Math.min(zIn, zOut), rx + 0.1, y0 + H, Math.max(zIn, zOut), 'wall');
        box(o.solids, rx + 6.1, y0, Math.min(zIn, zOut), rx + 6.3, y0 + H, Math.max(zIn, zOut), 'wall');
        const zb = side ? zW + 8 : zW - 8;
        box(o.solids, rx, y0, zb - 0.1, rx + 6.2, y0 + H, zb + 0.1, 'wall');
        box(o.decor, rx + 1.2, y0 + 1.0, side ? zb - 0.12 : zb + 0.1, rx + 5, y0 + 2.6, side ? zb - 0.1 : zb + 0.12, 'windows-day');
        const bz = side ? zW + 5 : zW - 7;
        box(o.solids, rx + 0.4, y0, bz, rx + 2.4, y0 + 0.55, bz + 2, 'fabric');
        box(o.solids, rx + 4, y0, bz + 0.5, rx + 5.2, y0 + 0.75, bz + 1.5, 'wood-dark');
        o.ceilings.push({ x0: rx, z0: Math.min(zIn, zOut), x1: rx + 6.2, z1: Math.max(zIn, zOut), y: y0 + H });
        o.floors.push({ x0: rx, z0: Math.min(zIn, zOut), x1: rx + 6.2, z1: Math.max(zIn, zOut), y: y0 });
        if (hash01(seed, 922, cx * 10 + i, cy, side) < 0.4) o.items.push({ uid: `r${i}${side}`, id: 'almond_water', x: rx + 4.6, y: y0 + 0.75, z: bz + 1, rot: 0 });
        o.lights.push({ x: rx + 3, y: y0 + 3, z: (zIn + zOut) / 2, I: 1.2 });
        o.zones.push({ kind: 'piece', name: 'apartment', x0: rx, z0: Math.min(zIn, zOut), x1: rx + 6.2, z1: Math.max(zIn, zOut) });
      }
    }
    o.panels.push({ x: rx + 3, y: y0 + H - 0.02, z: (CZ0 + CZ1) / 2, w: 1.2, d: 0.6, state: hash01(seed, 923, cx, i, cy) < 0.08 ? 2 : 1 });
    o.lights.push({ x: rx + 3, y: y0 + H - 0.1, z: (CZ0 + CZ1) / 2, I: 1.4 });
  }
  if (stair) {
    // This floor's flight: 10 steps of 0.4 m over 6.5 m in its own lane.
    const even = (((cy % 2) + 2) % 2) === 0;
    const run = (SX1 - SX0) / 10;
    for (let s2 = 0; s2 < 10; s2++) {
      const top = y0 + (s2 + 1) * 0.4;
      const xa = even ? SX1 - (s2 + 1) * run : SX0 + s2 * run;
      box(o.solids, xa, top - 0.3, oz0 + 0.1, xa + run, top, oz1 - 0.1, 'stone');
    }
    // A railing between the lanes so you do not step into the lower flight's hole by accident.
    box(o.solids, SX0 + run, y0, MID - 0.05, SX1 - run, y0 + 1, MID + 0.05, 'metal');
    o.zones.push({ kind: 'piece', name: 'stairwell', x0: 0, z0: CZ0, x1: SX1, z1: CZ1 });
  }
  if (hash01(seed, 924, cx, cy) < 0.15) o.items.push({ uid: 'c', id: 'almond_water', x: 20, y: y0, z: CZ0 + 0.6, rot: 0 });
  return o;
}

export function generateMansion(ctx: GenContext, cx: number, cz: number, cy = 0): ChunkData {
  if (Math.abs(cz) > 2) return toChunk(ctx, cx, cz, cy, 32, emptyOut());
  return toChunk(ctx, cx, cz, cy, 32, mansionOut(ctx.levelSeed, cx, cz, cy));
}

export function mansionSampler(ctx: GenContext, cx: number, cz: number, cy = 0): LightSampler {
  if (cz !== 0) return sampler(0.25, null, []);
  const lights: Light[] = [];
  for (let d = -1; d <= 1; d++) for (const l of mansionOut(ctx.levelSeed, cx + d, 0, cy).lights) lights.push({ ...l, x: l.x + d * 32 });
  return sampler(0.08, null, lights);
}

export function mansionArrival(ctx: GenContext, h: number): SpawnPoint {
  const cx = Math.floor(hash01(ctx.levelSeed, 925, h) * 20) - 10;
  const cy = Math.floor(hash01(ctx.levelSeed, 926, h) * 40) - 20;
  return { x: cx * 32 + 20, y: cy * MANSION_SLAB, z: (CZ0 + CZ1) / 2, yaw: Math.PI / 2 };
}

// ---------------------------------------------------------------------------
// Stacked poolrooms (Level 37.2): tiled halls on every slab, holes in the
// floor drop you into the pool of the slab below; stairs lead up.
// ---------------------------------------------------------------------------

export const POOL_SLAB = 8;
const T = 4; // floor tile size

/** Floor tiles of slab cy that are holes (they sit over pools of slab cy-1). */
function poolHoles(seed: number, cx: number, cz: number, cy: number): Array<[number, number]> {
  const rng = new Rng(hashInts(seed, 930, cx, cz, cy));
  const out: Array<[number, number]> = [];
  const n = 1 + rng.int(0, 1);
  for (let k = 0; k < n; k++) out.push([1 + rng.int(0, 3), 1 + rng.int(0, 5)]);
  return out;
}

function poolOut(seed: number, cx: number, cz: number, cy: number): Out {
  const o = emptyOut();
  const y0 = cy * POOL_SLAB;
  const H = 6.5;
  const holes = poolHoles(seed, cx, cz, cy);
  const pools = poolHoles(seed, cx, cz, cy + 1); // under the holes of the slab above
  // Stairs alternate between tile columns 6 and 5 from slab to slab, so the
  // flight arriving from below never collides with the flight leaving upward.
  const colOf = (c: number) => ((((c % 2) + 2) % 2) === 0 ? 6 : 5);
  const rowOf = (c: number) => ((hashInts(seed, 931, cx, cz, c) % 4) + 4) % 4 + 2;
  const stairI = colOf(cy);
  const stairJ = rowOf(cy);
  // The stair top of the slab below opens into this slab: that tile is a hole here.
  const belowI = colOf(cy - 1);
  const aboveStair = rowOf(cy - 1);
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const isHole = holes.some(([a, b]) => a === i && b === j) || (i === belowI && j === aboveStair);
      const isPool = pools.some(([a, b]) => a === i && b === j);
      const x0 = i * T;
      const z0 = j * T;
      if (isPool) {
        // A sunken pool tile: floor 1.6 m down, water, and a zone that softens landings.
        o.floors.push({ x0, z0, x1: x0 + T, z1: z0 + T, y: y0 - 1.6 });
        box(o.decor, x0, y0 - 0.5, z0, x0 + T, y0 - 0.45, z0 + T, 'water');
        o.zones.push({ kind: 'water', x0, z0, x1: x0 + T, z1: z0 + T });
        box(o.solids, x0, y0 - 1.6, z0, x0 + 0.8, y0 - 0.9, z0 + 0.8, 'tile-white'); // a step out
      } else if (!isHole) o.floors.push({ x0, z0, x1: x0 + T, z1: z0 + T, y: y0 });
      // Ceiling, open above our pools (the slab above has holes there) and where our stairs climb.
      const stairShaft = i === stairI && j >= stairJ - 2 && j <= stairJ;
      if (!isPool && !stairShaft) o.ceilings.push({ x0, z0, x1: x0 + T, z1: z0 + T, y: y0 + H });
    }
  // Pillars on the tile grid corners (arches feel)
  for (let i = 1; i < 8; i += 3)
    for (let j = 1; j < 8; j += 3) box(o.solids, i * T - 0.35, y0, j * T - 0.35, i * T + 0.35, y0 + H, j * T + 0.35, 'tile-white');
  // Stairs up along +z in the stair column, ending flush with the far edge of
  // the tile that is a hole in the slab above (so you step straight onto its floor).
  const sx0 = stairI * T + 0.4;
  const zEnd = (stairJ + 1) * T;
  const zStart = zEnd - 20 * 0.5;
  for (let s = 0; s < 20; s++) {
    const top = y0 + (s + 1) * 0.4;
    const z = zStart + s * 0.5;
    box(o.solids, sx0, top - 0.3, z, sx0 + 3.2, top, z + 0.5, 'tile-white');
  }
  // Side walls along the stair tile column above the floor, so the climb is enclosed.
  box(o.solids, sx0 - 0.25, y0, zStart, sx0 - 0.05, y0 + 8, zEnd, 'tile-white');
  o.zones.push({ kind: 'piece', name: 'pool-stairs', x0: sx0, z0: zStart, x1: sx0 + 3.2, z1: zEnd });
  if (holes.length) o.zones.push({ kind: 'piece', name: 'pool-drop', x0: holes[0][0] * T, z0: holes[0][1] * T, x1: holes[0][0] * T + T, z1: holes[0][1] * T + T });
  for (let k = 0; k < 4; k++) o.lights.push({ x: 4 + (k % 2) * 16 + 4, y: y0 + H - 0.3, z: 4 + Math.floor(k / 2) * 16 + 4, I: 2 });
  if (hash01(seed, 932, cx, cz, cy) < 0.5) o.items.push({ uid: 'p', id: 'almond_water', x: 2, y: y0, z: 2, rot: 0 });
  if (hash01(seed, 935, cx, cz, cy) < 0.2) {
    o.props.push({ uid: 'pd', kind: 'plain-door', x: 1 * T, y: y0, z: 1 * T + 0.37, rotY: 0, color: 0xdfe6e8 });
    o.zones.push({ kind: 'piece', name: 'pool-door', x0: T - 1, z0: T, x1: T + 1, z1: T + 1.5 });
  }
  return o;
}

export function generatePoolTower(ctx: GenContext, cx: number, cz: number, cy = 0): ChunkData {
  return toChunk(ctx, cx, cz, cy, 32, poolOut(ctx.levelSeed, cx, cz, cy));
}

export function poolTowerSampler(_ctx: GenContext, _cx: number, _cz: number, cy = 0): LightSampler {
  const y0 = cy * POOL_SLAB;
  const lights: Light[] = [];
  for (let k = 0; k < 4; k++) lights.push({ x: 8 + (k % 2) * 16, y: y0 + 6.2, z: 8 + Math.floor(k / 2) * 16, I: 2 });
  for (let k = 0; k < 4; k++) lights.push({ x: 8 + (k % 2) * 16, y: y0 - 1.8, z: 8 + Math.floor(k / 2) * 16, I: 1.5 });
  return sampler(0.22, null, lights);
}

export function poolTowerArrival(ctx: GenContext, h: number): SpawnPoint {
  const cx = Math.floor(hash01(ctx.levelSeed, 933, h) * 10) - 5;
  const cy = Math.floor(hash01(ctx.levelSeed, 934, h) * 10) - 5;
  return { x: cx * 32 + 2, y: cy * POOL_SLAB, z: 2.2, yaw: Math.PI };
}
