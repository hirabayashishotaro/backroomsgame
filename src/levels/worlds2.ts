/**
 * Level builders for the shaped worlds. Each builder takes options and an RNG,
 * so the explicit levels (fixed RNG) and random levels (RNG from the id) share
 * the same code but come out different.
 */
import { Rng } from '../core/rng';
import { ALMOND_ONLY } from '../items/lootTables';
import { SKY_PRESETS, type SkyKind } from '../systems/skyPresets';
import type { AmbienceDef, ExitRule, LevelDefinition } from './levelDefinition';
import { generateGrid, gridArrival, gridLightSampler, type GridParams } from './gridLevel';
import { GRID_PIECES } from './gridPieces';
import * as V from './shapes/vertical';
import * as T from './shapes/terrain';
import * as M from './shapes/misc';
import { chaosArrival, chaosSampler, generateChaos } from './shapes/chaos';
import { sampler } from './shapes/kit';

export interface ShapeOpts {
  id: string;
  title: string;
  name: string;
  subtitle?: string;
  threat: 0 | 1 | 2 | 3 | 4 | 5;
  kindLabel: string;
  exits: ExitRule[];
  sky?: SkyKind;
  glitch?: boolean;
}

const QUIET: AmbienceDef = { humFreq: 0, humGain: 0, noiseGain: 0.03, noiseCutoff: 500 };
const WIND: AmbienceDef = { humFreq: 0, humGain: 0, noiseGain: 0.06, noiseCutoff: 520 };

function pieces(list: Array<[string, string, string]>) {
  return list.map(([id, name, desc]) => ({ id, name, desc }));
}

function common(o: ShapeOpts) {
  return {
    id: o.id,
    title: o.title,
    name: o.name,
    subtitle: o.subtitle ?? o.name,
    threatClass: o.threat,
    exits: o.exits,
    kindLabel: o.kindLabel,
    glitch: o.glitch,
    hallucination: 0.8,
    drainMul: 1,
    lootTable: { perCell: 0, rules: ALMOND_ONLY },
    ceilingHeight: 30,
  };
}

function look(wall: string, floor: string, ceiling: string, fog: number, fogDensity: number, ambient = 0.1, light = 0xfff0d8, tint: [number, number, number] = [1, 0.95, 0.85]) {
  return { wallTex: wall, floorTex: floor, ceilingTex: ceiling, lightColor: light, fogColor: fog, fogDensity, ambient, lightTint: tint };
}

// --- Vertical ---------------------------------------------------------------

export function makeSpiral(o: ShapeOpts, rng: Rng): LevelDefinition {
  const p: V.SpiralParams = { wallMat: rng.pick(['wall', 'marble', 'brick', 'stone']), stepMat: rng.pick(['stone', 'metal', 'wood-dark', 'marble']), railMat: 'metal', lampEvery: rng.pick([1, 2]) };
  return {
    ...common(o),
    meshDetail: 1.5,
    chunkSize: 32,
    palette: look(rng.pick(['gen:panel:8a8478:601', 'wallpaper-yellow', 'gen:concrete:6a6a70:602']), 'gen:concrete:5a5a5a:603', 'white', 0x050505, 0.05),
    generator: (ctx, cx, cz, cy) => V.generateSpiral(ctx, p, cx, cz, cy),
    lightSampler: (ctx, cx, cz, cy) => V.spiralSampler(ctx, p, cx, cz, cy),
    setPieces: pieces([
      ['landing', '踊り場', '一周ごとにある踊り場。壁に同じ扉がついている。'],
      ['door', '踊り場の扉', 'どの階の扉も同じ形だが、開けると違う場所に出る。'],
      ['void', '吹き抜け', '手すりの切れ目から覗くと、下にも上にも終わりがない。'],
      ['lamp', '壁の灯り', '何周かおきに、壁に小さな灯りがともる。'],
      ['soft-step', '柔らかい段', '一段だけ色の違う踊り場がある。'],
    ]),
    footstep: 'concrete',
    ambience: { humFreq: 50, humGain: 0.03, noiseGain: 0.03, noiseCutoff: 400 },
    environment: 'enclosed',
    topology: 'vertical',
    vertical: { slab: V.SPIRAL_SLAB, radius: 3, hRadius: 1 },
    spawn: V.spiralArrival(undefined as never, 3),
    arrival: (ctx, h) => V.spiralArrival(ctx, h),
  };
}

export function makeGullet(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 1.5,
    chunkSize: 32,
    palette: look('gen:flesh:b8586a:610', 'gen:flesh:b8586a:610', 'white', 0x1a0406, 0.06, 0.1, 0xff8a8a, [1, 0.7, 0.7]),
    generator: (ctx, cx, cz, cy) => V.generateGullet(ctx, cx, cz, cy),
    lightSampler: (ctx, cx, cz, cy) => V.gulletSampler(ctx, cx, cz, cy),
    setPieces: pieces([
      ['sphincter', '括約筋の輪', '数十メートルおきに、肉の輪が床のように張り出している。'],
      ['ledge', '肉のひだ', '壁から張り出したひだ。ここに着地すれば落下の衝撃が和らぐ。'],
      ['valve', '弁の扉', '輪の壁に、弁のような扉がある。'],
      ['soft-spot', '柔らかい場所', '輪の一部が薄く、踏むと沈む。'],
      ['abyss', '底なし', '下へ、下へ。底は見えない。'],
    ]),
    footstep: 'water',
    ambience: { humFreq: 38, humGain: 0.06, noiseGain: 0.05, noiseCutoff: 300 },
    environment: 'enclosed',
    topology: 'vertical',
    vertical: { slab: V.GULLET_SLAB, radius: 3, hRadius: 1 },
    spawn: V.gulletArrival(),
    arrival: () => V.gulletArrival(),
    hallucination: 1.3,
  };
}

export function makeMansion(o: ShapeOpts, rng: Rng): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 1.5,
    chunkSize: 32,
    palette: look(rng.pick(['gen:stripes:8a6a5a:620', 'gen:panel:a89a88:621', 'wallpaper-yellow']), rng.pick(['gen:carpet:5a2a2a:622', 'gen:wood:6a4a2c:623']), 'gen:panel:d8d0c0:624', 0x0a0c14, 0.04, 0.08),
    generator: (ctx, cx, cz, cy) => V.generateMansion(ctx, cx, cz, cy),
    lightSampler: (ctx, cx, cz, cy) => V.mansionSampler(ctx, cx, cz, cy),
    setPieces: pieces([
      ['apartment', '開いた部屋', '鍵の開いた一室。窓の外には同じような摩天楼が延々と続く。'],
      ['stairwell', '階段室', 'どこまでも上へ、どこまでも下へ続く階段。'],
      ['corridor', '長い廊下', '同じ扉が並ぶ廊下。部屋番号は読めない。'],
      ['skyline', '摩天楼', '向かいのビルの窓に、ときどき灯りがつく。'],
      ['door', '部屋の扉', 'どの部屋の扉も、別の世界につながっている。'],
    ]),
    footstep: 'carpet',
    ambience: { humFreq: 60, humGain: 0.03, noiseGain: 0.03, noiseCutoff: 700 },
    environment: 'enclosed',
    topology: 'vertical',
    vertical: { slab: V.MANSION_SLAB, radius: 2, hRadius: 2 },
    spawn: { x: 20, y: 0, z: 16, yaw: Math.PI / 2 },
    arrival: (ctx, h) => V.mansionArrival(ctx, h),
  };
}

export function makePoolTower(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    chunkSize: 32,
    palette: look('gen:tile:e6f0f2:630', 'gen:tile:bfe2ea:631', 'gen:tile:f0f6f7:632', 0xb8dbe2, 0.03, 0.2, 0xf2ffff, [0.92, 1, 1]),
    generator: (ctx, cx, cz, cy) => V.generatePoolTower(ctx, cx, cz, cy),
    lightSampler: (ctx, cx, cz, cy) => V.poolTowerSampler(ctx, cx, cz, cy),
    setPieces: pieces([
      ['pool-drop', '床の穴', '床の穴の下には、ひとつ下の階のプールがある。飛び込めば痛くない。'],
      ['pool-stairs', '上り階段', 'タイルの階段が天井の穴へ続く。'],
      ['pool-door', 'タイルの扉', '柱の陰の白い扉。'],
      ['pillars', 'タイルの柱', '等間隔に並ぶ白い柱。'],
      ['still-water', '静かな水', '水面には波ひとつ立たない。'],
    ]),
    footstep: 'water',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.03, noiseCutoff: 1500 },
    environment: 'enclosed',
    topology: 'vertical',
    vertical: { slab: V.POOL_SLAB, radius: 1, hRadius: 2 },
    spawn: { x: 2, y: 0, z: 2.2, yaw: Math.PI },
    arrival: (ctx, h) => V.poolTowerArrival(ctx, h),
    hallucination: 0.4,
    drainMul: 0.8,
  };
}

export function makeCave(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 2.5,
    chunkSize: 32,
    palette: look('gen:rock:5a5450:640', 'gen:rock:4a4440:641', 'gen:rock:3a3430:642', 0x040404, 0.05, 0.06),
    generator: (ctx, cx, cz, cy) => M.generateCave(ctx, cx, cz, cy),
    lightSampler: (ctx, cx, cz, cy) => M.caveSampler(ctx, cx, cz, cy),
    setPieces: pieces([
      ['crystals', '宝石の群晶', '青や桃色に光る結晶が地面から生えている。'],
      ['hot-spring', '温泉', '湯気の立つ澄んだ湯だまり。飛び込んでも平気だ。'],
      ['stalactites', '鍾乳洞', '天井から垂れる鍾乳石と、床から伸びる石筍。'],
      ['shaft', '縦穴', '下の層へ続く縦穴。壁の岩棚を伝って降りられる。'],
      ['cave-door', '岩壁の扉', '洞窟の奥に、なぜか扉が立っている。'],
    ]),
    footstep: 'concrete',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.045, noiseCutoff: 260 },
    environment: 'enclosed',
    topology: 'vertical',
    vertical: { slab: M.CAVE_SLAB, radius: 1, hRadius: 2 },
    spawn: { x: 2, y: 0, z: 2, yaw: 0 },
    arrival: (ctx, h) => M.caveArrival(ctx, h),
  };
}

// --- Linear / closed / flat -------------------------------------------------------

export function makeTunnel(o: ShapeOpts, rng: Rng): LevelDefinition {
  const p: M.TunnelParams = { wallMat: rng.pick(['wall', 'stone', 'tile-white', 'brick']), floorMat: 'floor', rails: rng.chance(0.5), width: rng.pick([5, 6, 7]), height: rng.pick([4.5, 5, 6]) };
  return {
    ...common(o),
    chunkSize: 32,
    ceilingHeight: p.height,
    palette: look(rng.pick(['gen:concrete:7a7a76:650', 'gen:tile:d8d4c8:651', 'wallpaper-yellow']), 'gen:floor-concrete:4a4844:652', 'gen:concrete:3a3a3a:653', 0x050505, 0.05, 0.05),
    generator: (ctx, cx, cz) => M.generateTunnel(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => M.tunnelSampler(ctx, p, cx, cz),
    setPieces: pieces([
      ['side-door', '壁の扉', 'トンネルの壁に、ときどき扉がある。'],
      ['vending', '自販機', '誰も通らないトンネルで、自販機だけが光っている。'],
      ['rubble', '崩れた瓦礫', '天井から崩れた瓦礫。跳び越えて進む。'],
      ['phone', '非常電話', '赤い非常電話。受話器の向こうは無音だ。'],
      ['window', 'ありえない窓', 'トンネルの壁に窓。外に昼の光、あるいは何もない闇。'],
    ]),
    footstep: 'concrete',
    ambience: { humFreq: 50, humGain: 0.05, noiseGain: 0.05, noiseCutoff: 300 },
    environment: 'enclosed',
    topology: 'linear',
    spawn: { x: 0.6, y: 0, z: 16, yaw: -Math.PI / 2 },
    arrival: (ctx, h) => M.tunnelArrival(ctx, h),
  };
}

export function makeTemple(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 2,
    chunkSize: M.TEMPLE_S,
    palette: look('gen:marble:eceae6:660', 'gen:marble:dcd8d0:661', 'gen:marble:f4f2ee:662', 0x0a0a10, 0.01, 0.4),
    generator: (ctx, cx, cz) => M.generateTemple(ctx, cx, cz),
    lightSampler: () => M.templeSampler(),
    setPieces: pieces([
      ['clock', '大時計', '北の壁の大時計。針は動かないが、音だけが聞こえる。'],
      ['twelve-doors', '十二の扉', '等間隔に並ぶ十二の扉。それぞれ別の時代へ通じている気がする。'],
      ['colonnade', '列柱', '広間を囲む白い列柱。'],
      ['dais', '中央の祭壇', '中央の円盤が光っている。上に立つと……。'],
      ['skylight', '天窓', '天井の天窓から、時間の分からない光が落ちる。'],
    ]),
    footstep: 'tile',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.015, noiseCutoff: 2000 },
    environment: 'enclosed',
    topology: 'closed',
    spawn: { x: 32, y: 0.4, z: 36, yaw: 0 },
    arrival: () => ({ x: 32, y: 0.4, z: 36, yaw: 0 }),
    hallucination: 0.2,
    drainMul: 0.6,
  };
}

export function makeColossus(o: ShapeOpts, sky: SkyKind): LevelDefinition {
  const sk = SKY_PRESETS[sky];
  return {
    ...common(o),
    meshDetail: 2,
    chunkSize: 64,
    palette: look('gen:bronze:8a6234:670', 'gen:concrete:8a8680:671', 'white', sk.horizon, 0.008, 0.3),
    generator: (ctx, cx, cz) => M.generateColossus(ctx, cx, cz),
    lightSampler: () => sampler(sky === 'void' ? 0.35 : 0.85, [0.3, 0.8, -0.5], []),
    setPieces: pieces([
      ['colossus', '巨像', '見上げても頭が霞むほど巨大な像。'],
      ['only-door', 'ただひとつの扉', '広場の端に、扉がひとつだけ立っている。'],
      ['feet', '像の足もと', '台座の上、像の足もとに光る印がある。'],
      ['plaza-edge', '広場の縁', '広場の縁の向こうには何もない。'],
      ['pedestal', '台座の階段', '台座へ上る石段。'],
    ]),
    footstep: 'concrete',
    ambience: WIND,
    environment: 'open-sky',
    sky: { kind: sky },
    topology: 'closed',
    groundless: true,
    fall: { killY: -20, mode: 'transition' },
    // Face the statue (+z) from beside the single door.
    spawn: { x: 32, y: 0, z: 9, yaw: Math.PI },
    arrival: () => ({ x: 34, y: 0, z: 9, yaw: Math.PI }),
  };
}

export function makeGlassVoid(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    chunkSize: 32,
    palette: look('white', 'white', 'white', 0x000000, 0.02, 0.5),
    generator: (ctx, cx, cz) => M.generateGlassVoid(ctx, cx, cz),
    lightSampler: () => sampler(0.6, null, []),
    setPieces: pieces([
      ['light-pillar', '光の柱', '遠くに一本だけ立つ光の柱。'],
      ['dark-tile', '暗いタイル', '透明な床の中に、一枚だけ黒いタイルがある。'],
      ['monolith', '黒い石板', '何もない床に、黒い石板が一枚だけ立っている。'],
      ['grid', '格子', '足もとに、青い格子線がどこまでも続く。'],
      ['nothing', '何もないもの', '本当に、何もない。'],
    ]),
    footstep: 'tile',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.01, noiseCutoff: 3000 },
    environment: 'open-sky',
    sky: { kind: 'void' },
    spawn: { x: 16, y: 0, z: 16, yaw: 0 },
    arrival: (_ctx, h) => ({ x: ((h % 50) - 25) * 32 + 16, y: 0, z: 16, yaw: 0 }),
    hallucination: 0.3,
  };
}

// --- Terrain ------------------------------------------------------------------

export function makeMountain(o: ShapeOpts, rng: Rng): LevelDefinition {
  const p: T.MountainParams = { slope: rng.pick([0.18, 0.2, 0.22]), rough: rng.pick([10, 14, 18]), snowMat: 'snow', cliffMat: 'rock', treeMat: 'pine' };
  const sky = o.sky ?? 'day';
  return {
    ...common(o),
    meshDetail: 2,
    chunkSize: T.TERRAIN_S,
    palette: look('gen:snow:eef4fb:201', 'gen:snow:eef4fb:201', 'white', SKY_PRESETS[sky].horizon, 0.008, 0.2),
    generator: (ctx, cx, cz) => T.generateMountain(ctx, p, cx, cz),
    lightSampler: () => sampler(1, SKY_PRESETS[sky].sunDir, []),
    setPieces: pieces([
      ['hut', '山小屋', '登山道の脇に小屋がある。扉は開く。'],
      ['stone-gate', '石の門', '登山道の途中に立つ石の門。その下の光は……。'],
      ['pines', '針葉樹林', '雪をかぶった針葉樹。'],
      ['cliff', '岩壁', '登山道を外れると、切り立った岩壁ばかりだ。'],
      ['summit', '見えない頂上', 'どれだけ登っても、頂上は見えない。'],
    ]),
    footstep: 'carpet',
    ambience: WIND,
    environment: 'open-sky',
    sky: { kind: sky },
    topology: 'diagonal',
    spawn: { x: 16, y: 3, z: 0, yaw: -Math.PI / 2 },
    arrival: (ctx, h) => T.mountainArrival(ctx, p, h),
    drainMul: 1.1,
  };
}

export function makeSwamp(o: ShapeOpts, rng: Rng): LevelDefinition {
  const p: T.SwampParams = { capMats: rng.pick([['cap-teal', 'cap-purple'], ['cap-purple'], ['cap-teal']]), amp: rng.pick([7, 9, 11]) };
  return {
    ...common(o),
    meshDetail: 2,
    chunkSize: T.TERRAIN_S,
    palette: look('gen:moss:3a5a2a:220', 'gen:moss:3a5a2a:220', 'white', 0x050a07, 0.07, 0.05),
    generator: (ctx, cx, cz) => T.generateSwamp(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => T.swampSampler(ctx, p, cx, cz),
    setPieces: pieces([
      ['giant-mushroom', '巨大キノコ', '木よりも高いキノコ。傘の裏がぼんやり光っている。'],
      ['stump-door', '切り株の扉', 'キノコの根もとの切り株に、扉がついている。'],
      ['glow-shrooms', '光る小キノコ', '足もとで小さなキノコが光る。'],
      ['bog', '沼', '黒い水がたまった窪地。'],
      ['mire', '沈む地面', '色の違う地面は、踏むと沈む。'],
    ]),
    footstep: 'water',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.05, noiseCutoff: 380 },
    environment: 'open-sky',
    sky: { kind: 'night' },
    spawn: { x: 1, y: 3, z: 1, yaw: 0 },
    arrival: (ctx, h) => T.swampArrival(ctx, p, h),
    hallucination: 1.4,
  };
}

export function makeVolcano(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 2,
    chunkSize: T.TERRAIN_S,
    palette: look('gen:rock:2e2a28:203', 'gen:rock:2e2a28:203', 'white', 0x2a0804, 0.03, 0.08, 0xffa060, [1, 0.6, 0.4]),
    generator: (ctx, cx, cz) => T.generateVolcano(ctx, cx, cz),
    lightSampler: () => sampler(0.18, [0.2, 0.5, 0.3], [], { y: T.LAVA_Y, I: 0.8 }),
    setPieces: pieces([
      ['ridge', '玄武岩の尾根', '溶岩の海に細く延びる黒い尾根。歩ける道はここだけだ。'],
      ['obsidian-door', '黒曜石の扉', '尾根の上に、黒曜石の扉が立っている。'],
      ['vent', '噴気孔', '黒い噴気孔。中に飛び込むと……。'],
      ['lava-sea', '溶岩の海', '足を踏み外せば、ただでは済まない。'],
      ['island', '岩の島', '少しだけ広い岩場。休むならここだ。'],
    ]),
    footstep: 'concrete',
    ambience: { humFreq: 30, humGain: 0.05, noiseGain: 0.07, noiseCutoff: 200 },
    environment: 'open-sky',
    sky: { kind: 'dusk' },
    lava: { y: T.LAVA_Y, damage: 35 },
    spawn: { x: 1, y: 2, z: 1, yaw: 0 },
    arrival: (ctx, h) => T.volcanoArrival(ctx, h),
    drainMul: 1.2,
  };
}

export function makeIsland(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 2,
    chunkSize: T.TERRAIN_S,
    palette: look('gen:sand:d8c690:205', 'gen:sand:d8c690:205', 'white', SKY_PRESETS.day.horizon, 0.012, 0.2),
    generator: (ctx, cx, cz) => T.generateIsland(ctx, cx, cz),
    lightSampler: (_ctx, cx, cz) => sampler(1, SKY_PRESETS.day.sunDir, Math.abs(cx + 0.5) < 1 && Math.abs(cz + 0.5) < 1 ? [{ x: 0, y: 1, z: 2, I: 2 }] : []),
    setPieces: pieces([
      ['campfire', '焚き火', '誰が起こしたのか分からない焚き火。'],
      ['wreck', '難破船', '砂に埋もれた小舟の残骸。'],
      ['palms', 'ヤシの木', '島に四本だけ立つヤシの木。'],
      ['drifter', '漂流物', 'ときどき、扉やワームホールが流れ着く。それに乗らなければ出られない。'],
      ['sea', '果てのない海', '島の外はどこまでも海。浅瀬より先へは進めない。'],
    ]),
    footstep: 'carpet',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.07, noiseCutoff: 700 },
    environment: 'open-sky',
    sky: { kind: 'day' },
    topology: 'closed',
    drifters: { radius: 21 },
    spawn: { x: 1, y: 1.4, z: -1, yaw: 0 },
    arrival: (ctx) => T.islandArrival(ctx),
    drainMul: 0.8,
  };
}

export function makeEnd(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 2,
    chunkSize: T.TERRAIN_S,
    palette: look('gen:endstone:d8d4a0:218', 'gen:endstone:d8d4a0:218', 'white', 0x0a0414, 0.02, 0.3),
    generator: (ctx, cx, cz) => T.generateEnd(ctx, cx, cz),
    lightSampler: (ctx, cx, cz) => T.endSampler(ctx, cx, cz),
    setPieces: pieces([
      ['obsidian-pillar', '黒い塔', '浮島から突き出す黒い塔。頂上で紫の結晶が光る。'],
      ['void-portal', '虚空の門', '黒い縁取りの中に、星のない闇が満ちている。'],
      ['void-door', '浮島の扉', '浮島の端に立つ扉。'],
      ['bridges', '石の階段橋', '浮島どうしを、細い石の階段がつないでいる。'],
      ['abyss', '下の虚空', '足を踏み外せば、どこまでも落ちていく。'],
    ]),
    footstep: 'concrete',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.04, noiseCutoff: 300 },
    environment: 'open-sky',
    sky: { kind: 'void' },
    groundless: true,
    fall: { killY: -60, mode: 'transition' },
    spawn: { x: 16, y: 0, z: 16, yaw: 0 },
    arrival: (ctx, h) => T.endArrival(ctx, h),
  };
}

export function makeBooks(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    chunkSize: 32,
    palette: look('gen:pages:efe6cc:213', 'gen:pages:efe6cc:213', 'white', 0x1a1208, 0.03, 0.3),
    generator: (ctx, cx, cz) => M.generateBooks(ctx, cx, cz),
    lightSampler: () => sampler(0.55, [0.2, 1, 0.4], []),
    setPieces: pieces([
      ['floating-book', '浮かぶ本', '家ほどもある本が、宙に浮かんでいる。'],
      ['standing-book', '立った本', '一冊だけ縦に立った本が、壁のようにそびえる。'],
      ['candle', '蝋燭', '本の上で燃え続ける蝋燭。'],
      ['book-door', '表紙の扉', '本の上に扉が立っている。'],
      ['missing-book', '抜けた一冊', '本と本の間が大きく空いている。跳ぶしかない。'],
    ]),
    footstep: 'carpet',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.02, noiseCutoff: 900 },
    environment: 'open-sky',
    sky: { kind: 'dusk' },
    groundless: true,
    fall: { killY: -25, mode: 'transition' },
    spawn: { x: 3.2, y: 2, z: 3.2, yaw: 0 },
    arrival: (ctx, h) => M.booksArrival(ctx, h),
  };
}

export function makeRooftops(o: ShapeOpts): LevelDefinition {
  return {
    ...common(o),
    meshDetail: 3,
    chunkSize: 32,
    palette: look('gen:windows:3a3e4a:210', 'gen:concrete:4a4a4e:680', 'white', 0x12101e, 0.012, 0.3),
    generator: (ctx, cx, cz) => M.generateRooftops(ctx, cx, cz),
    lightSampler: (ctx, cx, cz) => M.rooftopSampler(ctx, cx, cz),
    setPieces: pieces([
      ['water-tower', '給水塔', '屋上に立つ木の給水塔。'],
      ['antenna', 'アンテナ', '赤い航空灯が点滅するアンテナ。'],
      ['neon-sign', 'ネオンサイン', '読めない文字のネオンが光る。'],
      ['roof-door', '屋上の扉', '塔屋の扉。階段の先は別の世界だ。'],
      ['ac-unit', '室外機', '回っていない室外機。'],
    ]),
    footstep: 'concrete',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.06, noiseCutoff: 450 },
    environment: 'open-sky',
    sky: { kind: 'night' },
    groundless: true,
    fall: { killY: 15, mode: 'transition' },
    spawn: { x: 4, y: 40, z: 8, yaw: 0 },
    arrival: (ctx, h) => M.rooftopArrival(ctx, h),
  };
}

// --- Grid-based: hospital -------------------------------------------------------

export function makeHospital(o: ShapeOpts): LevelDefinition {
  const p: GridParams = {
    cell: 3.5,
    cellsPerChunk: 9,
    wallP: 0.55,
    doorwayP: 0.5,
    regions: true,
    ceiling: 2.8,
    wallT: 0.15,
    pillarP: 0,
    pillarHalf: 0,
    lightP: 0.35,
    lightDeadP: 0.3,
    lightFlickerP: 0.15,
    lightW: 0.6,
    lightD: 1.2,
    lightIntensity: 0.9,
    crateP: 0,
    pipes: false,
    doorP: 0.05,
    doorKinds: [
      { kind: 'plain-door', weight: 2, color: 0xdfe6e0 },
      { kind: 'locked-door', weight: 1, color: 0xdfe6e0 },
    ],
    thinP: 0.012,
    lootP: 0.016,
    pieces: ['ward', 'surgery', 'nurse-station', 'reception', 'door-row'],
    pieceRate: 0.7,
    signP: 0.08,
    thinFloorP: 0.005,
  };
  return {
    ...common(o),
    chunkSize: p.cell * p.cellsPerChunk,
    ceilingHeight: p.ceiling,
    palette: look('gen:panel:c8d8d0:224', 'gen:tile:a8b8b0:225', 'ceiling-tile', 0x060a08, 0.06, 0.05, 0xd8fff0, [0.85, 1, 0.92]),
    generator: (ctx, cx, cz) => generateGrid(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => gridLightSampler(ctx, p, cx, cz),
    setPieces: (p.pieces ?? []).map((id) => ({ id, name: GRID_PIECES[id].name, desc: GRID_PIECES[id].desc })),
    footstep: 'tile',
    ambience: { humFreq: 60, humGain: 0.05, noiseGain: 0.02, noiseCutoff: 900 },
    environment: 'enclosed',
    spawn: { x: 1.75, y: 0, z: 1.75, yaw: 0 },
    arrival: (ctx, h) => gridArrival(ctx, p, h),
    lootTable: { perCell: p.lootP, rules: ALMOND_ONLY },
    hallucination: 1.5,
  };
}

// --- Chaos ----------------------------------------------------------------------

export const CHAOS_DONORS = ['0', '1', '2', 'u3', '13', '451', 'null', '222', '186', '139'];

export function makeChaos(o: ShapeOpts, rng: Rng): LevelDefinition {
  const donors = rng.chance(0.3) ? CHAOS_DONORS.filter(() => rng.chance(0.7)) : CHAOS_DONORS;
  const p = { donors: donors.length >= 3 ? donors : CHAOS_DONORS, shift: rng.pick([4, 8, 14]) };
  return {
    ...common(o),
    glitch: true,
    chunkSize: 32,
    ceilingHeight: 3,
    palette: look(rng.pick(['wallpaper-yellow', 'gen:tile:5fa8c8:83', 'studs']), rng.pick(['carpet-damp', 'gen:grass:5a8a3a:3']), 'ceiling-tile', 0x140a18, 0.035, 0.12),
    generator: (ctx, cx, cz) => generateChaos(ctx, p, cx, cz),
    lightSampler: (ctx, cx, cz) => chaosSampler(ctx, p, cx, cz),
    setPieces: pieces([
      ['seam', '世界の継ぎ目', '別々の世界が、継ぎ目で無理やり縫い合わされている。'],
      ['tilted', '回転した部屋', '部屋ごと九十度回っている。'],
      ['floating-shard', '宙の破片', '壁の破片が空中に浮かんでいる。'],
      ['stacked', '段違いの床', '隣の区画との床の高さが合っていない。'],
      ['echo', '既視感', 'どこかで見た場所の、壊れた写し。'],
    ]),
    footstep: 'concrete',
    ambience: { humFreq: 47, humGain: 0.07, noiseGain: 0.06, noiseCutoff: 900 },
    environment: 'open-sky',
    sky: { kind: rng.pick(['void', 'night', 'dusk'] as SkyKind[]) },
    topology: 'chaos',
    groundless: true,
    fall: { killY: -30, mode: 'transition' },
    spawn: { x: 2, y: 0, z: 2, yaw: 0 },
    arrival: (ctx) => chaosArrival(ctx, p),
    hallucination: 2,
  };
}

export { QUIET };
