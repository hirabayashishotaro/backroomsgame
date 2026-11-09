/**
 * Developer mode 2 (combat lab): one large closed hall for trying weapons
 * against entities. Not reachable through exits; only from the menu.
 * The hall spans the four chunks around the origin (world -26..26 m).
 */
import type { Box, ChunkData, LightPanel } from '../../world/chunkData';
import type { LevelDefinition } from '../levelDefinition';

export const ARENA_ID = 'arena';
/** Half size of the hall (m) and its height. */
export const ARENA_HALF = 26;
const H = 9;
const S = 32;
const T = 0.4;

type WBox = [number, number, number, number, number, number, string];

/** Static layout in world coordinates. */
function layout(): { boxes: WBox[]; lights: Array<[number, number]> } {
  const A = ARENA_HALF;
  const boxes: WBox[] = [
    // Outer walls on all four sides
    [-A - T, 0, -A - T, A + T, H, -A, 'wall'],
    [-A - T, 0, A, A + T, H, A + T, 'wall'],
    [-A - T, 0, -A, -A, H, A, 'wall'],
    [A, 0, -A, A + T, H, A, 'wall'],
  ];
  // Pillars (line-of-sight blockers for the "watched" behaviours)
  for (const x of [-11, 11]) for (const z of [-11, 11]) boxes.push([x - 1, 0, z - 1, x + 1, H, z + 1, 'pillar']);
  // Low cover (crouch behind, shoot over)
  boxes.push([-3, 0, -15.3, 3, 1.1, -14.7, 'metal']);
  boxes.push([-3, 0, 14.7, 3, 1.1, 15.3, 'metal']);
  boxes.push([-17.3, 0, -3, -16.7, 1.1, 3, 'metal']);
  boxes.push([16.7, 0, -3, 17.3, 1.1, 3, 'metal']);
  // A tall wall to hide behind
  boxes.push([-22, 0, -20.3, -14, H, -19.7, 'wall']);
  boxes.push([14, 0, 19.7, 22, H, 20.3, 'wall']);
  const lights: Array<[number, number]> = [];
  for (let x = -20; x <= 20; x += 8) for (let z = -20; z <= 20; z += 8) lights.push([x, z]);
  return { boxes, lights };
}

const LAYOUT = layout();

/** True if (x, z) is inside or next to an obstacle of the hall (world coords). */
export function arenaBlocked(x: number, z: number, margin = 1): boolean {
  const A = ARENA_HALF - margin;
  if (Math.abs(x) > A || Math.abs(z) > A) return true;
  return LAYOUT.boxes.slice(4).some(([x0, , z0, x1, , z1]) => x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin);
}

export const levelArena: LevelDefinition = {
  id: ARENA_ID,
  title: 'TEST',
  name: '戦闘テスト場',
  subtitle: '開発者モード2',
  threatClass: 0,
  chunkSize: S,
  ceilingHeight: H,
  palette: {
    wallTex: 'gen:concrete:9a978e:31',
    floorTex: 'gen:floor-concrete:6e6b64:32',
    ceilingTex: 'ceiling-tile',
    lightColor: 0xfff6e0,
    fogColor: 0x1a1912,
    fogDensity: 0.004,
    ambient: 0.5,
    lightTint: [1, 0.98, 0.9],
  },
  generator: (ctx, cx, cz): ChunkData => {
    const solids: Box[] = [];
    const base: ChunkData = { levelId: ctx.level.id, cx, cz, size: S, solids, decor: [], lights: [], floors: [], ceilings: [], items: [], props: [], zones: [] };
    if (cx < -1 || cx > 0 || cz < -1 || cz > 0) return base;
    const ox = cx * S;
    const oz = cz * S;
    const clip = (x0: number, z0: number, x1: number, z1: number) => {
      const a = Math.max(x0, ox) - ox;
      const b = Math.max(z0, oz) - oz;
      const c = Math.min(x1, ox + S) - ox;
      const d = Math.min(z1, oz + S) - oz;
      return c - a > 1e-6 && d - b > 1e-6 ? [a, b, c, d] : null;
    };
    for (const [x0, y0, z0, x1, y1, z1, mat] of LAYOUT.boxes) {
      const r = clip(x0, z0, x1, z1);
      if (r) solids.push({ minX: r[0], minY: y0, minZ: r[1], maxX: r[2], maxY: y1, maxZ: r[3], mat });
    }
    const A = ARENA_HALF;
    const f = clip(-A, -A, A, A);
    if (f) {
      base.floors.push({ x0: f[0], z0: f[1], x1: f[2], z1: f[3], y: 0 });
      base.ceilings.push({ x0: f[0], z0: f[1], x1: f[2], z1: f[3], y: H });
    }
    for (const [x, z] of LAYOUT.lights) {
      if (x < ox || x >= ox + S || z < oz || z >= oz + S) continue;
      const l: LightPanel = { x: x - ox, y: H - 0.02, z: z - oz, w: 0.8, d: 1.6, state: 1 };
      base.lights.push(l);
    }
    return base;
  },
  lightSampler: () => (_x, wy, _z, nx, ny) => 0.62 + 0.18 * Math.max(0, ny) - 0.06 * Math.abs(nx) + 0.06 * (wy / H),
  setPieces: [],
  lootTable: { perCell: 0, rules: [] },
  exits: [],
  drainMul: 0,
  hallucination: 0,
  footstep: 'concrete',
  ambience: { humFreq: 60, humGain: 0.01, noiseGain: 0.006, noiseCutoff: 1800 },
  environment: 'enclosed',
  kindLabel: '戦闘テスト',
  topology: 'closed',
  spawn: { x: 0, y: 0, z: 22, yaw: 0 },
  arrival: () => ({ x: 0, y: 0, z: 22, yaw: 0 }),
};
