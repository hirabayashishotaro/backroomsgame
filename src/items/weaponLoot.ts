/**
 * Rare weapon finds (pure, deterministic): now and then a chunk holds the body
 * of a fallen survey-team member with a weapon and ammunition beside it; loose
 * ammunition turns up a little more often. Placed on existing item spots, so
 * everything lands on walkable ground in every kind of level.
 */
import { hash01, hashString } from '../core/rng';
import type { ChunkData, ItemSpawn } from '../world/chunkData';
import type { ItemId } from './itemDefs';

export interface Corpse {
  uid: string;
  x: number;
  y: number;
  z: number;
  rot: number;
}

/** Chance per chunk of a corpse with a weapon, and per item spot of loose ammo. */
export const CORPSE_P = 0.045;
export const AMMO_P = 0.12;

const WEAPON_TABLE: Array<[ItemId, number]> = [
  ['pistol', 45],
  ['kunai', 22],
  ['axe', 18],
  ['magnum', 15],
];

function pick(u: number): ItemId {
  const total = WEAPON_TABLE.reduce((s, w) => s + w[1], 0);
  let x = u * total;
  for (const [id, w] of WEAPON_TABLE) {
    x -= w;
    if (x < 0) return id;
  }
  return 'pistol';
}

/** Adds weapon/ammo items to a chunk and returns corpses to draw. Mutates `data.items`. */
export function augmentLoot(data: ChunkData, levelSeed: number, safeLevel: boolean): Corpse[] {
  if (safeLevel || !data.items.length) return [];
  const key = hashString(data.levelId + ':' + data.cx + ',' + data.cz + ',' + (data.cy ?? 0));
  // Work on copies: generators may hand out cached item objects.
  data.items = data.items.map((i) => ({ ...i }));
  const corpses: Corpse[] = [];
  const extra: ItemSpawn[] = [];
  data.items.forEach((it, k) => {
    if (it.id !== 'almond_water') return;
    if (k === 0 && hash01(levelSeed, 1301, key) < CORPSE_P) {
      // The body lies next to the spot; the weapon and a spare magazine lie on it.
      const rot = hash01(levelSeed, 1302, key) * Math.PI * 2;
      corpses.push({ uid: 'corpse', x: it.x, y: it.y, z: it.z, rot });
      const w = pick(hash01(levelSeed, 1303, key));
      it.id = w;
      const ammo: ItemId | null = w === 'pistol' ? 'ammo_pistol' : w === 'magnum' ? 'ammo_magnum' : null;
      if (ammo) extra.push({ uid: it.uid + ':a', id: ammo, x: it.x + Math.cos(rot) * 0.5, y: it.y, z: it.z + Math.sin(rot) * 0.5, rot });
      return;
    }
    const u = hash01(levelSeed, 1304, key, k);
    if (u < AMMO_P) it.id = u < AMMO_P * 0.75 ? 'ammo_pistol' : 'ammo_magnum';
  });
  data.items.push(...extra);
  return corpses;
}
