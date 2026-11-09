/**
 * Item definitions. Per SPEC §17 (v0.3.1) only almond water exists for now;
 * the structure stays data-driven so more items can be added later.
 */

export type ItemId = 'almond_water';

export interface ItemDef {
  id: ItemId;
  name: string;
  desc: string;
  /** Health restored when used. */
  heal: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  almond_water: {
    id: 'almond_water',
    name: 'アーモンドウォーター',
    desc: '甘い香りの水。飲むと体力が回復する。',
    heal: 35,
  },
};
