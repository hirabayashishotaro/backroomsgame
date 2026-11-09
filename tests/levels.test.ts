import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveExitTarget, resolveLevel, entryHash } from '../src/levels/registry';
import type { LevelDefinition } from '../src/levels/levelDefinition';

const SEED = 4242;

function arrivalIsFree(level: LevelDefinition, h: number): boolean {
  const ctx = makeGenContext(SEED, level);
  const a = level.arrival(ctx, h);
  const S = level.chunkSize;
  const cx = Math.floor(a.x / S);
  const cz = Math.floor(a.z / S);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const d = level.generator(ctx, cx + dx, cz + dz);
      const ox = (cx + dx) * S;
      const oz = (cz + dz) * S;
      for (const b of d.solids) {
        if (b.minY > 1.7) continue;
        if (a.x > b.minX + ox - 0.3 && a.x < b.maxX + ox + 0.3 && a.z > b.minZ + oz - 0.3 && a.z < b.maxZ + oz + 0.3) return false;
      }
    }
  return true;
}

describe('levels', () => {
  const ids = ['0', '1', '2', '13', '14', '139', '482', '33.7', '-3', '4.3'];

  it('resolve: hand-made 0/1/2, everything else generated deterministically', () => {
    expect(resolveLevel('1').subtitle).toBe('The Habitable Zone');
    expect(resolveLevel('2').subtitle).toBe('Pipe Dreams');
    const a = resolveLevel('482');
    expect(a.title).toBe('Level 482');
    expect(resolveLevel('482')).toBe(a);
  });

  it('every level has at least 3 exit kinds and no exit without targets (no dead ends)', () => {
    for (const id of ids) {
      const L = resolveLevel(id);
      const kinds = new Set(L.exits.map((e) => e.kind));
      expect(kinds.size, id).toBeGreaterThanOrEqual(3);
      for (const e of L.exits) expect(e.targets.length).toBeGreaterThan(0);
    }
  });

  it('Level 0 reaches at least 5 different levels directly', () => {
    const L = resolveLevel('0');
    const targets = new Set(L.exits.flatMap((e) => e.targets.map((t) => t.levelId)));
    expect(targets.size).toBeGreaterThanOrEqual(5);
  });

  it('the same exit always leads to the same level', () => {
    const L = resolveLevel('0');
    for (const rule of L.exits)
      for (let k = 0; k < 20; k++) {
        const key = 'chunk' + k;
        expect(resolveExitTarget(SEED, '0', rule, key)).toBe(resolveExitTarget(SEED, '0', rule, key));
      }
    // and different exits can lead to different levels
    const door = L.exits.find((e) => e.prop === 'exit-door')!;
    const set = new Set(Array.from({ length: 60 }, (_, k) => resolveExitTarget(SEED, '0', door, 'k' + k)));
    expect(set.size).toBeGreaterThan(1);
  });

  it('arrival points are free of walls for every level', () => {
    for (const id of ids) {
      const L = resolveLevel(id);
      for (let k = 0; k < 12; k++) expect(arrivalIsFree(L, entryHash('x', 'e' + k)), `${id}#${k}`).toBe(true);
    }
  });

  it('generated levels produce at least 10 distinct themes', () => {
    const sig = new Set<string>();
    for (let n = 100; n < 160; n++) {
      const L = resolveLevel(String(n));
      sig.add(`${L.palette.wallTex.split(':').slice(0, 3).join(':')}|${L.ceilingHeight.toFixed(1)}|${L.chunkSize}`);
    }
    expect(sig.size).toBeGreaterThanOrEqual(10);
  });

  it('generated chunks are deterministic', () => {
    const L = resolveLevel('777');
    const a = L.generator(makeGenContext(SEED, L), 3, -2);
    const b = L.generator(makeGenContext(SEED, resolveLevel('777')), 3, -2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('Level 1 and 2 have doors to other levels', () => {
    for (const id of ['1', '2']) {
      const L = resolveLevel(id);
      const ctx = makeGenContext(SEED, L);
      let doors = 0;
      for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) doors += L.generator(ctx, cx, cz).props.length;
      expect(doors, id).toBeGreaterThan(3);
      for (const kind of new Set(
        Array.from({ length: 16 }, (_, k) => L.generator(ctx, k - 8, 0).props.map((p) => p.kind)).flat(),
      ))
        expect(L.exits.some((e) => e.kind === 'door' && e.prop === kind), `${id} ${kind}`).toBe(true);
    }
  });
});
