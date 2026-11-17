/**
 * Random entities (user design): like the random levels, a random entity is a
 * genome of independent parts layered on top of each other - lower body,
 * upper body, head, arms, technique, movement, effect, size, speed, pattern
 * and colours - so almost every one is a combination nobody has seen.
 *
 * They are not part of the escape mode's "every kind" condition. Pure (no
 * three.js): the genome, its name, its hit boxes and its stats; the model is
 * built from the genome in models.ts and the behaviour lives in brain.ts.
 */
import { hashString, Rng } from '../core/rng';
import { HP_SCALE, type EntityKind } from './entityDefs';

export type Lower = 'biped' | 'quad' | 'spider' | 'float' | 'serpent' | 'wheel' | 'tripod';
export type Upper = 'humanoid' | 'blob' | 'box' | 'tower' | 'orb' | 'ribs';
export type Head = 'sphere' | 'eye' | 'tv' | 'skull' | 'mask' | 'fan' | 'none' | 'lantern' | 'cone' | 'rifle';
/** Its technique (borrowed from the hand-made entities and recombined). */
export type Attack = 'contact' | 'slash' | 'shoot' | 'snipe' | 'lob' | 'lightning' | 'wind' | 'burst' | 'stomp' | 'boulder';
/** How it moves: rush in, keep its distance, creep only while unwatched, hop aside, drift slowly. */
export type Move = 'rush' | 'range' | 'creep' | 'hopper' | 'drift';
export type Effect = 'none' | 'aura' | 'orbit' | 'trail' | 'flicker' | 'glitch' | 'pulse';
export type Pattern = 'flat' | 'stripes' | 'spots' | 'checker' | 'noise' | 'gradient' | 'scales' | 'missing';
export type Voice = 'growl' | 'giggle' | 'hum' | 'step' | 'groan' | 'skitter' | 'whirr' | 'glitch';

export interface ChimeraHitBox {
  f: number;
  y0: number;
  y1: number;
  r: number;
  d?: number;
  head: boolean;
}

export interface ChimeraGenome {
  seed: number;
  name: string;
  hint: string;
  lower: Lower;
  upper: Upper;
  head: Head;
  arms: 0 | 2 | 4;
  attack: Attack;
  /** A second trick for when you come too close (a wind burst), or none. */
  close: 'gust' | 'none';
  move: Move;
  effect: Effect;
  pattern: Pattern;
  /** Body, accent and glow colours (0xRRGGBB). */
  color: number;
  accent: number;
  glow: number;
  /** Overall size multiplier (the model and its hit boxes). */
  scale: number;
  /** Heights (m, already scaled): top of the lower body, of the upper body, and overall. */
  hipY: number;
  shoulderY: number;
  height: number;
  /** Half-width of the body (m, scaled). */
  width: number;
  walk: number;
  run: number;
  hp: number;
  /** Damage of its technique. */
  damage: number;
  /** Seconds between uses of its technique. */
  cooldown: number;
  /** Rounds per burst (shoot). */
  burst: number;
  /** Preferred distance band for ranged ones. */
  near: number;
  far: number;
  voice: Voice;
  hitboxes: ChimeraHitBox[];
  chest: number;
}

const LOWER_H: Record<Lower, number> = { biped: 0.85, quad: 0.62, spider: 0.6, float: 0.55, serpent: 0.45, wheel: 0.6, tripod: 1.0 };
const UPPER_H: Record<Upper, number> = { humanoid: 0.65, blob: 0.8, box: 0.6, tower: 1.0, orb: 0.7, ribs: 0.75 };
const UPPER_W: Record<Upper, number> = { humanoid: 0.26, blob: 0.42, box: 0.33, tower: 0.3, orb: 0.36, ribs: 0.28 };
const HEAD_H: Record<Head, number> = { sphere: 0.32, eye: 0.36, tv: 0.36, skull: 0.32, mask: 0.38, fan: 0.6, none: 0, lantern: 0.42, cone: 0.5, rifle: 0.3 };

const RANGED: Attack[] = ['shoot', 'snipe', 'lob', 'lightning', 'wind', 'boulder'];
const MELEE: Attack[] = ['contact', 'contact', 'slash', 'burst', 'stomp'];

/** Damage, cooldown and preferred range per technique. */
const ATTACK_STATS: Record<Attack, { dmg: [number, number]; cd: [number, number]; near: number; far: number }> = {
  contact: { dmg: [15, 35], cd: [0, 0], near: 0, far: 0 },
  slash: { dmg: [20, 35], cd: [1.0, 1.6], near: 0, far: 0 },
  shoot: { dmg: [6, 12], cd: [2, 3.5], near: 8, far: 20 },
  snipe: { dmg: [30, 50], cd: [4, 6], near: 16, far: 36 },
  lob: { dmg: [20, 35], cd: [3, 4.5], near: 9, far: 22 },
  lightning: { dmg: [25, 40], cd: [3.5, 5], near: 12, far: 26 },
  wind: { dmg: [6, 12], cd: [2.2, 3.5], near: 8, far: 20 },
  burst: { dmg: [60, 140], cd: [0, 0], near: 0, far: 0 },
  stomp: { dmg: [25, 40], cd: [2, 3], near: 0, far: 0 },
  boulder: { dmg: [25, 40], cd: [4.5, 6.5], near: 10, far: 30 },
};

// --- Names (original words, made from the parts) -----------------------------

const ATTACK_WORD: Record<Attack, string[]> = {
  contact: ['噛みつく', '飛びかかる', '這い寄る'],
  slash: ['斬りつける', '刃を振るう'],
  shoot: ['撃ってくる', '弾を吐く'],
  snipe: ['遠くから狙う', '赤い目で狙う'],
  lob: ['投げてくる', '爆弾を抱えた'],
  lightning: ['雷を呼ぶ', '光る輪を描く'],
  wind: ['風を吐く', '息を吹く'],
  burst: ['膨らんで弾ける', '破裂する'],
  stomp: ['踏み鳴らす', '地団駄を踏む'],
  boulder: ['岩を投げる', '石を放る'],
};
const LOWER_WORD: Record<Lower, string> = { biped: '二本足の', quad: '四つ足の', spider: '多脚の', float: '宙に浮く', serpent: '蛇腹の', wheel: '車輪の', tripod: '三脚の' };
const HEAD_WORD: Record<Head, string[]> = {
  sphere: ['丸頭', 'まんまる'],
  eye: ['一つ目', '大目玉'],
  tv: ['箱頭', 'テレビ頭'],
  skull: ['骸骨', 'しゃれこうべ'],
  mask: ['面かぶり', '仮面'],
  fan: ['羽根頭', '扇風機頭'],
  none: ['首なし', '頭のないもの'],
  lantern: ['提灯頭', '灯り頭'],
  cone: ['とんがり', '円錐頭'],
  rifle: ['筒頭', '銃身頭'],
};
const SIZE_WORD = (s: number) => (s > 2.2 ? '巨大な' : s > 1.4 ? '大きな' : s < 0.75 ? '小さな' : '');

/** A colour word from the hue/lightness. */
function colorWord(h: number, s: number, l: number): string {
  if (l < 0.18) return '黒い';
  if (l > 0.85) return '白い';
  if (s < 0.18) return '灰色の';
  const words = ['赤い', '橙色の', '黄色い', '黄緑の', '緑の', '青緑の', '水色の', '青い', '紫の', '赤紫の', '桃色の', '赤い'];
  return words[Math.floor(((h % 1) + 1) % 1 * 12)];
}

function hsl(h: number, s: number, l: number): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

// --- The genome --------------------------------------------------------------

/** Which hand-made entities each technique / movement is borrowed from. */
const ATTACK_FROM: Record<Attack, EntityKind[]> = {
  contact: ['smiler', 'hound', 'duller', 'faceling', 'skinstealer', 'spider'],
  slash: ['namahage'],
  shoot: ['gunman'],
  snipe: ['peeker'],
  lob: ['bomber'],
  lightning: ['witch'],
  wind: ['fanman'],
  burst: ['bloater'],
  stomp: ['giant'],
  boulder: ['giant'],
};
const MOVE_FROM: Partial<Record<Move, EntityKind[]>> = { creep: ['faceling', 'duller'], hopper: ['hound'] };

export interface ChimeraOptions {
  /** Daidara (the giant) can appear in this level: there is room for big ones. Elsewhere they stay small enough for corridors. */
  giant?: boolean;
  /** Entities already living in this level: their traits are left to them (the random ones borrow from the others). */
  exclude?: readonly EntityKind[];
}

/** Tallest a random entity may be where the giant cannot go (m). */
export const CHIMERA_MAX_H_NARROW = 2.4;

/** A random entity, deterministic from its seed (and the level it lives in). */
export function chimeraGenome(seed: number, opts: ChimeraOptions = {}): ChimeraGenome {
  const rng = new Rng(seed ^ 0x6c1e7a);
  const ex = new Set(opts.exclude ?? []);
  // A trait is free to borrow when at least one of its owners does not live here.
  const free = (from: EntityKind[] | undefined) => !from || from.some((k) => !ex.has(k));
  const lower = rng.pick<Lower>(['biped', 'biped', 'quad', 'spider', 'float', 'serpent', 'wheel', 'tripod']);
  const upper = rng.pick<Upper>(['humanoid', 'humanoid', 'blob', 'box', 'tower', 'orb', 'ribs']);
  const ranged = rng.chance(0.45);
  const rangedOk = RANGED.filter((a) => free(ATTACK_FROM[a]));
  const meleeOk = MELEE.filter((a) => free(ATTACK_FROM[a]));
  let attack = (ranged && rangedOk.length) || !meleeOk.length ? rng.pick(rangedOk.length ? rangedOk : RANGED) : rng.pick(meleeOk);
  const head: Head = attack === 'snipe' && rng.chance(0.6) ? 'rifle' : attack === 'wind' && rng.chance(0.5) ? 'fan' : rng.pick<Head>(['sphere', 'eye', 'tv', 'skull', 'mask', 'fan', 'none', 'lantern', 'cone']);
  const arms: 0 | 2 | 4 = upper === 'orb' || upper === 'blob' ? rng.pick([0, 2]) : rng.pick([2, 2, 2, 4, 0]);
  // Throwing and slashing need hands.
  if (arms === 0 && (attack === 'slash' || attack === 'lob' || attack === 'boulder')) {
    const handless = (['contact', 'wind', 'lightning', 'stomp'] as Attack[]).filter((a) => free(ATTACK_FROM[a]));
    attack = rng.pick(handless.length ? handless : (['contact'] as Attack[]));
  }
  const moveOk = (m: Move[]) => {
    const ok = m.filter((x) => free(MOVE_FROM[x]));
    return ok.length ? ok : (['rush'] as Move[]);
  };
  const move: Move = RANGED.includes(attack) ? (rng.chance(0.85) ? 'range' : 'drift') : attack === 'burst' ? rng.pick(moveOk(['rush', 'creep'])) : rng.pick(moveOk(['rush', 'rush', 'creep', 'hopper', 'drift']));
  const close = RANGED.includes(attack) && free(['witch']) && rng.chance(0.35) ? 'gust' : 'none';
  const effect = rng.pick<Effect>(['none', 'none', 'aura', 'orbit', 'trail', 'flicker', 'glitch', 'pulse']);
  const pattern = rng.chance(0.06) ? 'missing' : rng.pick<Pattern>(['flat', 'flat', 'stripes', 'spots', 'checker', 'noise', 'gradient', 'scales']);
  // Size: mostly human-sized; big ones only where there is room.
  // Where the giant can go, some are huge; where it cannot, nothing grows taller than a corridor allows.
  const r = rng.float();
  let scale = opts.giant && r < 0.18 ? 1.8 + rng.float() * 1.6 : r < 0.25 ? 0.55 + rng.float() * 0.25 : 0.85 + rng.float() * (opts.giant ? 0.75 : 0.45);
  if (!opts.giant) scale = Math.min(scale, CHIMERA_MAX_H_NARROW / (LOWER_H[lower] + UPPER_H[upper] + HEAD_H[head]));
  // Colours
  const hue = rng.float();
  const sat = rng.chance(0.2) ? rng.float() * 0.15 : 0.35 + rng.float() * 0.55;
  const lig = rng.chance(0.2) ? 0.08 + rng.float() * 0.1 : 0.25 + rng.float() * 0.5;
  const color = hsl(hue, sat, lig);
  const accent = hsl((hue + 0.33 + rng.float() * 0.34) % 1, 0.4 + rng.float() * 0.5, 0.3 + rng.float() * 0.45);
  const glow = hsl(rng.float(), 0.9, 0.62);
  // Geometry
  const hipY = LOWER_H[lower] * scale;
  const shoulderY = hipY + UPPER_H[upper] * scale;
  const height = shoulderY + HEAD_H[head] * scale;
  const width = UPPER_W[upper] * scale * (lower === 'quad' || lower === 'spider' ? 1.6 : 1);
  // Speed: small things fast, big things slow; hoppers and rushers quicker.
  const speedK = Math.max(0.45, Math.min(1.6, 1.15 / Math.sqrt(scale)));
  const run = Math.min(11, (move === 'drift' ? 2.4 : move === 'range' ? 4 : 5 + rng.float() * 4) * speedK * (lower === 'spider' || lower === 'wheel' ? 1.25 : lower === 'serpent' || lower === 'tripod' ? 0.85 : 1));
  const walk = Math.max(1.2, run * (0.4 + rng.float() * 0.2));
  // Health: bigger and slower = tougher.
  const hp = Math.round((50 + rng.float() * 90) * HP_SCALE * Math.pow(scale, 1.3) * (attack === 'burst' ? 0.5 : 1) * Math.max(0.6, Math.min(1.4, 6 / (run + 1))));
  const st = ATTACK_STATS[attack];
  const damage = Math.round(st.dmg[0] + rng.float() * (st.dmg[1] - st.dmg[0]));
  const cooldown = st.cd[0] + rng.float() * (st.cd[1] - st.cd[0]);
  const burst = attack === 'shoot' ? rng.int(1, 6) : 1;
  const voice = rng.pick<Voice>(['growl', 'giggle', 'hum', 'step', 'groan', 'skitter', 'whirr', 'glitch']);
  // Name and hint
  // e.g. 雷を呼ぶ / 大きな / (宙に浮く) / 青い / (多脚の) / 一つ目
  const verb = rng.pick(ATTACK_WORD[attack]);
  const showLower = rng.chance(0.5);
  const float = lower === 'float' && showLower;
  const words = [verb, SIZE_WORD(scale), float ? '宙に浮く' : '', colorWord(hue, sat, lig), showLower && !float ? LOWER_WORD[lower] : '', rng.pick(HEAD_WORD[head])];
  const name = words.join('');
  const hint = chimeraHint(attack, move, close);
  const hitboxes: ChimeraHitBox[] = [{ f: 0, y0: 0, y1: shoulderY, r: width, d: lower === 'quad' || lower === 'spider' || lower === 'serpent' ? width * 1.4 : width * 0.8, head: false }];
  if (head !== 'none') hitboxes.push({ f: head === 'rifle' ? -0.2 * scale : 0, y0: shoulderY, y1: height, r: 0.2 * scale, d: head === 'rifle' ? 0.45 * scale : undefined, head: true });
  const chest = Math.max(0.5, shoulderY * 0.8);
  return { seed, name, hint, lower, upper, head, arms, attack, close, move, effect, pattern, color, accent, glow, scale, hipY, shoulderY, height, width, walk, run, hp, damage, cooldown, burst, near: st.near, far: st.far, voice, hitboxes, chest };
}

function chimeraHint(attack: Attack, move: Move, close: 'gust' | 'none'): string {
  const a: Record<Attack, string> = {
    contact: '近づいて触れてくる。',
    slash: '近くで刃を振り上げ、前方を斬る。赤い帯が出たら外へ。',
    shoot: '距離を取って弾を撃ってくる。弾は見て避けられる。',
    snipe: '遠くから赤い光で狙い、光が止まった直後に撃つ。',
    lob: '山なりに爆弾を投げてくる。',
    lightning: '足元に光る輪を描き、雷を落とす。',
    wind: 'ゆっくり飛ぶ風の玉を撃ち、当たると吹き飛ばされる。',
    burst: 'すぐそばで膨らみ、破裂する。シューという音がしたら離れること。',
    stomp: '足元に近づくと踏みつけてくる。',
    boulder: '離れていると岩を投げてくる。赤い円から出ること。',
  };
  const m: Record<Move, string> = {
    rush: '一直線に迫ってくる。',
    range: '',
    creep: '見ている間は動かない。目を離すと距離を詰める。',
    hopper: '狙うと横に跳んでよける。',
    drift: 'ゆっくり漂うように動く。',
  };
  return `どこにも記録のない、その場限りの存在。${a[attack]}${m[move]}${close === 'gust' ? '近づきすぎると周りに突風を放つ。' : ''}`;
}

/**
 * The random entities that live in a level: 1-3 species, the same each time
 * you visit (deterministic from the level id).
 */
export function chimeraSpecies(levelId: string, opts: ChimeraOptions): ChimeraGenome[] {
  const rng = new Rng(hashString('chimera:' + levelId));
  const n = rng.int(1, 3);
  const out: ChimeraGenome[] = [];
  for (let i = 0; i < n; i++) out.push(chimeraGenome(hashString(`chimera:${levelId}:${i}`), opts));
  return out;
}
