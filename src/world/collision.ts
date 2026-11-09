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
