import { describe, expect, it } from 'vitest';
import { makeGenContext } from '../src/levels/registry';
import { CELL, CELLS_PER_CHUNK, level0, wallX, wallZ } from '../src/levels/hand/level0';

const ctx = makeGenContext(123456, level0);

describe('Level 0 generation', () => {
  it('is deterministic for the same seed and chunk', () => {
    for (const [cx, cz] of [[0, 0], [-3, 7], [100000, -250000]]) {
      const a = level0.generator(ctx, cx, cz);
      const b = level0.generator(makeGenContext(123456, level0), cx, cz);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('differs between seeds', () => {
    const other = makeGenContext(999, level0);
    expect(JSON.stringify(level0.generator(ctx, 0, 0))).not.toBe(JSON.stringify(level0.generator(other, 0, 0)));
  });

  it('walls at chunk borders match across neighbouring chunks', () => {
    // Every edge is owned by exactly one chunk; reconstruct the global edge set
    // from chunk outputs and compare it to the edge-hash function.
    const S = level0.chunkSize;
    const found = new Set<string>();
    for (let cx = -2; cx <= 2; cx++)
      for (let cz = -2; cz <= 2; cz++) {
        const d = level0.generator(ctx, cx, cz);
        for (const b of d.solids) {
          if (!b.mat.startsWith('wall') || b.minY > 0) continue;
          const wx = b.minX + cx * S;
          const wz = b.minZ + cz * S;
          const thinX = b.maxX - b.minX < 0.3;
          if (thinX) {
            const line = Math.round((wx + 0.1) / CELL);
            const gz = Math.floor((wz + 0.2) / CELL);
            found.add(`x:${line}:${gz}`);
          } else {
            const line = Math.round((wz + 0.1) / CELL);
            const gx = Math.floor((wx + 0.2) / CELL);
            found.add(`z:${gx}:${line}`);
          }
        }
      }
    const g0 = -2 * CELLS_PER_CHUNK;
    const g1 = 3 * CELLS_PER_CHUNK - 1;
    let expected = 0;
    for (let gx = g0; gx <= g1; gx++)
      for (let gz = g0; gz <= g1; gz++) {
        if (wallX(ctx.levelSeed, gx, gz)) {
          expected++;
          expect(found.has(`x:${gx}:${gz}`)).toBe(true);
        }
        if (wallZ(ctx.levelSeed, gx, gz)) {
          expected++;
          expect(found.has(`z:${gx}:${gz}`)).toBe(true);
        }
      }
    expect(found.size).toBe(expected);
  });

  it('chunk content stays within (or just over) its bounds', () => {
    const d = level0.generator(ctx, 5, -5);
    for (const b of d.solids) {
      expect(b.minX).toBeGreaterThanOrEqual(-0.5);
      expect(b.maxX).toBeLessThanOrEqual(level0.chunkSize + 0.5);
      expect(b.minZ).toBeGreaterThanOrEqual(-0.5);
      expect(b.maxZ).toBeLessThanOrEqual(level0.chunkSize + 0.5);
    }
  });

  it('spawn point is free of walls', () => {
    const d = level0.generator(ctx, 0, 0);
    const { x, z } = level0.spawn;
    for (const b of d.solids) {
      const inside = x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3;
      expect(inside).toBe(false);
    }
  });
});
