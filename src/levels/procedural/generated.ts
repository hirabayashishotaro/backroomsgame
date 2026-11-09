/**
 * Unknown levels (SPEC §4.3): a level id is hashed into a "theme genome" so
 * the same id always yields the same level. Built on the shared grid generator.
 */
import { hashString, Rng } from '../../core/rng';
import { ALMOND_ONLY } from '../../items/lootTables';
import { generateGrid, gridArrival, gridLightSampler, type GridParams } from '../gridLevel';
import type { ExitRule, ExitTarget, LevelDefinition } from '../levelDefinition';
import type { SkyKind } from '../../systems/skyPresets';
import { makeGardenLevel, makeRoadLevel, makeTatamiLevel, makeWalkwayLevel, type WorldOpts } from '../worlds';
import { SKY_PRESETS } from '../../systems/skyPresets';
import * as W from '../worlds2';
import type { ShapeOpts } from '../worlds2';
import { ALL_GRID_PIECES, GRID_PIECES } from '../gridPieces';

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
const HINTS: Record<string, Partial<{ theme: number; structure: number; grammar: Grammar; sky: SkyKind }>> = {
  '13': { grammar: 'garden', sky: 'day' },
  '14': { theme: 9, structure: 2 },
  '139': { theme: 4, structure: 0 },
  '27': { theme: 2, structure: 2 },
  '37': { theme: 1, structure: 1 },
  '5': { theme: 8, structure: 3 },
  '4': { theme: 3, structure: 3 },
  '4.3': { theme: 5, structure: 2 },
  '57': { grammar: 'tatami', sky: 'night' },
  '88': { grammar: 'garden', sky: 'night' },
  '404': { grammar: 'narrow', sky: 'void' },
  '999': { grammar: 'walkways', sky: 'night' },
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

function pickPieces(rng: Rng, n: number): string[] {
  const pool = [...ALL_GRID_PIECES];
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return out;
}

export type Grammar =
  | 'grid'
  | 'ruins'
  | 'garden'
  | 'aero'
  | 'walkways'
  | 'narrow'
  | 'roads'
  | 'tatami'
  | 'spiral'
  | 'tunnel'
  | 'chaos'
  | 'mountain'
  | 'volcano'
  | 'temple'
  | 'island'
  | 'cave'
  | 'mansion'
  | 'swamp'
  | 'books'
  | 'gullet'
  | 'colossus'
  | 'glassvoid'
  | 'rooftops'
  | 'endisles'
  | 'pooltower'
  | 'hospital';

const GRAMMARS: Array<[Grammar, number, SkyKind[]]> = [
  ['grid', 24, []],
  ['ruins', 10, ['day', 'dusk', 'night', 'overcast', 'dawn']],
  ['garden', 16, ['day', 'dusk', 'night', 'dawn', 'overcast']],
  ['aero', 7, ['day', 'dawn']],
  ['walkways', 12, ['night', 'dawn', 'dusk', 'day', 'void']],
  ['narrow', 7, ['void', 'night']],
  ['roads', 7, ['dawn', 'day', 'dusk', 'night']],
  ['tatami', 8, ['night', 'dusk']],
  ['spiral', 6, []],
  ['tunnel', 6, []],
  ['chaos', 4, []],
  ['mountain', 6, ['day', 'dawn', 'overcast']],
  ['volcano', 4, []],
  ['temple', 3, []],
  ['island', 3, []],
  ['cave', 6, []],
  ['mansion', 5, []],
  ['swamp', 5, []],
  ['books', 4, []],
  ['gullet', 3, []],
  ['colossus', 3, ['dusk', 'void', 'day', 'night']],
  ['glassvoid', 3, []],
  ['rooftops', 4, []],
  ['endisles', 4, []],
  ['pooltower', 4, []],
  ['hospital', 5, []],
];

export const GRAMMAR_LABEL: Record<Grammar, string> = {
  spiral: '螺旋階段(縦)',
  tunnel: 'トンネル(一本道)',
  chaos: 'カオス',
  mountain: '雪山(斜め)',
  volcano: '火山',
  temple: '神殿(ひと部屋)',
  island: '孤島',
  cave: '洞窟(縦横)',
  mansion: 'マンション(縦)',
  swamp: 'キノコの湿地',
  books: '本の浮島',
  gullet: '食道(下へ)',
  colossus: '巨像',
  glassvoid: '透明な虚無',
  rooftops: '夜の屋上',
  endisles: '虚空の浮島',
  pooltower: '重なるプール(縦)',
  hospital: '夜の病院',
  grid: '屋内迷路',
  ruins: '空の下の廃墟',
  garden: '庭園',
  aero: 'エアロ広場',
  walkways: '空中通路',
  narrow: '極細の足場',
  roads: '浮遊道路',
  tatami: '座敷と橋',
};

export const SKY_LABEL: Record<SkyKind, string> = { day: '昼', dusk: '夕暮れ', night: '夜空', dawn: '夜明け', void: '虚無', overcast: '曇り' };

const WORLD_NOUN: Partial<Record<Grammar, string[]>> = {
  spiral: ['螺旋階段', '階段室', '吹き抜け'],
  tunnel: ['トンネル', '地下道', '坑道'],
  chaos: ['継ぎ目', '断片', '崩落'],
  mountain: ['雪山', '尾根', '氷河'],
  volcano: ['火口', '溶岩原', 'カルデラ'],
  temple: ['神殿', '聖堂', '拝殿'],
  island: ['孤島', '小島', '砂州'],
  cave: ['洞窟', '鍾乳洞', '地底湖'],
  mansion: ['マンション', '集合住宅', 'ホテル'],
  swamp: ['湿地', '菌の森', '沼地'],
  books: ['書架', '図書館', '書庫'],
  gullet: ['食道', '肉の縦穴', '喉'],
  colossus: ['巨像', '石像', '記念碑'],
  glassvoid: ['虚無', '空白', '無'],
  rooftops: ['屋上', '摩天楼', '夜景'],
  endisles: ['浮島', '果て', '虚空'],
  pooltower: ['プール', '浴場', '水槽'],
  hospital: ['病院', '病棟', '療養所'],
  ruins: ['廃墟', '中庭', '遺構', '回廊跡'],
  garden: ['庭園', '植物園', '花園', '中庭'],
  aero: ['広場', 'テラス', 'アトリウム', '未来都市'],
  walkways: ['足場', '吊り通路', '空中回廊', '桟橋'],
  narrow: ['奈落', '細道', '綱渡り', '深淵'],
  roads: ['高速道路', '環状線', '高架', 'インターチェンジ'],
  tatami: ['座敷', '離れ', '渡り廊下', '屋敷'],
};

/** The grammar and sky a generated id resolves to (for the developer level list). */
export function genomeOf(id: string): { grammar: Grammar; sky: SkyKind | null } {
  const rng = new Rng(hashString('grammar:' + id));
  const hint = HINTS[id] ?? {};
  let grammar = hint.grammar;
  if (!grammar) {
    if (hint.theme !== undefined) grammar = 'grid';
    else {
      const total = GRAMMARS.reduce((s, g) => s + g[1], 0);
      let x = rng.float() * total;
      for (const g of GRAMMARS) {
        x -= g[1];
        if (x < 0) {
          grammar = g[0];
          break;
        }
      }
    }
  }
  grammar ??= 'grid';
  const skies = GRAMMARS.find((g) => g[0] === grammar)![2];
  const sky = hint.sky ?? (skies.length ? rng.pick(skies) : null);
  return { grammar, sky };
}

const VERTICAL_GRAMMARS = new Set<Grammar>(['spiral', 'cave', 'mansion', 'gullet', 'pooltower']);
const GATE_GRAMMARS = new Set<Grammar>(['garden', 'aero', 'roads', 'mountain', 'volcano', 'temple', 'island', 'colossus', 'glassvoid', 'endisles']);

function genericExits(id: string, rng: Rng, grammar: Grammar): ExitRule[] {
  const exits: ExitRule[] = [
    { kind: 'door', prop: 'plain-door', targets: neighbours(id, rng), discovery: 'ありふれた扉の向こうは、まったく別の場所だった。' },
    {
      kind: 'floor',
      targets: [
        { levelId: String(rng.int(5, 999)), weight: 3 },
        { levelId: rng.chance(0.5) ? 'void' : '0', weight: 1 },
      ],
      discovery: grammar === 'walkways' || grammar === 'narrow' || grammar === 'roads' ? '足を踏み外し、下へ下へと落ちていった。' : '床が抜けて、どこかへ落ちていった。',
    },
    { kind: 'walk', distance: 1200 + rng.int(0, 800), targets: neighbours(id, rng), discovery: '歩き続けるうちに、景色が別のものに変わっていた。' },
  ];
  if (grammar === 'grid' || grammar === 'ruins' || grammar === 'tatami' || grammar === 'tunnel' || grammar === 'hospital' || grammar === 'temple' || grammar === 'chaos')
    exits.push({ kind: 'wall', push: 2.5, targets: [{ levelId: String(rng.int(5, 999)), weight: 1 }], discovery: '壁をすり抜けると、知らない場所にいた。' });
  if (VERTICAL_GRAMMARS.has(grammar))
    exits.push({ kind: 'depth', depth: 60 + rng.int(0, 60), targets: neighbours(id, rng), discovery: '上へ(下へ)進み続けると、別の場所に出た。' });
  if (GATE_GRAMMARS.has(grammar))
    exits.push({
      kind: 'special',
      zone: 'gate',
      seconds: 0.4,
      targets: [
        { levelId: rng.pick(['u1', 'u2', 'u3']), weight: 1 },
        { levelId: String(rng.int(5, 999)), weight: 2 },
      ],
      discovery: '光の中へ足を踏み入れると、別の場所に立っていた。',
    });
  return exits;
}

export function makeGeneratedLevel(id: string): LevelDefinition {
  const hit = cache.get(id);
  if (hit) return hit;
  const { grammar, sky } = genomeOf(id);
  let def: LevelDefinition;
  if (grammar === 'grid' || grammar === 'ruins') def = makeGridGenerated(id, grammar === 'ruins' ? sky! : null);
  else {
    const rng = new Rng(hashString('world:' + id));
    const name = rng.pick(ADJ) + rng.pick(WORLD_NOUN[grammar]!);
    const o: WorldOpts = {
      id,
      title: 'Level ' + id,
      name,
      threat: (grammar === 'narrow' ? 3 : rng.int(0, 2)) as 0 | 1 | 2 | 3,
      sky: sky ?? 'night',
      exits: genericExits(id, rng, grammar),
      kindLabel: sky ? `${GRAMMAR_LABEL[grammar]}・${SKY_LABEL[sky]}` : GRAMMAR_LABEL[grammar],
    };
    if (grammar === 'garden') def = makeGardenLevel(o, 'garden', rng);
    else if (grammar === 'aero') def = makeGardenLevel(o, 'aero', rng);
    else if (grammar === 'walkways') def = makeWalkwayLevel(o, rng);
    else if (grammar === 'narrow') def = makeWalkwayLevel(o, rng, true);
    else if (grammar === 'roads') def = makeRoadLevel(o, rng);
    else if (grammar === 'tatami') def = makeTatamiLevel(o, rng);
    else {
      const so: ShapeOpts = { ...o, threat: o.threat as ShapeOpts['threat'], sky: sky ?? undefined };
      const make: Record<string, () => LevelDefinition> = {
        spiral: () => W.makeSpiral(so, rng),
        tunnel: () => W.makeTunnel(so, rng),
        chaos: () => W.makeChaos(so, rng),
        mountain: () => W.makeMountain(so, rng),
        volcano: () => W.makeVolcano(so),
        temple: () => W.makeTemple(so),
        island: () => W.makeIsland(so),
        cave: () => W.makeCave(so),
        mansion: () => W.makeMansion(so, rng),
        swamp: () => W.makeSwamp(so, rng),
        books: () => W.makeBooks(so),
        gullet: () => W.makeGullet(so),
        colossus: () => W.makeColossus(so, sky ?? 'dusk'),
        glassvoid: () => W.makeGlassVoid(so),
        rooftops: () => W.makeRooftops(so),
        endisles: () => W.makeEnd(so),
        pooltower: () => W.makePoolTower(so),
        hospital: () => W.makeHospital(so),
      };
      def = make[grammar]();
    }
  }
  // A few levels are broken: their names come out garbled (bug levels).
  if (grammar === 'chaos' || hashString('glitch:' + id) % 100 < 6) def = { ...def, glitch: true };
  cache.set(id, def);
  return def;
}

function makeGridGenerated(id: string, openSky: SkyKind | null): LevelDefinition {
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
    lootP: 0.0013 * cell * cell,
    // Each generated level gets its own mix of 4 set pieces (SPEC §4.3 セットピースプール).
    pieces: pickPieces(rng, 4),
    pieceRate: 0.55,
    thinFloorP: 0.006,
    noCeiling: !!openSky,
  };
  if (openSky) params.lightP = 0;
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
    setPieces: (params.pieces ?? []).map((pid) => ({ id: pid, name: GRID_PIECES[pid].name, desc: GRID_PIECES[pid].desc })),
    lootTable: { perCell: params.lootP, rules: ALMOND_ONLY },
    exits: [
      { kind: 'door', prop: 'plain-door', targets: neighbours(id, rng), discovery: 'ありふれた扉の向こうは、まったく別の場所だった。' },
      { kind: 'wall', push: 2.5, targets: [{ levelId: String(rng.int(5, 999)), weight: 1 }], discovery: '壁をすり抜けると、知らない場所にいた。' },
      { kind: 'floor', targets: [{ levelId: String(rng.int(5, 999)), weight: 3 }, { levelId: '0', weight: 1 }], discovery: '床が抜けて、どこかへ落ちていった。' },
      { kind: 'walk', distance: 1200 + rng.int(0, 800), targets: neighbours(id, rng), discovery: '歩き続けるうちに、景色が別のものに変わっていた。' },
    ],
    drainMul: 1,
    hallucination: 1,
    footstep: 'concrete',
    ambience: { humFreq: rng.pick([0, 50, 60, 120]), humGain: 0.05, noiseGain: 0.02 + rng.float() * 0.04, noiseCutoff: 300 + rng.int(0, 900) },
    environment: openSky ? 'open-sky' : 'enclosed',
    sky: openSky ? { kind: openSky } : undefined,
    kindLabel: openSky ? `空の下の廃墟・${SKY_LABEL[openSky]}` : '屋内迷路',
    spawn: { x: cell / 2, y: 0, z: cell / 2, yaw: 0 },
    arrival: (ctx, h) => gridArrival(ctx, params, h),
  };
  if (openSky) {
    const sk = SKY_PRESETS[openSky];
    def.palette = { ...def.palette, fogColor: sk.horizon, fogDensity: 0.016, ambient: { day: 0.95, dusk: 0.55, night: 0.2, dawn: 0.65, void: 0.1, overcast: 0.7 }[openSky] };
    def.exits = genericExits(id, rng, 'ruins');
  }
  return def;
}
