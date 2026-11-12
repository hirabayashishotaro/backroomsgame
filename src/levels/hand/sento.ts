/**
 * Showa-era public bathhouse (user request), original layout. An endless run
 * of identical-looking bath halls: white tiled walls, pale aqua paint above,
 * a high wooden ceiling with clerestory windows, washing stations with taps,
 * mirrors, plastic stools and yellow washbowls, a tiled bath full of hot
 * water, a cheerful painted mountain-and-sea mural above the bath and a tile
 * picture below it. Somewhere a washbowl is set down on the tiles: ka-poon.
 *
 * Each hall is one 32 m chunk; doorways in the side walls (and at one end of
 * the front and back walls) join every hall to its neighbours.
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { ChunkData } from '../../world/chunkData';
import type { LevelDefinition } from '../levelDefinition';
import { ALMOND_ONLY } from '../../items/lootTables';
import { box, emptyOut, sampler, toChunk, type Light, type Out } from '../shapes/kit';

const S = 32;
/** Wall height to the ceiling; the centre of the ceiling is raised. */
export const SENTO_H = 7;
const RAISED = 9;
const T = 0.15; // half a shared wall
const TILE_TOP = 2;

/**
 * A row of washing places along a line: a low tiled counter, a tap pair and a
 * mirror per place, a shower head, stools and washbowls. `dir` = which way
 * the bathers face (+1: toward +x, the counter on the -x side). Local coords.
 */
export function washRow(o: Out, x: number, z0: number, z1: number, dir: 1 | -1, seed: number, y = 0, back = true): void {
  const cx0 = dir === 1 ? x : x - 0.6;
  const cx1 = dir === 1 ? x + 0.6 : x;
  box(o.solids, cx0, y, z0, cx1, y + 0.55, z1, 'sento-tile');
  if (back) box(o.solids, dir === 1 ? x - 0.12 : x, y, z0, dir === 1 ? x : x + 0.12, y + 1.9, z1, 'sento-tile');
  const wallX = dir === 1 ? x : x;
  let k = 0;
  for (let z = z0 + 0.8; z < z1 - 0.5; z += 1.5, k++) {
    // Taps (hot and cold), a mirror, a shower head
    box(o.solids, wallX + dir * 0.02 - 0.03, y + 0.72, z - 0.25, wallX + dir * 0.18 + 0.03, y + 0.8, z - 0.15, 'metal');
    box(o.solids, wallX + dir * 0.02 - 0.03, y + 0.72, z + 0.15, wallX + dir * 0.18 + 0.03, y + 0.8, z + 0.25, 'metal');
    box(o.decor, Math.min(wallX + dir * 0.005, wallX + dir * 0.015), y + 1.05, z - 0.3, Math.max(wallX + dir * 0.005, wallX + dir * 0.015), y + 1.6, z + 0.3, 'mirror');
    box(o.solids, wallX + dir * 0.02 - 0.03, y + 1.75, z - 0.04, wallX + dir * 0.22 + 0.03, y + 1.82, z + 0.04, 'metal');
    // A stool in front, a washbowl on the counter or on the floor
    const r = hash01(seed, 5201, k, Math.round(x * 10));
    const sx = x + dir * 1.1;
    if (r < 0.75) box(o.solids, sx - 0.18, y, z - 0.18, sx + 0.18, y + 0.32, z + 0.18, r < 0.4 ? 'stool-white' : 'oke-yellow');
    if (r > 0.25) {
      const bx = r > 0.6 ? x + dir * 0.3 : sx + dir * 0.45;
      const by = r > 0.6 ? y + 0.55 : y;
      box(o.solids, bx - 0.16, by, z - 0.16, bx + 0.16, by + 0.17, z + 0.16, 'oke-yellow');
    }
  }
}

/** A tiled bath of hot water (rim low enough to step over). Local coords. */
export function bathTub(o: Out, x0: number, z0: number, x1: number, z1: number, y = 0): void {
  const r = 0.3;
  const h = 0.42;
  box(o.solids, x0, y, z0, x1, y + h, z0 + r, 'sento-tile');
  box(o.solids, x0, y, z1 - r, x1, y + h, z1, 'sento-tile');
  box(o.solids, x0, y, z0 + r, x0 + r, y + h, z1 - r, 'sento-tile');
  box(o.solids, x1 - r, y, z0 + r, x1, y + h, z1 - r, 'sento-tile');
  // A step/bench along one side inside, and the water
  box(o.solids, x0 + r, y, z0 + r, x1 - r, y + 0.2, z0 + r + 0.5, 'sento-tile');
  box(o.decor, x0 + r, y + 0.34, z0 + r, x1 - r, y + 0.38, z1 - r, 'hot-spring');
  o.zones.push({ kind: 'water', x0: x0 + r, z0: z0 + r, x1: x1 - r, z1: z1 - r });
}

/** A freestanding wall with the bathhouse mountain mural on both faces. Local coords, along x. */
export function muralWall(o: Out, x0: number, x1: number, z: number, evening: boolean, y = 0, h = 4.2): void {
  box(o.solids, x0, y, z - 0.1, x1, y + 1.6, z + 0.1, 'sento-tile');
  box(o.solids, x0, y + 1.6, z - 0.1, x1, y + h, z + 0.1, evening ? 'fuji-mural-evening' : 'fuji-mural');
}

function hall(seed: number, cx: number, cz: number): { o: Out; lights: Light[] } {
  const o = emptyOut();
  const lights: Light[] = [];
  const rng = new Rng(hashInts(seed, 5202, cx, cz));
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    box(o.solids, x0, 0, z0, x1, TILE_TOP, z1, 'sento-tile');
    box(o.solids, x0, TILE_TOP, z0, x1, SENTO_H, z1, 'sento-paint');
  };
  // Side walls (x = 0 and x = 32) with a doorway near the back; front/back walls with a doorway at one end.
  const DZ0 = 25.5;
  const DZ1 = 28;
  for (const [a, b] of [
    [0, T],
    [S - T, S],
  ]) {
    wall(a, 0, b, DZ0);
    wall(a, DZ1, b, S);
    box(o.solids, a, 2.3, DZ0, b, SENTO_H, DZ1, 'sento-paint');
  }
  const DX0 = 2.2;
  const DX1 = 4.6;
  for (const [a, b] of [
    [0, T],
    [S - T, S],
  ]) {
    wall(0, a, DX0, b);
    wall(DX1, a, S, b);
    box(o.solids, DX0, 2.3, a, DX1, SENTO_H, b, 'sento-paint');
  }
  // Floor; ceiling with a raised lantern in the middle and clerestory windows.
  o.floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
  const lx0 = 7;
  const lx1 = 25;
  o.ceilings.push({ x0: 0, z0: 0, x1: lx0, z1: S, y: SENTO_H }, { x0: lx1, z0: 0, x1: S, z1: S, y: SENTO_H }, { x0: lx0, z0: 0, x1: lx1, z1: S, y: RAISED });
  box(o.solids, lx0 - 0.2, SENTO_H, 0, lx0, RAISED, S, 'sento-paint');
  box(o.solids, lx1, SENTO_H, 0, lx1 + 0.2, RAISED, S, 'sento-paint');
  // Clerestory windows: bright frosted panes high on the lantern sides and the side walls.
  for (let z = 1.5; z < S - 2; z += 3.4) {
    box(o.decor, lx0 + 0.01, SENTO_H + 0.4, z, lx0 + 0.03, RAISED - 0.3, z + 2.6, 'daylight');
    box(o.decor, lx1 - 0.03, SENTO_H + 0.4, z, lx1 - 0.01, RAISED - 0.3, z + 2.6, 'daylight');
    if (z < DZ0 - 3 || z > DZ1)
      for (const x of [T + 0.01, S - T - 0.03]) box(o.decor, x, 4.6, z, x + 0.02, 6.4, z + 2.6, 'daylight');
  }
  // Fluorescent tubes
  for (const [x, z] of [
    [4, 8],
    [28, 8],
    [4, 20],
    [28, 20],
  ])
    o.panels.push({ x, y: SENTO_H - 0.02, z, w: 0.3, d: 1.4, state: 1 });
  lights.push({ x: 16, y: RAISED - 1, z: 10, I: 6 }, { x: 16, y: RAISED - 1, z: 24, I: 6 });

  // The mural wall at the front (z = 0): painted mountain above, tile picture below, the bath in front.
  const evening = rng.chance(0.3);
  box(o.decor, 5.5, 2.4, T + 0.005, 26.5, 6.6, T + 0.025, evening ? 'fuji-mural-evening' : 'fuji-mural');
  box(o.decor, 8, 0.55, T + 0.005, 24, 2.3, T + 0.025, 'sento-tile-mural');
  bathTub(o, 7.8, T, 24.2, 6.4);
  box(o.solids, 15.85, 0.9, T, 16.15, 1.05, 0.9, 'metal'); // spout pouring into the bath
  box(o.decor, 15.92, 0.38, 0.8, 16.08, 0.9, 0.95, 'water');

  // Washing places: along both side walls and both sides of a central island.
  washRow(o, T, 8.5, 23.5, 1, hashInts(seed, cx, cz, 1), 0, false);
  washRow(o, S - T, 8.5, 23.5, -1, hashInts(seed, cx, cz, 2), 0, false);
  box(o.solids, 15.85, 0, 11, 16.15, 1.9, 23, 'sento-tile');
  washRow(o, 15.85, 11, 23, -1, hashInts(seed, cx, cz, 3), 0, false);
  washRow(o, 16.15, 11, 23, 1, hashInts(seed, cx, cz, 4), 0, false);

  // A sliding glass door in the back wall of some halls (a way out), a bottle on a counter.
  if (rng.chance(0.35)) {
    box(o.solids, 26, 0, S - T - 0.2, 29.5, 2.4, S - T, 'sento-tile');
    o.props.push({ uid: 'sd', kind: 'glass-door', x: 27.75, y: 0, z: S - T - 0.22, rotY: Math.PI });
    o.zones.push({ kind: 'piece', name: 'changing-room-door', x0: 25.5, z0: S - 2, x1: 30, z1: S });
  }
  if (rng.chance(0.6)) o.items.push({ uid: 'sb', id: 'almond_water', x: rng.chance(0.5) ? 0.5 : S - 0.5, y: 0.55, z: 9.3 + rng.int(0, 8) * 1.5, rot: 0 });
  o.zones.push({ kind: 'piece', name: 'mural', x0: 5, z0: 0, x1: 27, z1: 7 });
  o.zones.push({ kind: 'piece', name: 'wash-row', x0: 14, z0: 11, x1: 18, z1: 23 });
  return { o, lights };
}

function makeSento(): LevelDefinition {
  return {
    id: 'sento',
    title: 'Level 1965',
    name: '終わらない銭湯',
    subtitle: 'The Endless Bathhouse',
    threatClass: 1,
    chunkSize: S,
    ceilingHeight: SENTO_H,
    palette: {
      wallTex: 'sento-tile',
      floorTex: 'sento-floor',
      ceilingTex: 'sento-ceiling',
      lightColor: 0xf4fbff,
      fogColor: 0xdff2f4,
      fogDensity: 0.018, // steam
      ambient: 0.75,
      lightTint: [0.98, 1.02, 1.04],
    },
    generator: (ctx, cx, cz): ChunkData => toChunk(ctx, cx, cz, 0, S, hall(ctx.levelSeed, cx, cz).o),
    lightSampler: (ctx, cx, cz) => {
      const lights = hall(ctx.levelSeed, cx, cz).lights.map((l) => ({ ...l, x: l.x + cx * S, z: l.z + cz * S }));
      return sampler(0.8, [0.3, 0.9, 0.2], lights);
    },
    setPieces: [
      { id: 'mural', name: '富士の壁画', desc: '湯船の上の壁いっぱいに、雪をかぶった山と青い海の絵。どの浴場にも同じ絵がある。' },
      { id: 'wash-row', name: '洗い場', desc: '蛇口と鏡が並ぶ洗い場。黄色い桶と、白い腰掛け。' },
      { id: 'bath', name: '湯船', desc: 'タイル張りの湯船に、湯が張ってある。熱い。' },
      { id: 'oke', name: '桶の音', desc: 'どこかで、桶を置く音がする。かぽーん。誰もいないのに。' },
      { id: 'changing-room-door', name: '脱衣所の戸', desc: '曇りガラスの引き戸。脱衣所に続くはずだが……。' },
    ],
    lootTable: { perCell: 0, rules: ALMOND_ONLY },
    exits: [
      { kind: 'door', prop: 'glass-door', targets: [{ levelId: '37', weight: 1 }, { levelId: 'memphis', weight: 1 }, { levelId: String(200 + 13), weight: 1 }, { levelId: '0', weight: 1 }], discovery: '脱衣所の引き戸を開けると、湯気の向こうは別の場所だった。' },
      { kind: 'walk', distance: 1300, targets: [{ levelId: '37', weight: 1 }, { levelId: '37.2', weight: 1 }, { levelId: String(500 + 7), weight: 1 }], discovery: '浴場から浴場へ歩き続けると、タイルの色が変わっていた。' },
    ],
    drainMul: 0.7,
    hallucination: 0.5,
    footstep: 'tile',
    ambience: { humFreq: 0, humGain: 0, noiseGain: 0.012, noiseCutoff: 1800 },
    soundscape: 'sento',
    environment: 'enclosed',
    kindLabel: '昭和の銭湯(手作り)',
    spawn: { x: 11, y: 0, z: 27, yaw: 0 },
    arrival: (ctx, h) => {
      const cx = Math.floor((hash01(ctx.levelSeed, 5203, h) - 0.5) * 60);
      const cz = Math.floor((hash01(ctx.levelSeed, 5204, h) - 0.5) * 60);
      return { x: cx * S + 11, y: 0, z: cz * S + 27, yaw: -0.35 };
    },
  };
}

export const levelSento = makeSento();
