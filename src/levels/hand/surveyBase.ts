/**
 * Inside a survey base (user design): a concrete room behind the bunker door
 * of an indoor level. One or two living survey members to talk to, a weapon
 * rack with weapons and ammunition, cots, a radio desk. No entities come in.
 * Every base is its own level ('base:<level>:<cx>:<cz>:<cy>'), so what you
 * take from one rack stays taken there. Pure; deterministic from the id.
 */
import { hash01, hashString, Rng } from '../../core/rng';
import type { Box, ChunkData, ItemSpawn, LightPanel, Prop } from '../../world/chunkData';
import type { ItemId } from '../../items/itemDefs';
import type { LevelDefinition } from '../levelDefinition';

export const BASE_PREFIX = 'base:';
export const isBaseLevel = (id: string) => id.startsWith(BASE_PREFIX);

const S = 32;
const H = 3.4;
/** The room (chunk 0,0, local coordinates). */
const R = { x0: 8, z0: 10, x1: 24, z1: 22 };
const T = 0.3;
/** Just inside the exit door, facing into the room. */
export const BASE_ARRIVAL = { x: 16, y: 0, z: R.z0 + 1.3, yaw: Math.PI };

/** What a rack may hold. */
const RACK_WEAPONS: Array<[ItemId, number]> = [
  ['pistol', 30],
  ['shotgun', 18],
  ['magnum', 16],
  ['kunai', 14],
  ['axe', 10],
  ['laser', 6],
  ['rocket', 6],
];
const AMMO: ItemId[] = ['ammo_pistol', 'ammo_shotgun', 'ammo_magnum', 'ammo_rocket'];

function pickWeighted(rng: Rng): ItemId {
  const total = RACK_WEAPONS.reduce((s, w) => s + w[1], 0);
  let x = rng.float() * total;
  for (const [id, w] of RACK_WEAPONS) {
    x -= w;
    if (x < 0) return id;
  }
  return 'pistol';
}

/** The base's contents: rack items, survey members. */
export function baseContents(id: string): { items: ItemSpawn[]; people: Prop[] } {
  const rng = new Rng(hashString('base-contents:' + id));
  const items: ItemSpawn[] = [];
  // Weapons laid along the rack table (back wall), 2-4 of them, no two the same.
  const n = 2 + rng.int(0, 2);
  const weapons: ItemId[] = [];
  for (let k = 0; k < 20 && weapons.length < n; k++) {
    const w = pickWeighted(rng);
    if (!weapons.includes(w)) weapons.push(w);
  }
  weapons.forEach((w, i) => items.push({ uid: 'w' + i, id: w, x: 10.2 + i * 1.5, y: 0.92, z: R.z1 - 0.75, rot: 0.1 }));
  // Ammunition boxes on the shelf beside it: one for each gun on the rack, plus a few more.
  const ammoFor: Partial<Record<ItemId, ItemId>> = { pistol: 'ammo_pistol', shotgun: 'ammo_shotgun', magnum: 'ammo_magnum', rocket: 'ammo_rocket' };
  const ammo: ItemId[] = weapons.map((w) => ammoFor[w]).filter((a): a is ItemId => !!a);
  for (let k = 0; k < 3; k++) ammo.push(rng.pick(AMMO));
  ammo.slice(0, 7).forEach((a, i) => items.push({ uid: 'a' + i, id: a, x: 17.4 + (i % 4) * 0.9, y: 0.92, z: R.z1 - 0.7 - Math.floor(i / 4) * 0.5, rot: 0 }));
  // Almond water by the cots.
  for (let i = 0; i < 2; i++) items.push({ uid: 'aw' + i, id: 'almond_water', x: 9.4 + i * 0.5, y: 0.5, z: 14.6, rot: 0 });
  // One or two survey members.
  const people: Prop[] = [{ uid: 'p0', kind: 'surveyor', x: 19.5, y: 0, z: 14.5, rotY: -2.4 }];
  if (rng.chance(0.55)) people.push({ uid: 'p1', kind: 'surveyor', x: 13, y: 0, z: 18.6, rotY: 2.6 });
  return { items, people };
}

function chunkFor(id: string, cx: number, cz: number): ChunkData {
  const solids: Box[] = [];
  const decor: Box[] = [];
  const lights: LightPanel[] = [];
  const d: ChunkData = { levelId: id, cx, cz, size: S, solids, decor, lights, floors: [], ceilings: [], items: [], props: [], zones: [] };
  if (cx !== 0 || cz !== 0) return d;
  const b = (list: Box[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string) => list.push({ minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, mat });
  d.floors.push({ x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1, y: 0 });
  d.ceilings.push({ x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1, y: H });
  // Walls
  b(solids, R.x0 - T, 0, R.z0 - T, R.x1 + T, H, R.z0, 'wall');
  b(solids, R.x0 - T, 0, R.z1, R.x1 + T, H, R.z1 + T, 'wall');
  b(solids, R.x0 - T, 0, R.z0, R.x0, H, R.z1, 'wall');
  b(solids, R.x1, 0, R.z0, R.x1 + T, H, R.z1, 'wall');
  // A yellow-and-black stripe along the bottom of the walls.
  b(decor, R.x0 + 0.01, 0, R.z1 - 0.02, R.x1 - 0.01, 0.25, R.z1 - 0.01, 'hazard');
  b(decor, R.x0 + 0.01, 0, R.z0 + 0.01, R.x1 - 0.01, 0.25, R.z0 + 0.02, 'hazard');
  // The weapon rack: a long table against the back wall, a pegboard above it.
  b(solids, R.x0 + 1.4, 0, R.z1 - 1.1, R.x0 + 8.4, 0.9, R.z1 - 0.3, 'metal');
  b(decor, R.x0 + 1.4, 1.1, R.z1 - 0.06, R.x0 + 8.4, 2.4, R.z1 - 0.02, 'shelf');
  // Ammunition shelf beside it
  b(solids, R.x0 + 9, 0, R.z1 - 1.2, R.x0 + 13, 0.9, R.z1 - 0.3, 'shelf');
  b(solids, R.x0 + 9, 1.6, R.z1 - 0.7, R.x0 + 13, 1.65, R.z1 - 0.3, 'shelf');
  for (let i = 0; i < 4; i++) b(solids, R.x0 + 9.3 + i, 1.65, R.z1 - 0.65, R.x0 + 9.8 + i, 1.95, R.z1 - 0.35, 'crate');
  // Cots along the west wall
  for (const z of [12.2, 15.4]) {
    b(solids, R.x0 + 0.2, 0, z, R.x0 + 2.2, 0.45, z + 0.9, 'metal');
    b(decor, R.x0 + 0.25, 0.45, z + 0.05, R.x0 + 2.15, 0.55, z + 0.85, 'cot');
  }
  // Radio desk in the east corner, a map on the wall, crates.
  b(solids, R.x1 - 2.6, 0, R.z0 + 0.3, R.x1 - 0.3, 0.8, R.z0 + 1.1, 'wood-dark');
  b(solids, R.x1 - 2.2, 0.8, R.z0 + 0.4, R.x1 - 1.4, 1.15, R.z0 + 0.8, 'metal'); // radio
  b(decor, R.x1 - 2.05, 0.95, R.z0 + 0.81, R.x1 - 1.6, 1.05, R.z0 + 0.82, 'radio-glow');
  b(decor, R.x1 - 0.02, 1.2, R.z0 + 3, R.x1 - 0.01, 2.4, R.z0 + 6, 'map-board');
  b(solids, R.x1 - 1.4, 0, R.z1 - 3.2, R.x1 - 0.3, 0.9, R.z1 - 2.1, 'crate');
  b(solids, R.x1 - 1.3, 0.9, R.z1 - 3.0, R.x1 - 0.5, 1.6, R.z1 - 2.3, 'crate');
  // Lights
  for (const x of [12, 20]) for (const z of [13, 19]) lights.push({ x, y: H - 0.02, z, w: 0.6, d: 1.2, state: 1 });
  // The way out, and what is here.
  d.props.push({ uid: 'exit', kind: 'base-exit', x: 16, y: 0, z: R.z0 + 0.02, rotY: 0 });
  const c = baseContents(id);
  d.items.push(...c.items);
  d.props.push(...c.people);
  d.zones.push({ kind: 'piece', name: 'survey-base', x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1 });
  return d;
}

const cache = new Map<string, LevelDefinition>();

/** The level behind one bunker door. */
export function makeBaseLevel(id: string): LevelDefinition {
  let L = cache.get(id);
  if (L) return L;
  const shade = hash01(hashString(id), 3);
  L = {
    id,
    title: '調査基地',
    name: '前哨基地',
    subtitle: 'Survey Outpost',
    threatClass: 0,
    chunkSize: S,
    ceilingHeight: H,
    palette: {
      wallTex: shade < 0.5 ? 'gen:concrete:8a8a80:961' : 'gen:concrete:7e8478:962',
      floorTex: 'gen:floor-concrete:5a5850:963',
      ceilingTex: 'gen:concrete:6a6a62:964',
      lightColor: 0xfff4dc,
      fogColor: 0x14140f,
      fogDensity: 0.01,
      ambient: 0.6,
      lightTint: [1, 0.97, 0.9],
    },
    generator: (_ctx, cx, cz) => chunkFor(id, cx, cz),
    lightSampler: () => (_x, wy, _z, nx, ny) => 0.6 + 0.2 * Math.max(0, ny) - 0.06 * Math.abs(nx) + 0.08 * (wy / H),
    setPieces: [],
    lootTable: { perCell: 0, rules: [] },
    exits: [],
    drainMul: 0,
    hallucination: 0,
    footstep: 'concrete',
    ambience: { humFreq: 50, humGain: 0.008, noiseGain: 0.004, noiseCutoff: 900 },
    environment: 'enclosed',
    kindLabel: '調査基地',
    topology: 'closed',
    spawn: BASE_ARRIVAL,
    arrival: () => BASE_ARRIVAL,
  };
  cache.set(id, L);
  return L;
}
