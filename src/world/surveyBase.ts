/**
 * Survey bases (user design): indoor levels hide few rewards, so now and
 * then a chunk holds a small steel bunker with a reinforced door - the way
 * into a base where one or two living survey members keep a weapon rack.
 * Entities cannot follow you in.
 *
 * Pure (no three.js): where the bunker goes in a chunk, its solid, the door
 * prop, and the id of the base behind it. Deterministic from the level seed.
 */
import { hash01, hashString } from '../core/rng';
import type { Box, ChunkData, Prop } from './chunkData';

/** Chance that a chunk of an indoor level holds a base entrance. */
export const BASE_P = 0.05;
/** The bunker: width along its door wall, depth, height (m). */
export const BUNKER = { w: 3.0, d: 2.6, h: 2.7 };

export interface BaseSite {
  /** Bunker centre on the floor (chunk-local). */
  x: number;
  y: number;
  z: number;
  /** Which way the door faces (multiples of 90 degrees; the door's front is +Z rotated by this). */
  rot: number;
  /** The base behind the door (a level id of its own: its rack and its people). */
  baseId: string;
}

export function baseIdFor(levelId: string, cx: number, cz: number, cy = 0): string {
  return `base:${levelId}:${cx}:${cz}:${cy}`;
}

/** The bunker's footprint (chunk-local box) for a site. */
export function bunkerBox(s: BaseSite): Box {
  const along = Math.abs(Math.sin(s.rot)) > 0.5; // door faces along x: the bunker is turned
  const hx = (along ? BUNKER.d : BUNKER.w) / 2;
  const hz = (along ? BUNKER.w : BUNKER.d) / 2;
  return { minX: s.x - hx, maxX: s.x + hx, minY: s.y, maxY: s.y + BUNKER.h, minZ: s.z - hz, maxZ: s.z + hz, mat: 'metal' };
}

/** The door prop, flush with the bunker's front face. */
export function bunkerDoor(s: BaseSite): Prop {
  const fx = Math.sin(s.rot);
  const fz = Math.cos(s.rot);
  const off = BUNKER.d / 2 + 0.02;
  return { uid: 'base-door', kind: 'base-door', x: s.x + fx * off, y: s.y, z: s.z + fz * off, rotY: s.rot };
}

const overlaps = (b: Box, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => b.maxX > x0 && b.minX < x1 && b.maxY > y0 && b.minY < y1 && b.maxZ > z0 && b.minZ < z1;

/**
 * Where (if anywhere) this chunk has a base entrance: on one of its item
 * spots (so on walkable floor), with room for the bunker and a clear space
 * in front of its door, under a ceiling high enough.
 */
export function baseSiteFor(data: ChunkData, levelSeed: number): BaseSite | null {
  const key = hashString(data.levelId + ':' + data.cx + ',' + data.cz + ',' + (data.cy ?? 0));
  if (hash01(levelSeed, 1401, key) >= BASE_P || !data.items.length) return null;
  const S = data.size;
  const start = Math.floor(hash01(levelSeed, 1402, key) * data.items.length);
  for (let k = 0; k < data.items.length; k++) {
    const it = data.items[(start + k) % data.items.length];
    for (let r = 0; r < 4; r++) {
      const rot = ((Math.floor(hash01(levelSeed, 1403, key) * 4) + r) % 4) * (Math.PI / 2);
      // The bunker stands just behind the spot, its door facing the spot.
      const fx = Math.round(Math.sin(rot));
      const fz = Math.round(Math.cos(rot));
      const site: BaseSite = { x: it.x - fx * (BUNKER.d / 2 + 0.6), y: it.y, z: it.z - fz * (BUNKER.d / 2 + 0.6), rot, baseId: baseIdFor(data.levelId, data.cx, data.cz, data.cy ?? 0) };
      const b = bunkerBox(site);
      if (b.minX < 0.5 || b.minZ < 0.5 || b.maxX > S - 0.5 || b.maxZ > S - 0.5) continue;
      // Room for the bunker (with a little margin) and 1.8 m clear in front of the door.
      const m = 0.25;
      if (data.solids.some((s) => overlaps(s, b.minX - m, site.y + 0.1, b.minZ - m, b.maxX + m, site.y + BUNKER.h + 0.2, b.maxZ + m))) continue;
      const dx = site.x + fx * (BUNKER.d / 2 + 0.9);
      const dz = site.z + fz * (BUNKER.d / 2 + 0.9);
      if (data.solids.some((s) => overlaps(s, dx - 0.7, site.y + 0.3, dz - 0.7, dx + 0.7, site.y + 2, dz + 0.7))) continue;
      // Under a ceiling that leaves room above it, on a floor that covers the whole footprint.
      if (data.ceilings.some((c) => c.y < site.y + BUNKER.h + 0.3 && c.x1 > b.minX && c.x0 < b.maxX && c.z1 > b.minZ && c.z0 < b.maxZ)) continue;
      const floorOk = data.terrain ? true : data.floors.some((f) => Math.abs(f.y - site.y) < 0.05 && f.x0 <= b.minX && f.x1 >= b.maxX && f.z0 <= b.minZ && f.z1 >= b.maxZ);
      if (!floorOk) continue;
      if (data.zones.some((zn) => (zn.kind === 'water' || zn.kind === 'lava' || zn.kind === 'thin-floor') && zn.x1 > b.minX && zn.x0 < b.maxX && zn.z1 > b.minZ && zn.z0 < b.maxZ)) continue;
      return site;
    }
  }
  return null;
}
