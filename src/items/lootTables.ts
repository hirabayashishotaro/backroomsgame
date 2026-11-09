import type { ItemId } from './itemDefs';

export interface LootRule {
  item: ItemId;
  weight: number;
}

export interface LootTable {
  /** Probability that a given grid cell holds an item. */
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

export const ALMOND_ONLY: LootRule[] = [{ item: 'almond_water', weight: 1 }];
