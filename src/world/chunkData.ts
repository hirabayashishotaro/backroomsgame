/** Pure, renderer-independent chunk content. Coordinates are local to the chunk origin. */
import type { ItemId } from '../items/itemDefs';
import type { TerrainGrid } from './terrain';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Material key (resolved by the mesher via the level palette). */
  mat: string;
  /** A "thin" wall that can be noclipped through (SPEC §5.2 wall). */
  thin?: boolean;
}

export interface LightPanel {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  /** 0 = off, 1 = normal, 2 = flickering, 3 = warm (manila). */
  state: 0 | 1 | 2 | 3;
}

/** Horizontal ceiling rectangle (local coords). */
export interface CeilingRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
}

export interface ItemSpawn {
  /** Unique within the chunk; used as the delta key. */
  uid: string;
  id: ItemId;
  x: number;
  y: number;
  z: number;
  rot: number;
}

export type PropKind = 'exit-door' | 'glass-door' | 'metal-door' | 'white-door' | 'plain-door' | 'locked-door' | 'hatch';

export interface Prop {
  uid: string;
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  /** Rotation about Y; the prop's front faces +Z rotated by this angle. */
  rotY: number;
  /** Colour hint for generic doors (hex). */
  color?: number;
}

export type ZoneKind =
  | 'manila'
  | 'high-hall'
  | 'light-corridor'
  | 'chalk-room'
  | 'exit-door'
  | 'glass-door'
  | 'spawn'
  /** A floor patch that gives way (SPEC §5.2 floor). */
  | 'thin-floor'
  /** A named set piece in a grid level (journal / messages). */
  | 'piece'
  /** Stepping in here leads elsewhere (waterfall, stone circle, gantry light). */
  | 'gate'
  /** Landing in water: no fall damage. */
  | 'water'
  /** Lava: burns and sends you back to the last safe spot. */
  | 'lava';

export interface Zone {
  kind: ZoneKind;
  /** Set piece id for kind 'piece'. */
  name?: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface ChunkData {
  levelId: string;
  cx: number;
  cz: number;
  /** Vertical slab index (vertical levels only; 0 or undefined for flat levels). */
  cy?: number;
  size: number;
  /** Collidable, rendered boxes (walls, pillars). */
  solids: Box[];
  /** Non-collidable rendered boxes (outlets, wall linings). */
  decor: Box[];
  lights: LightPanel[];
  /** Smooth heightfield ground (natural terrain), local coordinates. */
  terrain?: TerrainGrid;
  /** Walkable floor rectangles (usually one covering the chunk at y=0; pits are gaps). */
  floors: CeilingRect[];
  ceilings: CeilingRect[];
  items: ItemSpawn[];
  props: Prop[];
  zones: Zone[];
}

/** Chunk key; flat levels keep the 2D form so older saves still match. */
export function chunkKey(cx: number, cz: number, cy = 0): string {
  return cy ? cx + ',' + cz + ',' + cy : cx + ',' + cz;
}
