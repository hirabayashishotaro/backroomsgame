import { hashString, hashInts } from '../core/rng';
import type { ExitRule, GenContext, LevelDefinition } from './levelDefinition';
import { level0 } from './hand/level0';
import { level1 } from './hand/level1';
import { level2 } from './hand/level2';
import { makeGeneratedLevel } from './procedural/generated';
import { levelU1, levelU2, levelU3, levelVoid } from './hand/special';
import { level13, level139, level14, level27, level37, level4_3, level7_5 } from './hand/wikiLevels';
import { levelFrontrooms } from './hand/frontrooms';
import { SHAPE_LEVELS } from './hand/shapeLevels';
import { setLevelResolver } from './resolverHook';

const HAND_LEVELS: Record<string, LevelDefinition> = {
  [level0.id]: level0,
  [level1.id]: level1,
  [level2.id]: level2,
  [levelU1.id]: levelU1,
  [levelU2.id]: levelU2,
  [levelU3.id]: levelU3,
  [levelVoid.id]: levelVoid,
  [level4_3.id]: level4_3,
  [level7_5.id]: level7_5,
  [level13.id]: level13,
  [level14.id]: level14,
  [level27.id]: level27,
  [level37.id]: level37,
  [level139.id]: level139,
  [levelFrontrooms.id]: levelFrontrooms,
};

/** Hand-made levels in display order (developer level select). */
export const HAND_LEVEL_IDS = [
  '0', '1', '2', '4.3', '7.5', '13', '14', '27', '37', '139', 'u1', 'u2', 'u3', 'void',
  '111', '222', '303', '666', '1000', '808', '120', '512', '77', '451', '313', '900', 'null', '212', '9999', '37.2', '186', 'chaos',
  'frontrooms',
];

const shapeCache = new Map<string, LevelDefinition>();

export function hasHandLevel(id: string): boolean {
  return id in HAND_LEVELS || id in SHAPE_LEVELS;
}

/** Resolve a level id: hand-made if available, otherwise generated from the id (SPEC §5.1). */
export function resolveLevel(id: string): LevelDefinition {
  const hand = HAND_LEVELS[id];
  if (hand) return hand;
  if (id in SHAPE_LEVELS) {
    let L = shapeCache.get(id);
    if (!L) shapeCache.set(id, (L = SHAPE_LEVELS[id]()));
    return L;
  }
  return makeGeneratedLevel(id);
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

setLevelResolver(resolveLevel, makeGenContext);
