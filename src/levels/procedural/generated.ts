/**
 * Unknown levels (SPEC §4.3): a level id is hashed into a "theme genome" so
 * the same id always yields the same level. Built on the shared grid generator.
 */
import { hashString, Rng } from '../../core/rng';
import { ALMOND_ONLY } from '../../items/lootTables';
import { generateGrid, gridArrival, gridLightSampler, type GridParams } from '../gridLevel';
import type { ExitTarget, LevelDefinition } from '../levelDefinition';

const ADJ = ['沈黙の', '黄昏の', '湿った', '終わらない', '色褪せた', '眠れる', '忘れられた', '傾いた', '冷たい', '遠い', '濁った', '白い', '錆びた', '静かな', '薄暗い', '誰もいない', '反響する', '夜明けの'];
const NOUN = ['貯水庫', '回廊', '待合室', '倉庫', '書庫', '階段室', '温室', '駐車場', '配電室', '客室', '広間', '地下道', '展示室', '洗濯室', '事務所', '更衣室', '水路', '講堂'];

interface Theme {
  wall: string;
  floor: string;
  ceiling: string;
  light: number;
  tint: [number, number, number];
  fog: number;
}

/** Palette families, including the U1-U3 moods from SPEC §4.2.1. */
const THEMES: Theme[] = [
  { wall: 'gen:stripes:b9a46a', floor: 'gen:carpet:6e5f3a', ceiling: 'gen:panel:cfc9b2', light: 0xfff4d6, tint: [1, 0.95, 0.8], fog: 0x221e12 }, // yellowish office
  { wall: 'gen:tile:d9e3e6', floor: 'gen:tile:9fb3b8', ceiling: 'gen:panel:e8eeee', light: 0xeaffff, tint: [0.9, 1, 1], fog: 0x1a2426 }, // pool tiles
  { wall: 'gen:brick:7a3b2a', floor: 'gen:floor-concrete:4e4842', ceiling: 'gen:concrete:3b3632', light: 0xffd090, tint: [1, 0.82, 0.6], fog: 0x150e0a }, // brick
  { wall: 'gen:panel:5c6f7d', floor: 'gen:carpet:3a4652', ceiling: 'gen:panel:9aa6ad', light: 0xdfe8ff, tint: [0.85, 0.92, 1], fog: 0x10151c }, // blue-grey office
  { wall: 'gen:wood:6b4a2c', floor: 'gen:wood:5a3b22', ceiling: 'gen:wood:3e2a18', light: 0xffb060, tint: [1, 0.75, 0.45], fog: 0x120a05 }, // dim japanese room (U2 mood)
  { wall: 'gen:panel:e9f6fb', floor: 'gen:tile:cfeef4', ceiling: 'gen:panel:ffffff', light: 0xffffff, tint: [0.9, 1, 1], fog: 0x9cd8e6 }, // aero white/aqua (U3 mood)
  { wall: 'gen:panel:7b8fa8', floor: 'gen:floor-concrete:4a4f57', ceiling: 'gen:concrete:3d4048', light: 0xffc9a8, tint: [1, 0.85, 0.75], fog: 0x2a2a38 }, // dawn grey-blue (U1 mood)
  { wall: 'gen:concrete:5b6b52', floor: 'gen:tile:4c5e48', ceiling: 'gen:concrete:39443a', light: 0xd8ffc8, tint: [0.85, 1, 0.8], fog: 0x0e150c }, // greenhouse green
  { wall: 'gen:stripes:8a5a6a', floor: 'gen:carpet:4a2a34', ceiling: 'gen:panel:a88a92', light: 0xffd8e0, tint: [1, 0.85, 0.88], fog: 0x1a0d12 }, // hotel corridor
  { wall: 'gen:concrete:3a3a3a', floor: 'gen:floor-concrete:2c2c2c', ceiling: 'gen:concrete:222222', light: 0xff6040, tint: [1, 0.5, 0.4], fog: 0x0a0505 }, // emergency red
];

/** Hints so known Wiki ids look like their connection (contents remain original). */
const HINTS: Record<string, Partial<{ theme: number; structure: number }>> = {
  '13': { theme: 7, structure: 1 },
  '14': { theme: 9, structure: 2 },
  '139': { theme: 4, structure: 0 },
  '27': { theme: 2, structure: 2 },
  '37': { theme: 1, structure: 1 },
  '5': { theme: 8, structure: 3 },
  '4': { theme: 3, structure: 3 },
  '4.3': { theme: 5, structure: 2 },
  '3': { theme: 2, structure: 0 },
  '8': { theme: 2, structure: 0 },
};

const cache = new Map<string, LevelDefinition>();

/** Nearby numeric ids for exits (SPEC §4.3: one exit leads to a near integer level). */
function neighbours(id: string, rng: Rng): ExitTarget[] {
  const n = Number(id);
  const out: ExitTarget[] = [{ levelId: '0', weight: 1 }];
  if (Number.isFinite(n)) {
    const base = Math.round(n);
    if (base - 1 >= 0) out.push({ levelId: String(base - 1), weight: 3 });
    out.push({ levelId: String(base + 1), weight: 3 });
  }
  out.push({ levelId: String(rng.int(5, 999)), weight: 2 });
  return out;
}

export function makeGeneratedLevel(id: string): LevelDefinition {
  const hit = cache.get(id);
  if (hit) return hit;
  const seed = hashString('genome:' + id);
  const rng = new Rng(seed);
  const hint = HINTS[id] ?? {};
  const themeIdx = hint.theme ?? rng.int(0, THEMES.length - 1);
  const theme = THEMES[themeIdx];
  // Structure: 0 maze, 1 halls with pillars, 2 corridors, 3 rooms
  const structure = hint.structure ?? rng.int(0, 3);
  const cell = [3.2, 6, 4, 5][structure] + (structure === 1 ? rng.pick([0, 2]) : 0);
  const cellsPerChunk = Math.max(4, Math.round(32 / cell));
  const wallP = [0.55, 0.15, 0.62, 0.42][structure];
  const passable = 0.64;
  const doorwayP = Math.min(0.9, Math.max(0.2, (passable - (1 - wallP)) / wallP));
  const ceiling = [2.6, 4 + rng.float() * 4, 2.5, 3 + rng.float()][structure];
  const params: GridParams = {
    cell,
    cellsPerChunk,
    wallP,
    doorwayP,
    regions: structure !== 2,
    ceiling,
    wallT: 0.2,
    pillarP: structure === 1 ? 0.7 : 0.05,
    pillarHalf: structure === 1 ? 0.4 : 0.25,
    lightP: 0.25 + rng.float() * 0.4,
    lightDeadP: rng.float() * 0.2,
    lightFlickerP: rng.float() * 0.08,
    lightW: 0.6,
    lightD: 1.2,
    lightIntensity: 0.8 + rng.float() * 0.8 + (ceiling > 4 ? 1.2 : 0),
    crateP: structure === 1 && rng.chance(0.4) ? 0.2 : 0,
    pipes: structure === 2 && rng.chance(0.5),
    doorP: 0.05,
    doorKinds: [{ kind: 'plain-door', weight: 1, color: rng.pick([0x6b4a2c, 0x8a8f94, 0xb8b2a0, 0x3d5a6b, 0x7a2a22]) }],
    thinP: 0.012,
    lootP: 0.02,
  };
  const tex = (k: string, n: number) => `${k}:${(seed + n) % 9973}`;
  const name = rng.pick(ADJ) + rng.pick(NOUN);
  const def: LevelDefinition = {
    id,
    title: 'Level ' + id,
    name,
    subtitle: name,
    threatClass: rng.int(1, 3) as 1 | 2 | 3,
    chunkSize: cell * cellsPerChunk,
    ceilingHeight: ceiling,
    palette: {
      wallTex: tex(theme.wall, 1),
      floorTex: tex(theme.floor, 2),
      ceilingTex: tex(theme.ceiling, 3),
      lightColor: theme.light,
      fogColor: theme.fog,
      fogDensity: 0.035 + rng.float() * 0.035,
      ambient: 0.06 + rng.float() * 0.08,
      lightTint: theme.tint,
    },
    generator: (ctx, cx, cz) => generateGrid(ctx, params, cx, cz),
    lightSampler: (ctx, cx, cz) => gridLightSampler(ctx, params, cx, cz),
    setPieces: [],
    lootTable: { perCell: params.lootP, rules: ALMOND_ONLY },
    exits: [
      { kind: 'door', prop: 'plain-door', targets: neighbours(id, rng), discovery: 'ありふれた扉の向こうは、まったく別の場所だった。' },
      { kind: 'wall', push: 2.5, targets: [{ levelId: String(rng.int(5, 999)), weight: 1 }], discovery: '壁をすり抜けると、知らない場所にいた。' },
      { kind: 'walk', distance: 1200 + rng.int(0, 800), targets: neighbours(id, rng), discovery: '歩き続けるうちに、景色が別のものに変わっていた。' },
    ],
    drainMul: 1,
    hallucination: 1,
    footstep: 'concrete',
    ambience: { humFreq: rng.pick([0, 50, 60, 120]), humGain: 0.05, noiseGain: 0.02 + rng.float() * 0.04, noiseCutoff: 300 + rng.int(0, 900) },
    environment: 'enclosed',
    spawn: { x: cell / 2, y: 0, z: cell / 2, yaw: 0 },
    arrival: (ctx, h) => gridArrival(ctx, params, h),
  };
  cache.set(id, def);
  return def;
}
