/**
 * Set pieces for grid levels (SPEC §3.5 / §4.3 "汎用セットピース").
 * Each level lists which pieces it uses; placement is per feature cell
 * (3x3 chunks) and every piece sits strictly inside one chunk (cells
 * 1..N-2) so chunk borders stay consistent. Pure: no three.js.
 */
import { hash01, hashInts, Rng } from '../core/rng';
import type { Box, CeilingRect, ItemSpawn, LightPanel, Prop } from '../world/chunkData';
import type { GridParams } from './gridLevel';

export interface PieceLight {
  x: number;
  y: number;
  z: number;
  I: number;
}

export interface PieceOut {
  solids: Box[];
  decor: Box[];
  panels: LightPanel[];
  lights: PieceLight[];
  items: ItemSpawn[];
  props: Prop[];
  /** Holes cut out of the main floor (local coords). */
  holes: Array<{ x0: number; z0: number; x1: number; z1: number }>;
  /** Extra walkable floors (e.g. a pool basin). */
  floors: CeilingRect[];
}

export interface PieceCtx {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  w: number;
  d: number;
  /** Normal ceiling height and this piece's ceiling height. */
  H: number;
  top: number;
  wallT: number;
  rng: Rng;
  out: PieceOut;
}

export type Border = 'open' | 'walled' | 'corridor';

export interface GridPieceDef {
  id: string;
  name: string;
  desc: string;
  /** Target footprint in metres. */
  metres: [number, number];
  /** Ceiling height for this piece given the level's normal height. */
  ceiling: (H: number) => number;
  border: Border;
  /** No ceiling at all: open to the sky (U2 bridges and gardens). */
  open?: boolean;
  build: (c: PieceCtx) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function box(list: Box[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string): void {
  list.push({
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minY: Math.min(y0, y1),
    maxY: Math.max(y0, y1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
    mat,
  });
}

let itemCounter = 0;
function item(c: PieceCtx, x: number, y: number, z: number): void {
  c.out.items.push({ uid: `pc${itemCounter++ % 1000}:${x.toFixed(1)},${z.toFixed(1)}`, id: 'almond_water', x, y, z, rot: c.rng.float() * 6.28 });
}

function panel(c: PieceCtx, x: number, z: number, y = c.top, I = 1.4, w = 0.6, d = 1.2): void {
  c.out.panels.push({ x, y: y - 0.02, z, w, d, state: 1 });
  c.out.lights.push({ x, y: y - 0.05, z, I });
}

/** Evenly spaced ceiling panels across the piece. */
function panelGrid(c: PieceCtx, spacing: number, I: number): void {
  const nx = Math.max(1, Math.floor(c.w / spacing));
  const nz = Math.max(1, Math.floor(c.d / spacing));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) panel(c, c.x0 + ((i + 0.5) * c.w) / nx, c.z0 + ((j + 0.5) * c.d) / nz, c.top, I);
}

const cxOf = (c: PieceCtx) => (c.x0 + c.x1) / 2;
const czOf = (c: PieceCtx) => (c.z0 + c.z1) / 2;

// ---------------------------------------------------------------------------
// Piece definitions
// ---------------------------------------------------------------------------

export const GRID_PIECES: Record<string, GridPieceDef> = {
  statue: {
    id: 'statue',
    name: '巨大な像',
    desc: '高い天井の下に、顔のない巨大な人型がじっと立っている。台座の上に何か置いてある。',
    metres: [16, 16],
    ceiling: (H) => Math.max(H, 13),
    border: 'open',
    build(c) {
      const s = c.out.solids;
      const mx = cxOf(c);
      const mz = czOf(c);
      const k = Math.min(c.w, c.d, 18) / 16;
      // Pedestal (jumpable: 1.0m)
      box(s, mx - 2.2 * k, 0, mz - 2.2 * k, mx + 2.2 * k, 1.0, mz + 2.2 * k, 'stone');
      const b = 1.0;
      // Legs, torso, arms, neck, faceless head
      box(s, mx - 1.3 * k, b, mz - 0.6 * k, mx - 0.35 * k, b + 4.2 * k, mz + 0.6 * k, 'stone');
      box(s, mx + 0.35 * k, b, mz - 0.6 * k, mx + 1.3 * k, b + 4.2 * k, mz + 0.6 * k, 'stone');
      box(s, mx - 1.7 * k, b + 4.2 * k, mz - 0.85 * k, mx + 1.7 * k, b + 8.0 * k, mz + 0.85 * k, 'stone');
      box(s, mx - 2.5 * k, b + 4.4 * k, mz - 0.5 * k, mx - 1.75 * k, b + 7.9 * k, mz + 0.5 * k, 'stone');
      box(s, mx + 1.75 * k, b + 4.4 * k, mz - 0.5 * k, mx + 2.5 * k, b + 7.9 * k, mz + 0.5 * k, 'stone');
      box(s, mx - 0.35 * k, b + 8.0 * k, mz - 0.35 * k, mx + 0.35 * k, b + 8.5 * k, mz + 0.35 * k, 'stone');
      box(s, mx - 0.9 * k, b + 8.5 * k, mz - 0.9 * k, mx + 0.9 * k, b + 10.2 * k, mz + 0.9 * k, 'stone');
      // Uplights at the pedestal corners
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const lx = mx + sx * 3.2 * k;
        const lz = mz + sz * 3.2 * k;
        box(c.out.decor, lx - 0.15, 0, lz - 0.15, lx + 0.15, 0.12, lz + 0.15, 'glow');
        c.out.lights.push({ x: lx, y: 0.3, z: lz, I: 3.5 });
      }
      item(c, mx + 1.6 * k, 1.0, mz + 1.6 * k);
      panel(c, mx, mz - 5 * k, c.top, 3);
      panel(c, mx, mz + 5 * k, c.top, 3);
    },
  },

  'stair-tower': {
    id: 'stair-tower',
    name: '終わらない階段',
    desc: '宙に浮いた折り返し階段が、暗い天井へ向かってどこまでも続いている。',
    metres: [12, 16],
    ceiling: (H) => Math.max(H, 18),
    border: 'open',
    build(c) {
      const s = c.out.solids;
      const m = 0.4;
      const run = 0.5;
      const rise = 0.3;
      const steps = 8;
      const flight = steps * run;
      const L = Math.min(1.6, (c.w - 2 * m - flight) / 2);
      const sw = 1.3;
      const gap = 0.15;
      const bands = Math.floor((c.d - 2 * m + gap) / (sw + gap));
      const flights = Math.max(1, Math.min(bands - 1, Math.floor((c.top - 2.5) / (steps * rise))));
      const xa = c.x0 + m + L; // flight start (west end)
      const xb = xa + flight; // flight end (east end)
      let h = 0;
      for (let i = 0; i < flights; i++) {
        const zb = c.z0 + m + i * (sw + gap);
        const east = i % 2 === 0;
        for (let k = 0; k < steps; k++) {
          const hh = h + (k + 1) * rise;
          const x = east ? xa + k * run : xb - (k + 1) * run;
          box(s, x, Math.max(0, hh - 0.25), zb, x + run, hh, zb + sw, k % 2 ? 'stone' : 'metal');
        }
        h += steps * rise;
        // Landing spanning this band and the next.
        const lx0 = east ? xb : c.x0 + m;
        const zEnd = zb + (i === flights - 1 ? sw : 2 * sw + gap);
        box(s, lx0, h - 0.25, zb, lx0 + L, h, zEnd, 'stone');
      }
      // Reward and a faint glow at the top.
      const lastEast = (flights - 1) % 2 === 0;
      const tx = (lastEast ? xb : c.x0 + m) + L / 2;
      const tz = c.z0 + m + (flights - 1) * (sw + gap) + sw / 2;
      item(c, tx, h, tz);
      box(c.out.decor, tx - 0.1, h, tz - 0.6, tx + 0.1, h + 0.05, tz + 0.6, 'glow');
      c.out.lights.push({ x: tx, y: h + 1.5, z: tz, I: 2.5 });
      // Dim lights along the way.
      for (let i = 0; i < flights; i += 2) panel(c, cxOf(c), c.z0 + m + i * (sw + gap) + sw, c.top, 2.5);
    },
  },

  'door-row': {
    id: 'door-row',
    name: '閉ざされた扉の廊下',
    desc: '両側に同じ扉がずらりと並ぶ長い廊下。ほとんどは鍵がかかっているが、ひとつだけ開くものがある。',
    metres: [20, 4],
    ceiling: (H) => H,
    border: 'corridor',
    build(c) {
      const alongX = c.w >= c.d;
      const len = alongX ? c.w : c.d;
      const n = Math.max(2, Math.floor((len - 1) / 2.4));
      const open = c.rng.int(0, n * 2 - 1);
      const f = c.wallT / 2 + 0.02;
      for (let i = 0; i < n; i++) {
        const a = (alongX ? c.x0 : c.z0) + ((i + 0.5) * len) / n;
        for (const side of [0, 1]) {
          const idx = i * 2 + side;
          const kind = idx === open ? 'plain-door' : 'locked-door';
          if (alongX)
            c.out.props.push({ uid: `row${idx}`, kind, x: a, y: 0, z: side ? c.z1 - f : c.z0 + f, rotY: side ? Math.PI : 0, color: 0x6b5a48 });
          else c.out.props.push({ uid: `row${idx}`, kind, x: side ? c.x1 - f : c.x0 + f, y: 0, z: a, rotY: side ? -Math.PI / 2 : Math.PI / 2, color: 0x6b5a48 });
        }
        if (i % 2 === 0) panel(c, alongX ? a : cxOf(c), alongX ? czOf(c) : a, c.top, 1.2, alongX ? 1.2 : 0.6, alongX ? 0.6 : 1.2);
      }
    },
  },

  'water-tanks': {
    id: 'water-tanks',
    name: '水槽の回廊',
    desc: '青く光る巨大な水槽が並ぶ。中には何もいない。少なくとも、今は。',
    metres: [14, 14],
    ceiling: (H) => Math.max(H, 4),
    border: 'open',
    build(c) {
      const tw = 2.2;
      const td = 1.0;
      const aisle = 1.9;
      for (let x = c.x0 + 1.2; x + tw <= c.x1 - 1.0; x += tw + aisle)
        for (let z = c.z0 + 1.4; z + td <= c.z1 - 1.0; z += td + aisle) {
          box(c.out.solids, x - 0.05, 0, z - 0.05, x + tw + 0.05, 0.35, z + td + 0.05, 'metal');
          box(c.out.solids, x, 0.35, z, x + tw, 2.7, z + td, 'glass');
          box(c.out.decor, x + 0.05, 0.36, z + 0.05, x + tw - 0.05, 2.35, z + td - 0.05, 'water');
          box(c.out.decor, x + 0.1, 0.36, z + td / 2 - 0.05, x + tw - 0.1, 0.42, z + td / 2 + 0.05, 'glow-blue');
          c.out.lights.push({ x: x + tw / 2, y: 1.2, z: z + td / 2, I: 1.1 });
        }
      item(c, c.x1 - 0.7, 0, c.z1 - 0.7);
    },
  },

  reception: {
    id: 'reception',
    name: '無人の受付',
    desc: '待合室の椅子と受付カウンター。呼び鈴を鳴らしても誰も来ない。',
    metres: [12, 9],
    ceiling: (H) => H,
    border: 'open',
    build(c) {
      const s = c.out.solids;
      // L-shaped counter along the north side
      const cz0 = c.z0 + 1.6;
      box(s, c.x0 + 1.2, 0, cz0, c.x1 - 1.6, 1.05, cz0 + 0.7, 'wood-dark');
      box(s, c.x1 - 2.3, 0, cz0, c.x1 - 1.6, 1.05, cz0 + 2.4, 'wood-dark');
      box(c.out.decor, c.x0 + 1.15, 1.05, cz0 - 0.05, c.x1 - 1.55, 1.1, cz0 + 0.75, 'stone');
      // Bell
      box(c.out.decor, cxOf(c) - 0.06, 1.1, cz0 + 0.3, cxOf(c) + 0.06, 1.18, cz0 + 0.42, 'metal');
      // Sign above
      box(c.out.decor, cxOf(c) - 1.5, c.H - 0.7, c.z0 + 0.15, cxOf(c) + 1.5, c.H - 0.3, c.z0 + 0.22, 'glow');
      // Rows of waiting chairs
      for (let r = 0; r < 3; r++) {
        const z = cz0 + 3.0 + r * 1.6;
        if (z + 0.6 > c.z1 - 0.5) break;
        for (let x = c.x0 + 1.2; x + 0.55 < c.x1 - 3; x += 0.62) {
          box(s, x, 0, z, x + 0.55, 0.45, z + 0.55, 'fabric');
          box(s, x, 0.45, z + 0.45, x + 0.55, 0.95, z + 0.55, 'fabric');
        }
      }
      item(c, c.x0 + 2.0, 0, cz0 - 0.6);
      panelGrid(c, 4, 1.2);
    },
  },

  pool: {
    id: 'pool',
    name: '沈んだプール',
    desc: '床が四角く沈み、淡い水色の水が張られている。底の階段から上がれる。',
    metres: [14, 12],
    ceiling: (H) => Math.max(H, 4.5),
    border: 'open',
    build(c) {
      const inset = 1.4;
      const depth = 1.7;
      const hx0 = c.x0 + inset;
      const hz0 = c.z0 + inset;
      const hx1 = c.x1 - inset;
      const hz1 = c.z1 - inset;
      c.out.holes.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1 });
      c.out.floors.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1, y: -depth });
      const t = 0.2;
      const s = c.out.solids;
      box(s, hx0 - t, -depth, hz0 - t, hx1 + t, 0, hz0, 'tile-white');
      box(s, hx0 - t, -depth, hz1, hx1 + t, 0, hz1 + t, 'tile-white');
      box(s, hx0 - t, -depth, hz0, hx0, 0, hz1, 'tile-white');
      box(s, hx1, -depth, hz0, hx1 + t, 0, hz1, 'tile-white');
      box(c.out.decor, hx0, -depth, hz0, hx1, -depth + 0.01, hz1, 'tile-blue');
      box(c.out.decor, hx0, -0.5, hz0, hx1, -0.45, hz1, 'water');
      // Steps out in one corner
      for (let k = 0; k < 4; k++) box(s, hx1 - 1.2, -depth, hz0 + k * 0.45, hx1, -depth + (k + 1) * 0.42, hz0 + (k + 1) * 0.45, 'tile-white');
      item(c, hx0 + 0.8, -depth, hz1 - 0.8);
      panelGrid(c, 4.5, 1.6);
    },
  },

  platforms: {
    id: 'platforms',
    name: '積み上がった足場',
    desc: '高さの違う足場が積み重なっている。跳び移っていけば、てっぺんに届きそうだ。',
    metres: [14, 14],
    ceiling: (H) => Math.max(H, 9),
    border: 'open',
    build(c) {
      const s = c.out.solids;
      let x = c.x0 + 1.6;
      let z = c.z0 + 1.6;
      let h = 0.6;
      let dirX = 1;
      let last = { x, z, size: 1.4, h };
      for (let i = 0; i < 12 && h < c.top - 2.6; i++) {
        const size = 1.2 + c.rng.float() * 0.5;
        box(s, x - size / 2, 0, z - size / 2, x + size / 2, h, z + size / 2, i % 3 === 2 ? 'crate' : 'metal');
        last = { x, z, size, h };
        // Next platform: within jumping distance and height.
        const stepLen = 1.9 + c.rng.float() * 0.5;
        if (x + dirX * stepLen > c.x1 - 1.2 || x + dirX * stepLen < c.x0 + 1.2) {
          dirX = -dirX;
          z += stepLen;
          if (z > c.z1 - 1.2) z = c.z0 + 1.6 + c.rng.float() * 2;
        } else x += dirX * stepLen;
        h += 0.55 + c.rng.float() * 0.3;
      }
      item(c, last.x, last.h, last.z);
      box(c.out.decor, last.x - 0.3, last.h, last.z - 0.3, last.x + 0.3, last.h + 0.03, last.z + 0.3, 'glow');
      c.out.lights.push({ x: last.x, y: last.h + 1.2, z: last.z, I: 2 });
      panelGrid(c, 5, 3.5);
    },
  },

  'pillar-forest': {
    id: 'pillar-forest',
    name: '柱の森',
    desc: '細い柱が森のように立ち並ぶ。その中に一本だけ、白く光る柱がある。',
    metres: [16, 16],
    ceiling: (H) => Math.max(H, 10),
    border: 'open',
    build(c) {
      const s = c.out.solids;
      const glowAt = c.rng.int(0, 40);
      let n = 0;
      for (let x = c.x0 + 1.2; x < c.x1 - 0.8; x += 2.0)
        for (let z = c.z0 + 1.2; z < c.z1 - 0.8; z += 2.0) {
          if (c.rng.chance(0.12)) continue;
          const px = x + c.rng.range(-0.4, 0.4);
          const pz = z + c.rng.range(-0.4, 0.4);
          const r = 0.22 + c.rng.float() * 0.12;
          const stump = c.rng.chance(0.15);
          const glow = n++ === glowAt;
          box(s, px - r, 0, pz - r, px + r, stump ? 0.4 + c.rng.float() * 0.6 : c.top, pz + r, glow ? 'glow' : 'pillar');
          if (glow) c.out.lights.push({ x: px, y: 2.5, z: pz, I: 4 });
        }
      panelGrid(c, 6, 3);
    },
  },

  shelves: {
    id: 'shelves',
    name: '棚の迷路',
    desc: '背の高い棚が何列も続く。ところどころ低い棚があり、上に登れる。',
    metres: [16, 14],
    ceiling: (H) => Math.max(H, 4),
    border: 'open',
    build(c) {
      const s = c.out.solids;
      for (let z = c.z0 + 1.2; z + 0.6 < c.z1 - 0.8; z += 2.2) {
        let x = c.x0 + 0.8;
        while (x < c.x1 - 1.5) {
          const len = 2 + c.rng.float() * 3;
          const x1 = Math.min(c.x1 - 0.8, x + len);
          const low = c.rng.chance(0.2);
          const hh = low ? 1.0 : Math.min(c.top - 0.6, 2.8);
          box(s, x, 0, z, x1, hh, z + 0.6, 'shelf');
          // Boxes on top of the low shelves (decor)
          if (low) box(c.out.decor, x + 0.2, hh, z + 0.1, x + 0.6, hh + 0.35, z + 0.5, 'crate');
          x = x1 + (c.rng.chance(0.5) ? 1.2 : 0.0);
        }
      }
      item(c, c.x1 - 1.2, 0, c.z1 - 0.6);
      panelGrid(c, 4, 1.4);
    },
  },

  'pit-bridge': {
    id: 'pit-bridge',
    name: '奈落と橋',
    desc: '床に大きな穴が開き、一本の細い橋が架かっている。底は見えない。',
    metres: [14, 14],
    ceiling: (H) => Math.max(H, 5),
    border: 'open',
    build(c) {
      const inset = 1.2;
      const hx0 = c.x0 + inset;
      const hz0 = c.z0 + inset;
      const hx1 = c.x1 - inset;
      const hz1 = c.z1 - inset;
      const deep = -14;
      c.out.holes.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1 });
      const s = c.out.solids;
      const t = 0.2;
      box(s, hx0 - t, deep, hz0 - t, hx1 + t, 0, hz0, 'dark');
      box(s, hx0 - t, deep, hz1, hx1 + t, 0, hz1 + t, 'dark');
      box(s, hx0 - t, deep, hz0, hx0, 0, hz1, 'dark');
      box(s, hx1, deep, hz0, hx1 + t, 0, hz1, 'dark');
      // Narrow plank bridge across the middle
      const bz = czOf(c);
      box(s, hx0, -0.18, bz - 0.5, hx1, 0, bz + 0.5, 'wood-dark');
      // Stepping pillars leading to a reward
      const n = 3;
      let px = cxOf(c);
      let pz = bz + 2.2;
      for (let i = 0; i < n && pz < hz1 - 0.7; i++) {
        box(s, px - 0.45, deep, pz - 0.45, px + 0.45, 0, pz + 0.45, 'stone');
        if (i === n - 1 || pz + 2 > hz1 - 0.7) item(c, px, 0, pz);
        px += c.rng.range(-1.2, 1.2);
        pz += 1.9;
      }
      panelGrid(c, 5, 1.8);
    },
  },

  'light-well': {
    id: 'light-well',
    name: '光の井戸',
    desc: '天井の高い吹き抜けに、白い光の柱が落ちている。周りのベンチには誰も座っていない。',
    metres: [12, 12],
    ceiling: (H) => Math.max(H, 16),
    border: 'open',
    build(c) {
      const mx = cxOf(c);
      const mz = czOf(c);
      box(c.out.solids, mx - 0.7, 0, mz - 0.7, mx + 0.7, c.top, mz + 0.7, 'glow');
      c.out.lights.push({ x: mx, y: 1.5, z: mz, I: 6 });
      c.out.lights.push({ x: mx, y: 6, z: mz, I: 6 });
      for (const [sx, sz] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        const bx = mx + sx * 3.2;
        const bz = mz + sz * 3.2;
        const wx = sx ? 0.25 : 1.0;
        const wz = sz ? 0.25 : 1.0;
        box(c.out.solids, bx - wx, 0, bz - wz, bx + wx, 0.45, bz + wz, 'wood-dark');
      }
      item(c, mx + 3.2, 0.45, mz);
    },
  },
};

/** Moat or pit with water: floor hole, basin floor, stone sides and steps out in a corner. */
function waterBasin(c: PieceCtx, inset: number, depth: number, waterMat: string): { hx0: number; hz0: number; hx1: number; hz1: number } {
  const hx0 = c.x0 + inset;
  const hz0 = c.z0 + inset;
  const hx1 = c.x1 - inset;
  const hz1 = c.z1 - inset;
  c.out.holes.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1 });
  c.out.floors.push({ x0: hx0, z0: hz0, x1: hx1, z1: hz1, y: -depth });
  const s = c.out.solids;
  const t = 0.2;
  box(s, hx0 - t, -depth, hz0 - t, hx1 + t, 0, hz0, 'stone');
  box(s, hx0 - t, -depth, hz1, hx1 + t, 0, hz1 + t, 'stone');
  box(s, hx0 - t, -depth, hz0, hx0, 0, hz1, 'stone');
  box(s, hx1, -depth, hz0, hx1 + t, 0, hz1, 'stone');
  box(c.out.decor, hx0, -depth * 0.45, hz0, hx1, -depth * 0.45 + 0.04, hz1, waterMat);
  for (let k = 0; k < 4; k++) box(s, hx0, -depth, hz1 - (k + 1) * 0.45, hx0 + 1.1, -depth + (k + 1) * (depth / 4), hz1 - k * 0.45, 'stone');
  return { hx0, hz0, hx1, hz1 };
}

function stoneLantern(c: PieceCtx, x: number, z: number): void {
  box(c.out.solids, x - 0.25, 0, z - 0.25, x + 0.25, 0.9, z + 0.25, 'stone');
  box(c.out.decor, x - 0.2, 0.9, z - 0.2, x + 0.2, 1.25, z + 0.2, 'lantern');
  box(c.out.solids, x - 0.35, 1.25, z - 0.35, x + 0.35, 1.4, z + 0.35, 'stone');
  c.out.lights.push({ x, y: 1.1, z, I: 1.6 });
}

Object.assign(GRID_PIECES, {
  'taiko-bridge': {
    id: 'taiko-bridge',
    name: '太鼓橋',
    desc: '黒い水の上に、朱塗りの太鼓橋が弧を描いて架かっている。頂上から遠くの灯りが見える。',
    metres: [14, 12],
    ceiling: (H: number) => H,
    border: 'open',
    open: true,
    build(c: PieceCtx) {
      const b = waterBasin(c, 1.0, 1.8, 'water-dark');
      const bz = czOf(c);
      const w = 0.9;
      const len = b.hx1 - b.hx0;
      const n = 9;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const top = Math.sin(t * Math.PI) * 1.3;
        const x0 = b.hx0 + (k / n) * len;
        box(c.out.solids, x0, top - 0.25, bz - w, x0 + len / n, top, bz + w, 'wood-red');
      }
      for (const x of [b.hx0 - 0.5, b.hx1 + 0.5]) for (const z of [bz - 1.4, bz + 1.4]) stoneLantern(c, x, z);
      item(c, b.hx1 - 0.6, -1.8, b.hz0 + 0.6);
    },
  },
  'tea-island': {
    id: 'tea-island',
    name: '池の茶室',
    desc: '暗い池の真ん中の小島に、小さな茶室が建っている。障子の向こうに灯りがともる。',
    metres: [16, 16],
    ceiling: (H: number) => H,
    border: 'open',
    open: true,
    build(c: PieceCtx) {
      const b = waterBasin(c, 0.9, 1.8, 'water-dark');
      const mx = cxOf(c);
      const mz = czOf(c);
      const r = Math.min(3.2, (b.hx1 - b.hx0) / 2 - 1.5);
      box(c.out.solids, mx - r, -1.8, mz - r, mx + r, 0, mz + r, 'stone');
      // Bridge from the west rim to the island
      box(c.out.solids, b.hx0, -0.2, mz - 0.6, mx - r, 0, mz + 0.6, 'wood-dark');
      // Tea house: posts, shoji walls on three sides, roof
      const q = r - 0.6;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        box(c.out.solids, mx + sx * q - 0.1, 0, mz + sz * q - 0.1, mx + sx * q + 0.1, 2.3, mz + sz * q + 0.1, 'wood-dark');
      box(c.out.solids, mx + q - 0.05, 0, mz - q, mx + q + 0.05, 2.1, mz + q, 'shoji');
      box(c.out.solids, mx - q, 0, mz - q - 0.05, mx + q, 2.1, mz - q + 0.05, 'shoji');
      box(c.out.solids, mx - q, 0, mz + q - 0.05, mx + q, 2.1, mz + q + 0.05, 'shoji');
      box(c.out.solids, mx - q - 0.6, 2.3, mz - q - 0.6, mx + q + 0.6, 2.55, mz + q + 0.6, 'wood-dark');
      box(c.out.decor, mx - q + 0.05, 0.01, mz - q + 0.05, mx + q - 0.05, 0.04, mz + q - 0.05, 'tatami');
      box(c.out.decor, mx - 0.2, 0.04, mz - 0.2, mx + 0.2, 0.5, mz + 0.2, 'lantern');
      c.out.lights.push({ x: mx, y: 0.8, z: mz, I: 2.2 });
      item(c, mx + 0.6, 0.04, mz + 0.4);
    },
  },
  'lantern-path': {
    id: 'lantern-path',
    name: '灯籠の小径',
    desc: '砂利の小径に石灯籠が並ぶ。竹が風に揺れる音がする。',
    metres: [16, 8],
    ceiling: (H: number) => H,
    border: 'open',
    open: true,
    build(c: PieceCtx) {
      box(c.out.decor, c.x0 + 0.3, 0.003, c.z0 + 0.3, c.x1 - 0.3, 0.015, c.z1 - 0.3, 'path');
      const alongX = c.w >= c.d;
      const len = alongX ? c.w : c.d;
      for (let a = 1.5; a < len - 1; a += 3.2)
        for (const side of [-1, 1]) {
          const along = (alongX ? c.x0 : c.z0) + a;
          const across = (alongX ? czOf(c) : cxOf(c)) + side * 1.8;
          stoneLantern(c, alongX ? along : across, alongX ? across : along);
        }
      for (let k = 0; k < 14; k++) {
        const x = c.x0 + 0.4 + c.rng.float() * (c.w - 0.8);
        const z = c.rng.chance(0.5) ? c.z0 + 0.3 + c.rng.float() * 0.6 : c.z1 - 0.9 + c.rng.float() * 0.6;
        box(c.out.solids, x - 0.06, 0, z - 0.06, x + 0.06, 4 + c.rng.float() * 2, z + 0.06, 'leaves-lime');
      }
      item(c, c.x1 - 1.0, 0, czOf(c));
    },
  },
} as Record<string, GridPieceDef>);

// Hospital pieces (Level 186).
Object.assign(GRID_PIECES, {
  ward: {
    id: 'ward',
    name: '病室',
    desc: 'カーテンで仕切られたベッドが並ぶ。どのベッドも、さっきまで誰かが寝ていたように乱れている。',
    metres: [12, 9],
    ceiling: (H: number) => H,
    border: 'walled',
    build(c: PieceCtx) {
      const n = Math.max(2, Math.floor((c.w - 1) / 2.6));
      for (let k = 0; k < n; k++) {
        const x = c.x0 + 1 + k * 2.6;
        for (const z of [c.z0 + 0.6, c.z1 - 2.6]) {
          box(c.out.solids, x, 0, z, x + 1.0, 0.65, z + 2, 'tile-white');
          box(c.out.decor, x, 0.65, z, x + 1.0, 0.72, z + 2, 'fabric');
          box(c.out.decor, x + 1.3, 0, z, x + 1.32, 2.1, z + 2, 'shoji');
          box(c.out.solids, x + 1.05, 0, z + 0.2, x + 1.12, 1.8, z + 0.27, 'metal');
        }
      }
      panelGrid(c, 4, 0.9);
      item(c, c.x0 + 1.5, 0, czOf(c));
    },
  },
  surgery: {
    id: 'surgery',
    name: '手術室',
    desc: '無影灯の下に手術台がひとつ。器具はきれいに並べられたままだ。',
    metres: [8, 8],
    ceiling: (H: number) => H,
    border: 'walled',
    build(c: PieceCtx) {
      const mx = cxOf(c);
      const mz = czOf(c);
      box(c.out.solids, mx - 0.5, 0, mz - 1.1, mx + 0.5, 0.9, mz + 1.1, 'metal');
      box(c.out.decor, mx - 0.45, 0.9, mz - 1.05, mx + 0.45, 0.95, mz + 1.05, 'tile-blue');
      box(c.out.decor, mx - 0.6, c.H - 0.5, mz - 0.6, mx + 0.6, c.H - 0.3, mz + 0.6, 'glow');
      c.out.lights.push({ x: mx, y: c.H - 0.6, z: mz, I: 3 });
      box(c.out.solids, mx + 1.2, 0, mz - 0.4, mx + 1.8, 0.95, mz + 0.4, 'metal');
    },
  },
  'nurse-station': {
    id: 'nurse-station',
    name: 'ナースステーション',
    desc: '夜勤の灯りだけがついたナースステーション。モニターには何も映っていない。',
    metres: [10, 8],
    ceiling: (H: number) => H,
    border: 'open',
    build(c: PieceCtx) {
      box(c.out.solids, c.x0 + 1, 0, c.z0 + 2, c.x1 - 1, 1.1, c.z0 + 2.7, 'hospital-wall');
      box(c.out.solids, c.x1 - 1.7, 0, c.z0 + 2.7, c.x1 - 1, 1.1, c.z1 - 2, 'hospital-wall');
      for (let k = 0; k < 3; k++) box(c.out.decor, c.x0 + 1.5 + k * 1.2, 1.1, c.z0 + 2.1, c.x0 + 2.3 + k * 1.2, 1.6, c.z0 + 2.2, 'gem-green');
      c.out.lights.push({ x: cxOf(c), y: 2, z: c.z0 + 3, I: 1.6 });
      item(c, c.x0 + 2, 1.1, c.z0 + 2.35);
    },
  },
} as Record<string, GridPieceDef>);

/** Generic pool used by generated grid levels (excludes the U2-specific open-air pieces). */
export const ALL_GRID_PIECES = Object.keys(GRID_PIECES).filter((k) => !GRID_PIECES[k].open);

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface GridPiece {
  def: GridPieceDef;
  gx0: number;
  gz0: number;
  gx1: number;
  gz1: number;
  door: number;
  doorAt: number;
  cx: number;
  cz: number;
}

export const PIECE_FEATURE_CELL = 3;

const placeCache = new WeakMap<GridParams, Map<string, GridPiece | null>>();
const buildCache = new WeakMap<GridParams, Map<string, PieceOut>>();

/** The set piece hosted by chunk (cx,cz) of a grid level, if any. */
export function gridPieceForChunk(seed: number, p: GridParams, cx: number, cz: number): GridPiece | null {
  if (!p.pieces?.length) return null;
  let cache = placeCache.get(p);
  if (!cache) placeCache.set(p, (cache = new Map()));
  const key = seed + ':' + cx + ',' + cz;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (cache.size > 4096) cache.clear();

  const F = p.featureCell ?? PIECE_FEATURE_CELL;
  const fx = Math.floor(cx / F);
  const fz = Math.floor(cz / F);
  const n = F * F;
  const count = 1 + (hash01(seed, 501, fx, fz) < (p.pieceRate ?? 0.5) ? 1 : 0);
  const slotA = Math.floor(hash01(seed, 502, fx, fz) * n);
  const slotB = (slotA + 1 + Math.floor(hash01(seed, 503, fx, fz) * (n - 1))) % n;
  const local = (cx - fx * F) * F + (cz - fz * F);
  let which = -1;
  if (local === slotA) which = 0;
  else if (count > 1 && local === slotB) which = 1;
  let piece: GridPiece | null = null;
  if (which >= 0) {
    const list = p.pieces;
    const a = Math.floor(hash01(seed, 504, fx, fz) * list.length);
    const idx = which === 0 ? a : (a + 1 + Math.floor(hash01(seed, 505, fx, fz) * Math.max(1, list.length - 1))) % list.length;
    const def = GRID_PIECES[list[idx]];
    const N = p.cellsPerChunk;
    const maxCells = N - 2;
    if (def && maxCells >= 1) {
      const w = Math.min(maxCells, Math.max(1, Math.round(def.metres[0] / p.cell)));
      const d = Math.min(maxCells, Math.max(1, Math.round(def.metres[1] / p.cell)));
      const ix = 1 + Math.floor(hash01(seed, 506, cx, cz) * (maxCells - w + 1));
      const iz = 1 + Math.floor(hash01(seed, 507, cx, cz) * (maxCells - d + 1));
      const door = Math.floor(hash01(seed, 508, cx, cz) * 4);
      piece = {
        def,
        gx0: cx * N + ix,
        gz0: cz * N + iz,
        gx1: cx * N + ix + w - 1,
        gz1: cz * N + iz + d - 1,
        door,
        doorAt: Math.floor(hash01(seed, 509, cx, cz) * (door % 2 === 0 ? w : d)),
        cx,
        cz,
      };
    }
  }
  cache.set(key, piece);
  return piece;
}

export function gridPieceAtCell(seed: number, p: GridParams, gx: number, gz: number): GridPiece | null {
  const N = p.cellsPerChunk;
  const piece = gridPieceForChunk(seed, p, Math.floor(gx / N), Math.floor(gz / N));
  return piece && gx >= piece.gx0 && gx <= piece.gx1 && gz >= piece.gz0 && gz <= piece.gz1 ? piece : null;
}

/** Edge override for a piece (undefined = not affected). axis 'x' = west edge of cell (gx,gz). */
export function gridPieceEdge(piece: GridPiece, axis: 'x' | 'z', gx: number, gz: number): 0 | 1 | 2 | undefined {
  let side: number;
  let at: number;
  if (axis === 'x') {
    if (gz < piece.gz0 || gz > piece.gz1 || gx < piece.gx0 || gx > piece.gx1 + 1) return undefined;
    if (gx !== piece.gx0 && gx !== piece.gx1 + 1) return 0;
    side = gx === piece.gx0 ? 3 : 1;
    at = gz - piece.gz0;
  } else {
    if (gx < piece.gx0 || gx > piece.gx1 || gz < piece.gz0 || gz > piece.gz1 + 1) return undefined;
    if (gz !== piece.gz0 && gz !== piece.gz1 + 1) return 0;
    side = gz === piece.gz0 ? 0 : 2;
    at = gx - piece.gx0;
  }
  switch (piece.def.border) {
    case 'open':
      return 0;
    case 'walled':
      return side === piece.door && at === piece.doorAt ? 2 : 1;
    case 'corridor': {
      const alongX = piece.gx1 - piece.gx0 >= piece.gz1 - piece.gz0;
      const longSide = alongX ? side === 0 || side === 2 : side === 1 || side === 3;
      return longSide ? 1 : 0;
    }
  }
}

/** Build (cached) the contents of a chunk's piece in chunk-local coordinates. */
export function buildGridPiece(seed: number, p: GridParams, piece: GridPiece): PieceOut {
  let cache = buildCache.get(p);
  if (!cache) buildCache.set(p, (cache = new Map()));
  const key = seed + ':' + piece.cx + ',' + piece.cz;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 512) cache.clear();
  const C = p.cell;
  const N = p.cellsPerChunk;
  const out: PieceOut = { solids: [], decor: [], panels: [], lights: [], items: [], props: [], holes: [], floors: [] };
  const x0 = (piece.gx0 - piece.cx * N) * C;
  const z0 = (piece.gz0 - piece.cz * N) * C;
  const x1 = (piece.gx1 + 1 - piece.cx * N) * C;
  const z1 = (piece.gz1 + 1 - piece.cz * N) * C;
  itemCounter = 0;
  piece.def.build({
    x0,
    z0,
    x1,
    z1,
    w: x1 - x0,
    d: z1 - z0,
    H: p.ceiling,
    top: piece.def.ceiling(p.ceiling),
    wallT: p.wallT,
    rng: new Rng(hashInts(seed, 777, piece.cx, piece.cz)),
    out,
  });
  cache.set(key, out);
  return out;
}
