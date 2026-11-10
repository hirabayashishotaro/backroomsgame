/**
 * The ending of escape mode (user design): you open a door and step out into
 * a crowded side street of a big Japanese city at dusk - shop signs, vending
 * machines, utility poles and wires, a pedestrian crossing, and people
 * everywhere (the crowd itself is drawn by the game, see world/crowd.ts).
 * Original layout; no real shop names or signage.
 */
import { Rng } from '../../core/rng';
import type { Box, ChunkData, Prop } from '../../world/chunkData';
import type { LevelDefinition } from '../levelDefinition';
import { sampler, type Light } from '../shapes/kit';
import { SKY_PRESETS } from '../../systems/skyPresets';
import { ENDING_LEVEL } from '../../systems/escape';

/** Street half-width (m) and length (z from -STREET_L to STREET_L). */
export const STREET_W = 5;
export const STREET_L = 80;
/** Sidewalk inner edge (|x| beyond this is sidewalk). */
export const CURB = 3.4;
const S = 32;

type WB = [number, number, number, number, number, number, string];

interface Layout {
  solids: WB[];
  decor: WB[];
  lights: Light[];
  props: Prop[];
}

function build(): Layout {
  const rng = new Rng(0x5b1a7a);
  const solids: WB[] = [];
  const decor: WB[] = [];
  const lights: Light[] = [];
  const props: Prop[] = [];
  const W = STREET_W;
  const L = STREET_L;
  const facades = ['windows', 'brick', 'panel', 'concrete', 'windows-day', 'tile-white', 'stone'];
  const signs = ['neon-pink', 'neon-blue', 'gem-green', 'lantern', 'glow', 'gem-pink', 'red-light', 'glow-blue'];
  // Sidewalks (a low step up from the road).
  solids.push([-W, 0, -L, -CURB, 0.12, L, 'path']);
  solids.push([CURB, 0, -L, W, 0.12, L, 'path']);
  // Buildings on both sides, shop fronts at street level, signs above.
  for (const side of [-1, 1]) {
    let z = -L - 6;
    while (z < L + 6) {
      const w = 6 + rng.int(0, 6);
      const depth = 8 + rng.int(0, 6);
      const h = 9 + rng.int(0, 22);
      const x0 = side * W;
      const x1 = side * (W + depth);
      const mat = rng.pick(facades);
      solids.push([Math.min(x0, x1), 0, z, Math.max(x0, x1), h, z + w - 0.2, mat]);
      const face = side * (W - 0.03);
      // Shop window glowing at street level
      if (rng.chance(0.75)) {
        const glow = rng.pick(['daylight', 'lantern', 'glow', 'cove-glow']);
        decor.push([Math.min(face, face - side * 0.02), 0.4, z + 0.8, Math.max(face, face - side * 0.02), 2.9, z + w - 1.2, glow]);
        lights.push({ x: face - side * 1.2, y: 2, z: z + w / 2, I: 2.2 });
        // An awning
        decor.push([Math.min(face, face - side * 1.1), 3.0, z + 0.5, Math.max(face, face - side * 1.1), 3.15, z + w - 0.9, rng.pick(['wood-red', 'sign-green', 'slide-blue', 'slide-yellow', 'dark'])]);
      }
      // Vertical signboards sticking out over the street
      const nSigns = rng.int(0, 2);
      for (let k = 0; k < nSigns; k++) {
        const sz = z + 1 + rng.float() * (w - 2);
        const y0 = 4 + rng.float() * 3;
        const y1 = Math.min(h - 0.5, y0 + 2.5 + rng.float() * 5);
        if (y1 - y0 < 1.5) continue;
        const sm = rng.pick(signs);
        decor.push([Math.min(face, face - side * 0.9), y0, sz - 0.12, Math.max(face, face - side * 0.9), y1, sz + 0.12, sm]);
        lights.push({ x: face - side * 0.6, y: (y0 + y1) / 2, z: sz, I: 1.4 });
      }
      // Lit windows on the upper floors (the facade texture) plus a rooftop sign now and then
      if (rng.chance(0.25) && h > 14) decor.push([Math.min(face, face - side * 0.3), h, z + 1, Math.max(face, face - side * 0.3), h + 2.2, z + w - 1.5, rng.pick(signs)]);
      // Vending machines in front of some buildings
      if (rng.chance(0.3)) {
        const vz = z + 1 + rng.float() * (w - 3);
        const vx = side * (W - 0.45);
        solids.push([vx - 0.4, 0.12, vz, vx + 0.4, 1.95, vz + 0.95, rng.pick(['tile-white', 'slide-red', 'slide-blue'])]);
        decor.push([vx - side * 0.42, 0.9, vz + 0.1, vx - side * 0.41, 1.8, vz + 0.85, 'daylight']);
        lights.push({ x: vx - side * 0.8, y: 1.3, z: vz + 0.5, I: 1.2 });
      }
      z += w;
    }
  }
  // Utility poles with wires across the street, and street lamps.
  for (let z = -L + 6; z < L; z += 17) {
    for (const side of [-1, 1]) {
      const x = side * (CURB + 0.5);
      solids.push([x - 0.16, 0.12, z - 0.16, x + 0.16, 9.5, z + 0.16, 'stone']);
      decor.push([x - 0.5, 8.6, z - 0.05, x + 0.5, 8.7, z + 0.05, 'dark']);
    }
    for (const y of [8.2, 8.9]) decor.push([-CURB - 0.5, y, z - 0.02, CURB + 0.5, y + 0.03, z + 0.02, 'dark']);
    decor.push([CURB + 0.2, 6.2, z - 0.25, CURB - 0.6, 6.4, z + 0.25, 'glow']);
    lights.push({ x: CURB - 0.2, y: 6, z, I: 3 });
  }
  // Road markings: a centre line and a pedestrian crossing.
  for (let z = -L; z < L; z += 6) decor.push([-0.08, 0.005, z, 0.08, 0.012, z + 3, 'tile-white']);
  for (let x = -CURB + 0.3; x < CURB - 0.4; x += 1.1) decor.push([x, 0.005, -52, x + 0.6, 0.014, -48, 'tile-white']);
  // The ends of the street fade into the haze; you cannot walk off.
  solids.push([-W, 0, -L - 1, W, 6, -L, 'invisible']);
  solids.push([-W, 0, L, W, 6, L + 1, 'invisible']);
  // The door you came out of: in the wall of a building, behind where you arrive.
  props.push({ uid: 'way-out', kind: 'metal-door', x: W - 0.03, y: 0.12, z: 60, rotY: -Math.PI / 2, color: 0x6a6e72 });
  return { solids, decor, lights, props };
}

const LAYOUT = build();

function clipInto(list: Box[], src: WB[], ox: number, oz: number): void {
  for (const [x0, y0, z0, x1, y1, z1, mat] of src) {
    const a = Math.max(x0, ox);
    const b = Math.max(z0, oz);
    const c = Math.min(x1, ox + S);
    const d = Math.min(z1, oz + S);
    if (c - a <= 1e-6 || d - b <= 1e-6) continue;
    list.push({ minX: a - ox, minY: y0, minZ: b - oz, maxX: c - ox, maxY: y1, maxZ: d - oz, mat });
  }
}

export const levelEnding: LevelDefinition = {
  id: ENDING_LEVEL,
  title: '',
  name: '街',
  subtitle: '人の行き交う路地',
  threatClass: 0,
  chunkSize: S,
  ceilingHeight: 40,
  palette: {
    wallTex: 'gen:concrete:8a8680:501',
    floorTex: 'gen:floor-concrete:3c3c40:502',
    ceilingTex: 'white',
    lightColor: 0xffffff,
    fogColor: SKY_PRESETS.dusk.horizon,
    fogDensity: 0.018,
    ambient: 0.5,
    lightTint: [1, 0.95, 0.88],
  },
  generator: (ctx, cx, cz): ChunkData => {
    const solids: Box[] = [];
    const decor: Box[] = [];
    const base: ChunkData = { levelId: ctx.level.id, cx, cz, size: S, solids, decor, lights: [], floors: [], ceilings: [], items: [], props: [], zones: [] };
    const ox = cx * S;
    const oz = cz * S;
    if (ox > STREET_W + 20 || ox + S < -STREET_W - 20 || oz > STREET_L + 10 || oz + S < -STREET_L - 10) return base;
    clipInto(solids, LAYOUT.solids, ox, oz);
    clipInto(decor, LAYOUT.decor, ox, oz);
    const a = Math.max(-STREET_W, ox);
    const b = Math.max(-STREET_L - 1, oz);
    const c = Math.min(STREET_W, ox + S);
    const d = Math.min(STREET_L + 1, oz + S);
    if (c > a && d > b) base.floors.push({ x0: a - ox, z0: b - oz, x1: c - ox, z1: d - oz, y: 0 });
    for (const p of LAYOUT.props) if (p.x >= ox && p.x < ox + S && p.z >= oz && p.z < oz + S) base.props.push({ ...p, x: p.x - ox, z: p.z - oz });
    return base;
  },
  lightSampler: (_ctx, cx, cz) =>
    sampler(
      0.62,
      SKY_PRESETS.dusk.sunDir,
      LAYOUT.lights.filter((l) => Math.abs(l.x - (cx + 0.5) * S) < S && Math.abs(l.z - (cz + 0.5) * S) < S),
    ),
  setPieces: [],
  lootTable: { perCell: 0, rules: [] },
  exits: [],
  drainMul: 0,
  hallucination: 0,
  footstep: 'concrete',
  ambience: { humFreq: 0, humGain: 0, noiseGain: 0.01, noiseCutoff: 900 },
  environment: 'open-sky',
  sky: { kind: 'dusk' },
  kindLabel: 'エンディング',
  topology: 'closed',
  spawn: { x: 3.9, y: 0.12, z: 59.2, yaw: 0 },
  arrival: () => ({ x: 3.9, y: 0.12, z: 59.2, yaw: 0 }),
};
