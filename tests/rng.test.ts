import { describe, expect, it } from 'vitest';
import { hash01, hashInts, mulberry32, Rng } from '../src/core/rng';

describe('rng', () => {
  it('mulberry32 is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('values are in [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('hashInts distinguishes far coordinates and negatives', () => {
    expect(hashInts(1, 2)).not.toBe(hashInts(2, 1));
    expect(hashInts(-1, 0)).not.toBe(hashInts(1, 0));
    expect(hashInts(5, 0)).not.toBe(hashInts(5 + 4294967296, 0));
    expect(hash01(3, 4)).toBe(hash01(3, 4));
  });
});
