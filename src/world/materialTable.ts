/**
 * Material table (pure): which texture each material key uses, how it is drawn
 * and how many metres one texture repeat covers. Shared by the renderer
 * (LevelMaterials) and the geometry builder (main thread or worker), so UVs
 * always match the textures.
 */
import type { Palette } from '../levels/levelDefinition';

export type MatKind = 'lit' | 'lit-transparent' | 'clear' | 'basic' | 'basic-tex' | 'water';

export interface MatDef {
  kind: MatKind;
  tex?: string;
  color?: number;
  opacity?: number;
  /** Colour multiplier for lit materials (thin walls/floors). */
  tint?: [number, number, number];
  /** Override for UV scale. */
  metres?: number;
  /** Water wave height (m). */
  wave?: number;
  /** A picture: stretched once over each side face instead of tiled (murals). */
  fit?: boolean;
}

const FIXED_METRES: Record<string, number> = {
  'wallpaper-yellow': 2,
  'carpet-damp': 2,
  'ceiling-tile': 1.2,
  outlet: 1,
  white: 1,
  'wallpaper-manila': 2,
  'chalk-graffiti': 4,
  'exit-sign': 1,
  'metal-door': 1,
  'frosted-green': 1,
  'label-almond': 1,
  bark: 1,
  tatami: 3.6,
  shoji: 1.2,
  'aero-tile': 2,
  grate: 0.5,
  studs: 2,
  'clouds-window': 4,
  'neon-grid': 2,
  'vapor-check': 2,
  plaster: 2,
  'memphis-stripes': 0.5,
  'memphis-check': 0.8,
  'memphis-squiggle': 3,
  terrazzo: 1.5,
  'terrazzo-dark': 1.5,
  'memphis-tile': 1,
  'sento-tile': 1.2,
  'sento-floor': 0.8,
  'sento-paint': 2,
  'sento-ceiling': 2,
};

const GEN_METRES: Record<string, number> = {
  concrete: 3,
  'floor-concrete': 4,
  brick: 2,
  tile: 2,
  stripes: 2,
  panel: 2,
  carpet: 2,
  wood: 2,
  metal: 1,
  grass: 2,
  leaves: 1.5,
  paving: 2,
  flowers: 1,
  snow: 2,
  rock: 2,
  lava: 4,
  sand: 2,
  flesh: 2,
  bronze: 4,
  marble: 2,
  windows: 8,
  pages: 1,
  book: 4,
  endstone: 2,
  obsidian: 2,
  moss: 2,
  cap: 4,
  pooltile: 1.6,
};

/** Metres covered by one repeat of a procedural texture. */
export function texMetres(key: string): number {
  if (key in FIXED_METRES) return FIXED_METRES[key];
  if (key.startsWith('gen:')) return GEN_METRES[key.split(':')[1]] ?? 2;
  if (key.startsWith('road:')) return 32;
  return 1;
}

const lit = (tex: string, extra: Partial<MatDef> = {}): MatDef => ({ kind: 'lit', tex, ...extra });
const clear = (color: number, opacity: number): MatDef => ({ kind: 'clear', color, opacity });
const basic = (color: number): MatDef => ({ kind: 'basic', color });
const water = (color: number, opacity: number, wave = 0.025): MatDef => ({ kind: 'water', color, opacity, wave });

/** All material keys used by generators, for one level palette. */
export function materialTable(p: Palette): Record<string, MatDef> {
  return {
    wall: lit(p.wallTex),
    pillar: lit(p.wallTex),
    floor: lit(p.floorTex),
    ceiling: lit(p.ceilingTex),
    'wall-thin': lit(p.wallTex, { tint: [1.16, 1.1, 0.92] }),
    'floor-thin': lit(p.floorTex, { tint: [0.8, 0.9, 1.08] }),
    outlet: lit('outlet'),
    'wall-manila': lit('wallpaper-manila'),
    // Pieces of other worlds dropped into random levels (fusion levels).
    'backrooms-wall': lit('wallpaper-yellow'),
    'backrooms-carpet': lit('carpet-damp'),
    'backrooms-ceiling': lit('ceiling-tile'),
    'studs-wall': lit('studs'),
    // Vaporwave
    'neon-grid': { kind: 'basic-tex', tex: 'neon-grid' },
    'vapor-check': lit('vapor-check'),
    plaster: lit('plaster'),
    'neon-magenta': basic(0xff3ad8),
    'neon-cyan': basic(0x46f4ff),
    // Memphis
    'memphis-stripes': lit('memphis-stripes'),
    'memphis-check': lit('memphis-check'),
    'memphis-squiggle': lit('memphis-squiggle'),
    terrazzo: lit('terrazzo'),
    'terrazzo-dark': lit('terrazzo-dark'),
    'memphis-tile': lit('memphis-tile'),
    'm-yellow': lit('flat:f6d21e'),
    'm-blue': lit('flat:2a8ad8'),
    'm-teal': lit('flat:2a7a8a'),
    'm-pink': lit('flat:ff6a9a'),
    'm-red': lit('flat:f0322a'),
    'm-green': lit('flat:32c860'),
    'm-white': lit('flat:fbfaf6'),
    'm-peach': lit('flat:f8c8b0'),
    'pink-sheet': clear(0xff6a90, 0.42),
    'mint-glass': clear(0x7affd0, 0.4),
    // Showa bathhouse
    'sento-tile': lit('sento-tile'),
    'sento-floor': lit('sento-floor'),
    'sento-paint': lit('sento-paint'),
    'sento-ceiling': lit('sento-ceiling'),
    'fuji-mural': lit('fuji-mural', { fit: true }),
    'fuji-mural-evening': lit('fuji-mural-evening', { fit: true }),
    'sento-tile-mural': lit('sento-tile-mural', { fit: true }),
    'mirror': lit('flat:d4e6ea'),
    'oke-yellow': lit('flat:f2c21e'),
    'stool-white': lit('flat:eeeae0'),
    // Bathhouse variety: open-air bath, sauna, cold bath, changing room
    cedar: lit('gen:wood:dcb88c:931'),
    'cedar-dark': lit('gen:wood:b08a5e:932'),
    'onsen-rock': lit('gen:rock:7a7268:933'),
    'onsen-rock-red': lit('gen:rock:8a6450:934'),
    'fence-board': lit('gen:wood:6a5a46:935'),
    'tile-aqua': lit('gen:tile:5fb8c8:936'),
    'milky-water': water(0xe4f0ea, 0.85, 0.012),
    'herb-water': water(0x8ac86a, 0.7, 0.012),
    'cold-water': water(0x2a8ad8, 0.55, 0.02),
    'sauna-glow': basic(0xffb45a),
    'locker-tag': lit('flat:c8c0a8'),
    'chalk-graffiti': { kind: 'lit-transparent', tex: 'chalk-graffiti' },
    pipe: lit('gen:metal:6a6560:77'),
    crate: lit('gen:wood:8a6a3e:78'),
    stone: lit('gen:concrete:9a968c:79'),
    dark: lit('gen:concrete:2a2826:80'),
    'wood-dark': lit('gen:wood:4a3420:81'),
    'tile-white': lit('gen:tile:dfe6e8:82'),
    'tile-blue': lit('gen:tile:5fa8c8:83'),
    shelf: lit('gen:wood:7a5a36:84'),
    metal: lit('gen:metal:8a8e92:85'),
    fabric: lit('gen:carpet:5a3a3a:86'),
    hedge: lit('gen:leaves:3f6a2e:90'),
    path: lit('gen:paving:a49c88:91'),
    bark: lit('bark'),
    'leaves-green': lit('gen:leaves:4f8a3a:92'),
    'leaves-dark': lit('gen:leaves:2f5a2a:93'),
    'leaves-autumn': lit('gen:leaves:c8742e:94'),
    'leaves-pink': lit('gen:leaves:f0a8c0:95'),
    'leaves-lime': lit('gen:leaves:8fd14f:96'),
    'flowers-0': lit('gen:flowers:e84a5a:97'),
    'flowers-1': lit('gen:flowers:f4d24a:98'),
    'flowers-2': lit('gen:flowers:a87ae8:99'),
    'flowers-3': lit('gen:flowers:3cc8e8:100'),
    'aero-white': lit('aero-tile'),
    'road-x': lit('road:x'),
    'road-z': lit('road:z'),
    grate: lit('grate'),
    shoji: lit('shoji'),
    tatami: lit('tatami'),
    'wood-red': lit('gen:panel:b8382a:101'),
    'sign-green': basic(0x1f7a4a),
    lantern: basic(0xffc070),
    daylight: basic(0xfafcff),
    glow: basic(0xfff6e0),
    'glow-blue': basic(0x8fe0ff),
    'exit-sign': { kind: 'basic-tex', tex: 'exit-sign', metres: 0.5 },
    snow: lit('gen:snow:eef4fb:201'),
    rock: lit('gen:rock:6e6a66:202'),
    basalt: lit('gen:rock:2e2a28:203'),
    lava: { kind: 'basic-tex', tex: 'gen:lava:8a1a04:204' },
    sand: lit('gen:sand:d8c690:205'),
    flesh: lit('gen:flesh:b8586a:206'),
    'flesh-dark': lit('gen:flesh:7a2838:207'),
    bronze: lit('gen:bronze:8a6234:208'),
    marble: lit('gen:marble:eceae6:209'),
    windows: lit('gen:windows:3a3e4a:210'),
    'windows-day': lit('gen:windows:8a96a8:211'),
    brick: lit('gen:brick:8a4a36:212'),
    pages: lit('gen:pages:efe6cc:213'),
    'book-red': lit('gen:book:7a1e24:214'),
    'book-blue': lit('gen:book:1e3a6a:215'),
    'book-green': lit('gen:book:1e5a3a:216'),
    'book-brown': lit('gen:book:5a3a1e:217'),
    endstone: lit('gen:endstone:d8d4a0:218'),
    obsidian: lit('gen:obsidian:1a1024:219'),
    moss: lit('gen:moss:3a5a2a:220'),
    'cap-teal': lit('gen:cap:2a6a7a:221'),
    'cap-purple': lit('gen:cap:5a2a7a:222'),
    pine: lit('gen:leaves:1f4a2e:223'),
    'hospital-wall': lit('gen:panel:c8d8d0:224'),
    'hospital-floor': lit('gen:tile:a8b8b0:225'),
    'crystal-purple': basic(0xc87aff),
    'gem-blue': basic(0x6ad8ff),
    'gem-pink': basic(0xff8ad8),
    'gem-green': basic(0x8affb0),
    'gill-glow': basic(0x7affe0),
    'neon-pink': basic(0xff4aa8),
    'neon-blue': basic(0x4ac8ff),
    'red-light': basic(0xff3030),
    portal: basic(0x1a0830),
    water: water(0x4fb6d0, 0.55),
    ocean: water(0x1a5a8a, 0.8, 0.12),
    'hot-spring': water(0x7ad8d0, 0.6, 0.015),
    'glass-floor': clear(0xbfe4ff, 0.12),
    invisible: clear(0xffffff, 0),
    // Solid underside of a floor in vertical levels (also the ceiling below).
    slab: lit(p.ceilingTex),
    'pool-tile': lit('gen:pooltile:f2f0e6:240'),
    'pool-water': water(0x38c4b0, 0.5, 0.015),
    'pool-water-blue': water(0x3aa8d8, 0.5, 0.015),
    'pool-water-mint': water(0x6ad8b8, 0.45, 0.015),
    'clouds-window': { kind: 'basic-tex', tex: 'clouds-window' },
    'slide-red': lit('gen:panel:e8402a:241'),
    'slide-yellow': lit('gen:panel:f4c830:242'),
    'slide-blue': lit('gen:panel:2a7ae8:243'),
    'slide-green': lit('gen:panel:3ac86a:244'),
    'slide-pink': lit('gen:panel:f070b0:245'),
    'cove-glow': basic(0xfff4d8),
    glass: clear(0x9fd8f0, 0.22),
    'water-dark': water(0x0c1c26, 0.85, 0.02),
    'water-shallow': water(0x7fd0e0, 0.4, 0.012),
  };
}

export function matMetres(table: Record<string, MatDef>, key: string): number {
  const d = table[key] ?? table.wall;
  return d.metres ?? (d.tex ? texMetres(d.tex) : 1);
}
