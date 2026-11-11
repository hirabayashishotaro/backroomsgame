/**
 * Two explicit "aesthetic" worlds (user request), original layouts:
 *
 *  - Vaporwave: a dark violet world drawn in glowing cyan wireframe. A wide
 *    road runs straight toward an enormous striped neon sun on the horizon;
 *    jagged wireframe mountains rise on both sides. Along the road: pink-and-
 *    navy checkerboard plazas with plaster Roman columns and giant plaster
 *    busts, neon palms, road lines.
 *
 *  - Memphis: an endless bright white studio in loud post-modern colours -
 *    squiggle and stripe walls, terrazzo, checker cubes on blue legs, yellow
 *    disc tables on blue posts, cones, translucent pink sheets and pink floor
 *    paths.
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { Box, ChunkData } from '../../world/chunkData';
import { makeTerrain } from '../../world/terrain';
import type { ExitRule, LevelDefinition } from '../levelDefinition';
import { ALMOND_ONLY } from '../../items/lootTables';
import { box, emptyOut, fbm2, sampler, toChunk, type Light, type Out } from '../shapes/kit';
import { SKY_PRESETS } from '../../systems/skyPresets';

const S = 32;

const randomTargets = (salt: number) => [
  { levelId: String(100 + salt), weight: 1 },
  { levelId: String(300 + salt * 7), weight: 1 },
  { levelId: '0', weight: 1 },
];

/** A round-ish column from three crossed boxes (boxes only, like the rest of the world). */
function round(list: Box[], x: number, z: number, r: number, y0: number, y1: number, mat: string): void {
  box(list, x - r, y0, z - r * 0.55, x + r, y1, z + r * 0.55, mat);
  box(list, x - r * 0.55, y0, z - r, x + r * 0.55, y1, z + r, mat);
  box(list, x - r * 0.85, y0, z - r * 0.85, x + r * 0.85, y1, z + r * 0.85, mat);
}

// =============================================================================
// Vaporwave
// =============================================================================

/** Half-width of the flat valley (road + plazas); the mountains start beyond it. */
const VALLEY = 26;
const ROAD = 6;

function vaporHeight(seed: number, x: number, z: number): number {
  const d = Math.abs(x) - VALLEY;
  if (d <= 0) return 0;
  const k = Math.min(1, d / 24);
  const ridge = 1 - Math.abs(fbm2(seed, 1601, x / 26, z / 26, 3) * 2 - 1);
  return Math.pow(k, 1.3) * (6 + 26 * ridge * ridge) + d * 0.08;
}

/** A Roman column: plinth, fluted-looking shaft, scroll capital. */
export function column(o: Out, x: number, z: number, h: number): void {
  box(o.solids, x - 0.75, 0, z - 0.75, x + 0.75, 0.35, z + 0.75, 'plaster');
  box(o.solids, x - 0.6, 0.35, z - 0.6, x + 0.6, 0.6, z + 0.6, 'plaster');
  round(o.solids, x, z, 0.42, 0.6, h - 0.5, 'plaster');
  box(o.solids, x - 0.55, h - 0.5, z - 0.55, x + 0.55, h - 0.3, z + 0.55, 'plaster');
  box(o.solids, x - 0.85, h - 0.3, z - 0.45, x + 0.85, h, z + 0.45, 'plaster'); // volutes
}

/** A giant plaster bust (head and neck), facing +x or -x, `s` metres tall-ish. */
export function bust(o: Out, x: number, z: number, s: number, face: 1 | -1, y = 0): void {
  const P = 'plaster';
  box(o.solids, x - 0.35 * s, y, z - 0.3 * s, x + 0.35 * s, y + 0.35 * s, z + 0.3 * s, P); // neck
  box(o.solids, x - 0.42 * s, y + 0.3 * s, z - 0.38 * s, x + 0.42 * s, y + 0.95 * s, z + 0.38 * s, P); // head
  box(o.solids, x - 0.36 * s, y + 0.2 * s, z - 0.32 * s, x + 0.36 * s, y + 0.34 * s, z + 0.32 * s, P); // jaw
  // Curly hair: lumps on top and at the back
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hx = x + Math.cos(a) * 0.3 * s - face * 0.08 * s;
    const hz = z + Math.sin(a) * 0.3 * s;
    box(o.solids, hx - 0.14 * s, y + 0.82 * s, hz - 0.14 * s, hx + 0.14 * s, y + 1.05 * s, hz + 0.14 * s, P);
  }
  box(o.solids, x - face * 0.5 * s, y + 0.45 * s, z - 0.32 * s, x - face * 0.4 * s, y + 0.95 * s, z + 0.32 * s, P); // back of the head
  // Face toward `face`: nose, brows, eyes in shadow
  const fx = x + face * 0.42 * s;
  box(o.solids, Math.min(fx, fx + face * 0.12 * s), y + 0.5 * s, z - 0.06 * s, Math.max(fx, fx + face * 0.12 * s), y + 0.72 * s, z + 0.06 * s, P);
  box(o.solids, Math.min(fx, fx + face * 0.06 * s), y + 0.72 * s, z - 0.3 * s, Math.max(fx, fx + face * 0.06 * s), y + 0.78 * s, z + 0.3 * s, P);
  box(o.decor, Math.min(fx, fx + face * 0.01), y + 0.62 * s, z - 0.24 * s, Math.max(fx, fx + face * 0.01), y + 0.7 * s, z - 0.1 * s, 'dark');
  box(o.decor, Math.min(fx, fx + face * 0.01), y + 0.62 * s, z + 0.1 * s, Math.max(fx, fx + face * 0.01), y + 0.7 * s, z + 0.24 * s, 'dark');
  box(o.decor, Math.min(fx, fx + face * 0.01), y + 0.36 * s, z - 0.12 * s, Math.max(fx, fx + face * 0.01), y + 0.4 * s, z + 0.12 * s, 'dark');
}

export function neonPalm(o: Out, x: number, z: number, h: number): void {
  box(o.solids, x - 0.15, 0, z - 0.15, x + 0.15, h, z + 0.15, 'neon-magenta');
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    box(o.decor, x + Math.min(0, dx * 2.2) - (dx === 0 ? 0.12 : 0), h - 0.15, z + Math.min(0, dz * 2.2) - (dz === 0 ? 0.12 : 0), x + Math.max(0, dx * 2.2) + (dx === 0 ? 0.12 : 0), h + 0.05, z + Math.max(0, dz * 2.2) + (dz === 0 ? 0.12 : 0), 'neon-cyan');
    box(o.decor, x + dx * 2.0 - 0.1, h - 0.9, z + dz * 2.0 - 0.1, x + dx * 2.2 + 0.1, h - 0.1, z + dz * 2.2 + 0.1, 'neon-cyan');
  }
}

/** What stands in a vaporwave chunk (shared by the generator and the light sampler). */
function vaporChunk(seed: number, cx: number, cz: number): { o: Out; lights: Light[] } {
  const o = emptyOut();
  const lights: Light[] = [];
  const ox = cx * S;
  const oz = cz * S;
  // Road lines: neon edges and a dashed centre line, running along z.
  if (ox <= ROAD && ox + S >= -ROAD) {
    for (const ex of [-ROAD, ROAD]) {
      const lx = ex - ox;
      if (lx >= 0 && lx <= S) box(o.decor, lx - 0.08, 0.01, 0, lx + 0.08, 0.03, S, 'neon-cyan');
    }
    const lx = 0 - ox;
    if (lx >= 0 && lx <= S) for (let z = 1; z < S; z += 6) box(o.decor, lx - 0.1, 0.01, z, lx + 0.1, 0.03, z + 3, 'neon-magenta');
  }
  // Now and then a bottle up in the wireframe hills.
  if (hash01(seed, 1608, cx, cz) < 0.7) {
    const bx = 2 + hash01(seed, 1609, cx, cz) * 28;
    const bz = 2 + hash01(seed, 1610, cx, cz) * 28;
    const wx = ox + bx;
    if (Math.abs(wx) > VALLEY + 2) o.items.push({ uid: 'vh', id: 'almond_water', x: bx, y: vaporHeight(seed, wx, oz + bz), z: bz, rot: 0 });
  }
  // Plazas beside the road: every chunk along the valley has one on each side.
  for (const side of [-1, 1]) {
    const px = side * 15; // plaza centre (world x)
    const lx = px - ox;
    if (lx < -8 || lx > S + 8) continue;
    const pz = 16;
    const roll = hash01(seed, 1603, cx, cz, side);
    const plaza = (x0: number, z0: number, x1: number, z1: number) => {
      const a = Math.max(0, x0);
      const c = Math.min(S, x1);
      if (c > a) box(o.decor, a, 0.005, z0, c, 0.02, z1, 'vapor-check');
    };
    plaza(lx - 7, pz - 9, lx + 7, pz + 9);
    const inChunk = (x: number) => x >= 0.5 && x <= S - 0.5;
    if (roll < 0.45) {
      // A row of columns, one fallen-short, and a bust between them.
      for (const dz of [-6, -1, 4]) if (inChunk(lx - side * 4)) column(o, lx - side * 4, pz + dz, 4.5 + hash01(seed, 1604, cx, cz, dz) * 3);
      if (inChunk(lx + side * 2)) bust(o, lx + side * 2, pz + 1.5, 3.2 + roll * 3, side === 1 ? -1 : 1);
      lights.push({ x: lx, y: 2.5, z: pz, I: 3 });
    } else if (roll < 0.75) {
      // A colossal bust rising out of the grid, facing the road.
      if (inChunk(lx)) bust(o, lx, pz, 7 + roll * 6, side === 1 ? -1 : 1, -1);
      lights.push({ x: lx - side * 6, y: 3, z: pz, I: 4 });
    } else {
      // Neon palms around a ring of light (a gate out of here).
      for (const dz of [-5, 5]) if (inChunk(lx)) neonPalm(o, lx, pz + dz, 5.5);
      if (inChunk(lx)) {
        box(o.decor, lx - 1.4, 0.03, pz - 1.4, lx + 1.4, 0.06, pz + 1.4, 'portal');
        box(o.decor, lx - 1.6, 0.02, pz - 1.6, lx + 1.6, 0.04, pz - 1.4, 'neon-magenta');
        box(o.decor, lx - 1.6, 0.02, pz + 1.4, lx + 1.6, 0.04, pz + 1.6, 'neon-magenta');
        o.zones.push({ kind: 'gate', x0: lx - 1.2, z0: pz - 1.2, x1: lx + 1.2, z1: pz + 1.2 });
        o.zones.push({ kind: 'piece', name: 'neon-gate', x0: lx - 2, z0: pz - 2, x1: lx + 2, z1: pz + 2 });
      }
      lights.push({ x: lx, y: 2, z: pz, I: 3 });
    }
    // A door on a plaster frame on some plazas, a bottle on others.
    const r2 = hash01(seed, 1605, cx, cz, side);
    const dx = lx + side * 5;
    if (inChunk(dx) && r2 < 0.3) {
      box(o.solids, dx - 0.8, 0, pz - 8.2, dx + 0.8, 2.6, pz - 8.0, 'plaster');
      o.props.push({ uid: 'vd' + side, kind: 'plain-door', x: dx, y: 0, z: pz - 7.97, rotY: 0, color: 0xf6a8ec });
      o.zones.push({ kind: 'piece', name: 'pink-door', x0: dx - 1.2, z0: pz - 9, x1: dx + 1.2, z1: pz - 7 });
    } else if (inChunk(dx) && r2 < 0.75) o.items.push({ uid: 'vb' + side, id: 'almond_water', x: dx, y: 0.02, z: pz + 6, rot: r2 * 6 });
  }
  return { o, lights };
}

function makeVaporwave(): LevelDefinition {
  const exits: ExitRule[] = [
    { kind: 'door', prop: 'plain-door', targets: [{ levelId: 'memphis', weight: 2 }, ...randomTargets(1)], discovery: 'ピンクの扉を開けると、ネオンの夕日が消えた。' },
    { kind: 'special', zone: 'gate', seconds: 0.5, targets: [{ levelId: 'memphis', weight: 1 }, { levelId: 'u3', weight: 1 }, ...randomTargets(2)], discovery: 'ネオンのヤシに囲まれた光の輪に立つと、景色がほどけた。' },
    { kind: 'walk', distance: 1600, targets: [{ levelId: 'u1', weight: 1 }, ...randomTargets(3)], discovery: '夕日に向かって歩き続けたが、太陽はいつまでも沈まなかった。' },
  ];
  return {
    id: 'vaporwave',
    title: 'Level 1986',
    name: 'ネオンの夕日',
    subtitle: 'Vaporwave',
    threatClass: 1,
    chunkSize: S,
    ceilingHeight: 40,
    meshDetail: 2,
    palette: {
      wallTex: 'plaster',
      floorTex: 'neon-grid',
      ceilingTex: 'white',
      lightColor: 0xff7ae8,
      fogColor: 0x2a0848,
      fogDensity: 0.006,
      ambient: 0.5,
      lightTint: [1.05, 0.62, 1.2],
    },
    generator: (ctx, cx, cz): ChunkData => {
      const { o } = vaporChunk(ctx.levelSeed, cx, cz);
      const terrain = makeTerrain(cx * S, cz * S, S, 2, (x, z) => vaporHeight(ctx.levelSeed, x, z), { flat: 'neon-grid', steep: 'neon-grid', steepAt: 9 });
      return { ...toChunk(ctx, cx, cz, 0, S, o), terrain };
    },
    lightSampler: (ctx, cx, cz) => {
      const lights: Light[] = [];
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const l of vaporChunk(ctx.levelSeed, cx + dx, cz + dz).lights) lights.push({ x: l.x + (cx + dx) * S, y: l.y, z: l.z + (cz + dz) * S, I: l.I });
      return sampler(0.55, SKY_PRESETS.synth.sunDir, lights);
    },
    setPieces: [
      { id: 'columns', name: '石膏の列柱', desc: '格子模様の広場に立ち並ぶ、白い柱。紫の光を浴びている。' },
      { id: 'bust', name: '巨大な胸像', desc: 'ワイヤーフレームの地面から、石膏の頭が生えている。' },
      { id: 'neon-gate', name: 'ネオンのヤシ', desc: '光るヤシの木の間に、光の輪がある。' },
      { id: 'pink-door', name: 'ピンクの扉', desc: '石膏の枠にはまった、ピンク色の扉。' },
      { id: 'sun', name: '沈まない太陽', desc: '道の先、地平線に縞模様の太陽が浮かんでいる。いくら歩いても沈まない。' },
    ],
    lootTable: { perCell: 0, rules: ALMOND_ONLY },
    exits,
    drainMul: 0.8,
    hallucination: 0.4,
    footstep: 'tile',
    ambience: { humFreq: 55, humGain: 0.025, noiseGain: 0.02, noiseCutoff: 400 },
    environment: 'open-sky',
    sky: { kind: 'synth' },
    kindLabel: 'ヴェイパーウェイヴ(手作り)',
    spawn: { x: 0, y: 0, z: 0, yaw: 0 },
    // On the road (always clear), facing the sun.
    arrival: (ctx, h) => ({ x: (hash01(ctx.levelSeed, 1606, h) - 0.5) * 6, y: 0, z: Math.round((hash01(ctx.levelSeed, 1607, h) - 0.5) * 2000), yaw: 0 }),
  };
}

// =============================================================================
// Memphis
// =============================================================================

const M_H = 12;

/** One loud sculpture at (x, z) (local), chosen by `k`. Keeps within ~2.6 m. */
export function sculpture(o: Out, x: number, z: number, k: number): void {
  const kind = Math.floor(k * 7);
  switch (kind) {
    case 0: {
      // Yellow disc table on a blue post with a blue roller at its foot
      round(o.solids, x, z, 0.18, 0, 1.0, 'm-blue');
      round(o.solids, x, z, 0.9, 1.0, 1.08, 'm-yellow');
      box(o.solids, x - 1.2, 0, z + 0.6, x + 1.2, 0.4, z + 1.0, 'm-blue');
      box(o.solids, x - 1.2, 0.05, z + 0.55, x + 1.2, 0.35, z + 1.05, 'm-blue');
      break;
    }
    case 1: {
      // Checker cube on splayed blue legs, a yellow disc on top
      for (const [dx, dz] of [
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6],
      ])
        box(o.solids, x + dx * 1.15 - 0.05, 0, z + dz * 1.15 - 0.05, x + dx * 1.15 + 0.05, 0.6, z + dz * 1.15 + 0.05, 'm-blue');
      box(o.solids, x - 0.7, 0.6, z - 0.7, x + 0.7, 2.0, z + 0.7, 'memphis-check');
      round(o.solids, x + 0.2, z, 0.1, 2.0, 2.5, 'm-blue');
      round(o.solids, x + 0.2, z, 0.85, 2.5, 2.58, 'm-yellow');
      break;
    }
    case 2: {
      // Striped slab with a yellow shelf and a green straw on top
      box(o.solids, x - 0.25, 0, z - 0.9, x + 0.25, 3.2, z + 0.9, 'memphis-stripes');
      round(o.solids, x + 0.5, z, 0.7, 1.6, 1.68, 'm-yellow');
      round(o.solids, x, z + 0.4, 0.05, 3.2, 4.0, 'm-green');
      box(o.solids, x - 0.9, 0, z - 1.2, x + 0.9, 0.38, z - 0.84, 'm-blue');
      break;
    }
    case 3: {
      // Terrazzo columns of different heights, a pastel cone
      round(o.solids, x - 0.6, z, 0.35, 0, 1.6, 'terrazzo-dark');
      round(o.solids, x + 0.5, z - 0.3, 0.45, 0, 2.2, 'terrazzo-dark');
      for (let i = 0; i < 5; i++) box(o.solids, x + 0.2 - 0.4 + i * 0.08, 0, z + 0.6 - 0.4 + i * 0.08, x + 0.2 + 0.4 - i * 0.08, 0.25 * (i + 1), z + 0.6 + 0.4 - i * 0.08, 'm-peach');
      break;
    }
    case 4: {
      // Teal drum with a mint glass vase and a peach block
      round(o.solids, x, z, 0.8, 0, 1.0, 'm-teal');
      round(o.solids, x - 0.2, z + 0.1, 0.3, 1.0, 1.9, 'mint-glass');
      box(o.solids, x + 0.3, 1.0, z - 0.5, x + 0.75, 1.5, z - 0.05, 'm-peach');
      break;
    }
    case 5: {
      // A tall pink pillar balancing a red ball (box) and a yellow ring
      round(o.solids, x, z, 0.3, 0, 3.6, 'm-pink');
      box(o.solids, x - 0.45, 3.6, z - 0.45, x + 0.45, 4.5, z + 0.45, 'm-red');
      round(o.solids, x, z, 0.75, 1.8, 1.9, 'm-yellow');
      break;
    }
    default: {
      // Black-and-white zig-zag bench and a blue cylinder
      box(o.solids, x - 1.5, 0, z - 0.4, x + 1.5, 0.5, z + 0.4, 'memphis-check');
      round(o.solids, x + 1.9, z, 0.35, 0, 1.2, 'm-blue');
      break;
    }
  }
}

function memphisChunk(seed: number, cx: number, cz: number): Out {
  const o = emptyOut();
  const rng = new Rng(hashInts(seed, 1701, cx, cz));
  // The centre square (13..19) stays clear: arrivals land there.
  const spots: Array<[number, number]> = [
    [6, 6],
    [26, 6],
    [6, 26],
    [26, 26],
    [16, 5],
    [5, 16],
    [11, 23],
    [23, 11],
  ];
  for (const [x, z] of spots) if (rng.chance(0.85)) sculpture(o, x + (rng.float() - 0.5) * 2, z + (rng.float() - 0.5) * 2, rng.float());
  // Loud blocks of colour and pattern on the floor.
  for (let k = 0; k < 3; k++) {
    const w = 3 + rng.float() * 6;
    const d = 3 + rng.float() * 6;
    const x = rng.float() * (S - w);
    const z = rng.float() * (S - d);
    box(o.decor, x, 0.006 + k * 0.002, z, x + w, 0.012 + k * 0.002, z + d, rng.pick(['m-yellow', 'm-blue', 'memphis-check', 'terrazzo', 'm-peach', 'm-green', 'memphis-stripes']));
  }
  // A loud freestanding wall (squiggle / stripes / terrazzo), sometimes with a door.
  const wallMat = rng.pick(['memphis-squiggle', 'memphis-squiggle', 'memphis-stripes', 'terrazzo', 'm-red', 'm-yellow']);
  // A second, lower wall of solid colour.
  if (rng.chance(0.5)) {
    const z = 2 + rng.float() * 3;
    box(o.solids, 2, 0, z, 9, 2.5 + rng.float() * 2, z + 0.3, rng.pick(['m-red', 'm-blue', 'm-yellow', 'm-pink', 'memphis-check']));
  }
  if (rng.chance(0.9)) {
    const along = rng.chance(0.5);
    const p = 28 + rng.float() * 2;
    const h = 5 + rng.float() * 4;
    if (along) box(o.solids, 8, 0, p, 24, h, p + 0.3, wallMat);
    else box(o.solids, p, 0, 8, p + 0.3, h, 24, wallMat);
    if (rng.chance(0.35)) {
      if (along) o.props.push({ uid: 'md', kind: 'plain-door', x: 16, y: 0, z: p - 0.03, rotY: Math.PI, color: rng.pick([0xf6d21e, 0x2a8ad8, 0xff6a9a]) });
      else o.props.push({ uid: 'md', kind: 'plain-door', x: p - 0.03, y: 0, z: 16, rotY: -Math.PI / 2, color: rng.pick([0xf6d21e, 0x2a8ad8, 0xff6a9a]) });
      o.zones.push({ kind: 'piece', name: 'loud-wall', x0: along ? 14 : p - 2, z0: along ? p - 2 : 14, x1: along ? 18 : p, z1: along ? p : 18 });
    }
  }
  // Translucent pink sheets hanging from the ceiling to the floor.
  if (rng.chance(0.5)) {
    const z = 2 + rng.float() * 3;
    box(o.decor, 9, 0, z, 23, M_H, z + 0.04, 'pink-sheet');
  }
  // Glossy pink paths on the floor, joining up across chunks.
  box(o.decor, 0, 0.004, 15, S, 0.014, 17.2, 'm-pink');
  if (rng.chance(0.5)) box(o.decor, 15, 0.004, 0, 17.2, 0.014, S, 'm-pink');
  // Ceiling lights
  for (const [x, z] of [
    [8, 8],
    [24, 8],
    [8, 24],
    [24, 24],
  ])
    o.panels.push({ x, y: M_H - 0.02, z, w: 2.4, d: 2.4, state: 1 });
  if (rng.chance(0.55)) o.items.push({ uid: 'mb', id: 'almond_water', x: 16 + (rng.float() - 0.5) * 4, y: 0, z: 18.5, rot: rng.float() * 6 });
  return o;
}

function makeMemphis(): LevelDefinition {
  return {
    id: 'memphis',
    title: 'Level 1981',
    name: 'うるさいショールーム',
    subtitle: 'Memphis',
    threatClass: 1,
    chunkSize: S,
    ceilingHeight: M_H,
    palette: {
      wallTex: 'flat:fbfaf6',
      floorTex: 'memphis-tile',
      ceilingTex: 'flat:ffffff',
      lightColor: 0xffffff,
      fogColor: 0xf4f0ea,
      fogDensity: 0.007,
      ambient: 0.9,
      lightTint: [1, 1, 1],
    },
    generator: (ctx, cx, cz): ChunkData => {
      const o = memphisChunk(ctx.levelSeed, cx, cz);
      o.floors.push({ x0: 0, z0: 0, x1: S, z1: S, y: 0 });
      o.ceilings.push({ x0: 0, z0: 0, x1: S, z1: S, y: M_H });
      return toChunk(ctx, cx, cz, 0, S, o);
    },
    lightSampler: () => sampler(0.95, null, []),
    setPieces: [
      { id: 'loud-wall', name: 'うるさい壁', desc: '赤と青の波線、白黒の縞。目がちかちかする壁に扉がついている。' },
      { id: 'disc-table', name: '黄色い円卓', desc: '青い柱の上に乗った、黄色い円盤。' },
      { id: 'checker-cube', name: '白黒の箱', desc: '青い脚で立つ、白黒の市松模様の箱。' },
      { id: 'pink-sheet', name: 'ピンクの幕', desc: '天井から床まで垂れる、半透明のピンクの幕。' },
      { id: 'terrazzo', name: 'テラゾーの柱', desc: '色の粒が散った、背の違う柱。' },
    ],
    lootTable: { perCell: 0, rules: ALMOND_ONLY },
    exits: [
      { kind: 'door', prop: 'plain-door', targets: [{ levelId: 'vaporwave', weight: 2 }, ...randomTargets(4)], discovery: '派手な色の扉を開けると、目がようやく休まった。' },
      { kind: 'walk', distance: 1200, targets: [{ levelId: 'vaporwave', weight: 1 }, { levelId: 'u3', weight: 1 }, ...randomTargets(5)], discovery: 'うるさい色の中を歩き続けると、いつの間にか別の場所にいた。' },
    ],
    drainMul: 0.8,
    hallucination: 0.3,
    footstep: 'tile',
    ambience: { humFreq: 120, humGain: 0.015, noiseGain: 0.015, noiseCutoff: 1200 },
    environment: 'enclosed',
    kindLabel: 'メンフィス(手作り)',
    spawn: { x: 16, y: 0, z: 16, yaw: 0 },
    arrival: (ctx, h) => {
      const cx = Math.floor((hash01(ctx.levelSeed, 1702, h) - 0.5) * 60);
      const cz = Math.floor((hash01(ctx.levelSeed, 1703, h) - 0.5) * 60);
      return { x: cx * S + 16, y: 0, z: cz * S + 16, yaw: hash01(ctx.levelSeed, 1704, h) * Math.PI * 2 };
    },
  };
}

export const levelVaporwave = makeVaporwave();
export const levelMemphis = makeMemphis();
