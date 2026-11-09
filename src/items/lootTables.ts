import { hash01 } from '../core/rng';
import type { ItemId } from './itemDefs';
import { NOTES } from './itemDefs';

export interface LootRule {
  item: ItemId;
  weight: number;
}

export interface LootTable {
  /** Probability that a given maze cell holds an item. */
  perCell: number;
  rules: LootRule[];
}

/** Weighted pick using a [0,1) value. */
export function pickLoot(rules: LootRule[], u: number): ItemId {
  const total = rules.reduce((s, r) => s + r.weight, 0);
  let x = u * total;
  for (const r of rules) {
    x -= r.weight;
    if (x < 0) return r.item;
  }
  return rules[rules.length - 1].item;
}

/** Meta value for an item spawned at a hashed location (note index, chalk uses). */
export function spawnMeta(id: ItemId, seed: number, a: number, b: number): number | undefined {
  if (id === 'note') return Math.floor(hash01(seed, 991, a, b) * NOTES.length);
  return undefined;
}
