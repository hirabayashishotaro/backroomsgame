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
import type * as T from '../shapes/terrain';
import * as F from '../shapes/fusion';
import { FEATURE_INFO } from '../shapes/features';
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
  // From the explicit worlds:
  { wall: 'plaster', floor: 'vapor-check', ceiling: 'neon-grid', light: 0xff7ae8, tint: [1.05, 0.62, 1.2], fog: 0x2a0848 }, // vaporwave corridors
  { wall: 'memphis-squiggle', floor: 'memphis-tile', ceiling: 'flat:ffffff', light: 0xffffff, tint: [1, 1, 1], fog: 0xf4f0ea }, // Memphis offices
  { wall: 'sento-tile', floor: 'sento-floor', ceiling: 'sento-ceiling', light: 0xf4fbff, tint: [0.98, 1.02, 1.04], fog: 0xdff2f4 }, // bathhouse corridors
  { wall: 'gen:wood:dcb88c', floor: 'gen:wood:b08a5e', ceiling: 'gen:wood:dcb88c', light: 0xffc890, tint: [1.08, 0.98, 0.86], fog: 0x6a4a30 }, // sauna corridors
  { wall: 'gen:tile:5fb8c8', floor: 'sento-floor', ceiling: 'sento-ceiling', light: 0xe8fbff, tint: [0.94, 1.02, 1.08], fog: 0xcfeef4 }, // cold-bath corridors
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
  | 'hospital'
  | 'poolrooms'
  | 'waterpark'
  | 'fusion';

/**
 * Grammar weights. Indoor mazes with a ceiling used to dominate; now terrain
 * (mountains, volcanoes, islands, forests) and vertical worlds come up far more.
 */
const GRAMMARS: Array<[Grammar, number, SkyKind[]]> = [
  ['grid', 7, []],
  ['ruins', 5, ['day', 'dusk', 'night', 'overcast', 'dawn']],
  ['garden', 9, ['day', 'dusk', 'night', 'dawn', 'overcast']],
  ['aero', 5, ['day', 'dawn']],
  ['walkways', 7, ['night', 'dawn', 'dusk', 'day', 'void']],
  ['narrow', 4, ['void', 'night']],
  ['roads', 5, ['dawn', 'day', 'dusk', 'night']],
  ['tatami', 5, ['night', 'dusk']],
  ['spiral', 8, []],
  ['tunnel', 5, []],
  ['chaos', 4, []],
  ['mountain', 14, ['day', 'dawn', 'overcast', 'dusk', 'night']],
  ['volcano', 11, ['dusk', 'night', 'overcast', 'day', 'dawn']],
  ['temple', 2, []],
  ['island', 7, ['day', 'dusk', 'dawn', 'night', 'overcast']],
  ['cave', 9, []],
  ['mansion', 8, []],
  ['swamp', 11, ['day', 'dawn', 'overcast', 'dusk']],
  ['books', 4, []],
  ['gullet', 5, []],
  ['colossus', 4, ['dusk', 'void', 'day', 'night']],
  ['glassvoid', 3, []],
  ['rooftops', 5, []],
  ['endisles', 5, []],
  ['pooltower', 7, []],
  ['hospital', 4, []],
  ['poolrooms', 7, []],
  ['waterpark', 4, []],
  // Superposed worlds: base form x roof x materials x liquid x several feature sets.
  ['fusion', 90, []],
];

/** Terrain variants for random levels (the named levels keep their originals). */
interface Variant {
  label: string;
  nouns: string[];
}
const MOUNTAIN_VARIANTS: Array<Variant & W.MountainLook> = [
  { label: '雪山', nouns: ['雪山', '尾根', '氷河'], ground: 'snow', cliff: 'rock', tree: 'pine', tex: 'gen:snow:eef4fb:201' },
  { label: '草原の山', nouns: ['高原', '丘陵', '草の尾根'], ground: 'grass', cliff: 'rock', tree: 'leaves-green', tex: 'gen:grass:5a8a3a:3' },
  { label: '紅葉の山', nouns: ['紅葉の山', '秋の峠', '山道'], ground: 'grass', cliff: 'rock', tree: 'leaves-autumn', tex: 'gen:grass:5a8a3a:3' },
  { label: '桜の丘', nouns: ['桜の丘', '花の斜面', '春の峠'], ground: 'grass', cliff: 'rock', tree: 'leaves-pink', tex: 'gen:grass:5a8a3a:3' },
  { label: '砂丘', nouns: ['砂丘', '砂の斜面', '砂漠'], ground: 'sand', cliff: 'sand', tree: 'leaves-lime', treeP: 0.012, tex: 'gen:sand:d8c690:205' },
  { label: '岩山', nouns: ['岩山', '断崖', '石の斜面'], ground: 'rock', cliff: 'basalt', tree: 'pine', treeP: 0.025, tex: 'gen:rock:6e6a66:202' },
];
const VOLCANO_VARIANTS: Array<Variant & T.VolcanoParams> = [
  { label: '火山', nouns: ['火口', '溶岩原', 'カルデラ'], liquid: 'lava', ground: 'basalt', sea: 'lava' },
  { label: '水没した火山', nouns: ['水没火口', '黒い入江', '沈んだカルデラ'], liquid: 'water', ground: 'basalt', sea: 'ocean' },
  { label: '浅瀬の尾根', nouns: ['浅瀬', '干潟', '尾根の海'], liquid: 'water', ground: 'sand', sea: 'water-shallow' },
  { label: '雪の火山', nouns: ['雪の火口', '凍てた溶岩原', '白いカルデラ'], liquid: 'lava', ground: 'snow', sea: 'lava' },
];
const SWAMP_VARIANTS: Array<Variant & { water?: string; ground?: string; day?: boolean; night?: boolean }> = [
  { label: '夜のキノコの湿地', nouns: ['湿地', '菌の森', '沼地'], night: true },
  { label: '昼のキノコの森', nouns: ['キノコの森', '菌の林', '胞子の谷'], day: true, water: 'water' },
  { label: '草原のキノコ', nouns: ['キノコの野原', '胞子の草原', '菌の丘'], day: true, water: 'water-shallow', ground: 'grass' },
];
const ISLAND_VARIANTS: Array<Variant & T.IslandParams> = [
  { label: '南の孤島', nouns: ['孤島', '小島', '砂州'], ground: 'sand', leaves: 'leaves-green', sea: 'ocean' },
  { label: '氷の島', nouns: ['氷の島', '流氷', '凍った岬'], ground: 'snow', leaves: 'pine', sea: 'ocean' },
  { label: '花の島', nouns: ['花の島', '草の小島', '春の岬'], ground: 'grass', leaves: 'leaves-pink', sea: 'water-shallow' },
];

/** Which variant a random level gets (deterministic per id). */
function pickVariant<T>(id: string, list: T[]): T {
  return list[hashString('variant:' + id) % list.length];
}

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
  poolrooms: 'プールルーム',
  waterpark: '屋内ウォーターパーク',
  grid: '屋内迷路',
  ruins: '空の下の廃墟',
  garden: '庭園',
  aero: 'エアロ広場',
  walkways: '空中通路',
  narrow: '極細の足場',
  roads: '浮遊道路',
  tatami: '座敷と橋',
  fusion: '重ね合わせ',
};

export const SKY_LABEL: Record<SkyKind, string> = { day: '昼', dusk: '夕暮れ', night: '夜空', dawn: '夜明け', void: '虚無', overcast: '曇り', synth: 'ネオンの夕日', vapor: 'パステルの空' };

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
  poolrooms: ['プール', '浴場', '水の回廊', 'タイルの間'],
  waterpark: ['ウォーターパーク', 'スライダー', '水の遊園地'],
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
  else if (grammar === 'fusion') def = makeFusionLevel(id, new Rng(hashString('world:' + id)));
  else {
    const rng = new Rng(hashString('world:' + id));
    const variant = grammar === 'mountain' ? pickVariant(id, MOUNTAIN_VARIANTS) : grammar === 'volcano' ? pickVariant(id, VOLCANO_VARIANTS) : grammar === 'swamp' ? pickVariant(id, SWAMP_VARIANTS) : grammar === 'island' ? pickVariant(id, ISLAND_VARIANTS) : null;
    const name = rng.pick(ADJ) + rng.pick(variant?.nouns ?? WORLD_NOUN[grammar]!);
    const label = variant?.label ?? GRAMMAR_LABEL[grammar];
    const o: WorldOpts = {
      id,
      title: 'Level ' + id,
      name,
      threat: (grammar === 'narrow' ? 3 : rng.int(0, 2)) as 0 | 1 | 2 | 3,
      sky: sky ?? 'night',
      exits: genericExits(id, rng, grammar),
      kindLabel: sky && !(variant && 'night' in variant && variant.night) ? `${label}・${SKY_LABEL[sky]}` : label,
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
        mountain: () => W.makeMountain(so, rng, pickVariant(id, MOUNTAIN_VARIANTS)),
        volcano: () => W.makeVolcano(so, pickVariant(id, VOLCANO_VARIANTS)),
        temple: () => W.makeTemple(so),
        island: () => W.makeIsland(so, pickVariant(id, ISLAND_VARIANTS)),
        cave: () => W.makeCave(so),
        mansion: () => W.makeMansion(so, rng),
        swamp: () => {
          const v = pickVariant(id, SWAMP_VARIANTS);
          return W.makeSwamp(so, rng, v.night ? undefined : { water: v.water, ground: v.ground, day: v.day });
        },
        books: () => W.makeBooks(so),
        gullet: () => W.makeGullet(so),
        colossus: () => W.makeColossus(so, sky ?? 'dusk'),
        glassvoid: () => W.makeGlassVoid(so),
        rooftops: () => W.makeRooftops(so),
        endisles: () => W.makeEnd(so),
        pooltower: () => W.makePoolTower(so, rng),
        poolrooms: () => W.makePoolrooms(so, rng),
        waterpark: () => W.makePoolrooms(so, rng, { waterpark: true }),
        hospital: () => W.makeHospital(so),
      };
      def = make[grammar]();
    }
  }
  // Pieces of other worlds layered into the level (most generated worlds get some).
  if (grammar !== 'fusion' && grammar !== 'temple' && grammar !== 'island' && grammar !== 'chaos') {
    const spec = F.overlayFor(id);
    if (spec) {
      const base = def.generator;
      const seedK = hashString('overlay-seed:' + id);
      const wrapped: LevelDefinition = {
        ...def,
        kindLabel: `${def.kindLabel ?? ''} + ${spec.features.map((f) => FEATURE_NAME[f]).join('・')}`,
        generator: (ctx, cx, cz, cy) => {
          const d = { ...base(ctx, cx, cz, cy) };
          F.overlayChunk(d, ctx.levelSeed ^ seedK, spec);
          return d;
        },
      };
      wrapped.arrival = F.arrivalAvoidingOverlay(wrapped, def.arrival);
      def = wrapped;
    }
  }
  // A few levels are broken: their names come out garbled (bug levels).
  if (grammar === 'chaos' || hashString('glitch:' + id) % 100 < 6) def = { ...def, glitch: true };
  cache.set(id, def);
  return def;
}

const FEATURE_NAME = Object.fromEntries(Object.entries(FEATURE_INFO).map(([k, v]) => [k, v.name])) as Record<string, string>;

/** A superposed world (see shapes/fusion.ts). */
function makeFusionLevel(id: string, rng: Rng): LevelDefinition {
  const g = F.fusionGenome(id);
  const { name, label } = F.fusionName(id, g);
  const exits = genericExits(id, rng, 'garden');
  const open = g.roof !== 'ceiling';
  return {
    id,
    title: 'Level ' + id,
    name,
    subtitle: name,
    threatClass: (g.hostile ? 4 : rng.int(1, 3)) as 1 | 2 | 3 | 4,
    chunkSize: F.FUSION_S,
    ceilingHeight: g.roof === 'ceiling' ? g.ceilingH : 30,
    meshDetail: 2,
    palette: {
      wallTex: g.palette.wall,
      floorTex: g.palette.floor,
      ceilingTex: g.palette.ceiling,
      lightColor: 0xfff4e0,
      fogColor: g.fog,
      fogDensity: g.fogDensity,
      ambient: g.brightness * 0.3,
      lightTint: [1, 0.96, 0.9],
    },
    generator: (ctx, cx, cz) => F.generateFusion(ctx, g, cx, cz),
    lightSampler: (ctx, cx, cz) => F.fusionSampler(ctx, g, cx, cz),
    setPieces: g.features.map((f) => ({ id: f, name: FEATURE_INFO[f].name, desc: `${FEATURE_INFO[f].name}が、ここにあるはずのない場所にある。` })),
    lootTable: { perCell: 0, rules: ALMOND_ONLY },
    exits,
    drainMul: g.hostile ? 1.6 : 1,
    hallucination: g.hostile ? 1.5 : 0.8,
    footstep: g.liquid && !g.liquid.lava ? 'water' : g.ground === 'backrooms-carpet' ? 'carpet' : 'concrete',
    ambience: g.liquid?.lava ? { humFreq: 30, humGain: 0.05, noiseGain: 0.07, noiseCutoff: 200 } : open ? { humFreq: 0, humGain: 0, noiseGain: 0.06, noiseCutoff: 520 } : { humFreq: 50, humGain: 0.03, noiseGain: 0.04, noiseCutoff: 300 },
    environment: open ? 'open-sky' : 'enclosed',
    sky: open ? { kind: g.roof === 'void' ? 'void' : g.sky } : undefined,
    groundless: g.roof === 'void' || undefined,
    fall: g.roof === 'void' ? { killY: -40, mode: 'transition' } : undefined,
    lava: g.liquid?.lava ? { y: g.liquid.y, damage: 30 } : undefined,
    kindLabel: label,
    // Bathhouse pieces bring the bathhouse's sounds with them.
    soundscape: g.features.some((f) => f === 'washplaces' || f === 'bathtub' || f === 'okepile' || f === 'sentomural' || f === 'rockpool' || f === 'saunatiers' || f === 'lockers') ? 'sento' : undefined,
    spawn: { x: 0.5, y: 2, z: 0.5, yaw: 0 },
    arrival: (ctx, h) => F.fusionArrival(ctx, g, h),
  };
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
  // +1 m over the old heights: room to jump (rocket jumps) under a solid ceiling.
  const ceiling = [3.6, 5 + rng.float() * 4, 3.5, 4 + rng.float()][structure];
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
  // gen: textures get a per-level variation seed; named textures are used as they are.
  const tex = (k: string, n: number) => (k.startsWith('gen:') ? `${k}:${(seed + n) % 9973}` : k);
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
    def.palette = { ...def.palette, fogColor: sk.horizon, fogDensity: 0.016, ambient: { day: 0.95, dusk: 0.55, night: 0.2, dawn: 0.65, void: 0.1, overcast: 0.7, synth: 0.3, vapor: 0.9 }[openSky] };
    def.exits = genericExits(id, rng, 'ruins');
  }
  return def;
}
