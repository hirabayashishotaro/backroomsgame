import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveLevel } from '../src/levels/registry';
import { ARENA_HALF, ARENA_ID } from '../src/levels/hand/arena';
import { entityTableFor } from '../src/entities/director';

describe('combat lab arena', () => {
  const L = resolveLevel(ARENA_ID);
  const ctx = makeGenContext(1, L);
  const chunks = [-1, 0].flatMap((cx) => [-1, 0].map((cz) => L.generator(ctx, cx, cz)));

  it('is a closed hall: floor everywhere inside and walls on all four sides', () => {
    const area = chunks.reduce((s, c) => s + c.floors.reduce((a, f) => a + (f.x1 - f.x0) * (f.z1 - f.z0), 0), 0);
    expect(area).toBeCloseTo((ARENA_HALF * 2) ** 2, 3);
    const walls = chunks.flatMap((c) => c.solids.map((b) => ({ ...b, minX: b.minX + c.cx * 32, maxX: b.maxX + c.cx * 32, minZ: b.minZ + c.cz * 32, maxZ: b.maxZ + c.cz * 32 })));
    const A = ARENA_HALF;
    expect(walls.some((b) => b.maxZ <= -A + 0.01 && b.maxY >= 5)).toBe(true);
    expect(walls.some((b) => b.minZ >= A - 0.01 && b.maxY >= 5)).toBe(true);
    expect(walls.some((b) => b.maxX <= -A + 0.01 && b.maxY >= 5)).toBe(true);
    expect(walls.some((b) => b.minX >= A - 0.01 && b.maxY >= 5)).toBe(true);
    for (const b of chunks.flatMap((c) => c.solids)) expect(b.minX >= 0 && b.maxX <= 32 && b.minZ >= 0 && b.maxZ <= 32).toBe(true);
  });

  it('has no exits, no loot and no random encounters', () => {
    expect(L.exits).toHaveLength(0);
    expect(chunks.every((c) => c.items.length === 0)).toBe(true);
    expect(entityTableFor(ARENA_ID, { dark: false, safe: false })).toHaveLength(0);
    expect(L.generator(ctx, 3, 3).solids).toHaveLength(0);
  });
});

describe('arena spawn points', () => {
  it('blocks pillars, cover and the outer walls; frees open floor', async () => {
    const { arenaBlocked } = await import('../src/levels/hand/arena');
    expect(arenaBlocked(11, 11)).toBe(true); // pillar
    expect(arenaBlocked(0, -15)).toBe(true); // low cover
    expect(arenaBlocked(30, 0)).toBe(true); // outside
    expect(arenaBlocked(0, 0)).toBe(false);
    expect(arenaBlocked(0, 22)).toBe(false);
  });
});
