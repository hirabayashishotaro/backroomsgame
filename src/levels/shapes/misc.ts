/**
 * More shaped worlds (pure): the endless tunnel (linear), the Temple of Time
 * and the Colossus (closed), the glass void, the corridor of floating books,
 * night rooftops, and layered caves (vertical + horizontal).
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { GenContext, LightSampler, SpawnPoint } from '../levelDefinition';
import type { ChunkData } from '../../world/chunkData';
import { box, emptyOut, fbm2, noise2, sampler, toChunk, neighbourLights, type Light, type Out } from './kit';

// ---------------------------------------------------------------------------
// Endless tunnel (Level 222): one straight tunnel along x, no branches.
// ---------------------------------------------------------------------------

export interface TunnelParams {
  wallMat: string;
  floorMat: string;
  rails: boolean;
  width: number;
  height: number;
}

const TZ = 16; // tunnel centre line

function tunnelOut(seed: number, p: TunnelParams, cx: number): Out {
  const o = emptyOut();
  const w = p.width / 2;
  const z0 = TZ - w;
  const z1 = TZ + w;
  o.floors.push({ x0: 0, z0, x1: 32, z1, y: 0 });
  o.ceilings.push({ x0: 0, z0, x1: 32, z1, y: p.height });
  for (let k = 0; k < 4; k++) {
    const x0 = k * 8;
    const gx = cx * 4 + k;
    const r = hash01(seed, 501, gx);
    const side = hash01(seed, 502, gx) < 0.5 ? -1 : 1;
    const zw = side < 0 ? z0 : z1;
    const inward = -side;
    // Walls in 8 m panels; a thin (noclippable) panel now and then.
    const thin = r > 0.97;
    const wl = box(o.solids, x0, 0, z0 - 0.4, x0 + 8, p.height, z0, thin && side < 0 ? 'wall-thin' : p.wallMat);
    const wr = box(o.solids, x0, 0, z1, x0 + 8, p.height, z1 + 0.4, thin && side > 0 ? 'wall-thin' : p.wallMat);
    if (thin) (side < 0 ? wl : wr).thin = true;
    // Ribs every 8 m and a lamp
    box(o.solids, x0, p.height - 0.4, z0, x0 + 0.5, p.height, z1, p.wallMat);
    box(o.decor, x0 + 3.8, p.height - 0.08, TZ - 0.2, x0 + 4.4, p.height - 0.02, TZ + 0.2, 'glow');
    o.lights.push({ x: x0 + 4, y: p.height - 0.3, z: TZ, I: hash01(seed, 503, gx) < 0.1 ? 0.2 : 1.6 });
    if (p.rails) {
      box(o.decor, x0, 0, TZ - 0.8, x0 + 8, 0.12, TZ - 0.7, 'metal');
      box(o.decor, x0, 0, TZ + 0.7, x0 + 8, 0.12, TZ + 0.8, 'metal');
    }
    // Something on the wall of this panel
    if (r < 0.18) {
      o.props.push({ uid: 'td' + k, kind: 'plain-door', x: x0 + 4, y: 0, z: zw + inward * 0.02, rotY: side < 0 ? 0 : Math.PI, color: 0x6a6e74 });
      o.zones.push({ kind: 'piece', name: 'side-door', x0, z0, x1: x0 + 8, z1 });
    } else if (r < 0.3) {
      // A vending machine glowing in an alcove
      box(o.solids, x0 + 3, 0, zw + inward * 0.05, x0 + 4.2, 1.9, zw + inward * 0.9, 'aero-white');
      box(o.decor, x0 + 3.1, 0.7, zw + inward * 0.92, x0 + 4.1, 1.7, zw + inward * 0.94, 'glow-blue');
      o.lights.push({ x: x0 + 3.6, y: 1.2, z: zw + inward * 1.4, I: 1.2 });
      o.items.push({ uid: 'vm' + k, id: 'almond_water', x: x0 + 3.6, y: 0, z: zw + inward * 1.4, rot: 0 });
      o.zones.push({ kind: 'piece', name: 'vending', x0, z0, x1: x0 + 8, z1 });
    } else if (r < 0.4) {
      // Rubble to jump over
      box(o.solids, x0 + 2, 0, z0, x0 + 3.2, 0.9, z1 - 1.2, 'stone');
      o.zones.push({ kind: 'piece', name: 'rubble', x0, z0, x1: x0 + 8, z1 });
    } else if (r < 0.5) {
      // An emergency phone and a sign
      box(o.solids, x0 + 5, 1, zw + inward * 0.05, x0 + 5.5, 1.6, zw + inward * 0.3, 'red-light');
      box(o.decor, x0 + 1, 2.4, zw + inward * 0.03, x0 + 3, 3.0, zw + inward * 0.06, 'exit-sign');
      o.zones.push({ kind: 'piece', name: 'phone', x0, z0, x1: x0 + 8, z1 });
    } else if (r < 0.55) {
      box(o.decor, x0 + 2, 0.003, TZ - 0.9, x0 + 3.8, 0.01, TZ + 0.9, 'floor-thin');
      o.zones.push({ kind: 'thin-floor', x0: x0 + 2, z0: TZ - 0.9, x1: x0 + 3.8, z1: TZ + 0.9 });
    } else if (r < 0.62) {
      // A window onto something that should not be there
      box(o.decor, x0 + 2, 1.2, zw + inward * 0.02, x0 + 6, 2.6, zw + inward * 0.04, hash01(seed, 504, gx) < 0.5 ? 'daylight' : 'portal');
      o.zones.push({ kind: 'piece', name: 'window', x0, z0, x1: x0 + 8, z1 });
    }
  }
  return o;
}

export function generateTunnel(ctx: GenContext, p: TunnelParams, cx: number, cz: number): ChunkData {
  if (cz !== 0) return toChunk(ctx, cx, cz, 0, 32, emptyOut());
  return toChunk(ctx, cx, cz, 0, 32, tunnelOut(ctx.levelSeed, p, cx));
}

export function tunnelSampler(ctx: GenContext, p: TunnelParams, cx: number, cz: number): LightSampler {
  if (cz !== 0) return sampler(0.05, null, []);
  const lights = neighbourLights(32, cx, 0, (a, b) => (b === 0 ? tunnelOut(ctx.levelSeed, p, a).lights : []));
  return sampler(0.05, null, lights);
}

export function tunnelArrival(ctx: GenContext, h: number): SpawnPoint {
  const cx = Math.floor(hash01(ctx.levelSeed, 505, h) * 200) - 100;
  return { x: cx * 32 + 0.6, y: 0, z: TZ, yaw: -Math.PI / 2 };
}

// ---------------------------------------------------------------------------
// Temple of Time (Level 1000): a single grand hall with twelve doors.
// ---------------------------------------------------------------------------

export const TEMPLE_S = 64;
const TX0 = 12;
const TX1 = 52;
const TH = 18;

export function generateTemple(ctx: GenContext, cx: number, cz: number): ChunkData {
  const o = emptyOut();
  if (cx === 0 && cz === 0) {
    const t = 1.2;
    o.floors.push({ x0: TX0, z0: TX0, x1: TX1, z1: TX1, y: 0 });
    o.ceilings.push({ x0: TX0, z0: TX0, x1: TX1, z1: TX1, y: TH });
    box(o.solids, TX0 - t, 0, TX0 - t, TX1 + t, TH, TX0, 'marble');
    box(o.solids, TX0 - t, 0, TX1, TX1 + t, TH, TX1 + t, 'marble');
    box(o.solids, TX0 - t, 0, TX0, TX0, TH, TX1, 'marble');
    const east = box(o.solids, TX1, 0, TX0, TX1 + t, TH, TX1, 'marble');
    void east;
    // A thin panel in the east wall (the one way out that is not a door)
    box(o.decor, TX1 - 0.02, 0, 30, TX1, 4, 34, 'wall-thin');
    o.solids.push({ minX: TX1 - 0.3, maxX: TX1, minY: 0, maxY: 4, minZ: 30, maxZ: 34, mat: 'wall-thin', thin: true });
    // Twelve doors, three per wall, perfectly spaced (the east wall's middle door
    // stands just beside the thin panel).
    const mid = (TX0 + TX1) / 2;
    let n = 0;
    for (const off of [-12, 0, 12]) {
      o.props.push({ uid: 'td' + n++, kind: 'plain-door', x: mid + off, y: 0, z: TX0 + 0.02, rotY: 0, color: 0xd8c890 });
      o.props.push({ uid: 'td' + n++, kind: 'plain-door', x: mid + off, y: 0, z: TX1 - 0.02, rotY: Math.PI, color: 0xd8c890 });
      o.props.push({ uid: 'td' + n++, kind: 'plain-door', x: TX0 + 0.02, y: 0, z: mid + off, rotY: Math.PI / 2, color: 0xd8c890 });
      o.props.push({ uid: 'td' + n++, kind: 'plain-door', x: TX1 - 0.02, y: 0, z: mid + (off === 0 ? -5 : off), rotY: -Math.PI / 2, color: 0xd8c890 });
    }
    // Columns in a ring
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = mid + Math.cos(a) * 14;
      const z = mid + Math.sin(a) * 14;
      box(o.solids, x - 0.8, 0, z - 0.8, x + 0.8, TH, z + 0.8, 'marble');
    }
    // The clock on the north wall: twelve marks and two hands
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = mid + Math.cos(a) * 5;
      const y = 11 + Math.sin(a) * 5;
      box(o.decor, x - 0.3, y - 0.3, TX0 + 0.02, x + 0.3, y + 0.3, TX0 + 0.08, 'glow');
    }
    box(o.decor, mid - 0.15, 11, TX0 + 0.05, mid + 0.15, 15, TX0 + 0.1, 'bronze');
    box(o.decor, mid, 10.85, TX0 + 0.05, mid + 3, 11.15, TX0 + 0.1, 'bronze');
    o.zones.push({ kind: 'piece', name: 'clock', x0: mid - 6, z0: TX0, x1: mid + 6, z1: TX0 + 6 });
    // Central dais with a sun disc (a gate of light)
    box(o.solids, mid - 4, 0, mid - 4, mid + 4, 0.4, mid + 4, 'marble');
    box(o.decor, mid - 1.5, 0.41, mid - 1.5, mid + 1.5, 0.43, mid + 1.5, 'glow');
    o.zones.push({ kind: 'gate', x0: mid - 1.2, z0: mid - 1.2, x1: mid + 1.2, z1: mid + 1.2 });
    o.zones.push({ kind: 'piece', name: 'dais', x0: mid - 4, z0: mid - 4, x1: mid + 4, z1: mid + 4 });
    o.zones.push({ kind: 'piece', name: 'twelve-doors', x0: TX0, z0: TX0, x1: TX0 + 3, z1: TX1 });
    o.zones.push({ kind: 'piece', name: 'colonnade', x0: TX0 + 3, z0: TX0 + 3, x1: TX1 - 3, z1: TX1 - 3 });
    // Skylight
    box(o.decor, mid - 3, TH - 0.05, mid - 3, mid + 3, TH - 0.02, mid + 3, 'daylight');
    o.items.push({ uid: 'w', id: 'almond_water', x: mid + 2.5, y: 0.4, z: mid, rot: 0 }, { uid: 'w2', id: 'almond_water', x: mid - 2.5, y: 0.4, z: mid, rot: 0 });
  }
  return toChunk(ctx, cx, cz, 0, TEMPLE_S, o);
}

export function templeSampler(): LightSampler {
  const mid = (TX0 + TX1) / 2;
  return sampler(0.45, null, [
    { x: mid, y: TH - 1, z: mid, I: 12 },
    { x: mid, y: 11, z: TX0 + 1, I: 3 },
  ]);
}

// ---------------------------------------------------------------------------
// The Colossus (Level 900): a plaza in the void, one gigantic statue, one door.
// ---------------------------------------------------------------------------

export function generateColossus(ctx: GenContext, cx: number, cz: number): ChunkData {
  const o = emptyOut();
  if (cx === 0 && cz === 0) {
    const P0 = 4;
    const P1 = 60;
    o.floors.push({ x0: P0, z0: P0, x1: P1, z1: P1, y: 0 });
    box(o.solids, P0, -3, P0, P1, -0.01, P1, 'stone');
    const m = 32;
    const k = 5; // scale: ~55 m tall
    const s = (v: number) => v * k;
    const b = 2;
    box(o.solids, m - s(2.2), 0, m - s(2.2), m + s(2.2), b, m + s(2.2), 'stone');
    box(o.solids, m - s(1.3), b, m - s(0.6), m - s(0.35), b + s(4.2), m + s(0.6), 'bronze');
    box(o.solids, m + s(0.35), b, m - s(0.6), m + s(1.3), b + s(4.2), m + s(0.6), 'bronze');
    box(o.solids, m - s(1.7), b + s(4.2), m - s(0.85), m + s(1.7), b + s(8), m + s(0.85), 'bronze');
    box(o.solids, m - s(2.5), b + s(4.4), m - s(0.5), m - s(1.75), b + s(7.9), m + s(0.5), 'bronze');
    box(o.solids, m + s(1.75), b + s(4.4), m - s(0.5), m + s(2.5), b + s(7.9), m + s(0.5), 'bronze');
    box(o.solids, m - s(0.35), b + s(8), m - s(0.35), m + s(0.35), b + s(8.5), m + s(0.35), 'bronze');
    box(o.solids, m - s(0.9), b + s(8.5), m - s(0.9), m + s(0.9), b + s(10.2), m + s(0.9), 'bronze');
    // Steps up the pedestal and a glowing mark at the statue's feet
    for (let i = 0; i < 4; i++) box(o.solids, m - 3, 0, m + s(2.2) + 2.4 - i * 0.6, m + 3, (i + 1) * 0.5, m + s(2.2) + 3 - i * 0.6, 'stone');
    box(o.decor, m - 1.5, b + 0.01, m + s(0.6) + 1, m + 1.5, b + 0.03, m + s(0.6) + 4, 'glow');
    o.zones.push({ kind: 'gate', x0: m - 1.3, z0: m + s(0.6) + 1.2, x1: m + 1.3, z1: m + s(0.6) + 3.8 });
    o.zones.push({ kind: 'piece', name: 'colossus', x0: m - s(2.2), z0: m - s(2.2), x1: m + s(2.2), z1: m + s(2.2) });
    // The single door at the plaza's edge
    box(o.solids, m - 1.2, 0, P0 + 0.5, m + 1.2, 2.6, P0 + 0.8, 'stone');
    o.props.push({ uid: 'only', kind: 'plain-door', x: m, y: 0, z: P0 + 0.82, rotY: 0, color: 0x8a6234 });
    o.zones.push({ kind: 'piece', name: 'only-door', x0: m - 3, z0: P0, x1: m + 3, z1: P0 + 4 });
    o.zones.push({ kind: 'piece', name: 'plaza-edge', x0: P1 - 3, z0: P0, x1: P1, z1: P1 });
    o.items.push({ uid: 'a', id: 'almond_water', x: m + 4, y: 0, z: P0 + 3, rot: 0 }, { uid: 'b', id: 'almond_water', x: m - 8, y: 0, z: m + 20, rot: 0 });
  }
  return toChunk(ctx, cx, cz, 0, 64, o);
}

// ---------------------------------------------------------------------------
// The glass void (Level NULL): an endless transparent floor and nothing else.
// ---------------------------------------------------------------------------

export function generateGlassVoid(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  box(o.solids, 0, -0.3, 0, 32, 0, 32, 'glass-floor');
  for (let i = 0; i <= 8; i++) {
    box(o.decor, i * 4 - 0.01, -0.29, 0, i * 4 + 0.01, -0.28, 32, 'gem-blue');
    box(o.decor, 0, -0.29, i * 4 - 0.01, 32, -0.28, i * 4 + 0.01, 'gem-blue');
  }
  const r = hash01(seed, 520, cx, cz);
  if (r < 0.03) {
    box(o.decor, 15, 0, 15, 17, 60, 17, 'daylight');
    o.zones.push({ kind: 'gate', x0: 14.8, z0: 14.8, x1: 17.2, z1: 17.2 });
    o.zones.push({ kind: 'piece', name: 'light-pillar', x0: 12, z0: 12, x1: 20, z1: 20 });
  } else if (r < 0.08) {
    box(o.decor, 8, 0.002, 8, 12, 0.01, 12, 'portal');
    o.zones.push({ kind: 'thin-floor', x0: 8, z0: 8, x1: 12, z1: 12 });
    o.zones.push({ kind: 'piece', name: 'dark-tile', x0: 8, z0: 8, x1: 12, z1: 12 });
  } else if (r < 0.12) {
    box(o.solids, 15, 0, 15, 17, 3.5, 15.5, 'obsidian');
    o.zones.push({ kind: 'piece', name: 'monolith', x0: 13, z0: 13, x1: 19, z1: 18 });
  }
  if (hash01(seed, 521, cx, cz) < 0.6) o.items.push({ uid: 'g', id: 'almond_water', x: 4 + hash01(seed, 522, cx, cz) * 24, y: 0, z: 4 + hash01(seed, 523, cx, cz) * 24, rot: 0 });
  return toChunk(ctx, cx, cz, 0, 32, o);
}

// ---------------------------------------------------------------------------
// Corridor of floating books (Level 451): jump from book to book.
// ---------------------------------------------------------------------------

const BOOK_MATS = ['book-red', 'book-blue', 'book-green', 'book-brown'];

export function bookH(seed: number, gx: number, gz: number): number {
  return Math.round(8 * fbm2(seed, 530, gx / 6, gz / 6, 2) / 0.6) * 0.6;
}

export function generateBooks(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  const C = 6.4; // 5 x 5 books per chunk
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const gx = cx * 5 + i;
      const gz = cz * 5 + j;
      if (hash01(seed, 531, gx, gz) < 0.12) continue; // missing book: a gap to jump
      const y = bookH(seed, gx, gz);
      const x0 = i * C;
      const z0 = j * C;
      const along = hash01(seed, 532, gx, gz) < 0.5;
      const L = 4.6 + hash01(seed, 533, gx, gz) * 0.8;
      const W = 3.6 + hash01(seed, 534, gx, gz) * 0.6;
      const w = along ? L : W;
      const d = along ? W : L;
      const bx = x0 + (C - w) / 2;
      const bz = z0 + (C - d) / 2;
      const cover = BOOK_MATS[Math.floor(hash01(seed, 535, gx, gz) * BOOK_MATS.length)];
      box(o.solids, bx, y - 0.9, bz, bx + w, y - 0.15, bz + d, 'pages');
      box(o.solids, bx - 0.08, y - 0.15, bz - 0.08, bx + w + 0.08, y, bz + d + 0.08, cover);
      box(o.solids, bx - 0.08, y - 1.05, bz - 0.08, bx + w + 0.08, y - 0.9, bz + d + 0.08, cover);
      const r = hash01(seed, 536, gx, gz);
      if (r < 0.06) {
        // a candle
        box(o.decor, bx + 0.6, y, bz + 0.6, bx + 0.8, y + 0.4, bz + 0.8, 'pages');
        box(o.decor, bx + 0.65, y + 0.4, bz + 0.65, bx + 0.75, y + 0.55, bz + 0.75, 'lantern');
        o.lights.push({ x: bx + 0.7, y: y + 0.6, z: bz + 0.7, I: 1.5 });
        o.zones.push({ kind: 'piece', name: 'candle', x0: bx, z0: bz, x1: bx + w, z1: bz + d });
      } else if (r < 0.1) o.items.push({ uid: `b${i},${j}`, id: 'almond_water', x: bx + w / 2, y, z: bz + d / 2, rot: 0 });
      else if (r < 0.13) {
        o.props.push({ uid: `bd${i},${j}`, kind: 'plain-door', x: bx + w / 2, y, z: bz + d / 2, rotY: 0, color: 0x5a3a1e });
        o.zones.push({ kind: 'piece', name: 'book-door', x0: bx, z0: bz, x1: bx + w, z1: bz + d });
      } else if (r < 0.16) {
        // a book standing upright: a wall of pages to climb around
        box(o.solids, bx, y, bz + d / 2 - 0.4, bx + w * 0.6, y + 4, bz + d / 2 + 0.4, cover);
        o.zones.push({ kind: 'piece', name: 'standing-book', x0: bx, z0: bz, x1: bx + w, z1: bz + d });
      }
    }
  return toChunk(ctx, cx, cz, 0, 32, o);
}

export function booksArrival(ctx: GenContext, h: number): SpawnPoint {
  for (let k = 0; k < 100; k++) {
    const gx = Math.floor(hash01(ctx.levelSeed, 537, h, k) * 60) - 30;
    const gz = Math.floor(hash01(ctx.levelSeed, 538, h, k) * 60) - 30;
    if (hash01(ctx.levelSeed, 531, gx, gz) < 0.12) continue;
    const cx = Math.floor(gx / 5);
    const cz = Math.floor(gz / 5);
    const i = gx - cx * 5;
    const j = gz - cz * 5;
    return { x: cx * 32 + i * 6.4 + 3.2, y: bookH(ctx.levelSeed, gx, gz), z: cz * 32 + j * 6.4 + 3.2, yaw: 0 };
  }
  return { x: 3.2, y: 2, z: 3.2, yaw: 0 };
}

// ---------------------------------------------------------------------------
// Night rooftops (Level 212): hop between rooftops above a glittering city.
// ---------------------------------------------------------------------------

export function roofH(seed: number, gx: number, gz: number): number {
  return 40 + Math.round(4 * fbm2(seed, 540, gx / 3, gz / 3, 2) / 0.6) * 0.6;
}

function roofLights(seed: number, cx: number, cz: number): Light[] {
  const out: Light[] = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const gx = cx * 2 + i;
      const gz = cz * 2 + j;
      if (hash01(seed, 545, gx, gz) < 0.35) out.push({ x: i * 16 + 8, y: roofH(seed, gx, gz) + 2, z: j * 16 + 8, I: 1.6 });
    }
  return out;
}

export function generateRooftops(ctx: GenContext, cx: number, cz: number): ChunkData {
  const seed = ctx.levelSeed;
  const o = emptyOut();
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      const gx = cx * 2 + i;
      const gz = cz * 2 + j;
      const y = roofH(seed, gx, gz);
      // Gaps between buildings: 1.2 - 2.4 m (jumpable), sometimes a wide street with a plank
      const gapX = 1.2 + hash01(seed, 541, gx, gz) * 1.2;
      const gapZ = 1.2 + hash01(seed, 542, gx, gz) * 1.2;
      const x0 = i * 16 + gapX / 2;
      const x1 = (i + 1) * 16 - gapX / 2;
      const z0 = j * 16 + gapZ / 2;
      const z1 = (j + 1) * 16 - gapZ / 2;
      box(o.solids, x0, y - 70, z0, x1, y, z1, hash01(seed, 543, gx, gz) < 0.5 ? 'windows' : 'brick');
      box(o.solids, x0, y, z0, x1, y + 0.6, z0 + 0.25, 'stone'); // parapet
      const r = hash01(seed, 544, gx, gz);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      if (r < 0.25) {
        // Water tower on legs
        for (const [a, b] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          box(o.solids, mx + a * 1.2 - 0.1, y, mz + b * 1.2 - 0.1, mx + a * 1.2 + 0.1, y + 2.2, mz + b * 1.2 + 0.1, 'metal');
        box(o.solids, mx - 1.6, y + 2.2, mz - 1.6, mx + 1.6, y + 5, mz + 1.6, 'wood-dark');
        o.zones.push({ kind: 'piece', name: 'water-tower', x0, z0, x1, z1 });
      } else if (r < 0.4) {
        box(o.solids, mx - 0.1, y, mz - 0.1, mx + 0.1, y + 8, mz + 0.1, 'metal');
        box(o.decor, mx - 0.2, y + 8, mz - 0.2, mx + 0.2, y + 8.3, mz + 0.2, 'red-light');
        o.zones.push({ kind: 'piece', name: 'antenna', x0, z0, x1, z1 });
      } else if (r < 0.55) {
        box(o.solids, x0 + 0.3, y + 0.6, z0 + 0.05, x1 - 0.3, y + 2.4, z0 + 0.25, 'stone');
        box(o.decor, x0 + 0.6, y + 0.9, z0 - 0.05, x1 - 0.6, y + 2.1, z0 + 0.05, hash01(seed, 546, gx, gz) < 0.5 ? 'neon-pink' : 'neon-blue');
        o.zones.push({ kind: 'piece', name: 'neon-sign', x0, z0, x1, z1 });
      } else if (r < 0.7) {
        box(o.solids, mx - 1.2, y, mz - 1.5, mx + 1.2, y + 2.6, mz + 1.5, 'brick');
        o.props.push({ uid: `rd${i}${j}`, kind: 'plain-door', x: mx, y, z: mz + 1.52, rotY: 0, color: 0x4a4a52 });
        o.zones.push({ kind: 'piece', name: 'roof-door', x0, z0, x1, z1 });
      } else if (r < 0.85) {
        box(o.solids, mx - 0.8, y, mz - 0.6, mx + 0.8, y + 1, mz + 0.6, 'metal');
        o.zones.push({ kind: 'piece', name: 'ac-unit', x0, z0, x1, z1 });
      }
      if (hash01(seed, 547, gx, gz) < 0.2) o.items.push({ uid: `ri${i}${j}`, id: 'almond_water', x: x0 + 1.5, y, z: z1 - 1.5, rot: 0 });
    }
  // Distant skyline glow far below
  box(o.decor, 0, -2, 0, 32, -1.9, 32, 'windows');
  return toChunk(ctx, cx, cz, 0, 32, o);
}

export function rooftopSampler(ctx: GenContext, cx: number, cz: number): LightSampler {
  return sampler(0.32, [0.3, 0.8, -0.4], neighbourLights(32, cx, cz, (a, b) => roofLights(ctx.levelSeed, a, b)));
}

export function rooftopArrival(ctx: GenContext, h: number): SpawnPoint {
  const gx = Math.floor(hash01(ctx.levelSeed, 548, h) * 40) - 20;
  const gz = Math.floor(hash01(ctx.levelSeed, 549, h) * 40) - 20;
  return { x: gx * 16 + 4, y: roofH(ctx.levelSeed, gx, gz), z: gz * 16 + 8, yaw: 0 };
}

// ---------------------------------------------------------------------------
// Caves (Level 120): stacked cave layers joined by shafts with ledges.
// ---------------------------------------------------------------------------

export const CAVE_SLAB = 14;
const CC = 4;
const CN = 8;
const CAVE_H = 10;

function rockAt(seed: number, gx: number, gz: number, cy: number): boolean {
  if (shaftAt(seed, gx, gz, cy) || shaftAt(seed, gx, gz, cy + 1)) return false;
  return noise2(seed, 560 + cy * 3, gx / 2.6, gz / 2.6) > 0.62;
}

function shaftAt(seed: number, gx: number, gz: number, cy: number): boolean {
  return hash01(seed, 561, gx, gz, cy) < 0.025;
}

function caveOut(seed: number, cx: number, cz: number, cy: number): Out {
  const o = emptyOut();
  const y0 = cy * CAVE_SLAB;
  const rng = new Rng(hashInts(seed, 562, cx, cz, cy));
  for (let i = 0; i < CN; i++)
    for (let j = 0; j < CN; j++) {
      const gx = cx * CN + i;
      const gz = cz * CN + j;
      const x0 = i * CC;
      const z0 = j * CC;
      if (rockAt(seed, gx, gz, cy)) {
        const ins = 0.3 + hash01(seed, 563, gx, gz, cy) * 0.6;
        box(o.solids, x0 - ins, y0, z0 - ins, x0 + CC + ins, y0 + CAVE_H, z0 + CC + ins, 'rock');
        box(o.decor, x0, y0 + CAVE_H, z0, x0 + CC, y0 + CAVE_SLAB - 0.004, z0 + CC, 'rock');
        continue;
      }
      const shaft = shaftAt(seed, gx, gz, cy);
      if (!shaft) o.floors.push({ x0, z0, x1: x0 + CC, z1: z0 + CC, y: y0 });
      // Solid rock between this layer's ceiling and the next layer's floor.
      if (!shaftAt(seed, gx, gz, cy + 1)) box(o.decor, x0, y0 + CAVE_H, z0, x0 + CC, y0 + CAVE_SLAB - 0.004, z0 + CC, 'rock');
      // Shaft walls through the rock below and ledges spiralling down to the layer below.
      if (shaft) {
        box(o.solids, x0 - 0.5, y0 - 4, z0 - 0.5, x0 + CC + 0.5, y0, z0, 'rock');
        box(o.solids, x0 - 0.5, y0 - 4, z0 + CC, x0 + CC + 0.5, y0, z0 + CC + 0.5, 'rock');
        for (let k = 0; k < 9; k++) {
          const y = y0 - 1.2 - k * 1.4;
          const side = k % 4;
          const lx = side === 1 ? x0 + CC - 1.2 : side === 3 ? x0 : x0 + 1;
          const lz = side === 0 ? z0 : side === 2 ? z0 + CC - 1.2 : z0 + 1;
          box(o.solids, lx, y - 0.4, lz, lx + (side % 2 ? 1.2 : 2), y, lz + (side % 2 ? 2 : 1.2), 'rock');
        }
        o.zones.push({ kind: 'piece', name: 'shaft', x0, z0, x1: x0 + CC, z1: z0 + CC });
        continue;
      }
      const r = rng.float();
      if (r < 0.05) {
        // Crystal cluster
        const col = rng.pick(['gem-blue', 'gem-pink', 'gem-green', 'crystal-purple']);
        for (let k = 0; k < 4; k++) {
          const gxx = x0 + 0.8 + rng.float() * 2.4;
          const gzz = z0 + 0.8 + rng.float() * 2.4;
          const gh = 0.6 + rng.float() * 1.8;
          box(o.solids, gxx - 0.2, y0, gzz - 0.2, gxx + 0.2, y0 + gh, gzz + 0.2, col);
        }
        o.lights.push({ x: x0 + 2, y: y0 + 1, z: z0 + 2, I: 2.5 });
        o.zones.push({ kind: 'piece', name: 'crystals', x0, z0, x1: x0 + CC, z1: z0 + CC });
      } else if (r < 0.075) {
        // Hot spring: a basin with a low rock rim, filled with warm water
        const r = 0.4;
        box(o.solids, x0 + 0.2, y0, z0 + 0.2, x0 + CC - 0.2, y0 + r, z0 + 0.2 + r, 'rock');
        box(o.solids, x0 + 0.2, y0, z0 + CC - 0.2 - r, x0 + CC - 0.2, y0 + r, z0 + CC - 0.2, 'rock');
        box(o.solids, x0 + 0.2, y0, z0 + 0.2 + r, x0 + 0.2 + r, y0 + r, z0 + CC - 0.2 - r, 'rock');
        box(o.solids, x0 + CC - 0.2 - r, y0, z0 + 0.2 + r, x0 + CC - 0.2, y0 + r, z0 + CC - 0.2 - r, 'rock');
        box(o.decor, x0 + 0.6, y0 + 0.28, z0 + 0.6, x0 + CC - 0.6, y0 + 0.3, z0 + CC - 0.6, 'hot-spring');
        o.lights.push({ x: x0 + 2, y: y0, z: z0 + 2, I: 1.6 });
        o.zones.push({ kind: 'water', x0, z0, x1: x0 + CC, z1: z0 + CC });
        o.zones.push({ kind: 'piece', name: 'hot-spring', x0, z0, x1: x0 + CC, z1: z0 + CC });
      } else if (r < 0.2) {
        // Stalactites and stalagmites (limestone)
        const sx = x0 + 1 + rng.float() * 2;
        const sz = z0 + 1 + rng.float() * 2;
        const len = 1.5 + rng.float() * 3;
        box(o.solids, sx - 0.25, y0 + CAVE_H - len, sz - 0.25, sx + 0.25, y0 + CAVE_H, sz + 0.25, 'stone');
        if (rng.chance(0.5)) box(o.solids, sx - 0.3, y0, sz - 0.3, sx + 0.3, y0 + len * 0.6, sz + 0.3, 'stone');
        o.zones.push({ kind: 'piece', name: 'stalactites', x0, z0, x1: x0 + CC, z1: z0 + CC });
      } else if (r < 0.215) {
        o.props.push({ uid: `cd${i},${j}`, kind: 'plain-door', x: x0 + 2, y: y0, z: z0 + 2, rotY: 0, color: 0x4a3a2a });
        o.zones.push({ kind: 'piece', name: 'cave-door', x0, z0, x1: x0 + CC, z1: z0 + CC });
      } else if (r < 0.235) o.items.push({ uid: `ci${i},${j}`, id: 'almond_water', x: x0 + 2, y: y0, z: z0 + 2, rot: 0 });
    }
  return o;
}

export function generateCave(ctx: GenContext, cx: number, cz: number, cy = 0): ChunkData {
  return toChunk(ctx, cx, cz, cy, 32, caveOut(ctx.levelSeed, cx, cz, cy));
}

export function caveSampler(ctx: GenContext, cx: number, cz: number, cy = 0): LightSampler {
  return sampler(0.06, null, neighbourLights(32, cx, cz, (a, b) => caveOut(ctx.levelSeed, a, b, cy).lights));
}

export function caveArrival(ctx: GenContext, h: number): SpawnPoint {
  for (let k = 0; k < 500; k++) {
    const gx = Math.floor(hash01(ctx.levelSeed, 564, h, k) * 80) - 40;
    const gz = Math.floor(hash01(ctx.levelSeed, 565, h, k) * 80) - 40;
    const cy = Math.floor(hash01(ctx.levelSeed, 566, h, k) * 6) - 3;
    if (rockAt(ctx.levelSeed, gx, gz, cy) || shaftAt(ctx.levelSeed, gx, gz, cy)) continue;
    // Check the generated cell: an ordinary floor at the layer height and nothing standing there.
    const cx = Math.floor(gx / CN);
    const cz = Math.floor(gz / CN);
    const o = caveOut(ctx.levelSeed, cx, cz, cy);
    const lx = gx * CC + 2 - cx * 32;
    const lz = gz * CC + 2 - cz * 32;
    const y0 = cy * CAVE_SLAB;
    const floorOk = o.floors.some((f) => f.y === y0 && lx > f.x0 && lx < f.x1 && lz > f.z0 && lz < f.z1);
    const blocked = o.solids.some((b) => b.maxY > y0 + 0.45 && b.minY < y0 + 1.7 && lx > b.minX - 0.4 && lx < b.maxX + 0.4 && lz > b.minZ - 0.4 && lz < b.maxZ + 0.4);
    if (floorOk && !blocked) return { x: gx * CC + 2, y: y0, z: gz * CC + 2, yaw: 0 };
  }
  return { x: 2, y: 0, z: 2, yaw: 0 };
}
