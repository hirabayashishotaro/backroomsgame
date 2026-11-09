/**
 * Data-driven level definition (SPEC §4.1).
 * Fields not used yet by the engine are optional and filled in by later phases.
 */
import type { ChunkData } from '../world/chunkData';
import type { LootTable } from '../items/lootTables';

export interface Palette {
  /** Procedural texture keys (see src/proc-tex). */
  wallTex: string;
  floorTex: string;
  ceilingTex: string;
  /** Light panel emissive color (hex). */
  lightColor: number;
  /** Fog color and density. */
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
}

export type ChunkGenerator = (ctx: GenContext, cx: number, cz: number) => ChunkData;

/** Per-position baked light intensity function, built per chunk for speed. */
export type LightSampler = (wx: number, wy: number, wz: number, nx: number, ny: number, nz: number) => number;
export type LightSamplerFactory = (ctx: GenContext, cx: number, cz: number) => LightSampler;

export interface SetPieceDef {
  id: string;
  name: string;
  /** Short description for the journal (self-written). */
  desc: string;
}

export interface LevelDefinition {
  id: string;
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
  /** Per-level stat modifiers (SPEC §4.1 statModifiers). */
  statModifiers: { hydrationMul: number; sanityDrain: number; staminaRegenMul: number };
  /** Hallucination frequency multiplier (Level 0 is high, SPEC §9.3). */
  hallucination: number;
  /** Footstep surface. */
  footstep: 'carpet' | 'concrete' | 'tile' | 'water' | 'metal';
  ambience: AmbienceDef;
  environment: 'enclosed' | 'open-sky';
  /** Spawn point in world coordinates. */
  spawn: { x: number; y: number; z: number; yaw: number };
  groundless?: boolean;
  verticalLayers?: { minY: number; maxY: number };
  fall?: { killY: number; mode: 'transition' | 'death' | 'respawn' };
}
