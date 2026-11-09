/**
 * Chaos space: the world can no longer hold its shape. Every chunk borrows a
 * chunk from another world, rotated by a multiple of 90 degrees and shifted up
 * or down, with stray fragments hanging in the air. Pure, deterministic.
 */
import { hash01, hashInts, Rng } from '../../core/rng';
import type { Box, CeilingRect, ChunkData } from '../../world/chunkData';
import type { GenContext, LightSampler } from '../levelDefinition';
import { contextFor, lookupLevel } from '../resolverHook';

const S = 32;

function rot(r: number, x: number, z: number): [number, number] {
  switch (r & 3) {
    case 1:
      return [S - z, x];
    case 2:
      return [S - x, S - z];
    case 3:
      return [z, S - x];
    default:
      return [x, z];
  }
}

function rotBox<T extends { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }>(b: T, r: number, dy: number): T {
  const [ax, az] = rot(r, b.minX, b.minZ);
  const [bx, bz] = rot(r, b.maxX, b.maxZ);
  return { ...b, minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz), minY: b.minY + dy, maxY: b.maxY + dy };
}

function rotRect<T extends { x0: number; z0: number; x1: number; z1: number }>(c: T, r: number): T {
  const [ax, az] = rot(r, c.x0, c.z0);
  const [bx, bz] = rot(r, c.x1, c.z1);
  return { ...c, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
}

export interface ChaosParams {
  donors: string[];
  shift: number;
}

function pick(ctx: GenContext, p: ChaosParams, cx: number, cz: number) {
  const seed = ctx.levelSeed;
  const donor = lookupLevel(p.donors[Math.floor(hash01(seed, 701, cx, cz) * p.donors.length)]);
  const r = Math.floor(hash01(seed, 702, cx, cz) * 4);
  const dy = Math.round((hash01(seed, 703, cx, cz) - 0.5) * 2 * p.shift);
  const dctx = contextFor(ctx.worldSeed ^ 0x5a5a, donor);
  return { donor, r, dy, dctx };
}

export function generateChaos(ctx: GenContext, p: ChaosParams, cx: number, cz: number): ChunkData {
  const { donor, r, dy, dctx } = pick(ctx, p, cx, cz);
  const d = donor.generator(dctx, cx, cz);
  const out: ChunkData = {
    ...d,
    levelId: ctx.level.id,
    size: S,
    solids: d.solids.map((b) => rotBox(b, r, dy)),
    decor: d.decor.map((b) => rotBox(b, r, dy)),
    floors: d.floors.map((f) => ({ ...rotRect(f, r), y: f.y + dy })) as CeilingRect[],
    ceilings: d.ceilings.map((f) => ({ ...rotRect(f, r), y: f.y + dy })) as CeilingRect[],
    lights: d.lights.map((l) => {
      const [x, z] = rot(r, l.x, l.z);
      return r & 1 ? { ...l, x, z, y: l.y + dy, w: l.d, d: l.w } : { ...l, x, z, y: l.y + dy };
    }),
    items: d.items.map((it) => {
      const [x, z] = rot(r, it.x, it.z);
      return { ...it, x, z, y: it.y + dy };
    }),
    props: d.props.map((pr) => {
      const [x, z] = rot(r, pr.x, pr.z);
      return { ...pr, x, z, y: pr.y + dy, rotY: pr.rotY - (r * Math.PI) / 2, kind: pr.kind === 'locked-door' ? 'locked-door' : 'plain-door' };
    }),
    zones: d.zones.map((z) => rotRect(z, r)),
  };
  // Stray fragments: copies of a few boxes hanging in the air, upside down.
  const rng = new Rng(hashInts(ctx.levelSeed, 704, cx, cz));
  const extra: Box[] = [];
  for (let k = 0; k < 4 && out.solids.length; k++) {
    const b = out.solids[rng.int(0, out.solids.length - 1)];
    const lift = 6 + rng.float() * 18;
    extra.push({ ...b, minY: b.minY + lift, maxY: b.maxY + lift, thin: undefined });
  }
  out.decor.push(...extra);
  return out;
}

export function chaosSampler(ctx: GenContext, p: ChaosParams, cx: number, cz: number): LightSampler {
  const { donor, r, dy, dctx } = pick(ctx, p, cx, cz);
  const inner = donor.lightSampler(dctx, cx, cz);
  const ox = cx * S;
  const oz = cz * S;
  const inv = (4 - (r & 3)) & 3;
  return (wx, wy, wz, nx, ny, nz) => {
    const [lx, lz] = rot(inv, wx - ox, wz - oz);
    const [nnx, nnz] = rot(inv, nx + S / 2, nz + S / 2).map((v) => v - S / 2) as [number, number];
    return Math.min(1.2, 0.08 + inner(lx + ox, wy - dy, lz + oz, nnx, ny, nnz));
  };
}

/** Somewhere solid and free to stand near chunk (0,0). */
export function chaosArrival(ctx: GenContext, p: ChaosParams): { x: number; y: number; z: number; yaw: number } {
  for (let k = 0; k < 9; k++) {
    const cx = (k % 3) - 1;
    const cz = Math.floor(k / 3) - 1;
    const d = generateChaos(ctx, p, cx, cz);
    const free = (x: number, y: number, z: number) =>
      !d.solids.some((b) => !(b.maxY <= y + 0.45 || b.minY >= y + 1.7) && x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5) &&
      !d.zones.some((zn) => zn.kind === 'thin-floor' && x > zn.x0 - 0.5 && x < zn.x1 + 0.5 && z > zn.z0 - 0.5 && z < zn.z1 + 0.5);
    for (const f of d.floors)
      for (let x = Math.ceil(f.x0) + 1; x < f.x1 - 1; x += 2)
        for (let z = Math.ceil(f.z0) + 1; z < f.z1 - 1; z += 2) if (free(x, f.y, z)) return { x: cx * S + x, y: f.y, z: cz * S + z, yaw: 0 };
  }
  return { x: 16, y: 0, z: 16, yaw: 0 };
}
