import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveExitTarget, resolveLevel, entryHash } from '../src/levels/registry';
import type { LevelDefinition } from '../src/levels/levelDefinition';
import { groundHeight } from '../src/world/collision';
import { sampleTerrain } from '../src/world/terrain';
import { genomeOf } from '../src/levels/procedural/generated';
import { HAND_LEVEL_IDS } from '../src/levels/registry';

const SEED = 4242;

function arrivalIsFree(level: LevelDefinition, h: number): boolean {
  const ctx = makeGenContext(SEED, level);
  const a = level.arrival(ctx, h);
  const S = level.chunkSize;
  const cx = Math.floor(a.x / S);
  const cz = Math.floor(a.z / S);
  const boxes = [];
  const floors = [];
  const slab = level.vertical?.slab;
  const cys = slab ? [Math.floor(a.y / slab) - 1, Math.floor(a.y / slab), Math.floor(a.y / slab) + 1] : [0];
  for (const cy of cys)
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const d = level.generator(ctx, cx + dx, cz + dz, cy);
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
  let g = groundHeight(a.x, a.z, 0.2, a.y + 0.45, floors, boxes);
  const d0 = level.generator(ctx, cx, cz, 0);
  if (d0.terrain) {
    const th = sampleTerrain(d0.terrain, a.x - cx * S, a.z - cz * S);
    if (th !== null && th <= a.y + 0.45) g = Math.max(g, th);
  }
  return Math.abs(g - a.y) < 0.05;
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
  }, 30000);

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

  it('random levels are mostly not ceilinged mazes, and terrain comes in variants', () => {
    let indoorMaze = 0;
    const labels = new Set<string>();
    let waterVolcano = false;
    let daySwamp = false;
    for (let n = 3; n < 1500; n++) {
      const id = String(n);
      const g = genomeOf(id);
      if (g.grammar === 'grid' || g.grammar === 'ruins') indoorMaze++;
      const L = resolveLevel(id);
      if (L.kindLabel) labels.add(L.kindLabel.split('・')[0]);
      if (g.grammar === 'volcano' && !L.lava) waterVolcano = true;
      if (g.grammar === 'swamp' && L.sky && L.sky.kind !== 'night') daySwamp = true;
    }
    expect(indoorMaze / 1497).toBeLessThan(0.12);
    expect(waterVolcano).toBe(true);
    expect(daySwamp).toBe(true);
    expect(labels.size).toBeGreaterThanOrEqual(35);
  });

  it('fusion levels: arrivals are free, and almost every one is a different combination', () => {
    const labels = new Set<string>();
    let fusion = 0;
    let overlaid = 0;
    for (let n = 3; n < 700 && fusion < 40; n++) {
      const id = String(n);
      const g = genomeOf(id);
      const L = resolveLevel(id);
      if (g.grammar !== 'fusion') {
        if ((L.kindLabel ?? '').includes(' + ')) overlaid++;
        continue;
      }
      fusion++;
      labels.add(L.kindLabel ?? '');
      for (let k = 0; k < 4; k++) expect(arrivalIsFree(L, entryHash('x', 'e' + k)), `${id}#${k} ${L.kindLabel}`).toBe(true);
    }
    expect(fusion).toBe(40);
    expect(labels.size).toBeGreaterThanOrEqual(38);
    expect(overlaid).toBeGreaterThan(20);
  });

  it('pieces of the explicit worlds (vaporwave, Memphis, the city, the bathhouse) turn up in random levels', () => {
    const want = ['石膏の胸像', 'ローマの柱', 'ネオンのヤシ', 'メンフィスの家具', '波線の壁', 'ピンクの幕', '自販機', '富士の壁画', '洗い場', '湯船', '黄色い桶', '岩風呂', 'サウナの段', '木のロッカー'];
    const found = new Set<string>();
    for (let n = 3; n < 1500; n++) {
      const label = resolveLevel(String(n)).kindLabel ?? '';
      for (const w of want) if (label.includes(w)) found.add(w);
    }
    expect([...found].sort()).toEqual([...want].sort());
  });

  it('levels with pieces of other worlds layered in still have free arrivals', () => {
    let tested = 0;
    for (let n = 3; n < 400 && tested < 30; n++) {
      const L = resolveLevel(String(n));
      if (!(L.kindLabel ?? '').includes(' + ')) continue;
      tested++;
      for (let k = 0; k < 3; k++) expect(arrivalIsFree(L, entryHash('y', 'e' + k)), `${n}#${k} ${L.kindLabel}`).toBe(true);
    }
    expect(tested).toBe(30);
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

  it('the ending street resolves, has a walkable street, and the old break room still has its bottle', () => {
    const E = resolveLevel('shibuya');
    const e = E.generator(makeGenContext(SEED, E), 0, 1);
    expect(e.floors.length).toBeGreaterThan(0);
    expect(e.solids.length).toBeGreaterThan(5);
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

describe('shaped worlds (user request)', () => {
  const explicit = ['111', '222', '303', '666', '1000', '808', '120', '512', '77', '451', '313', '900', 'null', '212', '9999', '37.2', '186', 'chaos'];

  it('all explicit shaped levels exist with their topology', () => {
    const topo: Record<string, string | undefined> = {};
    for (const id of explicit) topo[id] = resolveLevel(id).topology;
    expect(topo['111']).toBe('vertical');
    expect(topo['313']).toBe('vertical');
    expect(topo['512']).toBe('vertical');
    expect(topo['120']).toBe('vertical');
    expect(topo['37.2']).toBe('vertical');
    expect(topo['222']).toBe('linear');
    expect(topo['303']).toBe('diagonal');
    expect(topo['1000']).toBe('closed');
    expect(topo['808']).toBe('closed');
    expect(topo['900']).toBe('closed');
    expect(topo['chaos']).toBe('chaos');
  });

  it('vertical levels really extend vertically (content far above and below)', () => {
    for (const id of ['111', '313', '512', '120', '37.2']) {
      const L = resolveLevel(id);
      const ctx = makeGenContext(SEED, L);
      const hi = L.generator(ctx, 0, 0, 25);
      const lo = L.generator(ctx, 0, 0, -25);
      expect(hi.solids.length + hi.floors.length, id).toBeGreaterThan(0);
      expect(lo.solids.length + lo.floors.length, id).toBeGreaterThan(0);
      expect(Math.min(...lo.solids.map((b) => b.minY), ...lo.floors.map((f) => f.y)), id).toBeLessThan(-50);
    }
  });

  it('the mountain climbs: the path gets higher along +x', () => {
    const L = resolveLevel('303');
    const ctx = makeGenContext(SEED, L);
    const top = (cx: number) => Math.max(...L.generator(ctx, cx, 0).terrain!.h);
    expect(top(20)).toBeGreaterThan(top(0) + 60);
  });

  it('the tunnel never branches (nothing outside its corridor)', () => {
    const L = resolveLevel('222');
    const ctx = makeGenContext(SEED, L);
    expect(L.generator(ctx, 3, 1).solids.length).toBe(0);
    expect(L.generator(ctx, 3, -1).solids.length).toBe(0);
  });

  it('the temple is a single room: no content outside chunk (0,0)', () => {
    const L = resolveLevel('1000');
    const ctx = makeGenContext(SEED, L);
    expect(L.generator(ctx, 1, 0).solids.length).toBe(0);
    expect(L.generator(ctx, 0, 0).props.length).toBe(12);
  });

  it('chaos and some random levels are glitched (garbled names)', () => {
    expect(resolveLevel('chaos').glitch).toBe(true);
    let glitched = 0;
    for (let n = 3; n < 400; n++) if (resolveLevel(String(n)).glitch) glitched++;
    expect(glitched).toBeGreaterThan(5);
    expect(glitched).toBeLessThan(80);
  });

  it('random generation now uses at least 20 kinds of worlds', () => {
    const g = new Set<string>();
    for (let n = 3; n < 1000; n++) g.add(genomeOf(String(n)).grammar);
    expect(g.size).toBeGreaterThanOrEqual(20);
  });
});

describe('exits lead to generated levels too', () => {
  it('about a third of door/wall/floor exits go to generated levels, deterministically', () => {
    for (const id of ['0', '1', '37', '512', '808']) {
      const L = resolveLevel(id);
      const rule = L.exits.find((e) => e.kind === 'door') ?? L.exits[0];
      let gen = 0;
      const N = 300;
      for (let k = 0; k < N; k++) {
        const to = resolveExitTarget(SEED, id, rule, 'k' + k);
        expect(resolveExitTarget(SEED, id, rule, 'k' + k)).toBe(to);
        if (!rule.targets.some((t) => t.levelId === to)) gen++;
      }
      expect(gen / N, id).toBeGreaterThan(0.2);
      expect(gen / N, id).toBeLessThan(0.55);
    }
  });

  it('the bathhouse varies: room kinds, several baths, merged halls, free arrivals', () => {
    const L = resolveLevel('sento');
    const ctx = makeGenContext(SEED, L);
    const kinds = new Set<string>();
    let maxBaths = 0;
    let merged = 0;
    for (let cx = -6; cx < 6; cx++)
      for (let cz = -6; cz < 6; cz++) {
        const d = L.generator(ctx, cx, cz, 0);
        const names = (d.zones ?? []).filter((z) => z.kind === 'piece').map((z) => (z as { name: string }).name);
        for (const n of names) kinds.add(n);
        maxBaths = Math.max(maxBaths, (d.zones ?? []).filter((z) => z.kind === 'water').length);
        // A merged hall has a whole wall missing: no solid on that edge at all.
        if (!d.solids.some((b) => b.maxX < 0.2 && b.maxY > 2)) merged++;
        expect(JSON.stringify(L.generator(ctx, cx, cz, 0))).toBe(JSON.stringify(d));
      }
    for (const k of ['bath', 'wash-row', 'rotenburo', 'sauna', 'cold-bath', 'changing-room']) expect(kinds.has(k), k).toBe(true);
    expect(maxBaths).toBeGreaterThanOrEqual(3);
    expect(merged).toBeGreaterThan(5);
    for (let k = 0; k < 12; k++) expect(arrivalIsFree(L, entryHash('s', 'e' + k)), 'arrival ' + k).toBe(true);
  });
});
