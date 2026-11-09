/**
 * The ending (SPEC §12): an ordinary, quiet break room in daylight. One bottle
 * of almond water on the table. Only chunk (0,0) has content.
 */
import { ALMOND_ONLY } from '../../items/lootTables';
import type { Box, ChunkData } from '../../world/chunkData';
import type { LevelDefinition } from '../levelDefinition';

const X0 = 12;
const X1 = 20;
const Z0 = 12;
const Z1 = 18;
const H = 2.7;

function box(list: Box[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string): void {
  list.push({ minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, mat });
}

export const levelFrontrooms: LevelDefinition = {
  id: 'frontrooms',
  title: '???',
  name: '休憩室',
  subtitle: 'いつもの休憩室',
  threatClass: 0,
  chunkSize: 32,
  ceilingHeight: H,
  palette: {
    wallTex: 'gen:panel:e8e4da:401',
    floorTex: 'gen:tile:c8c2b4:402',
    ceilingTex: 'ceiling-tile',
    lightColor: 0xffffff,
    fogColor: 0xf4f2ec,
    fogDensity: 0.001,
    ambient: 0.85,
    lightTint: [1, 0.99, 0.95],
  },
  generator: (ctx, cx, cz): ChunkData => {
    const solids: Box[] = [];
    const decor: Box[] = [];
    const base: ChunkData = { levelId: ctx.level.id, cx, cz, size: 32, solids, decor, lights: [], floors: [], ceilings: [], items: [], props: [], zones: [] };
    if (cx !== 0 || cz !== 0) return base;
    const t = 0.2;
    box(solids, X0 - t, 0, Z0 - t, X1 + t, H, Z0, 'wall');
    box(solids, X0 - t, 0, Z1, X1 + t, H, Z1 + t, 'wall');
    box(solids, X0 - t, 0, Z0, X0, H, Z1, 'wall');
    box(solids, X1, 0, Z0, X1 + t, H, Z1, 'wall');
    // Windows full of daylight on the north wall
    for (const x of [13.5, 16, 18.5]) box(decor, x - 0.9, 0.9, Z0 + 0.01, x + 0.9, 2.2, Z0 + 0.03, 'daylight');
    // Table, chairs, a sink counter
    box(solids, 15, 0, 14.6, 17, 0.75, 15.6, 'wood-dark');
    for (const [x, z] of [
      [15.3, 14.0],
      [16.7, 14.0],
      [15.3, 16.2],
      [16.7, 16.2],
    ]) {
      box(solids, x - 0.22, 0, z - 0.22, x + 0.22, 0.45, z + 0.22, 'fabric');
    }
    box(solids, X1 - 0.6, 0, Z0 + 0.4, X1, 0.9, Z0 + 2.4, 'metal');
    base.items.push({ uid: 'last', id: 'almond_water', x: 16, y: 0.75, z: 15.1, rot: 0.4 });
    base.props.push({ uid: 'door', kind: 'locked-door', x: 16, y: 0, z: Z1 - 0.12, rotY: Math.PI, color: 0xb8b2a0 });
    base.lights.push({ x: 16, y: H - 0.02, z: 15, w: 0.6, d: 1.2, state: 1 });
    base.floors.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, y: 0 });
    base.ceilings.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, y: H });
    return base;
  },
  lightSampler: () => (_x, _y, _z, nx, ny) => 0.8 + 0.15 * Math.max(0, ny) - 0.08 * Math.abs(nx),
  setPieces: [],
  lootTable: { perCell: 0, rules: ALMOND_ONLY },
  exits: [],
  drainMul: 0,
  hallucination: 0,
  footstep: 'tile',
  ambience: { humFreq: 0, humGain: 0, noiseGain: 0.012, noiseCutoff: 2500 },
  environment: 'enclosed',
  kindLabel: 'エンディング',
  spawn: { x: 16, y: 0, z: 17.2, yaw: 0 },
  arrival: () => ({ x: 16, y: 0, z: 17.2, yaw: 0 }),
};
