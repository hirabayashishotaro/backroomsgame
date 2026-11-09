/** Item definitions (SPEC §8). Pure data; effects are applied by player/itemUse.ts. */

export type ItemId =
  | 'almond_water'
  | 'almond_water_blue'
  | 'expired_water'
  | 'canned_food'
  | 'energy_bar'
  | 'flashlight'
  | 'battery'
  | 'chalk'
  | 'glowstick'
  | 'first_aid'
  | 'radio'
  | 'compass'
  | 'crowbar'
  | 'key'
  | 'note'
  | 'warm_tea'
  | 'lantern'
  | 'aero_water';

export type ItemShape = 'bottle' | 'can' | 'bar' | 'flashlight' | 'battery' | 'chalk' | 'stick' | 'box' | 'paper' | 'tool';

export interface ItemDef {
  id: ItemId;
  name: string;
  desc: string;
  /** Max stack size per slot. */
  stack: number;
  shape: ItemShape;
  /** Main colour (hex) for the world model and HUD icon. */
  color: number;
  /** Consumed on use. */
  consumable: boolean;
  /** Has a number of uses (chalk). */
  uses?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  almond_water: { id: 'almond_water', name: 'アーモンドウォーター', desc: '甘い香りの水。水分+30、正気+5。', stack: 4, shape: 'bottle', color: 0xe8e2c8, consumable: true },
  almond_water_blue: { id: 'almond_water_blue', name: 'アーモンドウォーター(青)', desc: '青みがかった珍しい一本。正気を大きく回復する。', stack: 4, shape: 'bottle', color: 0x8fc8f0, consumable: true },
  expired_water: { id: 'expired_water', name: 'ラベルの変色した水', desc: 'ラベルが茶色く変色している。飲むのは危険かもしれない。', stack: 4, shape: 'bottle', color: 0xa89a64, consumable: true },
  canned_food: { id: 'canned_food', name: '缶詰', desc: '中身は分からないが食べられる。空腹+40。', stack: 4, shape: 'can', color: 0xb0b4b8, consumable: true },
  energy_bar: { id: 'energy_bar', name: '栄養バー', desc: '固くて甘い。空腹+20、スタミナ回復。', stack: 6, shape: 'bar', color: 0xc77b3a, consumable: true },
  flashlight: { id: 'flashlight', name: '懐中電灯', desc: 'F で点灯。バッテリーを消費する。', stack: 1, shape: 'flashlight', color: 0x2b2f36, consumable: false },
  battery: { id: 'battery', name: 'バッテリー', desc: '使うと懐中電灯のバッテリーが回復する。', stack: 6, shape: 'battery', color: 0x3a8a4a, consumable: true },
  chalk: { id: 'chalk', name: 'チョーク', desc: '壁や床に印をつけられる。迷子対策に。', stack: 1, shape: 'chalk', color: 0xf2f0e6, consumable: false, uses: 20 },
  glowstick: { id: 'glowstick', name: 'グロースティック', desc: '折ると一定時間光る。足元に置く。', stack: 6, shape: 'stick', color: 0x7cff6a, consumable: true },
  first_aid: { id: 'first_aid', name: '救急キット', desc: '体調異常を治し、正気を少し回復する。', stack: 2, shape: 'box', color: 0xd8d8d8, consumable: true },
  radio: { id: 'radio', name: 'ラジオ', desc: '近くの出口に反応して雑音が変わる。', stack: 1, shape: 'tool', color: 0x4a4038, consumable: false },
  compass: { id: 'compass', name: 'コンパス', desc: '方角を示す……はずだが、ここでは針が定まらない。', stack: 1, shape: 'tool', color: 0xb08a3c, consumable: false },
  crowbar: { id: 'crowbar', name: 'バール', desc: '鍵のかかった扉をこじ開けられる。', stack: 1, shape: 'tool', color: 0x8a2a22, consumable: false },
  key: { id: 'key', name: '鍵', desc: 'どこかの扉の鍵。', stack: 4, shape: 'tool', color: 0xc9a640, consumable: false },
  note: { id: 'note', name: 'メモ', desc: '誰かが書き残した紙切れ。Q で読む。', stack: 1, shape: 'paper', color: 0xefe8d0, consumable: false },
  warm_tea: { id: 'warm_tea', name: '温かいお茶', desc: '正気+15、水分+10。', stack: 2, shape: 'can', color: 0x6a8a3a, consumable: true },
  lantern: { id: 'lantern', name: '提灯', desc: '弱い明かり。バッテリー不要。', stack: 1, shape: 'tool', color: 0xd04a2a, consumable: false },
  aero_water: { id: 'aero_water', name: 'エアロウォーター', desc: '青緑に澄んだ水。水分+40、正気+10。', stack: 4, shape: 'bottle', color: 0x4fd6c8, consumable: true },
};

/** Self-written note texts found in the world (SPEC §8: 文章は自作). */
export const NOTES: string[] = [
  '三日目。壁の色は変わらない。蛍光灯の音だけが、数を数えるように鳴っている。',
  '右手を壁につけて歩けば出られる、と思っていた。壁が途中で終わることを知るまでは。',
  '天井の高い部屋を見つけた。そこだけ空気が少し冷たい。誰かが来た形跡はない。',
  'オレンジ色の部屋には長くいないこと。気がつくと、別の場所に立っていた。',
  'チョークで印をつけた角に、また戻ってきた。印の数が一つ多い。',
  '水はある。アーモンドの匂いがする。飲んだら少し頭がはっきりした。',
  '緑の非常口の表示。ドアノブは壁に描かれた絵だった。……本当に?',
  'ガラスの引き戸の向こうに植物が見えた。湿った土の匂いがした気がする。',
  'カーペットが湿っている理由を考えるのはやめた。',
  '遠くを歩けば、どこかの倉庫に出ると誰かが書いていた。どれくらい遠く?',
];
