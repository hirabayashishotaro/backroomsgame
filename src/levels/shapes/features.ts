/**
 * Feature library for fusion levels (pure). Each feature is a piece of some
 * other world - giant books, lava falling from above, a fragment of yellow
 * office wall, floating cubes, a buried giant head... - that can be set down
 * on any ground, at any scale that fits the headroom. Random levels layer
 * several of these over a base form, so a level can be e.g. a cave with lava
 * dripping from the ceiling and books the size of houses.
 */
import type { Box } from '../../world/chunkData';
import { box, emptyOut, type Light, type Out } from './kit';
import { bust, column, neonPalm, sculpture } from '../hand/aesthetic';
import { bathTub, lockers, muralWall, rockPool, saunaStove, saunaTiers, washRow } from '../hand/sento';

export type FeatureId =
  | 'books'
  | 'mushrooms'
  | 'pillars'
  | 'backrooms'
  | 'trees'
  | 'crystals'
  | 'lavafalls'
  | 'monoliths'
  | 'arches'
  | 'lamps'
  | 'floating'
  | 'shelves'
  | 'heads'
  | 'pipes'
  | 'poles'
  | 'fragments'
  | 'stairs'
  | 'neon'
  | 'waterfalls'
  | 'bones'
  // From the explicit worlds (every hand-made world adds its pieces here):
  | 'busts'
  | 'columns'
  | 'neonpalms'
  | 'memphis'
  | 'loudwall'
  | 'pinksheets'
  | 'vending'
  | 'sentomural'
  | 'washplaces'
  | 'bathtub'
  | 'okepile'
  | 'rockpool'
  | 'saunatiers'
  | 'lockers';

export const ALL_FEATURES: FeatureId[] = [
  'books',
  'mushrooms',
  'pillars',
  'backrooms',
  'trees',
  'crystals',
  'lavafalls',
  'monoliths',
  'arches',
  'lamps',
  'floating',
  'shelves',
  'heads',
  'pipes',
  'poles',
  'fragments',
  'stairs',
  'neon',
  'waterfalls',
  'bones',
  'busts',
  'columns',
  'neonpalms',
  'memphis',
  'loudwall',
  'pinksheets',
  'vending',
  'sentomural',
  'washplaces',
  'bathtub',
  'okepile',
  'rockpool',
  'saunatiers',
  'lockers',
];

/** Height needed at scale 1 (m), footprint half-size, and words for names. */
export const FEATURE_INFO: Record<FeatureId, { h: number; r: number; name: string; adj: string }> = {
  books: { h: 1.2, r: 2.6, name: '巨大な本', adj: '本の散らばる' },
  mushrooms: { h: 8, r: 3.2, name: '巨大キノコ', adj: 'キノコの生えた' },
  pillars: { h: 6, r: 0.9, name: '柱', adj: '柱の立ち並ぶ' },
  backrooms: { h: 2.8, r: 2.4, name: '黄色い壁', adj: '黄色い壁の残る' },
  trees: { h: 6, r: 1.6, name: '木々', adj: '木々の茂る' },
  crystals: { h: 3, r: 1.4, name: '結晶', adj: '結晶の光る' },
  lavafalls: { h: 6, r: 1.0, name: '溶岩の滝', adj: '溶岩の滴る' },
  monoliths: { h: 6, r: 1.0, name: '黒い石碑', adj: '石碑の立つ' },
  arches: { h: 5, r: 2.4, name: 'アーチ', adj: '門の連なる' },
  lamps: { h: 4.5, r: 0.4, name: '街灯', adj: '街灯の灯る' },
  floating: { h: 7, r: 1.6, name: '浮かぶ立方体', adj: '立方体の浮かぶ' },
  shelves: { h: 4, r: 2.2, name: '棚', adj: '棚の並ぶ' },
  heads: { h: 4, r: 2.6, name: '巨大な顔', adj: '巨大な顔の埋まる' },
  pipes: { h: 4, r: 3, name: '配管', adj: '配管の這う' },
  poles: { h: 8, r: 0.4, name: '電柱', adj: '電線の張られた' },
  fragments: { h: 6, r: 2.4, name: '部屋の欠片', adj: '部屋の漂う' },
  stairs: { h: 4, r: 2.4, name: '途切れた階段', adj: '階段の途切れた' },
  neon: { h: 4, r: 1, name: 'ネオン', adj: 'ネオンの瞬く' },
  waterfalls: { h: 7, r: 1.2, name: '水の柱', adj: '水の降る' },
  bones: { h: 5, r: 3, name: '巨大な骨', adj: '骨の横たわる' },
  busts: { h: 3.5, r: 2.2, name: '石膏の胸像', adj: '石膏の頭が並ぶ' },
  columns: { h: 5, r: 3.2, name: 'ローマの柱', adj: '列柱の立つ' },
  neonpalms: { h: 5.5, r: 2.4, name: 'ネオンのヤシ', adj: 'ネオンのヤシが光る' },
  memphis: { h: 4.5, r: 2.4, name: 'メンフィスの家具', adj: '派手な家具の置かれた' },
  loudwall: { h: 6, r: 4.2, name: '波線の壁', adj: '派手な壁の立つ' },
  pinksheets: { h: 8, r: 3.5, name: 'ピンクの幕', adj: 'ピンクの幕が垂れる' },
  vending: { h: 2, r: 0.8, name: '自販機', adj: '自販機の光る' },
  sentomural: { h: 4.2, r: 4.5, name: '富士の壁画', adj: '富士の壁画が立つ' },
  washplaces: { h: 1.9, r: 3.2, name: '洗い場', adj: '洗い場の並ぶ' },
  bathtub: { h: 0.5, r: 3.6, name: '湯船', adj: '湯船の点在する' },
  okepile: { h: 0.8, r: 1.2, name: '黄色い桶', adj: '桶の転がる' },
  rockpool: { h: 1.8, r: 4.6, name: '岩風呂', adj: '岩風呂の湧く' },
  saunatiers: { h: 1.4, r: 3.4, name: 'サウナの段', adj: 'サウナの段が光る' },
  lockers: { h: 2.1, r: 2.4, name: '木のロッカー', adj: 'ロッカーの並ぶ' },
};

/**
 * Run a builder from a hand-made world on a scratch output, lift everything
 * onto the ground height `y`, mark the solids as overlay, and copy it in.
 * Returns the height it reached (to check against the headroom first).
 */
function borrowed(o: Out, y: number, room: number, build: (t: Out) => void): void {
  const t = emptyOut();
  build(t);
  const top = Math.max(0, ...t.solids.map((b) => b.maxY), ...t.decor.map((b) => b.maxY));
  if (Number.isFinite(room) && top > room - 0.2) return;
  for (const b of t.solids) {
    b.minY += y;
    b.maxY += y;
    b.overlay = true;
    o.solids.push(b);
  }
  for (const b of t.decor) {
    b.minY += y;
    b.maxY += y;
    o.decor.push(b);
  }
}

/** One feature set down at a local point (y = the ground there). */
export interface Placement {
  f: FeatureId;
  x: number;
  y: number;
  z: number;
  /** Scale. */
  s: number;
  /** Variant / choice roll in [0, 1). */
  k: number;
  /** Rotate by 90 degrees (swap x/z extents). */
  rot: boolean;
  /** Free height above the ground (Infinity under the sky). */
  room: number;
}

const pick = <T,>(list: T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))];

/** Draw a feature into `o` (solids are marked as overlay). Adds glowing ones to `lights`. */
export function drawFeature(o: Out, p: Placement, lights: Light[]): void {
  const { x, y, z, s, k } = p;
  const solid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string): Box => {
    const b = p.rot ? box(o.solids, x + (z0 - z), y0, z + (x0 - x), x + (z1 - z), y1, z + (x1 - x), mat) : box(o.solids, x0, y0, z0, x1, y1, z1, mat);
    b.overlay = true;
    return b;
  };
  const deco = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string): void => {
    if (p.rot) box(o.decor, x + (z0 - z), y0, z + (x0 - x), x + (z1 - z), y1, z + (x1 - x), mat);
    else box(o.decor, x0, y0, z0, x1, y1, z1, mat);
  };
  const top = (want: number) => (Number.isFinite(p.room) ? Math.min(want, p.room - 0.2) : want);
  switch (p.f) {
    case 'books': {
      // A giant closed book lying on the ground (walk on it), or standing upright.
      const cover = pick(['book-red', 'book-blue', 'book-green', 'book-brown'], k);
      if (k > 0.65 && top(5 * s) > 3) {
        const h = top(5 * s);
        solid(x - 0.45 * s, y, z - 1.8 * s, x + 0.45 * s, y + h, z + 1.8 * s, cover);
        solid(x - 0.4 * s, y + 0.1, z - 1.72 * s, x + 0.42 * s, y + h - 0.1, z + 1.75 * s, 'pages');
      } else {
        const t = 0.9 * s;
        solid(x - 2.4 * s, y, z - 1.7 * s, x + 2.4 * s, y + 0.12 * s, z + 1.7 * s, cover);
        solid(x - 2.3 * s, y + 0.12 * s, z - 1.6 * s, x + 2.3 * s, y + t - 0.12 * s, z + 1.6 * s, 'pages');
        solid(x - 2.4 * s, y + t - 0.12 * s, z - 1.7 * s, x + 2.4 * s, y + t, z + 1.7 * s, cover);
      }
      break;
    }
    case 'mushrooms': {
      const h = top(8 * s);
      if (h < 2.5) break;
      const cap = pick(['cap-teal', 'cap-purple'], k);
      const r = 2.8 * s;
      solid(x - 0.4 * s, y, z - 0.4 * s, x + 0.4 * s, y + h - 0.9 * s, z + 0.4 * s, 'pages');
      solid(x - r, y + h - 0.9 * s, z - r, x + r, y + h - 0.3 * s, z + r, cap);
      solid(x - r * 0.6, y + h - 0.3 * s, z - r * 0.6, x + r * 0.6, y + h, z + r * 0.6, cap);
      deco(x - r + 0.2, y + h - 0.93 * s, z - r + 0.2, x + r - 0.2, y + h - 0.91 * s, z + r - 0.2, 'gill-glow');
      lights.push({ x, y: y + h - 1.2 * s, z, I: 2.5 });
      break;
    }
    case 'pillars': {
      const h = Number.isFinite(p.room) ? p.room + 0.3 : 6 * s + k * 10;
      const w = 0.6 * s;
      const mat = pick(['pool-tile', 'marble', 'stone', 'backrooms-wall'], k);
      solid(x - w, y - 0.2, z - w, x + w, y + h, z + w, mat);
      break;
    }
    case 'backrooms': {
      // A stray piece of the Level 0 office: yellow wallpaper, a strip of damp carpet, a fluorescent light.
      const h = top(2.8);
      solid(x - 2.2 * s, y, z - 0.1, x + 2.2 * s, y + h, z + 0.1, 'backrooms-wall');
      if (k > 0.4) solid(x + 2.2 * s - 0.2, y, z - 1.8 * s, x + 2.2 * s, y + h, z, 'backrooms-wall');
      deco(x - 2.2 * s, y + 0.005, z + 0.1, x + 2.2 * s, y + 0.02, z + 2 * s, 'backrooms-carpet');
      if (k < 0.5) {
        deco(x - 0.6, y + h - 0.05, z + 0.4, x + 0.6, y + h, z + 1.0, 'glow');
        deco(x - 2.2 * s, y + h, z + 0.1, x + 2.2 * s, y + h + 0.06, z + 2 * s, 'backrooms-ceiling');
        lights.push({ x, y: y + h - 0.2, z: z + 0.7, I: 2 });
      }
      break;
    }
    case 'trees': {
      const h = top(6 * s);
      if (h < 2.5) break;
      const leaves = pick(['leaves-green', 'leaves-autumn', 'leaves-pink', 'pine', 'leaves-lime'], k);
      solid(x - 0.2 * s, y, z - 0.2 * s, x + 0.2 * s, y + h * 0.55, z + 0.2 * s, 'bark');
      deco(x - 1.6 * s, y + h * 0.45, z - 1.6 * s, x + 1.6 * s, y + h * 0.75, z + 1.6 * s, leaves);
      deco(x - 1.0 * s, y + h * 0.75, z - 1.0 * s, x + 1.0 * s, y + h, z + 1.0 * s, leaves);
      break;
    }
    case 'crystals': {
      const gem = pick(['gem-blue', 'gem-pink', 'gem-green', 'crystal-purple'], k);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + k * 6;
        const cx = x + Math.cos(a) * 0.7 * s;
        const cz = z + Math.sin(a) * 0.7 * s;
        const h = top((1.2 + ((i * 0.37 + k) % 1) * 2.4) * s);
        const w = (0.18 + 0.12 * ((i + 1) % 2)) * s;
        solid(cx - w, y, cz - w, cx + w, y + h, cz + w, gem);
      }
      lights.push({ x, y: y + 1.2 * s, z, I: 2.4 });
      break;
    }
    case 'lavafalls': {
      // Lava pouring from high above (or from the ceiling) into a glowing pool.
      const h = Number.isFinite(p.room) ? p.room : 14 + k * 20;
      deco(x - 0.35 * s, y, z - 0.35 * s, x + 0.35 * s, y + h, z + 0.35 * s, 'lava');
      deco(x - 1.4 * s, y + 0.01, z - 1.4 * s, x + 1.4 * s, y + 0.06, z + 1.4 * s, 'lava');
      solid(x - 1.6 * s, y, z - 1.6 * s, x + 1.6 * s, y + 0.35, z - 1.4 * s, 'basalt');
      solid(x - 1.6 * s, y, z + 1.4 * s, x + 1.6 * s, y + 0.35, z + 1.6 * s, 'basalt');
      lights.push({ x, y: y + 1.5, z, I: 4 });
      break;
    }
    case 'monoliths': {
      const h = top(6 * s);
      solid(x - 0.5 * s, y - 0.3, z - 0.18 * s, x + 0.5 * s, y + h, z + 0.18 * s, 'obsidian');
      break;
    }
    case 'arches': {
      const h = top(5 * s);
      const mat = pick(['stone', 'marble', 'brick', 'pool-tile'], k);
      solid(x - 2.2 * s, y, z - 0.35 * s, x - 1.5 * s, y + h, z + 0.35 * s, mat);
      solid(x + 1.5 * s, y, z - 0.35 * s, x + 2.2 * s, y + h, z + 0.35 * s, mat);
      solid(x - 2.2 * s, y + h - 0.7 * s, z - 0.35 * s, x + 2.2 * s, y + h, z + 0.35 * s, mat);
      break;
    }
    case 'lamps': {
      const h = top(4.5 * s);
      solid(x - 0.08, y, z - 0.08, x + 0.08, y + h, z + 0.08, 'metal');
      deco(x - 0.3, y + h - 0.15, z - 0.3, x + 0.3, y + h, z + 0.3, k > 0.5 ? 'glow' : 'lantern');
      lights.push({ x, y: y + h - 0.4, z, I: 3 });
      break;
    }
    case 'floating': {
      // Cubes hanging in the air, low enough to climb from one to the next.
      const mat = pick(['tile-white', 'obsidian', 'backrooms-wall', 'marble', 'slide-blue', 'endstone'], k);
      for (let i = 0; i < 4; i++) {
        const fy = y + 1.0 + i * 1.1;
        if (Number.isFinite(p.room) && fy + 0.8 > p.room) break;
        const a = i * 1.9 + k * 5;
        const cx = x + Math.cos(a) * 1.3 * s;
        const cz = z + Math.sin(a) * 1.3 * s;
        solid(cx - 0.6, fy, cz - 0.6, cx + 0.6, fy + 0.6, cz + 0.6, mat);
      }
      break;
    }
    case 'shelves': {
      const h = top(4 * s);
      for (const dz of [-0.9, 0.9]) {
        solid(x - 2 * s, y, z + dz * s - 0.35, x + 2 * s, y + h, z + dz * s + 0.35, 'shelf');
      }
      solid(x - 0.5, y, z - 0.4, x + 0.5, y + 0.8, z + 0.4, 'crate');
      break;
    }
    case 'heads': {
      // A giant stone head buried to the chin; its eyes glow faintly.
      const r = 2.2 * s;
      const h = top(3.6 * s);
      solid(x - r, y - 0.5, z - r * 0.9, x + r, y + h, z + r * 0.9, 'bronze');
      solid(x - r * 0.25, y + h * 0.45, z - r * 0.9 - 0.5 * s, x + r * 0.25, y + h * 0.65, z - r * 0.9, 'bronze');
      deco(x - r * 0.55, y + h * 0.7, z - r * 0.9 - 0.02, x - r * 0.25, y + h * 0.8, z - r * 0.9, 'glow-blue');
      deco(x + r * 0.25, y + h * 0.7, z - r * 0.9 - 0.02, x + r * 0.55, y + h * 0.8, z - r * 0.9, 'glow-blue');
      break;
    }
    case 'pipes': {
      const h = top(3.2 * s);
      solid(x - 3 * s, y + h - 0.6, z - 0.3, x + 3 * s, y + h, z + 0.3, 'pipe');
      solid(x - 3 * s, y, z - 0.25, x - 3 * s + 0.5, y + h, z + 0.25, 'pipe');
      solid(x + 3 * s - 0.5, y, z - 0.25, x + 3 * s, y + h, z + 0.25, 'pipe');
      break;
    }
    case 'poles': {
      const h = top(8 * s);
      solid(x - 0.15, y, z - 0.15, x + 0.15, y + h, z + 0.15, 'stone');
      deco(x - 0.6, y + h - 0.6, z - 0.05, x + 0.6, y + h - 0.5, z + 0.05, 'dark');
      deco(x - 0.02, y + h - 0.7, z - 6, x + 0.02, y + h - 0.66, z + 6, 'dark');
      break;
    }
    case 'fragments': {
      // A slab of some other room hanging in the air: carpet, a strip of wall, a light.
      const fy = Number.isFinite(p.room) ? Math.max(y + 1.8, y + p.room * 0.5) : y + 2 + k * 6;
      if (Number.isFinite(p.room) && fy + 1 > y + p.room) break;
      solid(x - 2 * s, fy, z - 2 * s, x + 2 * s, fy + 0.2, z + 2 * s, 'backrooms-carpet');
      solid(x - 2 * s, fy + 0.2, z - 2 * s, x + 2 * s, fy + 1.2 * s, z - 1.8 * s, 'backrooms-wall');
      deco(x - 0.5, fy - 0.03, z - 0.5, x + 0.5, fy, z + 0.5, 'glow');
      lights.push({ x, y: fy - 0.5, z, I: 1.5 });
      break;
    }
    case 'stairs': {
      // A staircase that rises into nothing.
      const mat = pick(['stone', 'marble', 'tile-white', 'backrooms-carpet'], k);
      const n = Math.max(3, Math.floor(Math.min(12, (Number.isFinite(p.room) ? p.room - 2.2 : 8) / 0.3)));
      for (let i = 0; i < n; i++) solid(x - 0.8, y, z - 2.4 + i * 0.4, x + 0.8, y + 0.3 * (i + 1), z - 2.0 + i * 0.4, mat);
      break;
    }
    case 'neon': {
      const h = top(3.6 * s);
      const sign = pick(['neon-pink', 'neon-blue', 'gem-green', 'red-light'], k);
      solid(x - 0.08, y, z - 0.08, x + 0.08, y + h - 1, z + 0.08, 'metal');
      deco(x - 1.2 * s, y + h - 1.2, z - 0.06, x + 1.2 * s, y + h, z + 0.06, sign);
      lights.push({ x, y: y + h - 0.6, z, I: 2 });
      break;
    }
    case 'waterfalls': {
      const h = Number.isFinite(p.room) ? p.room : 12 + k * 18;
      deco(x - 0.4 * s, y, z - 0.4 * s, x + 0.4 * s, y + h, z + 0.4 * s, 'water');
      deco(x - 1.5 * s, y + 0.01, z - 1.5 * s, x + 1.5 * s, y + 0.1, z + 1.5 * s, 'water-shallow');
      break;
    }
    case 'busts': {
      // Plaster heads from the Vaporwave world, on a patch of pink-and-navy checkerboard.
      const h = Math.min(4 * s, Number.isFinite(p.room) ? (p.room - 0.3) / 1.05 : Infinity);
      if (h < 1.2) break;
      deco(x - 2.4 * s, y + 0.005, z - 2.4 * s, x + 2.4 * s, y + 0.02, z + 2.4 * s, 'vapor-check');
      borrowed(o, y, p.room, (t) => bust(t, x, z, h, k < 0.5 ? 1 : -1));
      lights.push({ x, y: y + h * 0.5, z, I: 2.5 });
      break;
    }
    case 'columns': {
      // A short colonnade of plaster Roman columns on checkerboard.
      const h = top(4.5 * s + k * 2);
      if (h < 2) break;
      deco(x - 3 * s, y + 0.005, z - 3 * s, x + 3 * s, y + 0.02, z + 3 * s, 'vapor-check');
      borrowed(o, y, p.room, (t) => {
        for (const dz of [-2, 0, 2]) column(t, x + (k < 0.5 ? -1.5 : 1.5) * s, z + dz * s, h * (dz === 2 && k > 0.6 ? 0.6 : 1));
      });
      break;
    }
    case 'neonpalms': {
      const h = top(5.5 * s);
      if (h < 2.5) break;
      borrowed(o, y, p.room, (t) => {
        neonPalm(t, x - 1.2 * s, z, h);
        neonPalm(t, x + 1.2 * s, z + 1.5 * s, h * 0.8);
      });
      lights.push({ x, y: y + h * 0.8, z, I: 2 });
      break;
    }
    case 'memphis': {
      // Loud post-modern furniture from the Memphis showroom, on a block of colour.
      deco(x - 2.2, y + 0.005, z - 2.2, x + 2.2, y + 0.02, z + 2.2, pick(['m-yellow', 'm-blue', 'memphis-check', 'terrazzo', 'm-pink'], k));
      borrowed(o, y, p.room, (t) => sculpture(t, x, z, k));
      break;
    }
    case 'loudwall': {
      const h = top(4 + k * 3);
      const mat = pick(['memphis-squiggle', 'memphis-stripes', 'terrazzo', 'memphis-check', 'm-red', 'm-yellow'], k);
      solid(x - 4 * s, y, z - 0.15, x + 4 * s, y + h, z + 0.15, mat);
      deco(x - 4 * s, y + 0.005, z + 0.15, x + 4 * s, y + 0.015, z + 1.6, 'm-pink');
      break;
    }
    case 'pinksheets': {
      const h = Number.isFinite(p.room) ? p.room : 6 + k * 6;
      deco(x - 3.4 * s, y, z - 0.02, x + 3.4 * s, y + h, z + 0.02, k < 0.7 ? 'pink-sheet' : 'mint-glass');
      if (k > 0.4) deco(x - 0.02, y, z - 3 * s, x + 0.02, y + h * 0.8, z + 3 * s, 'pink-sheet');
      break;
    }
    case 'vending': {
      // Vending machines from the city street, glowing in the middle of nowhere.
      for (let i = 0; i < 1 + Math.floor(k * 3); i++) {
        const vx = x + (i - 1) * 1.0;
        solid(vx - 0.45, y, z - 0.4, vx + 0.45, y + 1.85, z + 0.4, pick(['tile-white', 'slide-red', 'slide-blue'], (k * 7 + i * 0.3) % 1));
        deco(vx - 0.38, y + 0.85, z - 0.42, vx + 0.38, y + 1.75, z - 0.41, 'daylight');
      }
      lights.push({ x, y: y + 1.3, z: z - 0.8, I: 1.6 });
      break;
    }
    case 'sentomural': {
      // The bathhouse mountain mural on a freestanding tiled wall.
      if (Number.isFinite(p.room) && p.room < 4.6) break;
      borrowed(o, y, p.room, (t) => muralWall(t, x - 4 * s, x + 4 * s, z, k < 0.3, 0, 4.2));
      break;
    }
    case 'washplaces': {
      // A double row of washing places with taps, mirrors, stools and washbowls.
      borrowed(o, y, p.room, (t) => {
        box(t.solids, x - 0.15, 0, z - 2.5, x + 0.15, 1.9, z + 2.5, 'sento-tile');
        washRow(t, x - 0.15, z - 2.5, z + 2.5, -1, Math.floor(k * 1e6), 0, false);
        washRow(t, x + 0.15, z - 2.5, z + 2.5, 1, Math.floor(k * 1e6) + 1, 0, false);
      });
      deco(x - 2.6, y + 0.005, z - 2.8, x + 2.6, y + 0.015, z + 2.8, 'sento-floor');
      break;
    }
    case 'bathtub': {
      // A tiled bath of steaming water, wherever it happens to be.
      borrowed(o, y, p.room, (t) => bathTub(t, x - 3 * s, z - 2 * s, x + 3 * s, z + 2 * s));
      break;
    }
    case 'okepile': {
      // Yellow washbowls and white stools, stacked and scattered.
      for (let i = 0; i < 5; i++) {
        const a = i * 2.1 + k * 6;
        const bx = x + Math.cos(a) * 0.7;
        const bz = z + Math.sin(a) * 0.7;
        solid(bx - 0.16, y + (i === 4 ? 0.17 : 0), bz - 0.16, bx + 0.16, y + 0.17 * (i === 4 ? 2 : 1), bz + 0.16, i % 3 === 2 ? 'stool-white' : 'oke-yellow');
      }
      break;
    }
    case 'rockpool': {
      // An open-air rock bath, steaming wherever it surfaces.
      borrowed(o, y, p.room, (t) => rockPool(t, x, z, 3.2 * s, 2.6 * s, Math.floor(k * 1e6), 0, k < 0.3 ? 'milky-water' : 'hot-spring'));
      break;
    }
    case 'saunatiers': {
      // Lit cedar sauna benches and a caged stove, out of their room.
      const ls: typeof lights = [];
      borrowed(o, y, p.room, (t) => {
        saunaTiers(t, x - 2.8, x + 2.8, z + 1.8, 1);
        saunaStove(t, x, z - 2.6, ls);
      });
      for (const l of ls) lights.push({ ...l, y: l.y + y });
      break;
    }
    case 'lockers': {
      // A bank of changing-room lockers, back to back.
      borrowed(o, y, p.room, (t) => {
        lockers(t, x - 2.2, x + 2.2, z, -1);
        lockers(t, x - 2.2, x + 2.2, z, 1);
      });
      break;
    }
    case 'bones': {
      // The ribs of something enormous, arching over the ground.
      const h = top(5 * s);
      for (let i = -2; i <= 2; i++) {
        const zz = z + i * 1.1 * s;
        solid(x - 2.6 * s, y, zz - 0.15 * s, x - 2.2 * s, y + h, zz + 0.15 * s, 'marble');
        solid(x + 2.2 * s, y, zz - 0.15 * s, x + 2.6 * s, y + h, zz + 0.15 * s, 'marble');
        solid(x - 2.6 * s, y + h - 0.35 * s, zz - 0.15 * s, x + 2.6 * s, y + h, zz + 0.15 * s, 'marble');
      }
      break;
    }
  }
}
