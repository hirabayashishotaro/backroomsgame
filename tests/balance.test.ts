import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveLevel, HAND_LEVEL_IDS } from '../src/levels/registry';
import { genomeOf } from '../src/levels/procedural/generated';

/** Almond water per 1000 m2, averaged over a patch of chunks (flat-ish levels). */
function density(id: string): number {
  const L = resolveLevel(id);
  const ctx = makeGenContext(7, L);
  let items = 0;
  let n = 0;
  for (let cx = -4; cx < 4; cx++)
    for (let cz = -3; cz < 3; cz++) {
      items += L.generator(ctx, cx, cz).items.length;
      n++;
    }
  return items / n / ((L.chunkSize * L.chunkSize) / 1000);
}

/** Bottles found along the way in levels that are not open planes. */
function bottlesAlong(id: string): number {
  const L = resolveLevel(id);
  const ctx = makeGenContext(7, L);
  let items = 0;
  if (L.vertical) for (let cy = -10; cy < 10; cy++) items += L.generator(ctx, 0, 0, cy).items.length;
  else if (L.topology === 'linear') for (let cx = -10; cx < 10; cx++) items += L.generator(ctx, cx, 0).items.length;
  else for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) items += L.generator(ctx, cx, cz).items.length;
  return items;
}

describe('balance (Phase 10)', () => {
  const ids = HAND_LEVEL_IDS.filter((x) => x !== 'frontrooms');
  const seen = new Set<string>();
  for (let n = 3; n < 400; n++) {
    const g = genomeOf(String(n)).grammar;
    if (!seen.has(g)) {
      seen.add(g);
      ids.push(String(n));
    }
  }
  it('every level offers a fair amount of almond water (0.4 - 4 per 1000 m2)', () => {
    const report: string[] = [];
    for (const id of ids) {
      const L = resolveLevel(id);
      if (L.vertical || ['linear', 'closed', 'chaos'].includes(L.topology ?? '')) {
        // Narrow worlds: a fair number of bottles along the way instead of per area.
        expect(bottlesAlong(id), id).toBeGreaterThanOrEqual(2);
        continue;
      }
      const d = density(id);
      report.push(`${id}: ${d.toFixed(2)}`);
      expect(d, report.join(', ')).toBeGreaterThanOrEqual(0.4);
      expect(d, report.join(', ')).toBeLessThanOrEqual(4);
    }
  });
});
