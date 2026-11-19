/**
 * The second ending (user design): a big university lecture hall - rows of
 * seats rising toward the back, a stage at the front with a lectern and a
 * large projection screen, and the speaker's door at the side of the stage.
 * You come in through that door, and then watch yourself present what you
 * saw in the Backrooms. The audience and the slides are drawn by the game
 * (lectureEnding.ts); this is the room. Pure.
 */
import type { Box, ChunkData, LightPanel, Prop } from '../../world/chunkData';
import type { LevelDefinition } from '../levelDefinition';

import { LECTURE_LEVEL } from '../../systems/escape';
export { LECTURE_LEVEL };
const S = 32;
/** The hall (chunk 0,0, local): x 4..28, z 2..30. The stage is at the front (low z). */
export const HALL = { x0: 4, x1: 28, z0: 2, z1: 30, stageZ: 8.5, H: 10 };
/** Seating: rows from the stage back, each a step higher. */
export const ROWS = { first: 10, depth: 1.5, rise: 0.42, count: 12 };
/** Where things stand (local). */
export const LECTURE_SPOTS = {
  /** In the speaker's doorway, facing into the hall along +x. */
  door: { x: 4.5, z: 5.2 },
  lectern: { x: 19.5, z: 5.2 },
  /** Projection screen on the front wall. */
  screen: { x0: 8.5, x1: 22.5, y0: 3.2, y1: 9.0, z: 2.06 },
};

export function rowFloorY(row: number): number {
  return (row + 1) * ROWS.rise;
}

/** Seats: [x, z, y-of-the-row-floor] for every seat, row by row from the front. */
export function lectureSeats(): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let r = 0; r < ROWS.count; r++) {
    const z = ROWS.first + r * ROWS.depth + 0.95;
    for (let x = HALL.x0 + 2.2; x < HALL.x1 - 1.8; x += 1.0) {
      if (Math.abs(x - 16) < 0.9) continue; // the centre aisle
      out.push([x, z, rowFloorY(r)]);
    }
  }
  return out;
}

function chunk(cx: number, cz: number): ChunkData {
  const solids: Box[] = [];
  const decor: Box[] = [];
  const lights: LightPanel[] = [];
  const props: Prop[] = [];
  const d: ChunkData = { levelId: LECTURE_LEVEL, cx, cz, size: S, solids, decor, lights, floors: [], ceilings: [], items: [], props, zones: [] };
  if (cx !== 0 || cz !== 0) return d;
  const b = (list: Box[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string) => list.push({ minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, mat });
  const { x0, x1, z0, z1, H } = HALL;
  const T = 0.3;
  // Walls, a wood-panelled front, the ceiling.
  b(solids, x0 - T, 0, z0 - T, x1 + T, H, z0, 'lecture-wall');
  b(solids, x0 - T, 0, z1, x1 + T, H + 6, z1 + T, 'lecture-wall');
  b(solids, x0 - T, 0, z0, x0, H + 6, z1, 'lecture-wall');
  b(solids, x1, 0, z0, x1 + T, H + 6, z1, 'lecture-wall');
  b(decor, x0 + 0.01, 0, z0 + 0.01, x1 - 0.01, 2.4, z0 + 0.03, 'lecture-panel');
  d.floors.push({ x0, z0, x1, z1: ROWS.first, y: 0 });
  d.ceilings.push({ x0, z0, x1, z1, y: H + 5 });
  // The stage: a low platform, the lectern, a table.
  b(solids, x0, 0, z0, x1, 0.3, HALL.stageZ, 'lecture-stage');
  d.floors.push({ x0, z0, x1, z1: HALL.stageZ, y: 0.3 });
  b(solids, LECTURE_SPOTS.lectern.x - 0.45, 0.3, LECTURE_SPOTS.lectern.z + 0.2, LECTURE_SPOTS.lectern.x + 0.45, 1.45, LECTURE_SPOTS.lectern.z + 0.7, 'lecture-wood');
  b(solids, LECTURE_SPOTS.lectern.x - 0.55, 1.45, LECTURE_SPOTS.lectern.z + 0.1, LECTURE_SPOTS.lectern.x + 0.55, 1.5, LECTURE_SPOTS.lectern.z + 0.8, 'lecture-wood');
  b(solids, 9, 0.3, 4.5, 13, 1.05, 5.5, 'lecture-wood');
  // The projection screen (its picture is drawn over it by the game).
  const sc = LECTURE_SPOTS.screen;
  b(decor, sc.x0 - 0.1, sc.y0 - 0.1, z0 + 0.02, sc.x1 + 0.1, sc.y1 + 0.1, z0 + 0.04, 'lecture-frame');
  b(decor, sc.x0, sc.y0, z0 + 0.04, sc.x1, sc.y1, z0 + 0.05, 'lecture-screen');
  // Rising rows: a step of floor, a long desk at the front of each row.
  for (let r = 0; r < ROWS.count; r++) {
    const za = ROWS.first + r * ROWS.depth;
    const y = rowFloorY(r);
    b(solids, x0, 0, za, x1, y, za + ROWS.depth, 'lecture-step');
    d.floors.push({ x0, z0: za, x1, z1: za + ROWS.depth, y });
    if (r > 0 || true) {
      b(solids, x0 + 1.2, y + 0.68, za + 0.05, 16 - 0.9, y + 0.74, za + 0.55, 'lecture-wood');
      b(solids, 16 + 0.9, y + 0.68, za + 0.05, x1 - 1.0, y + 0.74, za + 0.55, 'lecture-wood');
      b(solids, x0 + 1.2, y, za + 0.45, 16 - 0.9, y + 0.68, za + 0.5, 'lecture-wood');
      b(solids, 16 + 0.9, y, za + 0.45, x1 - 1.0, y + 0.68, za + 0.5, 'lecture-wood');
    }
  }
  // The speaker's door at the side of the stage (you come in through it).
  props.push({ uid: 'speaker-door', kind: 'plain-door', x: x0 + 0.02, y: 0.3, z: LECTURE_SPOTS.door.z, rotY: Math.PI / 2, color: 0x6a4a30 });
  // Light
  for (let x = 8; x <= 24; x += 8) for (let z = 6; z <= 28; z += 7) lights.push({ x, y: H + 4.95, z, w: 1.2, d: 1.2, state: 1 });
  return d;
}

export const levelLecture: LevelDefinition = {
  id: LECTURE_LEVEL,
  title: '',
  name: '大講義室',
  subtitle: 'The Lecture Hall',
  threatClass: 0,
  chunkSize: S,
  ceilingHeight: HALL.H + 5,
  palette: {
    wallTex: 'plaster',
    floorTex: 'gen:carpet:5a3a34:972',
    ceilingTex: 'ceiling-tile',
    lightColor: 0xfff6e8,
    fogColor: 0x1a1612,
    fogDensity: 0.004,
    ambient: 0.7,
    lightTint: [1, 0.98, 0.94],
  },
  generator: (_ctx, cx, cz) => chunk(cx, cz),
  lightSampler: () => (_x, wy, _z, nx, ny) => 0.66 + 0.18 * Math.max(0, ny) - 0.05 * Math.abs(nx) + 0.02 * (wy / HALL.H),
  setPieces: [],
  lootTable: { perCell: 0, rules: [] },
  exits: [],
  drainMul: 0,
  hallucination: 0,
  footstep: 'carpet',
  ambience: { humFreq: 0, humGain: 0, noiseGain: 0.006, noiseCutoff: 700 },
  environment: 'enclosed',
  kindLabel: '大講義室',
  topology: 'closed',
  spawn: { x: LECTURE_SPOTS.door.x + 0.6, y: 0.3, z: LECTURE_SPOTS.door.z, yaw: -Math.PI / 2 },
  arrival: () => ({ x: LECTURE_SPOTS.door.x + 0.6, y: 0.3, z: LECTURE_SPOTS.door.z, yaw: -Math.PI / 2 }),
};
