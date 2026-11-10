/**
 * Poolrooms (Level 37 and random "poolrooms" levels), after the reference
 * images: small white tiles everywhere, a sheet of shallow turquoise water,
 * a spiral stair around a tiled column rising into a skylight, curved tiled
 * corridors, raised pools with tiled rims, round pillars, coffered ceilings
 * with cove lights, windows full of bright clouds, arched openings and
 * colourful water slides. Every chunk is one room; each chunk owns its west
 * and north walls (with at least one opening), so neighbours always match.
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { Box } from '../../world/chunkData';
import type { ChunkData } from '../../world/chunkData';
import type { GenContext, LightSampler, SpawnPoint } from '../levelDefinition';
import { box, emptyOut, neighbourLights, sampler, toChunk, type Light, type Out } from './kit';

export interface PoolParams {
  /** Ceiling height of ordinary rooms. */
  H: number;
  water: string;
  /** Room type weights: spiral, curve, pools, slides, hall, tunnel. */
  weights: [number, number, number, number, number, number];
  slideMats: string[];
  /** Brightness of the leaking daylight. */
  sun: number;
}

const S = 32;
const WT = 0.4; // wall thickness
const WATER_Y = 0.18;

type Room = 'spiral' | 'curve' | 'pools' | 'slides' | 'hall' | 'tunnel';
const ROOMS: Room[] = ['spiral', 'curve', 'pools', 'slides', 'hall', 'tunnel'];

export function roomOf(seed: number, p: PoolParams, cx: number, cz: number): Room {
  if (cx === 0 && cz === 0) return 'hall'; // a calm arrival room
  const total = p.weights.reduce((a, b) => a + b, 0);
  let x = hash01(seed, 1201, cx, cz) * total;
  for (let i = 0; i < ROOMS.length; i++) {
    x -= p.weights[i];
    if (x < 0) return ROOMS[i];
  }
  return 'hall';
}

/** Arc of wall segments (axis-aligned boxes approximating a curve). */
function arc(list: Box[], cx: number, cz: number, r: number, a0: number, a1: number, n: number, y0: number, y1: number, th: number, mat: string): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + 0.5) / n) * (a1 - a0);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const seg = (Math.abs(a1 - a0) * r) / n;
    const w = seg * 0.75 + th;
    box(list, x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, mat);
  }
}

/** Round pillar: a few nested boxes reading as a cylinder. */
function pillar(o: Out, x: number, z: number, r: number, y0: number, y1: number): void {
  box(o.solids, x - r, y0, z - r * 0.55, x + r, y1, z + r * 0.55, 'wall');
  box(o.solids, x - r * 0.55, y0, z - r, x + r * 0.55, y1, z + r, 'wall');
  box(o.solids, x - r * 0.85, y0, z - r * 0.85, x + r * 0.85, y1, z + r * 0.85, 'wall');
}

/** Wall along one chunk edge with openings (arches or tall gaps) and cloud windows. */
function edgeWall(o: Out, seed: number, p: PoolParams, cx: number, cz: number, axis: 'x' | 'z'): void {
  const H = p.H;
  // West wall (axis 'x': the line x = 0) or north wall ('z': the line z = 0).
  const rng = new Rng(hashInts(seed, 1202, cx, cz, axis === 'x' ? 0 : 1));
  const n = 1 + (rng.chance(0.4) ? 1 : 0);
  const gaps: Array<[number, number, boolean]> = [];
  for (let k = 0; k < n; k++) {
    const w = rng.pick([3, 4, 6]);
    const at = k === 0 ? 6 + rng.float() * (S - 12 - w) : (gaps[0][0] < 16 ? 18 : 3) + rng.float() * 8;
    gaps.push([at, at + w, rng.chance(0.6)]);
  }
  gaps.sort((a, b) => a[0] - b[0]);
  const seg = (a: number, b: number, y0: number, y1: number, mat = 'wall') => {
    if (b - a < 0.05) return;
    if (axis === 'x') box(o.solids, -WT / 2, y0, a, WT / 2, y1, b, mat);
    else box(o.solids, a, y0, -WT / 2, b, y1, WT / 2, mat);
  };
  let pos = 0;
  for (const [a, b, arch] of gaps) {
    const from = Math.max(pos, 0);
    // Solid stretch, sometimes with a long window of bright clouds.
    if (a - from > 6 && rng.chance(0.45)) {
      const w0 = from + 1;
      const w1 = a - 1;
      seg(from, w0, 0, H);
      seg(w1, a, 0, H);
      seg(w0, w1, 0, 1.2);
      seg(w0, w1, 3.0, H);
      // the window itself: a thin self-lit pane in the middle of the wall
      if (axis === 'x') box(o.decor, -0.02, 1.2, w0, 0.02, 3.0, w1, 'clouds-window');
      else box(o.decor, w0, 1.2, -0.02, w1, 3.0, 0.02, 'clouds-window');
      const mid = (w0 + w1) / 2;
      // Daylight pouring in: a strong light near the window and a softer one further in.
      for (const side of [-1, 1]) {
        o.lights.push(axis === 'x' ? { x: side * 2.0, y: 2.2, z: mid, I: 7 * p.sun } : { x: mid, y: 2.2, z: side * 2.0, I: 7 * p.sun });
        o.lights.push(axis === 'x' ? { x: side * 7, y: 0.6, z: mid, I: 3 * p.sun } : { x: mid, y: 0.6, z: side * 7, I: 3 * p.sun });
      }
      o.zones.push({ kind: 'piece', name: 'cloud-window', x0: axis === 'x' ? 0 : w0, z0: axis === 'x' ? w0 : 0, x1: axis === 'x' ? 3 : w1, z1: axis === 'x' ? w1 : 3 });
    } else seg(from, a, 0, H);
    // The opening: an arch (stepped curve) or a full-height gap.
    if (arch) {
      // A round-topped arch built from stepped blocks on both sides.
      const w = b - a;
      const mid = (a + b) / 2;
      const R = Math.min(w / 2, H - 2.6);
      const spring = H - R - 0.2;
      for (let k = 0; k < 5; k++) {
        const ya = spring + (k * R) / 5;
        const yb = ya + R / 5;
        const hw = (w / 2) * Math.sqrt(Math.max(0, 1 - ((k + 1) / 5) ** 2));
        seg(a, mid - hw, ya, yb);
        seg(mid + hw, b, ya, yb);
      }
      seg(a, b, spring + R, H);
    }
    pos = b;
  }
  seg(pos, S, 0, H);
}

/** The room contents of a chunk (local coordinates, y = 0 is the tiled floor). */
export function poolRoomOut(seed: number, p: PoolParams, cx: number, cz: number): Out {
  const o = emptyOut();
  const H = p.H;
  const room = roomOf(seed, p, cx, cz);
  const rng = new Rng(hashInts(seed, 1203, cx, cz));
  edgeWall(o, seed, p, cx, cz, 'x');
  edgeWall(o, seed, p, cx, cz, 'z');
  // Floor (holes for sunken pools are cut below), ceiling with coffers.
  const holes: Array<{ x0: number; z0: number; x1: number; z1: number; depth: number }> = [];
  let top = H;
  const coffer = (x0: number, z0: number, x1: number, z1: number, rise: number) => {
    // A recessed panel in the ceiling with a glowing cove around it.
    o.ceilings.push({ x0, z0, x1, z1, y: top + rise });
    box(o.decor, x0 - 0.02, top, z0 - 0.02, x1 + 0.02, top + rise, z0, 'wall');
    box(o.decor, x0 - 0.02, top, z1, x1 + 0.02, top + rise, z1 + 0.02, 'wall');
    box(o.decor, x0 - 0.02, top, z0, x0, top + rise, z1, 'wall');
    box(o.decor, x1, top, z0, x1 + 0.02, top + rise, z1, 'wall');
    box(o.decor, x0 + 0.1, top + rise - 0.08, z0 + 0.1, x1 - 0.1, top + rise - 0.05, z0 + 0.25, 'cove-glow');
    box(o.decor, x0 + 0.1, top + rise - 0.08, z1 - 0.25, x1 - 0.1, top + rise - 0.05, z1 - 0.1, 'cove-glow');
    o.lights.push({ x: (x0 + x1) / 2, y: top, z: (z0 + z1) / 2, I: 3.5 });
  };
  const ceilingWithHoles = (rects: Array<[number, number, number, number]>, y: number) => {
    // Ceiling rectangles around up to a few rectangular holes (simple sweep in x).
    const xs = [0, S, ...rects.flatMap((r) => [r[0], r[2]])].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i];
      const xb = xs[i + 1];
      if (xb - xa < 0.01) continue;
      const zs = [0, S];
      for (const r of rects) if (r[0] <= xa && r[2] >= xb) zs.push(r[1], r[3]);
      zs.sort((a, b) => a - b);
      for (let j = 0; j < zs.length - 1; j++) {
        const za = zs[j];
        const zb = zs[j + 1];
        const inHole = rects.some((r) => r[0] <= xa && r[2] >= xb && r[1] <= za && r[3] >= zb);
        if (!inHole && zb - za > 0.01) o.ceilings.push({ x0: xa, z0: za, x1: xb, z1: zb, y });
      }
    }
  };

  switch (room) {
    case 'spiral': {
      // A tiled column with a spiral stair rising into a skylight shaft.
      const mx = 16;
      const mz = 16;
      const rc = 1.5;
      pillar(o, mx, mz, rc, 0, H + 7);
      const n = Math.round(H / 0.25);
      const a0 = rng.float() * Math.PI * 2;
      const STEP_A = 0.34;
      const stepT = (k: number) => 0.25 * (k + 1);
      for (let k = 0; k < n; k++) {
        const a = a0 + k * STEP_A;
        const t = stepT(k);
        for (const r of [2.2, 3.2]) {
          const x = mx + Math.cos(a) * r;
          const z = mz + Math.sin(a) * r;
          box(o.solids, x - 0.6, t - 0.22, z - 0.6, x + 0.6, t, z + 0.6, 'wall');
        }
      }
      // Landing at the top: only where it does not hang over the stair's upper
      // steps (a slab at head height there used to stop you halfway up). The
      // last step is level with it, so you walk straight off onto it.
      const angDist = (a: number, b: number) => {
        const d = (((a - b) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        return Math.abs(d);
      };
      const landing: number[] = [];
      for (let k = 0; k < 36; k++) {
        const a = a0 + (k / 36) * Math.PI * 2;
        let clear = true;
        for (let j = 0; j < n; j++) {
          const t = stepT(j);
          if (t > H - 2.6 && t < H - 0.01 && angDist(a, a0 + j * STEP_A) < 0.5) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        landing.push(a);
        const x = mx + Math.cos(a) * 2.7;
        const z = mz + Math.sin(a) * 2.7;
        box(o.solids, x - 0.75, H - 0.22, z - 0.75, x + 0.75, H, z + 0.75, 'wall');
      }
      const ad = landing.length ? landing[Math.floor(landing.length / 2)] : a0 + (n + 4) * STEP_A;
      o.props.push({ uid: 'spiral-door', kind: 'plain-door', x: mx + Math.cos(ad) * (rc + 0.95), y: H, z: mz + Math.sin(ad) * (rc + 0.95), rotY: Math.atan2(Math.cos(ad), Math.sin(ad)), color: 0xf2f0e6 });
      // The shaft above: tiled walls up to a bright skylight
      // Round opening in the ceiling (stepped), a tiled shaft and a skylight above.
      const hw = 4.6;
      ceilingWithHoles([[mx - hw, mz - hw, mx + hw, mz + hw]], H);
      arc(o.solids, mx, mz, hw - 0.3, 0, Math.PI * 2, 24, H, H + 7, 0.3, 'wall');
      box(o.decor, mx - hw, H + 7, mz - hw, mx + hw, H + 7.1, mz + hw, 'daylight');
      o.lights.push({ x: mx, y: H + 5, z: mz, I: 14 * p.sun }, { x: mx, y: 1.5, z: mz + 3, I: 3 * p.sun });
      o.zones.push({ kind: 'piece', name: 'spiral-stair', x0: mx - 4, z0: mz - 4, x1: mx + 4, z1: mz + 4 });
      top = H;
      break;
    }
    case 'curve': {
      // Curved tiled corridor: two concentric arcs, open at both ends.
      const mx = 16;
      const up = rng.chance(0.5);
      const mz = up ? 8 : 24;
      const a0 = up ? 0.2 : Math.PI + 0.2;
      arc(o.solids, mx, mz, 6, a0, a0 + Math.PI - 0.4, 14, 0, H, WT, 'wall');
      arc(o.solids, mx, mz, 10, a0, a0 + Math.PI - 0.4, 22, 0, H, WT, 'wall');
      const ae = a0 + Math.PI - 0.2;
      o.lights.push({ x: mx + Math.cos(ae) * 8, y: 2.5, z: mz + Math.sin(ae) * 8, I: 6 * p.sun });
      o.lights.push({ x: mx + Math.cos(a0) * 8, y: 2.5, z: mz + Math.sin(a0) * 8, I: 3 * p.sun });
      o.zones.push({ kind: 'piece', name: 'curved-corridor', x0: mx - 10, z0: mz - 10, x1: mx + 10, z1: mz + 10 });
      ceilingWithHoles([], H);
      break;
    }
    case 'pools': {
      // Raised pools with tiled rims, round pillars, coffered ceiling.
      const pools: Array<[number, number, number, number]> = [];
      for (let k = 0; k < 2 + rng.int(0, 1); k++) {
        const w = rng.range(5, 9);
        const d = rng.range(4, 7);
        const x0 = 2 + rng.float() * (S - 4 - w);
        const z0 = 2 + rng.float() * (S - 4 - d);
        if (pools.some((q) => x0 < q[2] + 1.5 && x0 + w > q[0] - 1.5 && z0 < q[3] + 1.5 && z0 + d > q[1] - 1.5)) continue;
        pools.push([x0, z0, x0 + w, z0 + d]);
        const r = 0.45;
        box(o.solids, x0 - r, 0, z0 - r, x0 + w + r, 0.45, z0, 'wall');
        box(o.solids, x0 - r, 0, z0 + d, x0 + w + r, 0.45, z0 + d + r, 'wall');
        box(o.solids, x0 - r, 0, z0, x0, 0.45, z0 + d, 'wall');
        box(o.solids, x0 + w, 0, z0, x0 + w + r, 0.45, z0 + d, 'wall');
        holes.push({ x0, z0, x1: x0 + w, z1: z0 + d, depth: 1.3 });
        box(o.decor, x0, 0.3, z0, x0 + w, 0.32, z0 + d, p.water);
        // steps down inside
        box(o.solids, x0, -1.3, z0, x0 + 0.9, -0.6, z0 + 1.2, 'wall');
        box(o.solids, x0, -0.6, z0, x0 + 0.9, 0.0, z0 + 0.6, 'wall');
        o.zones.push({ kind: 'water', x0, z0, x1: x0 + w, z1: z0 + d });
        o.lights.push({ x: x0 + w / 2, y: -0.3, z: z0 + d / 2, I: 1.6 });
      }
      for (let k = 0; k < 6; k++) {
        const x = 3 + rng.float() * 26;
        const z = 3 + rng.float() * 26;
        if (pools.some((q) => x > q[0] - 2 && x < q[2] + 2 && z > q[1] - 2 && z < q[3] + 2)) continue;
        pillar(o, x, z, 0.55, 0, H);
      }
      ceilingWithHoles([[6, 6, 16, 14], [18, 16, 27, 26]], H);
      coffer(6, 6, 16, 14, 0.8);
      coffer(18, 16, 27, 26, 0.8);
      o.zones.push({ kind: 'piece', name: 'raised-pools', x0: 0, z0: 0, x1: S, z1: S });
      if (rng.chance(0.5)) o.items.push({ uid: 'p', id: 'almond_water', x: pools[0] ? pools[0][0] - 0.8 : 8, y: 0, z: pools[0] ? pools[0][1] : 8, rot: 0 });
      break;
    }
    case 'slides': {
      // Tall room: a tower with stairs and colourful slides into a splash pool.
      const H2 = H + 5;
      top = H2;
      const t = 0.2;
      box(o.decor, 0.2, H, 0.2, S - 0.2, H2, 0.2 + t, 'wall');
      box(o.decor, 0.2, H, S - 0.2 - t, S - 0.2, H2, S - 0.2, 'wall');
      box(o.decor, 0.2, H, 0.2, 0.2 + t, H2, S - 0.2, 'wall');
      box(o.decor, S - 0.2 - t, H, 0.2, S - 0.2, H2, S - 0.2, 'wall');
      ceilingWithHoles([], H2);
      // Tower platform (6 m); a straight stair climbs to it along +z -> -z.
      const tx = 6;
      const tz = 4;
      const ph = 6;
      box(o.solids, tx, 0, tz, tx + 6, ph, tz + 4, 'wall');
      for (let k = 0; k < 24; k++) {
        const z = tz + 16 - (k + 1) * 0.5;
        box(o.solids, tx + 4, (k + 1) * 0.25 - 0.25, z, tx + 6, (k + 1) * 0.25, z + 0.5, 'wall');
      }
      // Spiral slide (helix) from the tower's east side down into the splash pool
      const sx = 20;
      const sz = tz + 4;
      const mat1 = p.slideMats[rng.int(0, p.slideMats.length - 1)];
      const mat2 = p.slideMats[rng.int(0, p.slideMats.length - 1)];
      const n = 34;
      for (let k = 0; k < n; k++) {
        const a = Math.PI + k * 0.3;
        const y = ph - 0.2 - (k + 1) * ((ph - 0.6) / n);
        const x = sx + Math.cos(a) * 3.4;
        const z = sz + Math.sin(a) * 3.4;
        box(o.solids, x - 0.7, y - 0.15, z - 0.7, x + 0.7, y, z + 0.7, k % 2 ? mat1 : mat2);
        const rx = sx + Math.cos(a) * 4.3;
        const rz = sz + Math.sin(a) * 4.3;
        box(o.solids, rx - 0.15, y, rz - 0.15, rx + 0.15, y + 0.6, rz + 0.15, mat1);
      }
      // a short bridge from the tower top to the start of the helix
      box(o.solids, tx + 6, ph - 0.2, sz - 1, sx - 3.4 + 0.6, ph, sz + 1, mat2);
      // Splash pool under the helix
      holes.push({ x0: sx - 2.2, z0: sz - 2.2, x1: sx + 2.2, z1: sz + 2.2, depth: 1.8 });
      box(o.decor, sx - 2.2, 0.0, sz - 2.2, sx + 2.2, 0.02, sz + 2.2, p.water);
      o.zones.push({ kind: 'water', x0: sx - 4.5, z0: sz - 4.5, x1: sx + 4.5, z1: sz + 4.5 });
      // A long straight slide from the tower's south edge down to the floor
      const mat3 = p.slideMats[rng.int(0, p.slideMats.length - 1)];
      for (let k = 0; k < 20; k++) {
        const y = ph - (k + 1) * ((ph - 0.3) / 20);
        const z = tz + 4 + k * 0.6;
        box(o.solids, tx + 0.4, y - 0.15, z, tx + 2.4, y, z + 0.62, mat3);
        box(o.solids, tx + 0.2, y, z, tx + 0.4, y + 0.5, z + 0.62, mat3);
        box(o.solids, tx + 2.4, y, z, tx + 2.6, y + 0.5, z + 0.62, mat3);
      }
      o.lights.push({ x: sx, y: H2 - 1, z: sz, I: 5 * p.sun }, { x: tx + 2, y: H2 - 1, z: tz + 10, I: 4 * p.sun });
      box(o.decor, 10, H2 - 0.05, 10, 22, H2 - 0.02, 22, 'daylight');
      o.zones.push({ kind: 'piece', name: 'water-slide', x0: 4, z0: 4, x1: 26, z1: 28 });
      o.items.push({ uid: 's', id: 'almond_water', x: tx + 2, y: ph, z: tz + 2, rot: 0 });
      break;
    }
    case 'tunnel': {
      // A long arched tunnel of tiles crossing the room, water running through it.
      const alongX = rng.chance(0.5);
      const c0 = 13;
      const c1 = 19;
      const wall = (a0: number, a1: number) => {
        if (alongX) box(o.solids, 2, 0, a0, 30, H - 1.2, a1, 'wall');
        else box(o.solids, a0, 0, 2, a1, H - 1.2, 30, 'wall');
      };
      wall(c0 - 0.4, c0);
      wall(c1, c1 + 0.4);
      // vaulted top
      for (let k = 0; k < 4; k++) {
        const inset = [0.3, 0.8, 1.5, 2.5][k];
        const y = H - 1.2 + k * 0.3;
        if (alongX) box(o.solids, 2, y, c0 - 0.4, 30, y + 0.3, c0 + inset, 'wall'), box(o.solids, 2, y, c1 - inset, 30, y + 0.3, c1 + 0.4, 'wall');
        else box(o.solids, c0 - 0.4, y, 2, c0 + inset, y + 0.3, 30, 'wall'), box(o.solids, c1 - inset, y, 2, c1 + 0.4, y + 0.3, 30, 'wall');
      }
      o.lights.push(alongX ? { x: 29, y: 2, z: 16, I: 6 * p.sun } : { x: 16, y: 2, z: 29, I: 6 * p.sun });
      o.lights.push({ x: 16, y: 2.2, z: 16, I: 1.2 });
      ceilingWithHoles([], H);
      o.zones.push({ kind: 'piece', name: 'tile-tunnel', x0: alongX ? 2 : c0, z0: alongX ? c0 : 2, x1: alongX ? 30 : c1, z1: alongX ? c1 : 30 });
      break;
    }
    default: {
      // Pillared hall with coffers; sometimes a dark arch you can walk into.
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (rng.chance(0.75)) pillar(o, 6 + i * 10, 6 + j * 10, 0.6, 0, H);
      ceilingWithHoles([[8, 8, 24, 24]], H);
      coffer(8, 8, 24, 24, 0.9);
      if (rng.chance(0.4)) {
        o.props.push({ uid: 'hall-door', kind: 'plain-door', x: 16, y: 0, z: 0.22, rotY: 0, color: 0xf2f0e6 });
        o.zones.push({ kind: 'piece', name: 'tile-door', x0: 14, z0: 0, x1: 18, z1: 3 });
      }
      o.zones.push({ kind: 'piece', name: 'pillared-hall', x0: 0, z0: 0, x1: S, z1: S });
      if (rng.chance(0.4)) o.items.push({ uid: 'h', id: 'almond_water', x: 11, y: 0, z: 11, rot: 0 });
    }
  }

  // Floor with holes and the shallow water sheet over it.
  const rects: Array<[number, number, number, number]> = holes.map((h) => [h.x0, h.z0, h.x1, h.z1]);
  const before = o.ceilings.length;
  ceilingWithHoles(rects, 0);
  const floorRects = o.ceilings.splice(before);
  for (const f of floorRects) {
    o.floors.push(f);
    box(o.decor, f.x0, WATER_Y - 0.02, f.z0, f.x1, WATER_Y, f.z1, p.water);
  }
  for (const h of holes) {
    o.floors.push({ x0: h.x0, z0: h.z0, x1: h.x1, z1: h.z1, y: -h.depth });
    box(o.solids, h.x0 - 0.01, -h.depth, h.z0 - 0.2, h.x1 + 0.01, 0, h.z0, 'wall');
    box(o.solids, h.x0 - 0.01, -h.depth, h.z1, h.x1 + 0.01, 0, h.z1 + 0.2, 'wall');
    box(o.solids, h.x0 - 0.2, -h.depth, h.z0, h.x0, 0, h.z1, 'wall');
    box(o.solids, h.x1, -h.depth, h.z0, h.x1 + 0.2, 0, h.z1, 'wall');
  }
  o.zones.push({ kind: 'water', x0: 0, z0: 0, x1: S, z1: S });
  // A stray bottle by the wall now and then (never over a sunken pool).
  if (hash01(seed, 1207, cx, cz) < 0.45) {
    const bx = 2.5;
    const bz = 29.5;
    if (!holes.some((h) => bx > h.x0 - 0.5 && bx < h.x1 + 0.5 && bz > h.z0 - 0.5 && bz < h.z1 + 0.5)) o.items.push({ uid: 'w', id: 'almond_water', x: bx, y: 0, z: bz, rot: 0 });
  }
  if ((room === 'hall' || room === 'curve') && hash01(seed, 1204, cx, cz) < 0.25) {
    // A tile that gives way
    const x = 22 + rng.float() * 4;
    const z = 3 + rng.float() * 4;
    box(o.decor, x - 0.9, 0.002, z - 0.9, x + 0.9, 0.01, z + 0.9, 'floor-thin');
    o.zones.push({ kind: 'thin-floor', x0: x - 0.9, z0: z - 0.9, x1: x + 0.9, z1: z + 0.9 });
  }
  return o;
}

export function generatePoolrooms(ctx: GenContext, p: PoolParams, cx: number, cz: number): ChunkData {
  return toChunk(ctx, cx, cz, 0, S, poolRoomOut(ctx.levelSeed, p, cx, cz));
}

export function poolroomsSampler(ctx: GenContext, p: PoolParams, cx: number, cz: number): LightSampler {
  const lights: Light[] = neighbourLights(S, cx, cz, (a, b) => poolRoomOut(ctx.levelSeed, p, a, b).lights);
  // Dimmer base so the daylight leaking in from windows, skylights and coves reads as light and shade.
  return sampler(0.13 + 0.06 * p.sun, null, lights);
}

export function poolroomsArrival(ctx: GenContext, p: PoolParams, h: number): SpawnPoint {
  // Arrive in a pillared hall near its centre (always open floor).
  for (let k = 0; k < 60; k++) {
    const cx = Math.floor(hash01(ctx.levelSeed, 1205, h, k) * 16) - 8;
    const cz = Math.floor(hash01(ctx.levelSeed, 1206, h, k) * 16) - 8;
    if (roomOf(ctx.levelSeed, p, cx, cz) === 'hall') return { x: cx * S + 11, y: 0, z: cz * S + 16, yaw: -Math.PI / 2 };
  }
  return { x: 11, y: 0, z: 16, yaw: -Math.PI / 2 };
}
