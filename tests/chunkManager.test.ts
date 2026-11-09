import { describe, expect, it } from 'vitest';
import { ChunkManager } from '../src/world/chunkManager';
import { makeGenContext } from '../src/levels/registry';
import { level0 } from '../src/levels/hand/level0';
import { FloatingOrigin } from '../src/world/floatingOrigin';

describe('ChunkManager', () => {
  it('never exceeds the chunk cap over a simulated 50km walk and disposes everything it builds', () => {
    const ctx = makeGenContext(1, level0);
    let built = 0;
    let disposed = 0;
    let clock = 0;
    const cm = new ChunkManager<number>({
      chunkSize: level0.chunkSize,
      radius: 3,
      budgetMs: 4,
      now: () => clock,
      generate: (cx, cz) => level0.generator(ctx, cx, cz),
      build: () => ++built,
      dispose: () => disposed++,
    });
    let peak = 0;
    const step = 2.0; // metres per simulated frame (fast, to stress streaming)
    // Diagonal walk for 50km.
    const dir = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
    for (let d = 0; d < 50000; d += step) {
      clock += 16;
      cm.update(d * dir.x, d * dir.z, dir.x, dir.z);
      peak = Math.max(peak, cm.chunks.size);
      expect(cm.chunks.size).toBeLessThanOrEqual(cm.maxChunks);
    }
    expect(peak).toBeLessThanOrEqual(cm.maxChunks);
    expect(built - disposed).toBe(cm.chunks.size);
    cm.clear();
    expect(built).toBe(disposed);
  });

  it('loads every chunk within the radius when stationary', () => {
    const ctx = makeGenContext(1, level0);
    const cm = new ChunkManager<null>({
      chunkSize: 32,
      radius: 2,
      budgetMs: 0,
      generate: (cx, cz) => level0.generator(ctx, cx, cz),
      build: () => null,
      dispose: () => {},
    });
    for (let i = 0; i < 30; i++) cm.update(10, 10);
    expect(cm.chunks.size).toBe(25);
    expect(cm.pending).toBe(0);
  });
});

describe('FloatingOrigin', () => {
  it('rebases to a chunk-aligned offset after 1000m', () => {
    const fo = new FloatingOrigin(32, 1000);
    expect(fo.update(500, 0)).toBe(false);
    expect(fo.update(1001, 0)).toBe(true);
    expect(fo.offsetX % 32).toBe(0);
    expect(Math.abs(fo.toRenderX(1001))).toBeLessThan(32);
    expect(fo.update(1_000_000_123.5, -77_777_777.2)).toBe(true);
    expect(Math.abs(fo.toRenderX(1_000_000_123.5))).toBeLessThan(32);
    expect(Math.abs(fo.toRenderZ(-77_777_777.2))).toBeLessThan(32);
  });
});
