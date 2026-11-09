import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveExitTarget, resolveLevel, entryHash } from '../src/levels/registry';
import type { LevelDefinition } from '../src/levels/levelDefinition';
import { groundHeight } from '../src/world/collision';
import { genomeOf } from '../src/levels/procedural/generated';
import { HAND_LEVEL_IDS } from '../src/levels/registry';
import { ESCAPE_ROUTE } from '../src/escapeRoute';

const SEED = 4242;

function arrivalIsFree(level: LevelDefinition, h: number): boolean {
  const ctx = makeGenContext(SEED, level);
  const a = level.arrival(ctx, h);
  const S = level.chunkSize;
  const cx = Math.floor(a.x / S);
  const cz = Math.floor(a.z / S);
  const boxes = [];
  const floors = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const d = level.generator(ctx, cx + dx, cz + dz);
      const ox = (cx + dx) * S;
      const oz = (cz + dz) * S;
      for (const b of d.solids) boxes.push({ ...b, minX: b.minX + ox, maxX: b.maxX + ox, minZ: b.minZ + oz, maxZ: b.maxZ + oz });
      for (const f of d.floors) floors.push({ x0: f.x0 + ox, x1: f.x1 + ox, z0: f.z0 + oz, z1: f.z1 + oz, y: f.y });
    }
  // Nothing blocks the body...
  for (const b of boxes) {
    if (b.maxY <= a.y + 0.45 || b.minY >= a.y + 1.7) continue;
    if (a.x > b.minX - 0.3 && a.x < b.maxX + 0.3 && a.z > b.minZ - 0.3 && a.z < b.maxZ + 0.3) return false;
  }
  // ...and there is ground under the feet (groundless levels arrive on a platform).
  return Math.abs(groundHeight(a.x, a.z, 0.2, a.y + 0.45, floors, boxes) - a.y) < 0.05;
}

describe('levels', () => {
  const ids = ['0', '1', '2', 'u1', 'u2', 'u3', 'void', '4.3', '7.5', '13', '14', '27', '37', '139', '482', '33.7', '-3', '57', '88', '404', '999'];
  // plus one example of every generated grammar
  const seen = new Set<string>();
  for (let n = 3; n < 600; n++) {
    const g = genomeOf(String(n)).grammar;
    if (!seen.has(g)) {
      seen.add(g);
      ids.push(String(n));
    }
  }

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

  it('generated levels use many kinds of worlds (indoor, outdoor, groundless) and skies', () => {
    const grammars = new Set<string>();
    const skies = new Set<string>();
    for (let n = 3; n < 400; n++) {
      const g = genomeOf(String(n));
      grammars.add(g.grammar);
      if (g.sky) skies.add(g.sky);
    }
    expect(grammars.size).toBeGreaterThanOrEqual(8);
    expect(skies.size).toBeGreaterThanOrEqual(5);
    // outdoor levels have a sky, groundless ones fall into another level
    for (let n = 3; n < 120; n++) {
      const L = resolveLevel(String(n));
      if (L.environment === 'open-sky') expect(L.sky, L.id).toBeTruthy();
      if (L.groundless) expect(L.fall?.mode).toBe('transition');
    }
  });

  it('U1-U3 and the Void follow SPEC 4.2.1 (sky, groundless U1 with a fall transition)', () => {
    const u1 = resolveLevel('u1');
    expect(u1.groundless).toBe(true);
    expect(u1.fall?.mode).toBe('transition');
    expect(u1.sky?.kind).toBe('dawn');
    expect(u1.setPieces.length).toBeGreaterThanOrEqual(4);
    expect(resolveLevel('u2').setPieces.length).toBeGreaterThanOrEqual(3);
    expect(resolveLevel('u3').setPieces.length).toBeGreaterThanOrEqual(5);
    expect(resolveLevel('void').groundless).toBe(true);
  });

  it('every hand-made level has at least 5 kinds of set pieces (SPEC 3.5)', () => {
    for (const id of HAND_LEVEL_IDS) {
      if (id === 'frontrooms') continue; // the ending room
      expect(resolveLevel(id).setPieces.length, id).toBeGreaterThanOrEqual(5);
    }
  });

  it('escape route levels all resolve and the ending room has a bottle on the table', () => {
    for (const id of ESCAPE_ROUTE) expect(resolveLevel(id).id).toBe(id);
    const F = resolveLevel('frontrooms');
    const d = F.generator(makeGenContext(SEED, F), 0, 0);
    expect(d.items.some((i) => i.id === 'almond_water' && i.y > 0.5)).toBe(true);
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
