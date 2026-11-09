import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/player/inventory';
import { Stats, type StatEnv } from '../src/player/stats';
import { rayBox } from '../src/world/collision';
import { WorldDeltas } from '../src/world/deltas';

const env = (o: Partial<StatEnv> = {}): StatEnv => ({
  running: false,
  moving: true,
  light: 0.8,
  flashlightOn: false,
  hydrationMul: 1,
  sanityDrain: 0,
  staminaRegenMul: 1,
  difficulty: 'normal',
  ...o,
});

describe('Inventory', () => {
  it('stacks up to the item limit and fills 16 slots', () => {
    const inv = new Inventory();
    for (let i = 0; i < 4; i++) expect(inv.add('almond_water')).toBe(true);
    expect(inv.slots[0]!.count).toBe(4);
    expect(inv.add('almond_water')).toBe(true);
    expect(inv.slots[1]!.count).toBe(1);
    for (let i = 0; i < 14; i++) inv.add('flashlight');
    expect(inv.add('flashlight')).toBe(false);
    expect(inv.slots.every((s) => s)).toBe(true);
  });
  it('loses half of all items on death', () => {
    const inv = new Inventory();
    for (let i = 0; i < 6; i++) inv.add('almond_water');
    inv.add('flashlight');
    inv.add('chalk');
    const lost = inv.loseHalf(() => 0);
    expect(lost.length).toBe(4);
    const remaining = inv.slots.reduce((n, s) => n + (s ? s.count : 0), 0);
    expect(remaining).toBe(4);
  });
  it('chalk keeps its uses as meta', () => {
    const inv = new Inventory();
    inv.add('chalk');
    expect(inv.slots[0]!.meta).toBe(20);
  });
});

describe('Stats', () => {
  it('hydration drains and running drains faster', () => {
    const a = new Stats();
    const b = new Stats();
    for (let i = 0; i < 600; i++) {
      a.update(0.1, env());
      b.update(0.1, env({ running: true }));
    }
    expect(a.hydration).toBeLessThan(100);
    expect(b.hydration).toBeLessThan(a.hydration);
  });
  it('darkness reduces sanity, light does not', () => {
    const dark = new Stats();
    const lit = new Stats();
    for (let i = 0; i < 100; i++) {
      dark.update(0.1, env({ light: 0.05 }));
      lit.update(0.1, env({ light: 0.8 }));
    }
    expect(dark.sanity).toBeLessThan(lit.sanity);
  });
  it('dies after staying dehydrated past the delay', () => {
    const s = new Stats();
    s.hydration = 0;
    let cause = null;
    for (let i = 0; i < 700 && !cause; i++) cause = s.update(0.1, env());
    expect(cause).toBe('dehydration');
  });
  it('stamina cannot exceed the hunger-limited cap', () => {
    const s = new Stats();
    s.hunger = 0;
    s.update(0.1, env({ moving: false }));
    expect(s.stamina).toBeLessThanOrEqual(40);
  });
});

describe('rayBox', () => {
  it('hits the near face with the right normal', () => {
    const b = { minX: 1, maxX: 2, minY: 0, maxY: 3, minZ: -1, maxZ: 1 };
    const h = rayBox(0, 1, 0, 1, 0, 0, b, 10)!;
    expect(h.t).toBeCloseTo(1);
    expect(h.nx).toBe(-1);
    expect(rayBox(0, 1, 0, -1, 0, 0, b, 10)).toBeNull();
  });
});

describe('WorldDeltas', () => {
  it('records taken and dropped items and round-trips through JSON', () => {
    const d = new WorldDeltas();
    d.take('0', '1,2', '3,4');
    const dropped = d.drop('0', '1,2', { id: 'chalk', x: 1, y: 0, z: 2 });
    expect(d.isTaken('0', '1,2', '3,4')).toBe(true);
    d.take('0', '1,2', dropped.uid);
    expect(d.get('0', '1,2')!.dropped.length).toBe(0);
    const e = new WorldDeltas();
    e.load(JSON.parse(JSON.stringify(d.toJSON())));
    expect(e.isTaken('0', '1,2', '3,4')).toBe(true);
  });
});
