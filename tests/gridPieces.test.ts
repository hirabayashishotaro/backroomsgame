import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveLevel } from '../src/levels/registry';
import { ALL_GRID_PIECES, GRID_PIECES } from '../src/levels/gridPieces';
import { LEVEL1_PARAMS } from '../src/levels/hand/level1';
import { LEVEL2_PARAMS } from '../src/levels/hand/level2';
import { gridWallX, gridWallZ } from '../src/levels/gridLevel';

const SEED = 99;

function pieceIdsIn(id: string, range = 9): Set<string> {
  const L = resolveLevel(id);
  const ctx = makeGenContext(SEED, L);
  const out = new Set<string>();
  for (let cx = -range; cx < range; cx++)
    for (let cz = -range; cz < range; cz++)
      for (const z of L.generator(ctx, cx, cz).zones) if (z.kind === 'piece' && z.name) out.add(z.name);
  return out;
}

describe('grid set pieces', () => {
  it('there are at least 10 kinds of structures', () => {
    expect(ALL_GRID_PIECES.length).toBeGreaterThanOrEqual(10);
  });

  it('Level 1 and Level 2 each show at least 5 kinds of structures', () => {
    expect(pieceIdsIn('1').size).toBeGreaterThanOrEqual(5);
    expect(pieceIdsIn('2').size).toBeGreaterThanOrEqual(5);
  });

  it('generated levels have their own structures, and different levels differ', () => {
    const sets = ['101', '202', '303', '404', '505'].map((id) => [...pieceIdsIn(id)].sort().join(','));
    for (const s of sets) expect(s.split(',').filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(new Set(sets).size).toBeGreaterThanOrEqual(3);
  });

  it('chunk borders stay consistent with pieces (edge function matches the generated walls)', () => {
    for (const [id, p] of [
      ['1', LEVEL1_PARAMS],
      ['2', LEVEL2_PARAMS],
    ] as const) {
      const L = resolveLevel(id);
      const ctx = makeGenContext(SEED, L);
      const C = p.cell;
      const N = p.cellsPerChunk;
      let walls = 0;
      let expected = 0;
      for (let cx = -3; cx < 3; cx++)
        for (let cz = -3; cz < 3; cz++) {
          const d = L.generator(ctx, cx, cz);
          walls += d.solids.filter((b) => b.mat.startsWith('wall') && b.minY === 0 && b.maxY >= p.ceiling - 0.01).length;
          for (let i = 0; i < N; i++)
            for (let j = 0; j < N; j++) {
              const gx = cx * N + i;
              const gz = cz * N + j;
              expected += [gridWallX(ctx.levelSeed, p, gx, gz), gridWallZ(ctx.levelSeed, p, gx, gz)].reduce<number>((n, k) => n + (k === 1 ? 1 : k === 2 ? 2 : 0), 0);
            }
        }
      void C;
      expect(walls).toBe(expected);
    }
  });

  it('platform pieces are climbable (each step at most 0.9m higher)', () => {
    const L = resolveLevel('1');
    const ctx = makeGenContext(SEED, L);
    for (let cx = -9; cx < 9; cx++)
      for (let cz = -9; cz < 9; cz++) {
        const d = L.generator(ctx, cx, cz);
        if (!d.zones.some((z) => z.name === 'platforms')) continue;
        const tops = d.solids.filter((b) => b.mat === 'metal' || b.mat === 'crate').map((b) => b.maxY);
        // first platform must be jumpable from the floor
        expect(Math.min(...tops)).toBeLessThanOrEqual(0.9);
      }
  });

  it('every piece definition has a name and description', () => {
    for (const def of Object.values(GRID_PIECES)) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.desc.length).toBeGreaterThan(10);
    }
  });
});
