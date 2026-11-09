/** Pure, renderer-independent chunk content. Coordinates are local to the chunk origin. */

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Material key (resolved by the mesher via the level palette). */
  mat: string;
}

export interface LightPanel {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  /** 0 = off, 1 = normal, 2 = flickering. */
  state: 0 | 1 | 2;
}

export interface ChunkData {
  levelId: string;
  cx: number;
  cz: number;
  size: number;
  /** Collidable, rendered boxes (walls, pillars). */
  solids: Box[];
  /** Non-collidable rendered boxes (outlets, trims). */
  decor: Box[];
  lights: LightPanel[];
  /** Has a floor plane at y=0 / a ceiling plane at ceilingHeight. */
  floor: boolean;
  ceiling: boolean;
}

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}
