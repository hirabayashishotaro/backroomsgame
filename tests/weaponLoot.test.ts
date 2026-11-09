import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveLevel } from '../src/levels/registry';
import { augmentLoot } from '../src/items/weaponLoot';

describe('weapon loot', () => {
  it('corpses with weapons are rare, deterministic, and always on an item spot', () => {
    const L = resolveLevel('1');
    const ctx = makeGenContext(9, L);
    let chunks = 0;
    let corpses = 0;
    let ammo = 0;
    const weapons = new Set<string>();
    for (let cx = -15; cx < 15; cx++)
      for (let cz = -15; cz < 15; cz++) {
        const d = L.generator(ctx, cx, cz);
        if (!d.items.length) continue;
        chunks++;
        const before = JSON.stringify(d.items.map((i) => [i.x, i.z]));
        const c = augmentLoot(d, ctx.levelSeed, false);
        const d2 = L.generator(ctx, cx, cz);
        expect(augmentLoot(d2, ctx.levelSeed, false)).toEqual(c);
        expect(JSON.stringify(d.items.slice(0, JSON.parse(before).length).map((i) => [i.x, i.z]))).toBe(before);
        corpses += c.length;
        for (const it of d.items) {
          if (['pistol', 'magnum', 'kunai', 'axe'].includes(it.id)) weapons.add(it.id);
          if (it.id.startsWith('ammo')) ammo++;
        }
      }
    expect(corpses / chunks).toBeGreaterThan(0.01);
    expect(corpses / chunks).toBeLessThan(0.1);
    expect(ammo).toBeGreaterThan(corpses);
    expect(weapons.size).toBeGreaterThanOrEqual(3);
  });
  it('no weapons in the ending room', () => {
    const L = resolveLevel('frontrooms');
    const d = L.generator(makeGenContext(1, L), 0, 0);
    expect(augmentLoot(d, 1, true)).toEqual([]);
  });
});
