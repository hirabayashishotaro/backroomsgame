/**
 * The player's outfits (pure). Four families:
 *  - the six everyday outfits, always available;
 *  - entity cosplays, won by clearing the escape mode;
 *  - random outfits ('rand:<seed>'), also won by clearing - made like the
 *    random entities, from a genome of independent parts;
 *  - the trophies: silver (a clear without dying) and gold (a clear without
 *    ever being hurt by an entity), each with its own pistol.
 */
import { Rng } from '../core/rng';

export type Skin = string;
export type BaseSkin = 'suit' | 'hoodie' | 'hawaiian' | 'researcher' | 'casual' | 'military';

export const SKINS: Array<[BaseSkin, string]> = [
  ['suit', 'スーツ'],
  ['hoodie', 'フード'],
  ['hawaiian', 'ハワイアン'],
  ['researcher', '調査隊員'],
  ['casual', '私服'],
  ['military', '軍隊'],
];

/** Entity cosplay outfits (rewards). */
export const COSPLAYS: Array<[string, string]> = [
  ['cos:smiler', 'スマイラーのコスプレ'],
  ['cos:hound', 'ハウンドのコスプレ'],
  ['cos:namahage', 'なまはげのコスプレ'],
  ['cos:fanman', 'ファンマンのコスプレ'],
  ['cos:peeker', 'ピーカーのコスプレ'],
  ['cos:witch', 'ウィッチャーのコスプレ'],
  ['cos:gunman', 'ガンマンのコスプレ'],
];

export const SILVER = 'trophy:silver';
export const GOLD = 'trophy:gold';
export const TROPHIES: Array<[string, string]> = [
  [SILVER, 'シルバートロフィー'],
  [GOLD, 'ゴールドトロフィー'],
];

export const isBaseSkin = (s: string): s is BaseSkin => SKINS.some(([id]) => id === s);
export const randomSkinId = (seed: number) => 'rand:' + (seed >>> 0);

// --- Random outfits ------------------------------------------------------------

export type Pattern = 'flat' | 'stripes' | 'spots' | 'check' | 'camo' | 'floral' | 'denim';
export type Headwear = 'hair' | 'cap' | 'beanie' | 'helmet' | 'hood' | 'tophat' | 'bandana' | 'crown';
export type Accessory = 'none' | 'pack' | 'scarf' | 'tie' | 'glasses' | 'cape';

export interface OutfitGenome {
  top: { color: number; accent: number; pattern: Pattern };
  legs: { color: number; accent: number; pattern: Pattern };
  shoes: number;
  shortSleeves: boolean;
  shorts: boolean;
  head: Headwear;
  headColor: number;
  hair: number;
  accessory: Accessory;
  accessoryColor: number;
  name: string;
}

function hsl(h: number, s: number, l: number): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

const COLOR_WORDS = ['赤い', '橙色の', '黄色い', '黄緑の', '緑の', '青緑の', '水色の', '青い', '紫の', '赤紫の', '桃色の', '赤い'];
const PATTERN_WORD: Record<Pattern, string> = { flat: '無地', stripes: 'しま模様', spots: '水玉', check: '市松模様', camo: '迷彩', floral: '花柄', denim: 'デニム' };
const HEAD_WORD: Record<Headwear, string> = { hair: '', cap: 'キャップ', beanie: 'ニット帽', helmet: 'ヘルメット', hood: 'フード', tophat: 'シルクハット', bandana: 'バンダナ', crown: '王冠' };
const ACC_WORD: Record<Accessory, string> = { none: '', pack: 'リュック', scarf: 'マフラー', tie: 'ネクタイ', glasses: 'サングラス', cape: 'マント' };

/** A random outfit, deterministic from its seed. */
export function outfitGenome(seed: number): OutfitGenome {
  const rng = new Rng((seed ^ 0x5c1a) >>> 0);
  const color = () => {
    const dark = rng.chance(0.2);
    return hsl(rng.float(), rng.chance(0.2) ? rng.float() * 0.15 : 0.35 + rng.float() * 0.55, dark ? 0.1 + rng.float() * 0.12 : 0.3 + rng.float() * 0.45);
  };
  const topHue = rng.float();
  const top = { color: hsl(topHue, 0.4 + rng.float() * 0.5, 0.3 + rng.float() * 0.4), accent: color(), pattern: rng.pick<Pattern>(['flat', 'flat', 'stripes', 'spots', 'check', 'camo', 'floral']) };
  const legs = { color: color(), accent: color(), pattern: rng.pick<Pattern>(['flat', 'flat', 'denim', 'denim', 'stripes', 'check', 'camo']) };
  const head = rng.pick<Headwear>(['hair', 'hair', 'cap', 'beanie', 'helmet', 'hood', 'tophat', 'bandana', 'crown']);
  const accessory = rng.pick<Accessory>(['none', 'none', 'pack', 'scarf', 'tie', 'glasses', 'cape']);
  const g: OutfitGenome = {
    top,
    legs,
    shoes: color(),
    shortSleeves: rng.chance(0.4),
    shorts: rng.chance(0.25),
    head,
    headColor: color(),
    hair: rng.pick([0x2a2018, 0x1a1a1a, 0x6a4a2a, 0xc8a050, 0xe8e0d0, 0xa83a2a, 0x3a5ab8]),
    accessory,
    accessoryColor: color(),
    name: '',
  };
  const cw = COLOR_WORDS[Math.floor(topHue * 12) % 12];
  const extra = [HEAD_WORD[head], ACC_WORD[accessory]].filter(Boolean).join('と');
  g.name = `${cw}${PATTERN_WORD[top.pattern]}の服${extra ? 'に' + extra : ''}`;
  return g;
}

/** The name shown for any skin id. */
export function skinLabel(id: Skin): string {
  for (const list of [SKINS, COSPLAYS, TROPHIES] as Array<Array<[string, string]>>) {
    const f = list.find(([k]) => k === id);
    if (f) return f[1];
  }
  if (id.startsWith('rand:')) return outfitGenome(Number(id.slice(5))).name;
  return id;
}
