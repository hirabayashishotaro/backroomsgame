/**
 * Fusion levels (user request: random levels the player has never seen).
 * Instead of picking one world and recolouring it, a fusion level layers
 * independent choices on top of each other:
 *   base form (hills, canyons, terraces, spires, dunes, craters, islands, flat)
 *   x roof (open sky of any kind / a ceiling of any material / the void)
 *   x ground and cliff materials (carpet hills, tiled canyons, page dunes...)
 *   x liquid (none / water / lava / pool water) at some height
 *   x 2-4 feature sets from other worlds (giant books, lava falls, yellow
 *     office walls, floating cubes, buried heads, ribs of something huge...)
 *   x lighting mood, fog, hostility.
 * The same layering can be laid over existing generated worlds (overlay), so
 * a cave can have lava dripping from its ceiling and books the size of houses.
 * Pure (no three.js); deterministic from the level id.
 */
import { hash01, hashString, Rng } from '../../core/rng';
import type { ChunkData } from '../../world/chunkData';
import { groundHeight, type FloorRect, type WBox } from '../../world/collision';
import { makeTerrain, sampleTerrain } from '../../world/terrain';
import type { GenContext, LevelDefinition, SpawnPoint } from '../levelDefinition';
import { drawFeature, FEATURE_INFO, ALL_FEATURES, type FeatureId, type Placement } from './features';
import { box, emptyOut, fbm2, sampler, toChunk, type Light } from './kit';
import { SKY_PRESETS, type SkyKind } from '../../systems/skyPresets';

export const FUSION_S = 32;

export type BaseForm = 'flat' | 'hills' | 'canyon' | 'terraces' | 'spires' | 'dunes' | 'craters' | 'islands';
export const BASE_LABEL: Record<BaseForm, string> = {
  flat: '平原',
  hills: '丘陵',
  canyon: '峡谷',
  terraces: '段丘',
  spires: '尖塔の地',
  dunes: '砂紋の原',
  craters: 'クレーター',
  islands: '群島',
};

export interface FusionGenome {
  base: BaseForm;
  amp: number;
  scale: number;
  roof: 'sky' | 'ceiling' | 'void';
  sky: SkyKind;
  ceilingH: number;
  ground: string;
  cliff: string;
  liquid: null | { mat: string; y: number; lava: boolean };
  features: FeatureId[];
  /** Feature scale (0.6 = small, 3 = enormous) and how many per chunk. */
  featureScale: number;
  density: number;
  /** A hostile level: dark, little water, harsh terrain. */
  hostile: boolean;
  brightness: number;
  fog: number;
  fogDensity: number;
  palette: { wall: string; floor: string; ceiling: string };
}

const GROUND_SETS: Array<[string, string, string]> = [
  // [ground material, cliff material, palette floor texture used by 'floor']
  ['grass', 'rock', ''],
  ['snow', 'rock', ''],
  ['sand', 'sand', ''],
  ['moss', 'rock', ''],
  ['rock', 'basalt', ''],
  ['basalt', 'obsidian', ''],
  ['endstone', 'endstone', ''],
  ['marble', 'marble', ''],
  ['pool-tile', 'pool-tile', ''],
  ['backrooms-carpet', 'backrooms-wall', ''],
  ['pages', 'book-brown', ''],
  ['flesh', 'flesh-dark', ''],
  ['tile-white', 'tile-blue', ''],
  ['path', 'stone', ''],
  ['aero-white', 'tile-blue', ''],
  ['tatami', 'wood-dark', ''],
  // From the explicit worlds:
  ['neon-grid', 'neon-grid', ''], // Vaporwave wireframe
  ['vapor-check', 'plaster', ''],
  ['memphis-tile', 'terrazzo', ''], // Memphis
  ['terrazzo', 'memphis-stripes', ''],
];

const LIQUIDS: Array<{ mat: string; lava: boolean }> = [
  { mat: 'water', lava: false },
  { mat: 'ocean', lava: false },
  { mat: 'water-dark', lava: false },
  { mat: 'pool-water', lava: false },
  { mat: 'water-shallow', lava: false },
  { mat: 'lava', lava: true },
];

const CEILING_TEX = ['flat:ffffff', 'gen:rock:3a3430:801', 'ceiling-tile', 'gen:concrete:4a4844:802', 'gen:pooltile:f2f0e6:803', 'gen:wood:3e2a18:804', 'gen:flesh:7a2838:805', 'gen:marble:eceae6:806', 'studs'];
const WALL_TEX = ['memphis-squiggle', 'plaster', 'wallpaper-yellow', 'gen:concrete:8a8680:811', 'gen:tile:d9e3e6:812', 'gen:brick:7a3b2a:813', 'gen:marble:eceae6:814', 'gen:rock:5a5450:815'];

/** The genome of a fusion level (deterministic from its id). */
export function fusionGenome(id: string): FusionGenome {
  const rng = new Rng(hashString('fusion:' + id));
  const base = rng.pick<BaseForm>(['flat', 'hills', 'hills', 'canyon', 'terraces', 'spires', 'dunes', 'craters', 'islands', 'islands']);
  const hostile = rng.chance(0.2);
  const roofRoll = rng.float();
  const roof: FusionGenome['roof'] = base === 'islands' && roofRoll < 0.35 ? 'void' : roofRoll < 0.33 ? 'ceiling' : 'sky';
  const [ground, cliff] = rng.pick(GROUND_SETS);
  const amp = { flat: 0.6, hills: 6 + rng.float() * 10, canyon: 10 + rng.float() * 14, terraces: 6 + rng.float() * 8, spires: 4 + rng.float() * 5, dunes: 2 + rng.float() * 3, craters: 5 + rng.float() * 6, islands: 4 + rng.float() * 4 }[base];
  let liquid: FusionGenome['liquid'] = null;
  if (base === 'islands' && roof !== 'void') liquid = { ...rng.pick(LIQUIDS), y: 0 };
  else if (base !== 'flat' && roof !== 'void' && rng.chance(hostile ? 0.6 : 0.35)) liquid = { ...(hostile ? { mat: 'lava', lava: true } : rng.pick(LIQUIDS)), y: (rng.float() - 0.2) * amp * 0.5 };
  const nf = 2 + rng.int(0, 2);
  const pool = [...ALL_FEATURES];
  const features: FeatureId[] = [];
  while (features.length < nf) features.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  const sky = rng.pick<SkyKind>(hostile ? ['night', 'void', 'dusk', 'overcast', 'synth'] : ['day', 'dusk', 'night', 'dawn', 'overcast', 'void', 'synth', 'vapor']);
  const brightness = roof === 'ceiling' ? (hostile ? 0.06 : 0.12 + rng.float() * 0.3) : { day: 1, dusk: 0.6, dawn: 0.7, night: 0.25, overcast: 0.75, void: 0.15, synth: 0.35, vapor: 0.95 }[sky] * (hostile ? 0.6 : 1);
  return {
    base,
    amp,
    scale: 30 + rng.float() * 60,
    roof,
    sky,
    ceilingH: 8 + rng.float() * 10,
    ground,
    cliff,
    liquid,
    features,
    featureScale: rng.pick([0.7, 1, 1, 1.4, 2, 3]),
    density: hostile ? 0.35 : 0.45 + rng.float() * 0.4,
    hostile,
    brightness,
    fog: roof === 'ceiling' ? rng.pick([0x050505, 0x0a0805, 0x0a1012, 0x120608, 0x101010]) : SKY_PRESETS[sky].horizon,
    fogDensity: roof === 'ceiling' ? 0.03 + rng.float() * 0.04 : hostile ? 0.035 : 0.008 + rng.float() * 0.02,
    palette: { wall: rng.pick(WALL_TEX), floor: 'carpet-damp', ceiling: rng.pick(CEILING_TEX) },
  };
}

/** Ground height of the base form at a world point. */
export function fusionHeight(seed: number, g: FusionGenome, x: number, z: number): number {
  const u = x / g.scale;
  const v = z / g.scale;
  let h: number;
  switch (g.base) {
    case 'flat':
      h = g.amp * (fbm2(seed, 901, u * 3, v * 3, 2) - 0.5);
      break;
    case 'hills':
      h = g.amp * (fbm2(seed, 902, u, v) - 0.45);
      break;
    case 'canyon': {
      const r = Math.abs(fbm2(seed, 903, u * 0.8, v * 0.8, 3) * 2 - 1);
      h = g.amp * Math.min(1, r * 4) - g.amp * 0.5 + 1.5 * fbm2(seed, 904, u * 4, v * 4, 2);
      break;
    }
    case 'terraces': {
      const raw = g.amp * fbm2(seed, 905, u, v);
      const step = 1.2;
      const fl = Math.floor(raw / step);
      const fr = raw / step - fl;
      // Flat terraces joined by short, steep (still climbable) risers.
      h = (fl + Math.min(1, Math.max(0, (fr - 0.8) / 0.2))) * step - g.amp * 0.4;
      break;
    }
    case 'spires': {
      const base = g.amp * (fbm2(seed, 906, u, v, 3) - 0.5);
      const spike = Math.pow(Math.max(0, fbm2(seed, 907, u * 6, v * 6, 2) - 0.55) / 0.45, 3) * g.amp * 6;
      h = base + spike;
      break;
    }
    case 'dunes':
      h = g.amp * (Math.sin(x / 7 + 3 * fbm2(seed, 908, u, v, 2)) * 0.5 + 0.5) + g.amp * (fbm2(seed, 909, u, v, 2) - 0.5);
      break;
    case 'craters': {
      const cs = 40;
      const ci = Math.floor(x / cs);
      const cj = Math.floor(z / cs);
      let d = 0;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const px = (ci + a + hash01(seed, 910, ci + a, cj + b)) * cs;
          const pz = (cj + b + hash01(seed, 911, ci + a, cj + b)) * cs;
          const r = 8 + hash01(seed, 912, ci + a, cj + b) * 12;
          const q = Math.hypot(x - px, z - pz) / r;
          if (q < 1.3) d = Math.min(d, q < 1 ? -(1 - q * q) : (q - 1) * 0.6 * (1.3 - q));
        }
      h = g.amp * d + 2 * fbm2(seed, 913, u * 2, v * 2, 2);
      break;
    }
    default: {
      // islands
      const land = fbm2(seed, 914, u * 1.3, v * 1.3, 3);
      h = land > 0.52 ? 0.6 + (land - 0.52) * g.amp * 6 : g.roof === 'void' ? -60 : -2.5;
    }
  }
  if (g.roof === 'ceiling') h = Math.min(h, g.ceilingH - 3.5);
  return h;
}

/** Feature placements of a fusion chunk (local coordinates). */
function fusionPlan(seed: number, g: FusionGenome, cx: number, cz: number): Placement[] {
  const out: Placement[] = [];
  const ox = cx * FUSION_S;
  const oz = cz * FUSION_S;
  const room = g.roof === 'ceiling' ? 1 : Infinity;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      if (hash01(seed, 920, cx * 4 + i, cz * 4 + j) > g.density) continue;
      const f = g.features[Math.floor(hash01(seed, 921, cx * 4 + i, cz * 4 + j) * g.features.length)];
      const x = i * 8 + 1.5 + hash01(seed, 922, cx * 4 + i, cz * 4 + j) * 5;
      const z = j * 8 + 1.5 + hash01(seed, 923, cx * 4 + i, cz * 4 + j) * 5;
      const y = fusionHeight(seed, g, ox + x, oz + z);
      if (g.liquid && y < g.liquid.y + 0.2 && f !== 'floating' && f !== 'fragments' && f !== 'pillars') continue;
      if (y < -30) continue; // over the void
      const s = g.featureScale * (0.7 + hash01(seed, 924, cx * 4 + i, cz * 4 + j) * 0.6);
      const headroom = g.roof === 'ceiling' ? g.ceilingH - y : Infinity;
      if (headroom < FEATURE_INFO[f].h * Math.min(1, s) * 0.5) continue;
      out.push({ f, x, y, z, s, k: hash01(seed, 925, cx * 4 + i, cz * 4 + j), rot: hash01(seed, 926, cx * 4 + i, cz * 4 + j) < 0.5, room: headroom * room });
    }
  return out;
}

/** Doors (exits), gates, bottles: one or two things per chunk, never on a feature. */
function fusionExtras(seed: number, g: FusionGenome, cx: number, cz: number, plan: Placement[]) {
  const ox = cx * FUSION_S;
  const oz = cz * FUSION_S;
  const spots: Array<{ x: number; y: number; z: number; r: number }> = [];
  for (let k = 0; k < 16 && spots.length < 4; k++) {
    const x = 2 + hash01(seed, 930, cx, cz, k) * 28;
    const z = 2 + hash01(seed, 931, cx, cz, k) * 28;
    const y = fusionHeight(seed, g, ox + x, oz + z);
    if (y < -30 || (g.liquid && y < g.liquid.y + 0.3)) continue;
    if (plan.some((p) => Math.hypot(p.x - x, p.z - z) < FEATURE_INFO[p.f].r * p.s + 2)) continue;
    spots.push({ x, y, z, r: hash01(seed, 932, cx, cz, k) });
  }
  return spots;
}

export function generateFusion(ctx: GenContext, g: FusionGenome, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  const ox = cx * FUSION_S;
  const oz = cz * FUSION_S;
  const terrain = makeTerrain(ox, oz, FUSION_S, 1, (x, z) => fusionHeight(seed, g, x, z), { flat: g.ground, steep: g.cliff, steepAt: 1.0 });
  if (g.liquid) {
    box(o.decor, 0, g.liquid.y - 0.05, 0, FUSION_S, g.liquid.y, FUSION_S, g.liquid.mat);
    o.zones.push({ kind: g.liquid.lava ? 'lava' : 'water', x0: 0, z0: 0, x1: FUSION_S, z1: FUSION_S });
  }
  if (g.roof === 'ceiling') o.ceilings.push({ x0: 0, z0: 0, x1: FUSION_S, z1: FUSION_S, y: g.ceilingH });
  const lights: Light[] = [];
  const plan = fusionPlan(seed, g, cx, cz);
  for (const p of plan) drawFeature(o, p, lights);
  const spots = fusionExtras(seed, g, cx, cz, plan);
  spots.forEach((sp, k) => {
    if (sp.r < 0.22) {
      // A door standing by itself, somewhere it should not be.
      box(o.solids, sp.x - 0.7, sp.y - 0.3, sp.z - 0.15, sp.x + 0.7, sp.y + 2.4, sp.z + 0.15, g.cliff);
      o.props.push({ uid: 'fd' + k, kind: 'plain-door', x: sp.x, y: sp.y, z: sp.z + 0.17, rotY: 0, color: 0x8a8f94 });
      o.zones.push({ kind: 'piece', name: 'fusion-door', x0: sp.x - 1, z0: sp.z - 1, x1: sp.x + 1, z1: sp.z + 1 });
    } else if (sp.r < 0.3) {
      // A ring of light on the ground: step in to leave.
      box(o.decor, sp.x - 0.9, sp.y + 0.02, sp.z - 0.9, sp.x + 0.9, sp.y + 0.05, sp.z + 0.9, 'portal');
      o.zones.push({ kind: 'gate', x0: sp.x - 0.8, z0: sp.z - 0.8, x1: sp.x + 0.8, z1: sp.z + 0.8 });
    } else if (sp.r < (g.hostile ? 0.6 : 0.85)) o.items.push({ uid: 'fb' + k, id: 'almond_water', x: sp.x, y: sp.y, z: sp.z, rot: sp.r * 6 });
  });
  return { ...toChunk(ctx, cx, cz, 0, FUSION_S, o), terrain };
}

/** Light: the mood's ambient/sun plus glowing features of this and neighbouring chunks. */
export function fusionSampler(ctx: GenContext, g: FusionGenome, cx: number, cz: number) {
  const lights: Light[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const local: Light[] = [];
      for (const p of fusionPlan(ctx.levelSeed, g, cx + dx, cz + dz)) drawFeature(emptyOut(), p, local);
      for (const l of local) lights.push({ x: l.x + (cx + dx) * FUSION_S, y: l.y, z: l.z + (cz + dz) * FUSION_S, I: l.I });
    }
  const lava = g.liquid?.lava ? { y: g.liquid.y, I: 0.7 } : undefined;
  return g.roof === 'ceiling' ? sampler(g.brightness, null, lights, lava) : sampler(g.brightness, SKY_PRESETS[g.sky].sunDir, lights, lava);
}

/** A walkable arrival point: on dry ground, gentle slope, clear of features. */
export function fusionArrival(ctx: GenContext, g: FusionGenome, h: number): SpawnPoint {
  const seed = ctx.levelSeed;
  const H = (x: number, z: number) => fusionHeight(seed, g, x, z);
  for (let k = 0; k < 600; k++) {
    // Whole metres: the terrain mesh passes exactly through the height there.
    const x = Math.round((hash01(seed, 940, h, k) - 0.5) * 400);
    const z = Math.round((hash01(seed, 941, h, k) - 0.5) * 400);
    const y = H(x, z);
    if (y < -30 || (g.liquid && y < g.liquid.y + 0.4)) continue;
    if (Math.abs(H(x + 1, z) - H(x - 1, z)) > 0.9 || Math.abs(H(x, z + 1) - H(x, z - 1)) > 0.9) continue;
    if (g.roof === 'ceiling' && y + 2.4 > g.ceilingH) continue;
    const cx = Math.floor(x / FUSION_S);
    const cz = Math.floor(z / FUSION_S);
    const lx = x - cx * FUSION_S;
    const lz = z - cz * FUSION_S;
    if (lx < 1 || lx > FUSION_S - 1 || lz < 1 || lz > FUSION_S - 1) continue;
    const near = [...fusionPlan(seed, g, cx, cz), ...fusionPlan(seed, g, cx - 1, cz).map((p) => ({ ...p, x: p.x - FUSION_S })), ...fusionPlan(seed, g, cx + 1, cz).map((p) => ({ ...p, x: p.x + FUSION_S })), ...fusionPlan(seed, g, cx, cz - 1).map((p) => ({ ...p, z: p.z - FUSION_S })), ...fusionPlan(seed, g, cx, cz + 1).map((p) => ({ ...p, z: p.z + FUSION_S }))];
    if (near.some((p) => Math.hypot(p.x - lx, p.z - lz) < FEATURE_INFO[p.f].r * p.s * 1.5 + 2.5)) continue;
    // Not inside a door / gate block either.
    const ex = fusionExtras(seed, g, cx, cz, fusionPlan(seed, g, cx, cz));
    if (ex.some((e) => e.r < 0.3 && Math.hypot(e.x - lx, e.z - lz) < 2)) continue;
    return { x, y, z, yaw: hash01(seed, 942, h) * Math.PI * 2 };
  }
  return { x: 1, y: H(1, 1), z: 1, yaw: 0 };
}

// ---------------------------------------------------------------------------
// Overlay: pieces of other worlds dropped into an existing generated level
// ---------------------------------------------------------------------------

export interface OverlaySpec {
  features: FeatureId[];
  scale: number;
  density: number;
}

/** Which overlay (if any) an existing generated level gets. */
export function overlayFor(id: string): OverlaySpec | null {
  const rng = new Rng(hashString('overlay:' + id));
  if (!rng.chance(0.65)) return null;
  const pool = [...ALL_FEATURES];
  const n = 1 + rng.int(0, 2);
  const features: FeatureId[] = [];
  while (features.length < n) features.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return { features, scale: rng.pick([0.7, 1, 1.3, 2]), density: 0.35 + rng.float() * 0.4 };
}

/**
 * Set features down on free ground of an already generated chunk: ground from
 * terrain / floors / box tops, headroom from ceilings and boxes above, and a
 * clear footprint (with a margin, so corridors are never blocked). Doors and
 * zones are kept clear.
 */
export function overlayChunk(data: ChunkData, seed: number, spec: OverlaySpec): void {
  const S = data.size;
  const o = emptyOut();
  const lights: Light[] = [];
  const solids = data.solids as WBox[];
  const floors = data.floors as FloorRect[];
  const ceil = [...data.ceilings, ...data.floors];
  const n = Math.max(2, Math.round(S / 8));
  const cell = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const key = [data.cx, data.cz, data.cy ?? 0, i, j] as const;
      if (hash01(seed, 950, ...key) > spec.density) continue;
      const f = spec.features[Math.floor(hash01(seed, 951, ...key) * spec.features.length)];
      const x = (i + 0.25 + hash01(seed, 952, ...key) * 0.5) * cell;
      const z = (j + 0.25 + hash01(seed, 953, ...key) * 0.5) * cell;
      // Ground: the highest surface under this point that has room above it.
      let g = groundHeight(x, z, 0.3, Infinity, floors, solids);
      const t = data.terrain ? sampleTerrain(data.terrain, x, z) : null;
      if (t !== null && (t > g || !Number.isFinite(g))) g = t;
      if (!Number.isFinite(g)) continue;
      // Headroom: lowest ceiling / floor above / box bottom over the footprint.
      const s = spec.scale * (0.7 + hash01(seed, 954, ...key) * 0.6);
      const r = FEATURE_INFO[f].r * s + 1.2;
      if (x - r < 0 || x + r > S || z - r < 0 || z + r > S) continue;
      let room = Infinity;
      for (const c of ceil) if (c.y > g + 0.1 && c.y - g < room && x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) room = c.y - g;
      let blocked = false;
      for (const b of solids) {
        if (b.maxX < x - r || b.minX > x + r || b.maxZ < z - r || b.minZ > z + r) continue;
        if (b.maxY <= g + 0.05) continue; // below the ground
        if (b.minY >= g + 2.2) {
          room = Math.min(room, b.minY - g);
          continue;
        }
        blocked = true;
        break;
      }
      if (blocked) continue;
      if (room < 2.4) continue;
      // Keep doors, gates and set pieces clear.
      if (data.props.some((p) => Math.hypot(p.x - x, p.z - z) < r + 1.5)) continue;
      if (data.zones.some((zn) => zn.kind !== 'water' && zn.kind !== 'lava' && x + r > zn.x0 && x - r < zn.x1 && z + r > zn.z0 && z - r < zn.z1)) continue;
      // Only on level-ish ground (terrain): check the footprint corners.
      if (t !== null && data.terrain) {
        const c = [sampleTerrain(data.terrain, x - r * 0.5, z - r * 0.5), sampleTerrain(data.terrain, x + r * 0.5, z + r * 0.5)];
        if (c.some((v) => v === null || Math.abs(v - g) > 1.5)) continue;
      }
      drawFeature(o, { f, x, y: g, z, s, k: hash01(seed, 955, ...key), rot: hash01(seed, 956, ...key) < 0.5, room }, lights);
    }
  data.solids = [...data.solids, ...o.solids];
  data.decor = [...data.decor, ...o.decor];
}

/** Wrap a level's arrival so it never lands inside an overlay piece. */
export function arrivalAvoidingOverlay(def: LevelDefinition, base: LevelDefinition['arrival']): LevelDefinition['arrival'] {
  return (ctx, h) => {
    const a = base(ctx, h);
    const S = def.chunkSize;
    const cy = def.vertical ? Math.floor(a.y / def.vertical.slab) : 0;
    const blockers: WBox[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const cx = Math.floor(a.x / S) + dx;
        const cz = Math.floor(a.z / S) + dz;
        const d = def.generator(ctx, cx, cz, cy);
        for (const b of d.solids) if (b.overlay) blockers.push({ minX: b.minX + cx * S, maxX: b.maxX + cx * S, minY: b.minY, maxY: b.maxY, minZ: b.minZ + cz * S, maxZ: b.maxZ + cz * S });
      }
    const hit = (x: number, z: number) => blockers.some((b) => b.maxY > a.y + 0.3 && b.minY < a.y + 1.9 && x > b.minX - 0.6 && x < b.maxX + 0.6 && z > b.minZ - 0.6 && z < b.maxZ + 0.6);
    if (!hit(a.x, a.z)) return a;
    // Overlay pieces stand clear of walls by a margin, so stepping back toward where we came from is free.
    for (let r = 1; r <= 10; r++)
      for (let k = 0; k < 8; k++) {
        const x = a.x + Math.cos((k / 8) * Math.PI * 2) * r;
        const z = a.z + Math.sin((k / 8) * Math.PI * 2) * r;
        if (!hit(x, z)) return { ...a, x, z };
      }
    return a;
  };
}

/** Name parts for a fusion level. */
export function fusionName(id: string, g: FusionGenome): { name: string; label: string } {
  const rng = new Rng(hashString('fusion-name:' + id));
  const f = g.features[rng.int(0, g.features.length - 1)];
  const noun = g.roof === 'ceiling' ? rng.pick(['地下', '洞', '大広間', '地底']) : g.roof === 'void' ? rng.pick(['浮島', '虚空', '欠片']) : BASE_LABEL[g.base];
  const lq = g.liquid ? (g.liquid.lava ? '溶岩の' : '水の') : '';
  const adj = FEATURE_INFO[f].adj;
  const name = (rng.chance(0.4) && !adj.includes('水') && !adj.includes('溶岩') ? lq : '') + adj + noun;
  const label = `重ね合わせ: ${BASE_LABEL[g.base]}・${g.roof === 'ceiling' ? '天井' : g.roof === 'void' ? '虚空' : '空'}${g.liquid ? (g.liquid.lava ? '・溶岩' : '・水') : ''}・${g.features.map((q) => FEATURE_INFO[q].name).join('・')}${g.hostile ? '(過酷)' : ''}`;
  return { name, label };
}

