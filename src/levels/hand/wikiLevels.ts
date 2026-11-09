/**
 * Hand-made levels whose numbers come from the Backrooms Wiki connection graph
 * (SPEC §4.2, Phase 11). Only names and connections are borrowed; contents are
 * original designs.
 */
import { Rng } from '../../core/rng';
import { makeDocksLevel, makeGardenLevel, makeGridLevel } from '../worlds';
import type { GridParams } from '../gridLevel';
import type { LevelDefinition } from '../levelDefinition';

const gp = (o: Partial<GridParams> & Pick<GridParams, 'cell' | 'cellsPerChunk' | 'ceiling'>): GridParams => ({
  wallP: 0.45,
  doorwayP: 0.45,
  regions: true,
  wallT: 0.2,
  pillarP: 0.05,
  pillarHalf: 0.25,
  lightP: 0.4,
  lightDeadP: 0.1,
  lightFlickerP: 0.05,
  lightW: 0.6,
  lightD: 1.2,
  lightIntensity: 1,
  crateP: 0,
  pipes: false,
  doorP: 0.03,
  doorKinds: [{ kind: 'plain-door', weight: 1, color: 0x8a8f94 }],
  thinP: 0.012,
  lootP: 0.0013 * o.cell * o.cell,
  pieceRate: 0.6,
  thinFloorP: 0.005,
  ...o,
});

/** 4.3 — an endless, painfully white corridor (reached through Level 1's white door). */
export const level4_3 = makeGridLevel(
  {
    id: '4.3',
    title: 'Level 4.3',
    name: '白い廊下',
    subtitle: 'The White Hall',
    threat: 1,
    sky: 'day',
    kindLabel: '白い廊下(手作り)',
    exits: [
      { kind: 'door', prop: 'plain-door', targets: [{ levelId: '1', weight: 2 }, { levelId: '43', weight: 1 }, { levelId: '403', weight: 1 }], discovery: '白い扉を開けると、目が慣れるまで何も見えなかった。' },
      { kind: 'wall', push: 2.5, targets: [{ levelId: '1', weight: 1 }], discovery: '白い壁をすり抜けると、コンクリートの倉庫に戻っていた。' },
      { kind: 'floor', targets: [{ levelId: '27', weight: 1 }], discovery: '白い床が一枚だけ灰色で、そこから落ちた。' },
      { kind: 'walk', distance: 1200, targets: [{ levelId: '4', weight: 1 }], discovery: '白い廊下の果てに、事務所の匂いがした。' },
    ],
  },
  gp({ cell: 3, cellsPerChunk: 10, ceiling: 3.2, wallP: 0.62, doorwayP: 0.38, regions: false, lightP: 0.45, lightIntensity: 0.9, lightDeadP: 0, lightFlickerP: 0, doorKinds: [{ kind: 'plain-door', weight: 1, color: 0xf4f4f0 }], pieces: ['door-row', 'light-well', 'pillar-forest', 'reception', 'statue'] }),
  { wall: 'gen:panel:f2f2ee:301', floor: 'gen:tile:e8e8e4:302', ceiling: 'gen:panel:fafaf8:303', light: 0xffffff, tint: [1, 1, 1], fog: 0xdcdcda, fogDensity: 0.03, ambient: 0.16 },
  { hallucination: 0.7 },
);

/** 13 — a humid glass greenhouse (reached through Level 0's sliding glass door). */
export const level13 = (() => {
  const L = makeGardenLevel(
    {
      id: '13',
      title: 'Level 13',
      name: '温室',
      subtitle: 'The Greenhouse',
      threat: 0,
      sky: 'overcast',
      kindLabel: '温室(手作り)',
      exits: [
        { kind: 'door', prop: 'plain-door', targets: [{ levelId: '0', weight: 2 }, { levelId: 'u2', weight: 1 }, { levelId: 'u3', weight: 1 }], discovery: '温室の中に立つ扉の一つは、黄色い廊下に通じていた。' },
        { kind: 'special', zone: 'gate', seconds: 0.4, targets: [{ levelId: 'u3', weight: 1 }], discovery: 'ガラス越しの光の中へ入ると、明るい未来都市に出た。' },
        { kind: 'floor', targets: [{ levelId: '37', weight: 1 }], discovery: '湿った土が崩れて、タイルの部屋に落ちた。' },
        { kind: 'walk', distance: 1200, targets: [{ levelId: '0', weight: 1 }], discovery: '植物の間を歩き続けると、黄色い壁紙が見えてきた。' },
      ],
    },
    'greenhouse',
    new Rng(113),
  );
  return { ...L, palette: { ...L.palette, fogColor: 0xb8cdb0, fogDensity: 0.03 }, drainMul: 0.8 } as LevelDefinition;
})();

/** 14 — dark emergency stairwells lit only by green exit signs. */
export const level14 = makeGridLevel(
  {
    id: '14',
    title: 'Level 14',
    name: '非常口の先',
    subtitle: 'Emergency Exit',
    threat: 2,
    sky: 'night',
    kindLabel: '非常口の通路(手作り)',
    exits: [
      { kind: 'door', prop: 'plain-door', targets: [{ levelId: '0', weight: 2 }, { levelId: '1', weight: 2 }, { levelId: '114', weight: 1 }], discovery: '非常階段の扉は、本当に外へ……ではなく、別のどこかへ通じていた。' },
      { kind: 'wall', push: 2.5, targets: [{ levelId: '0', weight: 1 }], discovery: 'コンクリートの壁をすり抜けて、黄色い迷路に戻った。' },
      { kind: 'floor', targets: [{ levelId: '27', weight: 1 }], discovery: '踊り場の床が抜けた。' },
      { kind: 'walk', distance: 1000, targets: [{ levelId: '1', weight: 1 }], discovery: '非常口の表示に従って進み続けると、倉庫に出た。' },
    ],
  },
  gp({ cell: 2.8, cellsPerChunk: 11, ceiling: 2.6, wallP: 0.6, doorwayP: 0.4, regions: false, lightP: 0.08, lightIntensity: 0.6, signP: 0.25, pieces: ['stair-tower', 'door-row', 'platforms', 'pit-bridge', 'pillar-forest'] }),
  { wall: 'gen:concrete:5d675f:311', floor: 'gen:floor-concrete:3c423e:312', ceiling: 'gen:concrete:2c302d:313', light: 0x7aff9a, tint: [0.55, 1, 0.7], fog: 0x050a07, fogDensity: 0.07, ambient: 0.06 },
  { hallucination: 1.2, drainMul: 1.1 },
);

/** 27 — the cramped space under Level 0's floor: low ceiling, pipes, darkness. */
export const level27 = makeGridLevel(
  {
    id: '27',
    title: 'Level 27',
    name: '床下',
    subtitle: 'Underfloor',
    threat: 2,
    sky: 'night',
    kindLabel: '床下(手作り)',
    exits: [
      { kind: 'door', prop: 'plain-door', targets: [{ levelId: '0', weight: 2 }, { levelId: '37', weight: 1 }], discovery: '頭上のハッチを押し上げると、湿ったカーペットの上に出た。' },
      { kind: 'floor', targets: [{ levelId: '37', weight: 3 }, { levelId: 'void', weight: 1 }], discovery: '床下のさらに下へ、水の音のする方へ落ちていった。' },
      { kind: 'wall', push: 2.5, targets: [{ levelId: '0', weight: 1 }], discovery: '配管の隙間をすり抜けると、黄色い迷路に戻っていた。' },
      { kind: 'walk', distance: 900, targets: [{ levelId: '37', weight: 1 }], discovery: '這うように進み続けると、塩素の匂いがした。' },
    ],
  },
  gp({ cell: 3, cellsPerChunk: 10, ceiling: 2.15, wallP: 0.5, doorwayP: 0.5, pipes: true, lightP: 0.12, lightW: 0.25, lightD: 0.25, lightIntensity: 0.8, pieces: ['pit-bridge', 'water-tanks', 'pool', 'shelves', 'door-row'] }),
  { wall: 'gen:concrete:5a5248:321', floor: 'gen:floor-concrete:3a352f:322', ceiling: 'gen:wood:4a3a28:323', light: 0xffb060, tint: [1, 0.75, 0.5], fog: 0x0a0806, fogDensity: 0.08, ambient: 0.05 },
  { hallucination: 1.3, drainMul: 1.15 },
);

/** 37 — tiled rooms flooded with shallow, still water. */
export const level37 = makeGridLevel(
  {
    id: '37',
    title: 'Level 37',
    name: 'プールルーム',
    subtitle: 'Poolrooms',
    threat: 0,
    sky: 'day',
    kindLabel: 'プールルーム(手作り)',
    exits: [
      { kind: 'door', prop: 'plain-door', targets: [{ levelId: '27', weight: 2 }, { levelId: '137', weight: 1 }], discovery: 'タイルの壁の扉は、薄暗い床下へ続いていた。' },
      { kind: 'floor', targets: [{ levelId: 'u2', weight: 2 }, { levelId: '370', weight: 1 }], discovery: '水の底のタイルが一枚抜けて、沈んでいった。' },
      { kind: 'wall', push: 2.5, targets: [{ levelId: '27', weight: 1 }], discovery: 'タイルの壁をすり抜けた。' },
      { kind: 'walk', distance: 1200, targets: [{ levelId: 'u2', weight: 1 }], discovery: '水の中を歩き続けると、畳の匂いがした。' },
    ],
  },
  gp({ cell: 6, cellsPerChunk: 5, ceiling: 4.5, wallP: 0.32, doorwayP: 0.75, pillarP: 0.2, pillarHalf: 0.3, lightP: 0.5, lightIntensity: 1.6, waterY: 0.22, pieces: ['pool', 'water-tanks', 'light-well', 'pillar-forest', 'door-row'] }),
  { wall: 'gen:tile:e6f0f2:331', floor: 'gen:tile:bfe2ea:332', ceiling: 'gen:tile:f0f6f7:333', light: 0xf2ffff, tint: [0.92, 1, 1], fog: 0xb8dbe2, fogDensity: 0.03, ambient: 0.18 },
  { footstep: 'water', ambience: { humFreq: 0, humGain: 0, noiseGain: 0.03, noiseCutoff: 1500 }, hallucination: 0.5, drainMul: 0.8 },
);

/** 139 — the space behind Level 0's walls: exposed studs, insulation and wiring. */
export const level139 = makeGridLevel(
  {
    id: '139',
    title: 'Level 139',
    name: '壁の向こう',
    subtitle: 'Behind the Wall',
    threat: 1,
    sky: 'night',
    kindLabel: '壁の裏(手作り)',
    exits: [
      { kind: 'wall', push: 2.5, targets: [{ levelId: '0', weight: 1 }], discovery: '骨組みの間を押し進むと、壁紙の裏から元の迷路に出た。' },
      { kind: 'door', prop: 'plain-door', targets: [{ levelId: '0', weight: 2 }, { levelId: '239', weight: 1 }], discovery: '壁の裏の点検口は、黄色い廊下に開いていた。' },
      { kind: 'floor', targets: [{ levelId: '27', weight: 1 }], discovery: '床板が抜けて、床下へ落ちた。' },
      { kind: 'walk', distance: 900, targets: [{ levelId: '1', weight: 1 }], discovery: '壁の裏をずっと進むと、コンクリートの倉庫に出た。' },
    ],
  },
  gp({ cell: 2.4, cellsPerChunk: 13, ceiling: 2.6, wallP: 0.58, doorwayP: 0.45, wallT: 0.15, lightP: 0.1, lightW: 0.2, lightD: 0.2, lightIntensity: 0.7, thinP: 0.03, pieces: ['shelves', 'door-row', 'platforms', 'pit-bridge', 'stair-tower'] }),
  { wall: 'studs', floor: 'gen:wood:6a5034:341', ceiling: 'studs', light: 0xffc890, tint: [1, 0.82, 0.6], fog: 0x0c0806, fogDensity: 0.07, ambient: 0.05 },
  { footstep: 'carpet', hallucination: 1.2 },
);

/** 7.5 — The Docks: wooden piers over dark water, benches, bins, and doors to safe places. */
export const level7_5 = makeDocksLevel({
  id: '7.5',
  title: 'Level 7.5',
  name: '桟橋',
  subtitle: 'The Docks',
  threat: 0,
  sky: 'dusk',
  kindLabel: '桟橋(手作り)',
  exits: [
    {
      kind: 'door',
      prop: 'plain-door',
      targets: [
        { levelId: '7', weight: 2 },
        { levelId: '8', weight: 2 },
        { levelId: '13', weight: 1 },
        { levelId: 'u3', weight: 1 },
        { levelId: '37', weight: 1 },
      ],
      discovery: '桟橋に立つ扉は、それぞれ別の静かな場所に通じていた。',
    },
    { kind: 'floor', targets: [{ levelId: '8', weight: 1 }], discovery: '桟橋から暗い水に落ちて、洞窟の天井から出てきた。' },
    { kind: 'walk', distance: 1000, targets: [{ levelId: '7', weight: 1 }], discovery: '桟橋をどこまでも歩くと、水面が足元まで上がってきた。' },
  ],
});
