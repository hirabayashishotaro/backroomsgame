/**
 * Level builders for the non-maze worlds (SPEC §3.6, §4.2.1, §4.3):
 * gardens / aero plazas (open sky), walkways over the void and floating roads
 * (groundless), and tatami rooms with open-air bridges. Used both by the
 * hand-made U1-U3 / Void levels and by generated levels.
 */
import { Rng } from '../core/rng';
import { ALMOND_ONLY } from '../items/lootTables';
import { SKY_PRESETS, type SkyKind } from '../systems/skyPresets';
import { generateGrid, gridArrival, gridLightSampler, type GridParams } from './gridLevel';
import { GRID_PIECES } from './gridPieces';
import type { AmbienceDef, ExitRule, LevelDefinition } from './levelDefinition';
import {
  GARDEN_CELL,
  GARDEN_N,
  ROAD_S,
  WALK_CELL,
  WALK_N,
  gardenArrival,
  gardenSampler,
  generateGarden,
  generateRoads,
  generateWalkways,
  roadArrival,
  roadSampler,
  walkwayArrival,
  walkwaySampler,
  type GardenParams,
  type RoadParams,
  type WalkwayParams,
} from './procedural/outdoor';

export const GARDEN_FEATURES = ['fountain', 'gazebo', 'pond', 'stone-circle', 'hedge-maze', 'flower-field'];
export const AERO_FEATURES = ['fountain', 'gazebo', 'waterfall', 'glass-tube', 'kiosk', 'pond'];

export const FEATURE_NAMES: Record<string, { name: string; desc: string }> = {
  fountain: { name: '噴水', desc: '水の音だけが響く噴水。縁にアーモンドウォーターが置かれている。' },
  gazebo: { name: 'あずまや', desc: '屋根の下に小さな明かりとベンチ。誰かが休んでいた気配がある。' },
  pond: { name: '飛び石の池', desc: '浅い池に飛び石が並ぶ。真ん中に何か光るものがある。' },
  'stone-circle': { name: '石の環', desc: '背の高い石が輪になって立つ。中心の光に足を踏み入れると……。' },
  'hedge-maze': { name: '生け垣の迷路', desc: '背の高い生け垣が小さな迷路を作っている。' },
  'flower-field': { name: '花畑', desc: '一面の花と、薄紅色の葉をつけた木。' },
  waterfall: { name: '滝の壁', desc: '白い枠の中を水が流れ落ちる。くぐり抜けると別の場所に出る。' },
  'glass-tube': { name: 'ガラスのエレベーター', desc: '空へ伸びるガラスの筒。階ごとに光の輪が灯る。' },
  kiosk: { name: 'インフォメーション', desc: '誰もいない案内所。画面には読めない文字が流れている。' },
  toll: { name: '無人の料金所', desc: 'ブースだけが立ち、バーは上がったままになっている。' },
  gantry: { name: '標識門', desc: '意味の分からない地名の看板。その下の光は出口に見える。' },
  rest: { name: '浮かぶ休憩所', desc: '空中に浮かぶ駐車場。自販機の光と扉がひとつ。' },
  tower: { name: '立った道路', desc: '道路が壁のように垂直に立っている。' },
  junction: { name: '空中ジャンクション', desc: '頭上をはるかに高く、別の道路が横切っていく。橋脚は雲の下まで続く。' },
  'wide-platform': { name: '広い足場', desc: '虚空に浮かぶ広い床。ここだけは少し安心できる。' },
  'lamp-post': { name: '孤独な街灯', desc: '足場の角に一本だけ立つ街灯。' },
  'lone-door': { name: '宙の扉', desc: '何もない足場の上に、扉だけが立っている。' },
  'lost-bottle': { name: '置き忘れのボトル', desc: '誰かが置いていったアーモンドウォーター。' },
  pillar: { name: '底なしの柱', desc: '足場を支える柱は、闇の底まで続いている。' },
};

const WALKWAY_PIECES = ['wide-platform', 'lamp-post', 'lone-door', 'lost-bottle', 'pillar'];

function sunOf(kind: SkyKind): [number, number, number] {
  return SKY_PRESETS[kind].sunDir;
}

function daylightOf(kind: SkyKind): number {
  return { day: 1.0, dusk: 0.6, night: 0.22, dawn: 0.72, void: 0.12, overcast: 0.75 }[kind];
}

const WIND: AmbienceDef = { humFreq: 0, humGain: 0, noiseGain: 0.05, noiseCutoff: 520 };

export interface WorldOpts {
  id: string;
  title: string;
  name: string;
  subtitle?: string;
  threat: 0 | 1 | 2 | 3 | 4 | 5;
  sky: SkyKind;
  exits: ExitRule[];
  kindLabel: string;
}

function base(o: WorldOpts) {
  return {
    id: o.id,
    title: o.title,
    name: o.name,
    subtitle: o.subtitle ?? o.name,
    threatClass: o.threat,
    exits: o.exits,
    kindLabel: o.kindLabel,
    hallucination: 0.6,
    drainMul: 1,
    lootTable: { perCell: 0.02, rules: ALMOND_ONLY },
  };
}

// ---------------------------------------------------------------------------

export function makeGardenLevel(o: WorldOpts, style: 'garden' | 'aero' | 'greenhouse', rng: Rng): LevelDefinition {
  const night = o.sky === 'night' || o.sky === 'dusk';
  const p: GardenParams = {
    style,
    hedgeP: style === 'aero' ? 0.12 : 0.18 + rng.float() * 0.2,
    hedgeH: style === 'garden' ? 1.3 : 2.2,
    treeP: 0.18 + rng.float() * 0.15,
    leafMats: style === 'aero' ? ['leaves-lime', 'leaves-green'] : rng.pick([['leaves-green', 'leaves-dark'], ['leaves-autumn', 'leaves-green'], ['leaves-pink', 'leaves-green'], ['leaves-dark']]),
    bedP: 0.12,
    flowerMats: style === 'aero' ? ['flowers-3', 'flowers-1'] : ['flowers-0', 'flowers-1', 'flowers-2'],
    lampsOn: night || o.sky === 'void',
    featureP: 0.45,
    features: style === 'aero' ? AERO_FEATURES : style === 'greenhouse' ? ['pond', 'fountain', 'flower-field', 'gazebo', 'hedge-maze', 'glass-tube'] : GARDEN_FEATURES,
    doorP: 0.012,
    thinFloorP: 0.006,
    lootP: 0.02,
    daylight: daylightOf(o.sky),
    sun: sunOf(o.sky),
  };
  const S = GARDEN_CELL * GARDEN_N;
  const sky = SKY_PRESETS[o.sky];
  return {
    ...base(o),
    chunkSize: S,
    ceilingHeight: 30,
    palette: {
      wallTex: style === 'aero' ? 'aero-tile' : 'gen:leaves:3f6a2e:90',
      floorTex: style === 'aero' ? 'aero-tile' : `gen:grass:${night ? '3a5a2a' : '5a8a3a'}:${rng.int(1, 999)}`,
      ceilingTex: 'white',
      lightColor: 0xfff4d6,
      fogColor: sky.horizon,
      fogDensity: night ? 0.022 : 0.012,
      ambient: 0.1,
      lightTint: style === 'aero' ? [1, 1, 1] : [1, 0.98, 0.92],
    },
    generator: (ctx, cx, cz) => generateGarden(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => gardenSampler(ctx, p, cx, cz),
    setPieces: p.features.map((id) => ({ id, ...FEATURE_NAMES[id] })),
    footstep: style === 'aero' ? 'tile' : 'carpet',
    ambience: style === 'aero' ? { humFreq: 0, humGain: 0, noiseGain: 0.025, noiseCutoff: 1400 } : WIND,
    environment: 'open-sky',
    sky: { kind: o.sky },
    spawn: { x: GARDEN_CELL / 2, y: 0, z: GARDEN_CELL * 2 + GARDEN_CELL / 2, yaw: 0 },
    arrival: (ctx, h) => gardenArrival(ctx, p, h),
    drainMul: style === 'aero' ? 0.7 : 0.9,
  };
}

export function makeWalkwayLevel(o: WorldOpts, rng: Rng, narrow = false): LevelDefinition {
  const p: WalkwayParams = {
    linkP: narrow ? 0.7 : 0.72,
    gapP: narrow ? 0.28 : 0.12 + rng.float() * 0.08,
    // "Extremely narrow": beams barely wider than your feet.
    beamW: narrow ? 0.5 : 0.8 + rng.float() * 0.5,
    heightStep: rng.pick([0.6, 0.9, 1.2]),
    lampP: o.sky === 'day' ? 0.05 : 0.18,
    doorP: 0.5,
    lootP: 0.08,
    pillarP: 0.25,
    deckMat: rng.pick(['grate', 'stone', 'wood-dark', 'metal']),
    daylight: daylightOf(o.sky),
    sun: sunOf(o.sky),
  };
  const sky = SKY_PRESETS[o.sky];
  return {
    ...base(o),
    chunkSize: WALK_CELL * WALK_N,
    ceilingHeight: 30,
    palette: {
      wallTex: 'gen:concrete:3a3a3e:120',
      floorTex: 'grate',
      ceilingTex: 'white',
      lightColor: 0xfff0d0,
      fogColor: sky.horizon,
      fogDensity: o.sky === 'void' ? 0.05 : 0.02,
      ambient: 0.1,
      lightTint: [1, 0.95, 0.85],
    },
    generator: (ctx, cx, cz) => generateWalkways(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => walkwaySampler(ctx, p, cx, cz),
    setPieces: WALKWAY_PIECES.map((id) => ({ id, ...FEATURE_NAMES[id] })),
    footstep: 'metal',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.06, noiseCutoff: 300 },
    environment: 'open-sky',
    sky: { kind: o.sky, cloudSea: o.sky === 'dawn' || o.sky === 'day' },
    groundless: true,
    fall: { killY: -25, mode: 'transition' },
    spawn: { x: WALK_CELL / 2, y: 0, z: WALK_CELL / 2, yaw: 0 },
    arrival: (ctx, h) => walkwayArrival(ctx, p, h),
    hallucination: 0.9,
    drainMul: 1.1,
  };
}

export function makeRoadLevel(o: WorldOpts, rng: Rng): LevelDefinition {
  const p: RoadParams = {
    linkP: 0.78,
    gapP: 0.16,
    railP: 0.4,
    overpassP: 0.3 + rng.float() * 0.2,
    pieceP: 0.3,
    daylight: daylightOf(o.sky),
    sun: sunOf(o.sky),
  };
  const sky = SKY_PRESETS[o.sky];
  return {
    ...base(o),
    chunkSize: ROAD_S,
    ceilingHeight: 30,
    palette: {
      wallTex: 'road:x',
      floorTex: 'road:x',
      ceilingTex: 'white',
      lightColor: 0xfff4d6,
      fogColor: sky.horizon,
      fogDensity: 0.011,
      ambient: 0.1,
      lightTint: [1, 0.95, 0.9],
    },
    generator: (ctx, cx, cz) => generateRoads(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => roadSampler(ctx, p, cx, cz),
    setPieces: ['junction', 'toll', 'gantry', 'rest', 'tower'].map((id) => ({ id, ...FEATURE_NAMES[id] })),
    footstep: 'concrete',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.07, noiseCutoff: 260 },
    environment: 'open-sky',
    sky: { kind: o.sky, cloudSea: true },
    groundless: true,
    fall: { killY: -30, mode: 'transition' },
    spawn: { x: 14, y: 0, z: 14, yaw: 0 },
    arrival: (ctx, h) => roadArrival(ctx, p, h),
    lootTable: { perCell: 0, rules: ALMOND_ONLY },
  };
}

export function makeTatamiLevel(o: WorldOpts, _rng: Rng): LevelDefinition {
  const p: GridParams = {
    cell: 3.6,
    cellsPerChunk: 9,
    wallP: 0.42,
    doorwayP: 0.6,
    regions: true,
    ceiling: 2.5,
    wallT: 0.12,
    pillarP: 0.35,
    pillarHalf: 0.08,
    lightP: 0.22,
    lightDeadP: 0.15,
    lightFlickerP: 0.05,
    lightW: 0.45,
    lightD: 0.45,
    lightIntensity: 0.7,
    crateP: 0,
    pipes: false,
    doorP: 0.03,
    doorKinds: [{ kind: 'plain-door', weight: 1, color: 0xd8cfb4 }],
    thinP: 0.012,
    lootP: 0.02,
    pieces: ['taiko-bridge', 'tea-island', 'lantern-path', 'door-row', 'reception'],
    pieceRate: 0.8,
    featureCell: 2,
    thinFloorP: 0.005,
  };
  const sky = SKY_PRESETS[o.sky];
  return {
    ...base(o),
    chunkSize: p.cell * p.cellsPerChunk,
    ceilingHeight: p.ceiling,
    palette: {
      wallTex: 'shoji',
      floorTex: 'tatami',
      ceilingTex: 'gen:wood:4a3420:130',
      lightColor: 0xffc890,
      fogColor: sky.horizon,
      fogDensity: 0.05,
      ambient: 0.06,
      lightTint: [1, 0.8, 0.55],
    },
    generator: (ctx, cx, cz) => generateGrid(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => gridLightSampler(ctx, p, cx, cz),
    setPieces: (p.pieces ?? []).map((id) => ({ id, name: GRID_PIECES[id].name, desc: GRID_PIECES[id].desc })),
    footstep: 'carpet',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.035, noiseCutoff: 700 },
    environment: 'enclosed',
    sky: { kind: o.sky },
    spawn: { x: 1.8, y: 0, z: 1.8, yaw: 0 },
    arrival: (ctx, h) => gridArrival(ctx, p, h),
    hallucination: 1.1,
  };
}

/** Grid level from explicit parameters (hand-made Wiki levels). */
export function makeGridLevel(
  o: WorldOpts,
  p: GridParams,
  look: { wall: string; floor: string; ceiling: string; light: number; tint: [number, number, number]; fog: number; fogDensity: number; ambient: number },
  extra: Partial<LevelDefinition> = {},
): LevelDefinition {
  return {
    ...base(o),
    chunkSize: p.cell * p.cellsPerChunk,
    ceilingHeight: p.ceiling,
    palette: {
      wallTex: look.wall,
      floorTex: look.floor,
      ceilingTex: look.ceiling,
      lightColor: look.light,
      fogColor: look.fog,
      fogDensity: look.fogDensity,
      ambient: look.ambient,
      lightTint: look.tint,
    },
    generator: (ctx, cx, cz) => generateGrid(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => gridLightSampler(ctx, p, cx, cz),
    setPieces: (p.pieces ?? []).map((id) => ({ id, name: GRID_PIECES[id].name, desc: GRID_PIECES[id].desc })),
    footstep: 'concrete',
    ambience: { humFreq: 50, humGain: 0.04, noiseGain: 0.03, noiseCutoff: 600 },
    environment: 'enclosed',
    spawn: { x: p.cell / 2, y: 0, z: p.cell / 2, yaw: 0 },
    arrival: (ctx, h) => gridArrival(ctx, p, h),
    lootTable: { perCell: p.lootP, rules: ALMOND_ONLY },
    ...extra,
  };
}

export function makeDocksLevel(o: WorldOpts): LevelDefinition {
  const p: WalkwayParams = {
    linkP: 0.66,
    gapP: 0,
    beamW: 2.2,
    heightStep: 0,
    lampP: 0.28,
    doorP: 0.6,
    lootP: 0.1,
    pillarP: 0,
    deckMat: 'wood-dark',
    daylight: daylightOf(o.sky),
    sun: sunOf(o.sky),
    waterY: -1.4,
    docks: true,
  };
  const sky = SKY_PRESETS[o.sky];
  return {
    ...base(o),
    chunkSize: WALK_CELL * WALK_N,
    ceilingHeight: 30,
    palette: { wallTex: 'gen:wood:4a3420:81', floorTex: 'gen:wood:4a3420:81', ceilingTex: 'white', lightColor: 0xfff0d0, fogColor: sky.horizon, fogDensity: 0.03, ambient: 0.1, lightTint: [1, 0.92, 0.8] },
    generator: (ctx, cx, cz) => generateWalkways(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => walkwaySampler(ctx, p, cx, cz),
    setPieces: [
      { id: 'pier', name: '桟橋', desc: '暗い水の上に、木の桟橋がどこまでも延びている。' },
      { id: 'bench', name: 'ベンチ', desc: '桟橋の先のベンチ。誰かが座って水面を眺めていたのだろうか。' },
      { id: 'bin', name: 'ゴミ箱', desc: '空っぽの金属のゴミ箱。たまにアーモンドウォーターが捨てられている。' },
      { id: 'lamp', name: '街灯', desc: '水面に揺れる、弱い街灯の光。' },
      { id: 'doors', name: '扉の群れ', desc: '広い桟橋の上に、どこにもつながっていない扉が立っている。開けると別の場所に出る。' },
    ],
    footstep: 'carpet',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.05, noiseCutoff: 420 },
    environment: 'open-sky',
    sky: { kind: o.sky },
    groundless: true,
    fall: { killY: -2.5, mode: 'transition' },
    spawn: { x: WALK_CELL / 2, y: 0, z: WALK_CELL / 2, yaw: 0 },
    arrival: (ctx, h) => walkwayArrival(ctx, p, h),
    hallucination: 0.5,
    drainMul: 0.85,
  };
}
