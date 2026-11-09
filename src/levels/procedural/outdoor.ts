/**
 * Open-sky and groundless generators (SPEC §3.6, §4.2.1, §4.3):
 *  - garden   : lawns, paths, hedges, trees, flower beds, lamps and features
 *               (style 'garden' or the glossy 'aero' style of U3)
 *  - walkways : narrow beams between platforms over a void (groundless)
 *  - roads    : floating highway decks over a sea of clouds (U1, groundless)
 * Every structure is owned by a single chunk so chunk borders always agree.
 * Pure: no three.js.
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { Box, CeilingRect, ChunkData, ItemSpawn, LightPanel, Prop, Zone } from '../../world/chunkData';
import type { GenContext, LightSampler, SpawnPoint } from '../levelDefinition';

interface Out {
  solids: Box[];
  decor: Box[];
  items: ItemSpawn[];
  props: Prop[];
  zones: Zone[];
  lights: Array<{ x: number; y: number; z: number; I: number }>;
}

function box(list: Box[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string): void {
  list.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), mat });
}

function emptyOut(): Out {
  return { solids: [], decor: [], items: [], props: [], zones: [], lights: [] };
}

function chunkData(ctx: GenContext, cx: number, cz: number, S: number, o: Out, floors: CeilingRect[]): ChunkData {
  const lights: LightPanel[] = [];
  return { levelId: ctx.level.id, cx, cz, size: S, solids: o.solids, decor: o.decor, lights, floors, ceilings: [], items: o.items, props: o.props, zones: o.zones };
}

/** Sunlight + local point lights. */
function outdoorSampler(daylight: number, sun: [number, number, number], lights: Array<{ x: number; y: number; z: number; I: number }>): LightSampler {
  const sl = Math.hypot(...sun);
  const sx = sun[0] / sl;
  const sy = sun[1] / sl;
  const sz = sun[2] / sl;
  return (wx, wy, wz, nx, ny, nz) => {
    const ndl = Math.max(0, nx * sx + ny * sy + nz * sz);
    // Sky light from above, a little bounce from the sides, darker underneath.
    let L = daylight * (0.55 + 0.3 * Math.max(0, ny) + 0.35 * ndl - (ny < -0.5 ? 0.25 : 0));
    for (const l of lights) {
      const dx = l.x - wx;
      const dy = l.y - wy;
      const dz = l.z - wz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 400) continue;
      const d = Math.sqrt(d2) || 1;
      const k = Math.max(0.25, (nx * dx + ny * dy + nz * dz) / d);
      L += (l.I * k * 6) / (d2 + 3);
    }
    return Math.min(1.3, Math.max(0.03, L));
  };
}

// ===========================================================================
// Garden
// ===========================================================================

export interface GardenParams {
  style: 'garden' | 'aero';
  hedgeP: number;
  hedgeH: number;
  treeP: number;
  leafMats: string[];
  bedP: number;
  flowerMats: string[];
  /** Lamps along the paths are lit (dusk/night). */
  lampsOn: boolean;
  featureP: number;
  features: string[];
  doorP: number;
  thinFloorP: number;
  lootP: number;
  daylight: number;
  sun: [number, number, number];
}

export const GARDEN_CELL = 4;
export const GARDEN_N = 8;
const PATH_EVERY = 4;

const isPath = (gx: number, gz: number) => ((gx % PATH_EVERY) + PATH_EVERY) % PATH_EVERY === 0 || ((gz % PATH_EVERY) + PATH_EVERY) % PATH_EVERY === 0;

/** Feature region of a chunk: cells 1..3 or 5..7 in each axis (bounded by paths). */
function featureFor(seed: number, p: GardenParams, cx: number, cz: number): { kind: string; i0: number; j0: number } | null {
  if (!p.features.length || hash01(seed, 601, cx, cz) >= p.featureP) return null;
  return {
    kind: p.features[Math.floor(hash01(seed, 602, cx, cz) * p.features.length)],
    i0: hash01(seed, 603, cx, cz) < 0.5 ? 1 : 5,
    j0: hash01(seed, 604, cx, cz) < 0.5 ? 1 : 5,
  };
}

function inFeature(seed: number, p: GardenParams, gx: number, gz: number): boolean {
  const cx = Math.floor(gx / GARDEN_N);
  const cz = Math.floor(gz / GARDEN_N);
  const f = featureFor(seed, p, cx, cz);
  if (!f) return false;
  const i = gx - cx * GARDEN_N;
  const j = gz - cz * GARDEN_N;
  return i >= f.i0 && i < f.i0 + 3 && j >= f.j0 && j < f.j0 + 3;
}

function hedgeX(seed: number, p: GardenParams, gx: number, gz: number): boolean {
  if (isPath(gx, gz) || isPath(gx - 1, gz) || inFeature(seed, p, gx, gz) || inFeature(seed, p, gx - 1, gz)) return false;
  return hash01(seed, 610, gx, gz) < p.hedgeP;
}
function hedgeZ(seed: number, p: GardenParams, gx: number, gz: number): boolean {
  if (isPath(gx, gz) || isPath(gx, gz - 1) || inFeature(seed, p, gx, gz) || inFeature(seed, p, gx, gz - 1)) return false;
  return hash01(seed, 611, gx, gz) < p.hedgeP;
}

function lampAt(seed: number, _p: GardenParams, gx: number, gz: number): boolean {
  const onX = ((gx % PATH_EVERY) + PATH_EVERY) % PATH_EVERY === 0;
  const onZ = ((gz % PATH_EVERY) + PATH_EVERY) % PATH_EVERY === 0;
  return (onX || onZ) && !(onX && onZ) && ((gx + gz) & 1) === 0 && hash01(seed, 612, gx, gz) < 0.6;
}

function gardenThinFloor(seed: number, p: GardenParams, gx: number, gz: number): boolean {
  return !isPath(gx, gz) && !inFeature(seed, p, gx, gz) && hash01(seed, 613, gx, gz) < p.thinFloorP;
}

const LAMP_Y = 3.1;

function buildFeature(c: { x0: number; z0: number; rng: Rng; aero: boolean }, kind: string, o: Out): void {
  const S = 12; // 3 cells
  const x0 = c.x0;
  const z0 = c.z0;
  const mx = x0 + S / 2;
  const mz = z0 + S / 2;
  const s = o.solids;
  const d = o.decor;
  const rim = c.aero ? 'aero-white' : 'stone';
  const water = 'water';
  switch (kind) {
    case 'fountain': {
      const r = 3.2;
      box(s, mx - r, 0, mz - r, mx + r, 0.55, mz - r + 0.4, rim);
      box(s, mx - r, 0, mz + r - 0.4, mx + r, 0.55, mz + r, rim);
      box(s, mx - r, 0, mz - r + 0.4, mx - r + 0.4, 0.55, mz + r - 0.4, rim);
      box(s, mx + r - 0.4, 0, mz - r + 0.4, mx + r, 0.55, mz + r - 0.4, rim);
      box(d, mx - r + 0.4, 0.01, mz - r + 0.4, mx + r - 0.4, 0.4, mz + r - 0.4, water);
      box(s, mx - 0.4, 0, mz - 0.4, mx + 0.4, 1.8, mz + 0.4, rim);
      box(s, mx - 1.0, 1.8, mz - 1.0, mx + 1.0, 2.0, mz + 1.0, rim);
      if (c.aero) {
        // Glossy orbs floating above the fountain
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          const ox = mx + Math.cos(a) * 1.8;
          const oz = mz + Math.sin(a) * 1.8;
          const y = 2.4 + c.rng.float() * 1.2;
          box(d, ox - 0.25, y, oz - 0.25, ox + 0.25, y + 0.5, oz + 0.25, 'glow-blue');
          o.lights.push({ x: ox, y, z: oz, I: 1.2 });
        }
      } else box(d, mx - 0.15, 2.0, mz - 0.15, mx + 0.15, 2.6, mz + 0.15, water);
      o.items.push({ uid: 'f0', id: 'almond_water', x: mx + r - 0.2, y: 0.55, z: mz, rot: 0 });
      break;
    }
    case 'gazebo': {
      const r = 3;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        box(s, mx + sx * r - 0.15, 0, mz + sz * r - 0.15, mx + sx * r + 0.15, 2.8, mz + sz * r + 0.15, c.aero ? 'aero-white' : 'wood-dark');
      box(s, mx - r - 0.5, 2.8, mz - r - 0.5, mx + r + 0.5, 3.1, mz + r + 0.5, c.aero ? 'glass' : 'wood-dark');
      box(s, mx - r - 0.1, 0, mz - r - 0.1, mx + r + 0.1, 0.2, mz + r + 0.1, rim);
      box(s, mx - 1.6, 0.2, mz - 0.3, mx + 1.6, 0.65, mz + 0.3, 'wood-dark');
      o.lights.push({ x: mx, y: 2.6, z: mz, I: 1.5 });
      box(d, mx - 0.15, 2.5, mz - 0.15, mx + 0.15, 2.78, mz + 0.15, 'glow');
      o.items.push({ uid: 'f0', id: 'almond_water', x: mx + 1.2, y: 0.65, z: mz, rot: 1 });
      break;
    }
    case 'pond': {
      box(d, x0 + 1, 0.005, z0 + 1, x0 + S - 1, 0.05, z0 + S - 1, water);
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        const sx = x0 + 1.5 + t * (S - 3) + c.rng.range(-0.5, 0.5);
        const sz = z0 + 1.5 + t * (S - 3) + c.rng.range(-0.8, 0.8);
        box(s, sx - 0.45, 0, sz - 0.45, sx + 0.45, 0.25, sz + 0.45, 'stone');
      }
      o.items.push({ uid: 'f0', id: 'almond_water', x: mx, y: 0.25, z: mz, rot: 1 });
      break;
    }
    case 'stone-circle': {
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const sx = mx + Math.cos(a) * 4.2;
        const sz = mz + Math.sin(a) * 4.2;
        const h = 2.4 + c.rng.float() * 1.2;
        box(s, sx - 0.4, 0, sz - 0.3, sx + 0.4, h, sz + 0.3, 'stone');
      }
      box(d, mx - 1.2, 0.005, mz - 1.2, mx + 1.2, 0.03, mz + 1.2, 'glow');
      o.lights.push({ x: mx, y: 0.6, z: mz, I: 2.2 });
      o.zones.push({ kind: 'gate', x0: mx - 1.0, z0: mz - 1.0, x1: mx + 1.0, z1: mz + 1.0 });
      break;
    }
    case 'hedge-maze': {
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const hx = x0 + i * 4;
          const hz = z0 + j * 4;
          if (i > 0 && c.rng.chance(0.55)) box(s, hx - 0.3, 0, hz + 0.6, hx + 0.3, 2.6, hz + 4, 'hedge');
          if (j > 0 && c.rng.chance(0.55)) box(s, hx + 0.6, 0, hz - 0.3, hx + 4, 2.6, hz + 0.3, 'hedge');
        }
      o.items.push({ uid: 'f0', id: 'almond_water', x: mx, y: 0, z: mz, rot: 1 });
      break;
    }
    case 'flower-field':
      box(s, x0 + 0.5, 0, z0 + 0.5, x0 + S - 0.5, 0.18, z0 + S - 0.5, 'flowers-' + c.rng.int(0, 2));
      for (let k = 0; k < 4; k++) {
        const tx = x0 + 2 + c.rng.float() * (S - 4);
        const tz = z0 + 2 + c.rng.float() * (S - 4);
        box(s, tx - 0.15, 0, tz - 0.15, tx + 0.15, 1.6, tz + 0.15, 'bark');
        box(d, tx - 1, 1.4, tz - 1, tx + 1, 2.6, tz + 1, 'leaves-pink');
      }
      break;
    case 'waterfall': {
      // A wall of falling water; walking through it leads elsewhere (SPEC U3).
      box(d, x0 + 2, 0, mz - 0.15, x0 + S - 2, 7, mz + 0.15, 'water');
      box(s, x0 + 1.6, 0, mz - 0.6, x0 + 2, 7.2, mz + 0.6, 'aero-white');
      box(s, x0 + S - 2, 0, mz - 0.6, x0 + S - 1.6, 7.2, mz + 0.6, 'aero-white');
      box(s, x0 + 1.6, 7, mz - 0.6, x0 + S - 1.6, 7.4, mz + 0.6, 'aero-white');
      box(d, x0 + 2, 0, mz - 1.5, x0 + S - 2, 0.03, mz + 1.5, 'water');
      o.lights.push({ x: mx, y: 1.5, z: mz, I: 2.5 });
      o.zones.push({ kind: 'gate', x0: x0 + 2.2, z0: mz - 0.3, x1: x0 + S - 2.2, z1: mz + 0.3 });
      break;
    }
    case 'glass-tube': {
      // Glass elevator tube with a glowing ring (decorative)
      box(s, mx - 1.2, 0, mz - 1.2, mx + 1.2, 12, mz + 1.2, 'glass');
      for (let y = 0.5; y < 12; y += 2.5) box(d, mx - 1.25, y, mz - 1.25, mx + 1.25, y + 0.12, mz + 1.25, 'glow-blue');
      o.lights.push({ x: mx, y: 3, z: mz, I: 2.5 });
      break;
    }
    case 'kiosk': {
      box(s, mx - 1.0, 0, mz - 0.6, mx + 1.0, 1.2, mz + 0.6, 'aero-white');
      box(s, mx - 0.1, 1.2, mz - 0.1, mx + 0.1, 2.1, mz + 0.1, 'aero-white');
      box(d, mx - 0.8, 2.1, mz - 0.05, mx + 0.8, 3.0, mz + 0.05, 'glow-blue');
      o.lights.push({ x: mx, y: 2.5, z: mz, I: 1.6 });
      o.items.push({ uid: 'f0', id: 'almond_water', x: mx + 0.5, y: 1.2, z: mz, rot: 0 });
      break;
    }
  }
}

export function generateGarden(ctx: GenContext, p: GardenParams, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const C = GARDEN_CELL;
  const N = GARDEN_N;
  const S = C * N;
  const o = emptyOut();
  const aero = p.style === 'aero';
  const gx0 = cx * N;
  const gz0 = cz * N;
  const pathMat = aero ? 'aero-white' : 'path';
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const gx = gx0 + i;
      const gz = gz0 + j;
      const lx = i * C;
      const lz = j * C;
      if (isPath(gx, gz)) box(o.decor, lx, 0.002, lz, lx + C, 0.02, lz + C, pathMat);
      const hh = p.hedgeH;
      const hm = aero ? 'glass' : 'hedge';
      if (hedgeX(seed, p, gx, gz)) box(o.solids, lx - 0.35, 0, lz + 0.2, lx + 0.35, hh, lz + C - 0.2, hm);
      if (hedgeZ(seed, p, gx, gz)) box(o.solids, lx + 0.2, 0, lz - 0.35, lx + C - 0.2, hh, lz + 0.35, hm);
      if (lampAt(seed, p, gx, gz)) {
        const px = lx + 0.5;
        const pz = lz + 0.5;
        box(o.solids, px - 0.07, 0, pz - 0.07, px + 0.07, LAMP_Y, pz + 0.07, 'metal');
        box(o.decor, px - 0.2, LAMP_Y, pz - 0.2, px + 0.2, LAMP_Y + 0.35, pz + 0.2, p.lampsOn ? 'glow' : 'glass');
      }
      if (isPath(gx, gz) || inFeature(seed, p, gx, gz)) continue;
      if (gardenThinFloor(seed, p, gx, gz)) {
        box(o.decor, lx + C / 2 - 0.9, 0.003, lz + C / 2 - 0.9, lx + C / 2 + 0.9, 0.01, lz + C / 2 + 0.9, 'floor-thin');
        o.zones.push({ kind: 'thin-floor', x0: lx + C / 2 - 0.9, z0: lz + C / 2 - 0.9, x1: lx + C / 2 + 0.9, z1: lz + C / 2 + 0.9 });
        continue;
      }
      const h = hash01(seed, 620, gx, gz);
      if (h < p.treeP) {
        const tx = lx + C / 2 + (hash01(seed, 621, gx, gz) - 0.5) * 1.2;
        const tz = lz + C / 2 + (hash01(seed, 622, gx, gz) - 0.5) * 1.2;
        const leaf = p.leafMats[Math.floor(hash01(seed, 623, gx, gz) * p.leafMats.length)];
        const th = 1.8 + hash01(seed, 624, gx, gz) * 1.5;
        if (aero) box(o.solids, tx - 0.8, 0, tz - 0.8, tx + 0.8, 0.5, tz + 0.8, 'aero-white');
        box(o.solids, tx - 0.18, 0, tz - 0.18, tx + 0.18, th + 0.6, tz + 0.18, 'bark');
        if (aero) box(o.decor, tx - 1.2, th, tz - 1.2, tx + 1.2, th + 2.2, tz + 1.2, leaf);
        else {
          box(o.decor, tx - 1.5, th, tz - 1.5, tx + 1.5, th + 1.3, tz + 1.5, leaf);
          box(o.decor, tx - 1.0, th + 1.3, tz - 1.0, tx + 1.0, th + 2.3, tz + 1.0, leaf);
          box(o.decor, tx - 0.5, th + 2.3, tz - 0.5, tx + 0.5, th + 3.0, tz + 0.5, leaf);
        }
      } else if (h < p.treeP + p.bedP) {
        const fm = p.flowerMats[Math.floor(hash01(seed, 625, gx, gz) * p.flowerMats.length)];
        box(o.solids, lx + 0.7, 0, lz + 0.7, lx + C - 0.7, 0.3, lz + C - 0.7, aero ? 'aero-white' : 'stone');
        box(o.decor, lx + 0.85, 0.3, lz + 0.85, lx + C - 0.85, 0.42, lz + C - 0.85, fm);
      } else if (h < p.treeP + p.bedP + p.doorP) {
        // A door standing alone in the garden.
        o.props.push({ uid: `g${i},${j}`, kind: 'plain-door', x: lx + C / 2, y: 0, z: lz + C / 2, rotY: Math.floor(hash01(seed, 626, gx, gz) * 4) * (Math.PI / 2), color: aero ? 0xf4fbff : 0x8a6a4a });
      } else if (h < p.treeP + p.bedP + p.doorP + p.lootP) {
        o.items.push({ uid: `${i},${j}`, id: 'almond_water', x: lx + C / 2, y: 0, z: lz + C / 2, rot: h * 40 });
      }
    }
  const f = featureFor(seed, p, cx, cz);
  if (f) {
    const fo = emptyOut();
    buildFeature({ x0: f.i0 * C, z0: f.j0 * C, rng: new Rng(hashInts(seed, 630, cx, cz)), aero }, f.kind, fo);
    o.solids.push(...fo.solids);
    o.decor.push(...fo.decor);
    o.items.push(...fo.items);
    o.zones.push(...fo.zones, { kind: 'piece', name: f.kind, x0: f.i0 * C, z0: f.j0 * C, x1: f.i0 * C + 12, z1: f.j0 * C + 12 });
  }
  return chunkData(ctx, cx, cz, S, o, [{ x0: 0, z0: 0, x1: S, z1: S, y: 0 }]);
}

export function gardenSampler(ctx: GenContext, p: GardenParams, cx: number, cz: number): LightSampler {
  const seed = ctx.levelSeed;
  const C = GARDEN_CELL;
  const N = GARDEN_N;
  const lights: Array<{ x: number; y: number; z: number; I: number }> = [];
  if (p.lampsOn)
    for (let gx = (cx - 1) * N; gx < (cx + 2) * N; gx++)
      for (let gz = (cz - 1) * N; gz < (cz + 2) * N; gz++)
        if (lampAt(seed, p, gx, gz)) lights.push({ x: gx * C + 0.5, y: LAMP_Y, z: gz * C + 0.5, I: 2.4 });
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const f = featureFor(seed, p, cx + dx, cz + dz);
      if (!f) continue;
      const fo = emptyOut();
      buildFeature({ x0: f.i0 * C, z0: f.j0 * C, rng: new Rng(hashInts(seed, 630, cx + dx, cz + dz)), aero: p.style === 'aero' }, f.kind, fo);
      for (const l of fo.lights) lights.push({ x: l.x + (cx + dx) * C * N, y: l.y, z: l.z + (cz + dz) * C * N, I: l.I });
    }
  return outdoorSampler(p.daylight, p.sun, lights);
}

export function gardenArrival(ctx: GenContext, p: GardenParams, h: number): SpawnPoint {
  const seed = ctx.levelSeed;
  // Arrive on a path crossing (always open).
  const gx = (Math.floor(hash01(seed, 640, h) * 20) - 10) * PATH_EVERY;
  const gz = (Math.floor(hash01(seed, 641, h) * 20) - 10) * PATH_EVERY + 2;
  void p;
  return { x: gx * GARDEN_CELL + GARDEN_CELL / 2, y: 0, z: gz * GARDEN_CELL + GARDEN_CELL / 2, yaw: Math.floor(hash01(seed, 642, h) * 4) * (Math.PI / 2) };
}

// ===========================================================================
// Walkways over the void (groundless)
// ===========================================================================

export interface WalkwayParams {
  linkP: number;
  gapP: number;
  beamW: number;
  heightStep: number;
  lampP: number;
  doorP: number;
  lootP: number;
  pillarP: number;
  deckMat: string;
  daylight: number;
  sun: [number, number, number];
}

export const WALK_CELL = 6;
export const WALK_N = 5;

function nodeH(seed: number, p: WalkwayParams, gx: number, gz: number): number {
  // Neighbouring nodes share heights in 2x2 groups, so most links are flat.
  return Math.floor(hash01(seed, 701, Math.floor(gx / 2), Math.floor(gz / 2)) * 4) * p.heightStep;
}
/** Link between node (gx-1,gz) and (gx,gz) [axis 0], or (gx,gz-1) and (gx,gz) [axis 1]. */
function link(seed: number, p: WalkwayParams, axis: number, gx: number, gz: number): 0 | 1 | 2 {
  const h = hash01(seed, 702, axis, gx, gz);
  if (h >= p.linkP) return 0;
  return h < p.gapP ? 2 : 1; // 2 = link with a jumpable gap in the middle
}

/** Stepped half-beam from a node edge (height h0) to the midpoint (height hm). */
function halfBeam(o: Out, p: WalkwayParams, ax: number, az: number, bx: number, bz: number, h0: number, hm: number, gap: boolean): void {
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const end = gap ? len - 0.6 : len;
  const steps = Math.max(1, Math.ceil(Math.abs(hm - h0) / 0.35));
  const w = p.beamW / 2;
  for (let k = 0; k < steps; k++) {
    const t0 = (k / steps) * end;
    const t1 = ((k + 1) / steps) * end;
    const top = h0 + ((hm - h0) * (k + 1)) / steps;
    const x0 = ax + ux * t0;
    const z0 = az + uz * t0;
    const x1 = ax + ux * t1;
    const z1 = az + uz * t1;
    box(o.solids, Math.min(x0, x1) - (ux === 0 ? w : 0), top - 0.3, Math.min(z0, z1) - (uz === 0 ? w : 0), Math.max(x0, x1) + (ux === 0 ? w : 0), top, Math.max(z0, z1) + (uz === 0 ? w : 0), p.deckMat);
  }
}

export function generateWalkways(ctx: GenContext, p: WalkwayParams, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const C = WALK_CELL;
  const N = WALK_N;
  const S = C * N;
  const o = emptyOut();
  const pad = 1.3; // node platform half-size
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const gx = cx * N + i;
      const gz = cz * N + j;
      const mx = i * C + C / 2;
      const mz = j * C + C / 2;
      const h = nodeH(seed, p, gx, gz);
      const big = hash01(seed, 703, gx, gz) < 0.12;
      const r = big ? 2.4 : pad;
      box(o.solids, mx - r, h - 0.4, mz - r, mx + r, h, mz + r, p.deckMat);
      if (hash01(seed, 704, gx, gz) < p.pillarP) box(o.solids, mx - 0.3, h - 40, mz - 0.3, mx + 0.3, h - 0.4, mz + 0.3, 'dark');
      // Half-beams toward each linked neighbour (each node owns its halves).
      const nbs: Array<[number, number, number, number, number]> = [
        [0, gx, gz, -1, 0], // west: link stored at (gx,gz) axis 0
        [0, gx + 1, gz, 1, 0], // east
        [1, gx, gz, 0, -1], // north
        [1, gx, gz + 1, 0, 1], // south
      ];
      for (const [axis, lx, lz, dx, dz] of nbs) {
        const k = link(seed, p, axis, lx, lz);
        if (!k) continue;
        const hn = nodeH(seed, p, gx + dx, gz + dz);
        const hm = (h + hn) / 2;
        halfBeam(o, p, mx + dx * r, mz + dz * r, mx + (dx * C) / 2, mz + (dz * C) / 2, h, hm, k === 2 && h === hn);
      }
      const roll = hash01(seed, 705, gx, gz);
      if (roll < p.lampP) {
        box(o.solids, mx + r - 0.3, h, mz + r - 0.3, mx + r - 0.15, h + 2.4, mz + r - 0.15, 'metal');
        box(o.decor, mx + r - 0.4, h + 2.4, mz + r - 0.4, mx + r - 0.05, h + 2.7, mz + r - 0.05, 'glow');
      } else if (roll < p.lampP + p.doorP && big) {
        o.props.push({ uid: `w${i},${j}`, kind: 'plain-door', x: mx, y: h, z: mz, rotY: 0, color: 0x5a5a6a });
      } else if (roll < p.lampP + p.doorP + p.lootP) {
        o.items.push({ uid: `${i},${j}`, id: 'almond_water', x: mx + 0.6, y: h, z: mz - 0.6, rot: roll * 30 });
      }
    }
  return chunkData(ctx, cx, cz, S, o, []);
}

export function walkwaySampler(ctx: GenContext, p: WalkwayParams, cx: number, cz: number): LightSampler {
  const seed = ctx.levelSeed;
  const lights: Array<{ x: number; y: number; z: number; I: number }> = [];
  for (let gx = (cx - 1) * WALK_N; gx < (cx + 2) * WALK_N; gx++)
    for (let gz = (cz - 1) * WALK_N; gz < (cz + 2) * WALK_N; gz++) {
      if (hash01(seed, 705, gx, gz) >= p.lampP) continue;
      const big = hash01(seed, 703, gx, gz) < 0.12;
      const r = big ? 2.4 : 1.3;
      const h = nodeH(seed, p, gx, gz);
      lights.push({ x: gx * WALK_CELL + WALK_CELL / 2 + r - 0.2, y: h + 2.5, z: gz * WALK_CELL + WALK_CELL / 2 + r - 0.2, I: 2.2 });
    }
  return outdoorSampler(p.daylight, p.sun, lights);
}

export function walkwayArrival(ctx: GenContext, p: WalkwayParams, h: number): SpawnPoint {
  const seed = ctx.levelSeed;
  const gx = Math.floor(hash01(seed, 710, h) * 30) - 15;
  const gz = Math.floor(hash01(seed, 711, h) * 30) - 15;
  return { x: gx * WALK_CELL + WALK_CELL / 2, y: nodeH(seed, p, gx, gz), z: gz * WALK_CELL + WALK_CELL / 2, yaw: Math.floor(hash01(seed, 712, h) * 4) * (Math.PI / 2) };
}

// ===========================================================================
// Floating roads (U1 Skyway Dawn)
// ===========================================================================

export interface RoadParams {
  linkP: number;
  /** Chance that a link has a gap; small gaps are jumpable, big ones not. */
  gapP: number;
  railP: number;
  overpassP: number;
  pieceP: number;
  daylight: number;
  sun: [number, number, number];
}

export const ROAD_S = 32;
const R0 = 11; // deck from 11m to 21m across the chunk
const R1 = 21;

function roadLink(seed: number, p: RoadParams, axis: number, gx: number, gz: number): 0 | 1 | 2 | 3 {
  const h = hash01(seed, 801, axis, gx, gz);
  if (h >= p.linkP) return 0;
  if (h < p.gapP * 0.5) return 3; // wide gap (cannot jump)
  if (h < p.gapP) return 2; // narrow gap (jumpable)
  return 1;
}

export function roadPiece(seed: number, p: RoadParams, cx: number, cz: number): string | null {
  if (hash01(seed, 802, cx, cz) >= p.pieceP) return null;
  return ['toll', 'gantry', 'rest', 'tower'][Math.floor(hash01(seed, 803, cx, cz) * 4)];
}

export function generateRoads(ctx: GenContext, p: RoadParams, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const S = ROAD_S;
  const o = emptyOut();
  const T = 0.6;
  // Junction deck
  box(o.solids, R0, -T, R0, R1, 0, R1, 'road-x');
  // Half roads (each chunk owns the halves from its junction to its own edges)
  const halves: Array<[number, number, number, 'x' | 'z', number]> = [
    [0, cx, cz, 'x', -1],
    [0, cx + 1, cz, 'x', 1],
    [1, cx, cz, 'z', -1],
    [1, cx, cz + 1, 'z', 1],
  ];
  for (const [axis, lx, lz, dir, sgn] of halves) {
    const k = roadLink(seed, p, axis, lx, lz);
    if (!k) continue;
    const cut = k === 3 ? 5 + hash01(seed, 804, axis, lx, lz) * 4 : k === 2 ? 0.6 : 0;
    const a = sgn < 0 ? cut : R1;
    const b = sgn < 0 ? R0 : S - cut;
    if (dir === 'x') box(o.solids, a, -T, R0, b, 0, R1, 'road-x');
    else box(o.solids, R0, -T, a, R1, 0, b, 'road-z');
    if (hash01(seed, 805, axis, lx, lz) < p.railP) {
      for (const side of [R0, R1 - 0.15]) {
        if (dir === 'x') box(o.solids, a, 0, side, b, 0.8, side + 0.15, 'metal');
        else box(o.solids, side, 0, a, side + 0.15, 0.8, b, 'metal');
      }
    }
  }
  // Overpasses far above, continuous along whole rows/columns (decorative).
  if (hash01(seed, 806, 0, cz) < p.overpassP) {
    box(o.solids, 0, 11.4, 3, S, 12, 9, 'road-x');
    box(o.solids, 15, -30, 5, 17, 11.4, 7, 'stone');
  }
  if (hash01(seed, 806, 1, cx) < p.overpassP) {
    box(o.solids, 23, 18.4, 0, 29, 19, S, 'road-z');
    box(o.solids, 25, -30, 15, 27, 18.4, 17, 'stone');
  }
  const piece = roadPiece(seed, p, cx, cz);
  if (piece === 'toll') {
    for (const bx of [12.5, 16, 19.5]) {
      box(o.solids, bx - 0.6, 0, 15, bx + 0.6, 2.5, 17, 'aero-white');
      box(o.decor, bx - 0.65, 2.5, 14.8, bx + 0.65, 2.7, 17.2, 'metal');
      box(o.decor, bx + 0.6, 1.0, 16.8, bx + 0.7, 1.1, 19.8, 'glow'); // raised barrier arm
    }
    o.items.push({ uid: 'toll', id: 'almond_water', x: 16, y: 0, z: 17.5, rot: 0 });
    o.zones.push({ kind: 'piece', name: 'toll', x0: R0, z0: R0, x1: R1, z1: R1 });
  } else if (piece === 'gantry') {
    box(o.solids, R0 - 0.4, 0, 15.6, R0, 6.5, 16.4, 'metal');
    box(o.solids, R1, 0, 15.6, R1 + 0.4, 6.5, 16.4, 'metal');
    box(o.solids, R0 - 0.4, 6.5, 15.6, R1 + 0.4, 7.0, 16.4, 'metal');
    box(o.decor, R0 + 0.5, 4.6, 15.9, R1 - 0.5, 6.4, 16.1, 'sign-green');
    // The light under the gantry is a way out.
    box(o.decor, R0 + 1, 0.01, 15.5, R1 - 1, 0.03, 16.5, 'glow');
    o.lights.push({ x: 16, y: 1.0, z: 16, I: 3 });
    o.zones.push({ kind: 'gate', x0: R0 + 1, z0: 15.5, x1: R1 - 1, z1: 16.5 });
    o.zones.push({ kind: 'piece', name: 'gantry', x0: R0, z0: R0, x1: R1, z1: R1 });
  } else if (piece === 'rest') {
    // A floating rest area beside the junction.
    box(o.solids, R1, -T, R0 + 1, R1 + 8, 0, R1 - 1, 'path');
    box(o.solids, R1 + 6.5, 0, R0 + 2, R1 + 7.5, 1.9, R0 + 3.2, 'aero-white');
    box(o.decor, R1 + 6.45, 0.6, R0 + 2.1, R1 + 6.5, 1.7, R0 + 3.1, 'glow-blue');
    box(o.solids, R1 + 2, 0, R1 - 3, R1 + 4.5, 0.45, R1 - 2.4, 'wood-dark');
    o.lights.push({ x: R1 + 6, y: 1.2, z: R0 + 2.6, I: 2 });
    o.items.push({ uid: 'rest', id: 'almond_water', x: R1 + 5.5, y: 0, z: R0 + 4, rot: 0 });
    o.props.push({ uid: 'restdoor', kind: 'plain-door', x: R1 + 4, y: 0, z: R1 - 1.05, rotY: Math.PI, color: 0x9aa4ac });
    o.zones.push({ kind: 'piece', name: 'rest', x0: R1, z0: R0, x1: R1 + 8, z1: R1 });
  } else if (piece === 'tower') {
    // A road standing on end: a vertical slab of asphalt, like a wall in the sky.
    box(o.solids, 2, -10, 2, 9, 22, 2.6, 'road-z');
    o.zones.push({ kind: 'piece', name: 'tower', x0: 0, z0: 0, x1: 10, z1: 4 });
  }
  return chunkData(ctx, cx, cz, S, o, []);
}

export function roadSampler(ctx: GenContext, p: RoadParams, cx: number, cz: number): LightSampler {
  const seed = ctx.levelSeed;
  const lights: Array<{ x: number; y: number; z: number; I: number }> = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const pc = roadPiece(seed, p, cx + dx, cz + dz);
      const ox = (cx + dx) * ROAD_S;
      const oz = (cz + dz) * ROAD_S;
      if (pc === 'gantry') lights.push({ x: ox + 16, y: 1, z: oz + 16, I: 3 });
      if (pc === 'rest') lights.push({ x: ox + R1 + 6, y: 1.2, z: oz + R0 + 2.6, I: 2 });
    }
  return outdoorSampler(p.daylight, p.sun, lights);
}

export function roadArrival(ctx: GenContext, p: RoadParams, h: number): SpawnPoint {
  const seed = ctx.levelSeed;
  void p;
  const cx = Math.floor(hash01(seed, 820, h) * 12) - 6;
  const cz = Math.floor(hash01(seed, 821, h) * 12) - 6;
  return { x: cx * ROAD_S + 14, y: 0, z: cz * ROAD_S + 14, yaw: Math.floor(hash01(seed, 822, h) * 4) * (Math.PI / 2) };
}
