/**
 * Material table (pure): which texture each material key uses, how it is drawn
 * and how many metres one texture repeat covers. Shared by the renderer
 * (LevelMaterials) and the geometry builder (main thread or worker), so UVs
 * always match the textures.
 */
import type { Palette } from '../levels/levelDefinition';

export type MatKind = 'lit' | 'lit-transparent' | 'clear' | 'basic' | 'basic-tex';

export interface MatDef {
  kind: MatKind;
  tex?: string;
  color?: number;
  opacity?: number;
  /** Colour multiplier for lit materials (thin walls/floors). */
  tint?: [number, number, number];
  /** Override for UV scale. */
  metres?: number;
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
    water: clear(0x4fb6d0, 0.55),
    ocean: clear(0x1a5a8a, 0.8),
    'hot-spring': clear(0x7ad8d0, 0.6),
    'glass-floor': clear(0xbfe4ff, 0.12),
    invisible: clear(0xffffff, 0),
    glass: clear(0x9fd8f0, 0.22),
    'water-dark': clear(0x0c1c26, 0.85),
    'water-shallow': clear(0x7fd0e0, 0.4),
  };
}

export function matMetres(table: Record<string, MatDef>, key: string): number {
  const d = table[key] ?? table.wall;
  return d.metres ?? (d.tex ? texMetres(d.tex) : 1);
}
