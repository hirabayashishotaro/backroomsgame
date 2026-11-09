import { hashString, hashInts } from '../core/rng';
import type { ExitRule, GenContext, LevelDefinition } from './levelDefinition';
import { level0 } from './hand/level0';
import { level1 } from './hand/level1';
import { level2 } from './hand/level2';
import { makeGeneratedLevel } from './procedural/generated';
import { levelU1, levelU2, levelU3, levelVoid } from './hand/special';

const HAND_LEVELS: Record<string, LevelDefinition> = {
  [level0.id]: level0,
  [level1.id]: level1,
  [level2.id]: level2,
  [levelU1.id]: levelU1,
  [levelU2.id]: levelU2,
  [levelU3.id]: levelU3,
  [levelVoid.id]: levelVoid,
};

/** Hand-made levels in display order (developer level select). */
export const HAND_LEVEL_IDS = ['0', '1', '2', 'u1', 'u2', 'u3', 'void'];

export function hasHandLevel(id: string): boolean {
  return id in HAND_LEVELS;
}

/** Resolve a level id: hand-made if available, otherwise generated from the id (SPEC §5.1). */
export function resolveLevel(id: string): LevelDefinition {
  return HAND_LEVELS[id] ?? makeGeneratedLevel(id);
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

/**
 * Deterministic destination for an exit (SPEC §5.4.3): the same exit always
 * leads to the same level; different exits may lead to different ones.
 */
export function resolveExitTarget(worldSeed: number, levelId: string, rule: ExitRule, exitKey: string): string {
  const total = rule.targets.reduce((s, t) => s + t.weight, 0);
  let x = (hashInts(worldSeed, hashString(levelId), hashString(rule.kind + ':' + exitKey)) / 4294967296) * total;
  for (const t of rule.targets) {
    x -= t.weight;
    if (x < 0) return t.levelId;
  }
  return rule.targets[rule.targets.length - 1].levelId;
}

/** Entry hash: arriving via different exits lands in different places. */
export function entryHash(fromLevel: string, exitKey: string): number {
  return hashInts(hashString(fromLevel), hashString(exitKey));
}
