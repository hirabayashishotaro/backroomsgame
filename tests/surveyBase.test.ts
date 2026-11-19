import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveLevel } from '../src/levels/registry';
import { baseSiteFor, bunkerBox, bunkerDoor, BASE_P } from '../src/world/surveyBase';
import { baseContents, isBaseLevel } from '../src/levels/hand/surveyBase';
import { entityTableFor } from '../src/entities/director';
import { ITEMS } from '../src/items/itemDefs';

const SEED = 4242;

describe('survey bases', () => {
  it('turn up now and then in indoor levels, on floor, clear of walls, with room in front of the door', () => {
    let found = 0;
    let chunks = 0;
    for (const id of ['0', '1', '2']) {
      const L = resolveLevel(id);
      expect(L.environment).toBe('enclosed');
      const ctx = makeGenContext(SEED, L);
      for (let cx = -8; cx < 8; cx++)
        for (let cz = -8; cz < 8; cz++) {
          const d = L.generator(ctx, cx, cz, 0);
          chunks++;
          const s = baseSiteFor(d, ctx.levelSeed);
          if (!s) continue;
          found++;
          const b = bunkerBox(s);
          for (const w of d.solids) {
            const hit = w.maxX > b.minX && w.minX < b.maxX && w.maxZ > b.minZ && w.minZ < b.maxZ && w.maxY > s.y + 0.1 && w.minY < s.y + 2.7;
            expect(hit, `${id} ${cx},${cz}`).toBe(false);
          }
          const door = bunkerDoor(s);
          // The door is on the bunker's face, facing out.
          const fx = Math.sin(door.rotY);
          const fz = Math.cos(door.rotY);
          expect(Math.abs((door.x - s.x) * fx + (door.z - s.z) * fz - 1.32)).toBeLessThan(0.05);
        }
    }
    expect(found).toBeGreaterThan(chunks * BASE_P * 0.25);
    expect(found).toBeLessThan(chunks * BASE_P * 1.5);
  });

  it('inside: its own level with an exit, a rack of weapons and ammunition, one or two survey members, and no entities', () => {
    const id = 'base:1:3,4,0';
    expect(isBaseLevel(id)).toBe(true);
    const L = resolveLevel(id);
    expect(L.title).toBe('調査基地');
    expect(entityTableFor(id, { dark: false, safe: false })).toEqual([]);
    const d = L.generator(makeGenContext(SEED, L), 0, 0, 0);
    expect(d.props.filter((p) => p.kind === 'base-exit').length).toBe(1);
    const people = d.props.filter((p) => p.kind === 'surveyor').length;
    expect(people).toBeGreaterThanOrEqual(1);
    expect(people).toBeLessThanOrEqual(2);
    const weapons = d.items.filter((i) => ITEMS[i.id].kind === 'weapon');
    const ammo = d.items.filter((i) => ITEMS[i.id].kind === 'ammo');
    expect(weapons.length).toBeGreaterThanOrEqual(2);
    expect(ammo.length).toBeGreaterThanOrEqual(3);
    // Different bases, different racks; the same base, the same rack.
    expect(baseContents(id)).toEqual(baseContents(id));
    const racks = new Set(Array.from({ length: 20 }, (_, i) => baseContents('base:2:' + i + ',0,0').items.map((x) => x.id).join(',')));
    expect(racks.size).toBeGreaterThan(5);
  });
});
