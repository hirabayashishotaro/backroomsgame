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
    water: clear(0x4fb6d0, 0.55),
    glass: clear(0x9fd8f0, 0.22),
    'water-dark': clear(0x0c1c26, 0.85),
    'water-shallow': clear(0x7fd0e0, 0.4),
  };
}

export function matMetres(table: Record<string, MatDef>, key: string): number {
  const d = table[key] ?? table.wall;
  return d.metres ?? (d.tex ? texMetres(d.tex) : 1);
}
