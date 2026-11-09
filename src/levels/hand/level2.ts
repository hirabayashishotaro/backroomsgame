/** Level 2 — Pipe Dreams: narrow, dim maintenance tunnels lined with pipes. */
import { ALMOND_ONLY } from '../../items/lootTables';
import { generateGrid, gridArrival, gridLightSampler, type GridParams } from '../gridLevel';
import type { LevelDefinition } from '../levelDefinition';

export const LEVEL2_PARAMS: GridParams = {
  cell: 3.2,
  cellsPerChunk: 10,
  wallP: 0.6,
  doorwayP: 0.38,
  regions: false,
  ceiling: 2.7,
  wallT: 0.25,
  pillarP: 0,
  pillarHalf: 0,
  lightP: 0.2,
  lightDeadP: 0.2,
  lightFlickerP: 0.1,
  lightW: 0.25,
  lightD: 0.25,
  lightIntensity: 0.9,
  crateP: 0,
  pipes: true,
  doorP: 0.025,
  doorKinds: [{ kind: 'metal-door', weight: 1, color: 0x6a4a35 }],
  thinP: 0.01,
  lootP: 0.012,
};

export const level2: LevelDefinition = {
  id: '2',
  title: 'Level 2',
  name: '配管の夢',
  subtitle: 'Pipe Dreams',
  threatClass: 2,
  chunkSize: LEVEL2_PARAMS.cell * LEVEL2_PARAMS.cellsPerChunk,
  ceilingHeight: LEVEL2_PARAMS.ceiling,
  palette: {
    wallTex: 'gen:concrete:6e655b:21',
    floorTex: 'gen:floor-concrete:47423c:22',
    ceilingTex: 'gen:concrete:3a3632:23',
    lightColor: 0xffc070,
    fogColor: 0x120d08,
    fogDensity: 0.07,
    ambient: 0.09,
    lightTint: [1.0, 0.78, 0.5],
  },
  generator: (ctx, cx, cz) => generateGrid(ctx, LEVEL2_PARAMS, cx, cz),
  lightSampler: (ctx, cx, cz) => gridLightSampler(ctx, LEVEL2_PARAMS, cx, cz),
  setPieces: [],
  lootTable: { perCell: LEVEL2_PARAMS.lootP, rules: ALMOND_ONLY },
  exits: [
    {
      kind: 'door',
      prop: 'metal-door',
      targets: [
        { levelId: '1', weight: 3 },
        { levelId: '3', weight: 3 },
        { levelId: '37', weight: 1 },
        { levelId: '8', weight: 1 },
      ],
      discovery: '錆びた鉄扉をくぐると、配管の音が遠ざかった。',
    },
    { kind: 'wall', push: 2.5, targets: [{ levelId: '1', weight: 1 }], discovery: '湿ったコンクリートの壁をすり抜けた。' },
    { kind: 'walk', distance: 1500, targets: [{ levelId: '3', weight: 1 }], discovery: 'トンネルを延々と歩くと、電気の匂いがしてきた。' },
  ],
  drainMul: 1.2,
  hallucination: 1.2,
  footstep: 'concrete',
  ambience: { humFreq: 45, humGain: 0.05, noiseGain: 0.06, noiseCutoff: 380 },
  environment: 'enclosed',
  spawn: { x: 1.6, y: 0, z: 1.6, yaw: 0 },
  arrival: (ctx, h) => gridArrival(ctx, LEVEL2_PARAMS, h),
};
