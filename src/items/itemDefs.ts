/**
 * Items: almond water (heals), weapons and ammunition. Weapons occupy item
 * slots; ammunition goes straight into the reserve.
 */
import type { AmmoType, WeaponId } from '../weapons/weaponDefs';

export type ItemId = 'almond_water' | 'pistol' | 'magnum' | 'kunai' | 'axe' | 'ammo_pistol' | 'ammo_magnum';

export interface ItemDef {
  id: ItemId;
  name: string;
  desc: string;
  kind: 'consumable' | 'weapon' | 'ammo';
  /** Health restored when used (consumables). */
  heal: number;
  weapon?: WeaponId;
  ammo?: AmmoType;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  almond_water: { id: 'almond_water', name: 'アーモンドウォーター', desc: '甘い香りの水。飲むと体力が回復する。', kind: 'consumable', heal: 35 },
  pistol: { id: 'pistol', name: 'ピストル', desc: '調査隊の標準装備。即着弾、遠いほど威力が落ちる。12発。', kind: 'weapon', heal: 0, weapon: 'pistol' },
  magnum: { id: 'magnum', name: 'マグナム', desc: '重い一撃。弾は飛んでいくので偏差撃ちが必要。6発。', kind: 'weapon', heal: 0, weapon: 'magnum' },
  kunai: { id: 'kunai', name: 'クナイ', desc: '投げて使う。放物線を描き、拾い直せる。10本。', kind: 'weapon', heal: 0, weapon: 'kunai' },
  axe: { id: 'axe', name: '斧', desc: '近接武器。壊れない。', kind: 'weapon', heal: 0, weapon: 'axe' },
  ammo_pistol: { id: 'ammo_pistol', name: 'ピストルの弾', desc: '9mm弾。12発。', kind: 'ammo', heal: 0, ammo: 'pistol' },
  ammo_magnum: { id: 'ammo_magnum', name: 'マグナムの弾', desc: '大口径の弾。6発。', kind: 'ammo', heal: 0, ammo: 'magnum' },
};

export function isWeapon(id: ItemId | null | undefined): id is 'pistol' | 'magnum' | 'kunai' | 'axe' {
  return !!id && ITEMS[id].kind === 'weapon';
}
