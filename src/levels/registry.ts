import { hashString, hashInts } from '../core/rng';
import type { GenContext, LevelDefinition } from './levelDefinition';
import { level0 } from './hand/level0';

const HAND_LEVELS: Record<string, LevelDefinition> = {
  [level0.id]: level0,
};

export function hasHandLevel(id: string): boolean {
  return id in HAND_LEVELS;
}

/**
 * Resolve a level id to a definition.
 * Unknown ids fall back to Level 0 until procedural levels exist (Phase 5/8).
 */
export function resolveLevel(id: string): LevelDefinition {
  return HAND_LEVELS[id] ?? level0;
}

export function makeGenContext(worldSeed: number, level: LevelDefinition): GenContext {
  return { worldSeed, levelSeed: hashInts(worldSeed, hashString('level:' + level.id)), level };
}

/** Convert a user-entered seed string into a 32-bit world seed. */
export function parseWorldSeed(s: string): number {
  const t = s.trim();
  if (/^-?\d+$/.test(t)) return Number(BigInt.asUintN(32, BigInt(t)));
  return hashString(t);
}
