/**
 * Data-driven level definition (SPEC §4.1, simplified per §17).
 */
import type { ChunkData, PropKind, ZoneKind } from '../world/chunkData';
import type { LootTable } from '../items/lootTables';
import type { SkyDef } from '../systems/skyPresets';

export interface Palette {
  /** Procedural texture keys (see src/proc-tex). */
  wallTex: string;
  floorTex: string;
  ceilingTex: string;
  /** Light fixture emissive colour (hex). */
  lightColor: number;
  /** Fog colour and density. */
  fogColor: number;
  fogDensity: number;
  /** Ambient (unlit) brightness 0..1 and baked-light tint. */
  ambient: number;
  lightTint: [number, number, number];
}

export interface AmbienceDef {
  /** Electrical hum base frequency (Hz). 0 = none. */
  humFreq: number;
  humGain: number;
  /** Background noise gain and lowpass cutoff (Hz). */
  noiseGain: number;
  noiseCutoff: number;
}

export interface GenContext {
  worldSeed: number;
  levelSeed: number;
  level: LevelDefinition;
  /**
   * Non-Euclidean epoch (SPEC §3.4): levels that support it reshuffle the
   * interior of chunks generated after the player has walked far enough.
   * Chunk borders never depend on it, so neighbours always match.
   */
  epoch?: number;
}

export type ChunkGenerator = (ctx: GenContext, cx: number, cz: number, cy?: number) => ChunkData;

/** Per-position baked light intensity function, built per chunk for speed. */
export type LightSampler = (wx: number, wy: number, wz: number, nx: number, ny: number, nz: number) => number;
export type LightSamplerFactory = (ctx: GenContext, cx: number, cz: number, cy?: number) => LightSampler;

export interface SetPieceDef {
  id: string;
  name: string;
  /** Short description for the journal (self-written). */
  desc: string;
}

export type ExitKind = 'walk' | 'wall' | 'floor' | 'door' | 'special' | 'depth';

export interface ExitTarget {
  levelId: string;
  weight: number;
}

/** How to leave a level (SPEC §5.1). */
export interface ExitRule {
  kind: ExitKind;
  /** door: which prop kind opens this exit. */
  prop?: PropKind;
  /** special: stay inside this zone kind for `seconds`. */
  zone?: ZoneKind;
  seconds?: number;
  /** walk: cumulative distance walked in the level (m). */
  distance?: number;
  /** wall: seconds of pushing against a thin wall. */
  push?: number;
  /** depth: vertical distance travelled from the entry point (m). */
  depth?: number;
  targets: ExitTarget[];
  /** Self-written description for the journal. */
  discovery: string;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface LevelDefinition {
  id: string;
  /** Title shown on arrival, e.g. "Level 0". */
  title: string;
  name: string;
  subtitle?: string;
  threatClass: 0 | 1 | 2 | 3 | 4 | 5;
  chunkSize: number;
  ceilingHeight: number;
  palette: Palette;
  generator: ChunkGenerator;
  lightSampler: LightSamplerFactory;
  setPieces: SetPieceDef[];
  lootTable: LootTable;
  exits: ExitRule[];
  /** Multiplier on health drain in this level. */
  drainMul: number;
  /** Hallucination frequency multiplier. */
  hallucination: number;
  footstep: 'carpet' | 'concrete' | 'tile' | 'water' | 'metal';
  ambience: AmbienceDef;
  environment: 'enclosed' | 'open-sky';
  /** Default spawn point in world coordinates. */
  spawn: SpawnPoint;
  /**
   * Arrival point for an entry identified by `entryHash` (SPEC §5.4: arriving
   * from different exits lands in different places). Must be walkable.
   */
  arrival: (ctx: GenContext, entryHash: number) => SpawnPoint;
  /** Open-sky levels: sky dome settings (SPEC §3.6). */
  sky?: SkyDef;
  groundless?: boolean;
  fall?: { killY: number; mode: 'transition' | 'death' | 'respawn' };
  /** Short label for the developer level select. */
  kindLabel?: string;
  /**
   * How the level extends (for labels and streaming): flat (default),
   * vertical (streams slabs above/below), diagonal, linear, closed, chaos.
   */
  topology?: 'flat' | 'vertical' | 'diagonal' | 'linear' | 'closed' | 'chaos';
  /** Vertical streaming for vertical levels. */
  vertical?: { slab: number; radius: number; hRadius: number };
  /** Garbled, glitching title (bug levels). */
  glitch?: boolean;
  /** Dynamic drifting doors/wormholes around an island (Level 808). */
  drifters?: { radius: number };
  /** Mesh subdivision for baked lighting (metres per segment, default 1). Bigger = fewer triangles. */
  meshDetail?: number;
  /** Lava: touching it burns and sends you back to the last safe spot. */
  lava?: { y: number; damage: number };
}
