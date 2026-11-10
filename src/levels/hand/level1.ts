/** Level 1 — The Habitable Zone: a vast concrete warehouse/garage with columns and crates. */
import { ALMOND_ONLY } from '../../items/lootTables';
import { generateGrid, gridArrival, gridLightSampler, type GridParams } from '../gridLevel';
import type { LevelDefinition } from '../levelDefinition';
import { GRID_PIECES } from '../gridPieces';

export const LEVEL1_PARAMS: GridParams = {
  cell: 8,
  cellsPerChunk: 4,
  wallP: 0.2,
  doorwayP: 0.35,
  regions: true,
  ceiling: 6.5,
  wallT: 0.35,
  pillarP: 0.85,
  pillarHalf: 0.45,
  lightP: 0.45,
  lightDeadP: 0.12,
  lightFlickerP: 0.06,
  lightW: 0.5,
  lightD: 2.2,
  lightIntensity: 2.6,
  crateP: 0.32,
  pipes: false,
  doorP: 0.07,
  doorKinds: [
    { kind: 'metal-door', weight: 8, color: 0x5d6b62 },
    { kind: 'white-door', weight: 1, color: 0xf2f2ee },
  ],
  thinP: 0.012,
  lootP: 0.05,
  pieces: ['shelves', 'platforms', 'door-row', 'statue', 'pit-bridge'],
  pieceRate: 0.5,
  thinFloorP: 0.01,
};

export const level1: LevelDefinition = {
  id: '1',
  title: 'Level 1',
  name: '居住区',
  subtitle: 'The Habitable Zone',
  threatClass: 1,
  chunkSize: LEVEL1_PARAMS.cell * LEVEL1_PARAMS.cellsPerChunk,
  ceilingHeight: LEVEL1_PARAMS.ceiling,
  palette: {
    wallTex: 'gen:concrete:8b8a85:11',
    floorTex: 'gen:floor-concrete:66645f:12',
    ceilingTex: 'gen:concrete:4f4f4d:13',
    lightColor: 0xeef6ff,
    fogColor: 0x1b1d20,
    fogDensity: 0.04,
    ambient: 0.07,
    lightTint: [0.9, 0.96, 1.0],
  },
  generator: (ctx, cx, cz) => generateGrid(ctx, LEVEL1_PARAMS, cx, cz),
  lightSampler: (ctx, cx, cz) => gridLightSampler(ctx, LEVEL1_PARAMS, cx, cz),
  setPieces: (LEVEL1_PARAMS.pieces ?? []).map((id) => ({ id, name: GRID_PIECES[id].name, desc: GRID_PIECES[id].desc })),
  lootTable: { perCell: LEVEL1_PARAMS.lootP, rules: ALMOND_ONLY },
  exits: [
    {
      kind: 'door',
      prop: 'metal-door',
      targets: [
        { levelId: '2', weight: 5 },
        { levelId: '3', weight: 2 },
        { levelId: '4', weight: 2 },
      ],
      discovery: '倉庫の鉄扉の先は、別の場所につながっていた。',
    },
    { kind: 'door', prop: 'white-door', targets: [{ levelId: '4.3', weight: 1 }], discovery: '真っ白な扉。開けると、目が痛むほど白い廊下があった。' },
    { kind: 'wall', push: 2.5, targets: [{ levelId: '0', weight: 1 }], discovery: 'コンクリートの壁をすり抜けると、黄色い壁紙の匂いがした。' },
    {
      kind: 'floor',
      targets: [
        { levelId: '2', weight: 3 },
        { levelId: '27', weight: 1 },
      ],
      discovery: 'コンクリートの床の色が違う場所で、足元が抜けた。',
    },
    { kind: 'walk', distance: 2000, targets: [{ levelId: '2', weight: 1 }], discovery: '倉庫の奥へ奥へと歩くと、配管の音が聞こえてきた。' },
  ],
  drainMul: 0.9,
  hallucination: 0.8,
  footstep: 'concrete',
  ambience: { humFreq: 50, humGain: 0.05, noiseGain: 0.04, noiseCutoff: 500 },
  environment: 'enclosed',
  kindLabel: '倉庫(手作り)',
  spawn: { x: 4, y: 0, z: 4, yaw: 0 },
  arrival: (ctx, h) => gridArrival(ctx, LEVEL1_PARAMS, h),
};
