import type { Box } from './chunkData';

/** World-space AABB. */
export interface WBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/**
 * Push a vertical cylinder (radius r, from y to y+h) out of the given boxes in XZ.
 * Returns the corrected position. Iterates a few times for corners.
 */
export function resolveCylinder(
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  boxes: Iterable<WBox>,
): { x: number; z: number } {
  const list = Array.isArray(boxes) ? (boxes as WBox[]) : [...boxes];
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of list) {
      if (y + h <= b.minY || y >= b.maxY) continue;
      const qx = Math.max(b.minX, Math.min(x, b.maxX));
      const qz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - qx;
      const dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = r - d;
        x += (dx / d) * push;
        z += (dz / d) * push;
      } else {
        // Centre is inside the box: push out along the shallowest axis.
        const left = x - b.minX;
        const right = b.maxX - x;
        const back = z - b.minZ;
        const front = b.maxZ - z;
        const m = Math.min(left, right, back, front);
        if (m === left) x = b.minX - r;
        else if (m === right) x = b.maxX + r;
        else if (m === back) z = b.minZ - r;
        else z = b.maxZ + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

export function toWorldBox(b: Box, ox: number, oz: number): WBox {
  return { minX: b.minX + ox, maxX: b.maxX + ox, minY: b.minY, maxY: b.maxY, minZ: b.minZ + oz, maxZ: b.maxZ + oz };
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

/** Ray vs AABB slab test. Returns the entry distance and face normal, or null. */
export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: WBox,
  maxT: number,
): RayHit | null {
  let tmin = 0;
  let tmax = maxT;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const axes: Array<[number, number, number, number, 0 | 1 | 2]> = [
    [ox, dx, b.minX, b.maxX, 0],
    [oy, dy, b.minY, b.maxY, 1],
    [oz, dz, b.minZ, b.maxZ, 2],
  ];
  for (const [o, d, lo, hi, axis] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    let sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = axis === 0 ? sign : 0;
      ny = axis === 1 ? sign : 0;
      nz = axis === 2 ? sign : 0;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (nx === 0 && ny === 0 && nz === 0) return null; // origin inside the box
  return { t: tmin, nx, ny, nz };
}
