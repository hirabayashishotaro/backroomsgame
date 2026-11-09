/** Shared helpers for the shaped worlds (pure). */
import { hash01 } from '../../core/rng';
import type { Box, CeilingRect, ChunkData, ItemSpawn, LightPanel, Prop, Zone } from '../../world/chunkData';
import type { GenContext, LightSampler } from '../levelDefinition';

export interface Light {
  x: number;
  y: number;
  z: number;
  I: number;
}

export interface Out {
  solids: Box[];
  decor: Box[];
  items: ItemSpawn[];
  props: Prop[];
  zones: Zone[];
  floors: CeilingRect[];
  ceilings: CeilingRect[];
  panels: LightPanel[];
  lights: Light[];
}

export function emptyOut(): Out {
  return { solids: [], decor: [], items: [], props: [], zones: [], floors: [], ceilings: [], panels: [], lights: [] };
}

export function box(list: Box[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string): Box {
  const b: Box = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minY: Math.min(y0, y1), maxY: Math.max(y0, y1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), mat };
  list.push(b);
  return b;
}

export function toChunk(ctx: GenContext, cx: number, cz: number, cy: number, S: number, o: Out): ChunkData {
  return {
    levelId: ctx.level.id,
    cx,
    cz,
    cy: cy || undefined,
    size: S,
    solids: o.solids,
    decor: o.decor,
    lights: o.panels,
    floors: o.floors,
    ceilings: o.ceilings,
    items: o.items,
    props: o.props,
    zones: o.zones,
  };
}

/** Smooth value noise in [0,1). */
export function noise2(seed: number, salt: number, x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash01(seed, salt, xi, zi);
  const b = hash01(seed, salt, xi + 1, zi);
  const c = hash01(seed, salt, xi, zi + 1);
  const d = hash01(seed, salt, xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export function fbm2(seed: number, salt: number, x: number, z: number, oct = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(seed, salt + i * 17, x * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return v / (1 - Math.pow(0.5, oct));
}

/** Ambient + sun + point lights (+ optional glow from below, e.g. lava). */
export function sampler(base: number, sun: [number, number, number] | null, lights: Light[], below?: { y: number; I: number }): LightSampler {
  let sx = 0;
  let sy = 1;
  let sz = 0;
  if (sun) {
    const l = Math.hypot(...sun) || 1;
    [sx, sy, sz] = [sun[0] / l, sun[1] / l, sun[2] / l];
  }
  return (wx, wy, wz, nx, ny, nz) => {
    let L = base * (sun ? 0.55 + 0.3 * Math.max(0, ny) + 0.35 * Math.max(0, nx * sx + ny * sy + nz * sz) - (ny < -0.5 ? 0.25 : 0) : 1);
    for (const l of lights) {
      const dx = l.x - wx;
      const dy = l.y - wy;
      const dz = l.z - wz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 625) continue;
      const d = Math.sqrt(d2) || 1;
      const k = Math.max(0.2, (nx * dx + ny * dy + nz * dz) / d);
      L += (l.I * k * 7) / (d2 + 3);
    }
    if (below) L += below.I * Math.max(0, 1 - (wy - below.y) / 6) * (ny < 0 ? 1 : 0.5);
    return Math.min(1.3, Math.max(0.02, L));
  };
}

/** Lights of this and the 8 neighbouring chunks (world coordinates). */
export function neighbourLights(S: number, cx: number, cz: number, get: (cx: number, cz: number) => Light[]): Light[] {
  const out: Light[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) for (const l of get(cx + dx, cz + dz)) out.push({ x: l.x + (cx + dx) * S, y: l.y, z: l.z + (cz + dz) * S, I: l.I });
  return out;
}

/** A dim ring of wall boxes approximating a circle (radius r, n segments). */
export function ring(list: Box[], cx: number, cz: number, r: number, n: number, y0: number, y1: number, thick: number, mat: string): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * (r + thick / 2);
    const z = cz + Math.sin(a) * (r + thick / 2);
    const w = ((2 * Math.PI * r) / n) * 0.62 + thick;
    box(list, x - w / 2, y0, z - w / 2, x + w / 2, y1, z + w / 2, mat);
  }
}
