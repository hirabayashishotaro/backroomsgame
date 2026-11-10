import { describe, expect, it } from 'vitest';
import { Inventory, SLOTS } from '../src/player/inventory';
import { Stats, type StatEnv } from '../src/player/stats';
import { rayBox } from '../src/world/collision';
import { WorldDeltas } from '../src/world/deltas';
import { ITEMS } from '../src/items/itemDefs';

const env = (o: Partial<StatEnv> = {}): StatEnv => ({ running: false, drainMul: 1, difficulty: 'normal', ...o });

describe('Inventory (6 slots)', () => {
  it('holds exactly 6 items, one per slot', () => {
    const inv = new Inventory();
    expect(SLOTS).toBe(6);
    for (let i = 0; i < 6; i++) expect(inv.add('almond_water')).toBe(true);
    expect(inv.add('almond_water')).toBe(false);
    expect(inv.full).toBe(true);
  });
  it('take empties the slot', () => {
    const inv = new Inventory();
    inv.add('almond_water');
    expect(inv.take(0)).toBe('almond_water');
    expect(inv.count).toBe(0);
  });
  it('loses half of the items on death', () => {
    const inv = new Inventory();
    for (let i = 0; i < 4; i++) inv.add('almond_water');
    expect(inv.loseHalf(() => 0).length).toBe(2);
    expect(inv.count).toBe(2);
  });
  it('wraps hotbar selection', () => {
    const inv = new Inventory();
    inv.select(-1);
    expect(inv.selected).toBe(5);
    inv.select(6);
    expect(inv.selected).toBe(0);
  });
});

describe('Stats (health + dash only)', () => {
  it('health drains slowly over time and almond water heals it', () => {
    const s = new Stats();
    for (let i = 0; i < 600; i++) s.update(0.1, env());
    expect(s.health).toBeLessThan(100);
    expect(s.health).toBeGreaterThan(80);
    const before = s.health;
    s.heal(ITEMS.almond_water.heal);
    expect(s.health).toBeGreaterThan(before);
  });
  it('dash drains while running and recovers after stopping', () => {
    const s = new Stats();
    for (let i = 0; i < 20; i++) s.update(0.1, env({ running: true }));
    const low = s.stamina;
    expect(low).toBeLessThan(100);
    for (let i = 0; i < 40; i++) s.update(0.1, env());
    expect(s.stamina).toBeGreaterThan(low);
  });
  it('dies when health reaches zero', () => {
    const s = new Stats();
    s.health = 0.01;
    expect(s.update(0.5, env())).toBe('exhaustion');
  });
  it('hard drains faster than easy', () => {
    const a = new Stats();
    const b = new Stats();
    for (let i = 0; i < 100; i++) {
      a.update(0.1, env({ difficulty: 'easy' }));
      b.update(0.1, env({ difficulty: 'hard' }));
    }
    expect(b.health).toBeLessThan(a.health);
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
  it('records taken items and round-trips through JSON', () => {
    const d = new WorldDeltas();
    d.take('0', '1,2', '3,4');
    expect(d.isTaken('0', '1,2', '3,4')).toBe(true);
    const e = new WorldDeltas();
    e.load(JSON.parse(JSON.stringify(d.toJSON())));
    expect(e.isTaken('0', '1,2', '3,4')).toBe(true);
  });
});

describe('knockback', () => {
  it('pushes the body away and decays once it lands', async () => {
    const { PlayerController } = await import('../src/player/controller');
    const floor = { x0: -100, z0: -100, x1: 100, z1: 100, y: 0 };
    const world = { boxes: () => [], floors: () => [floor], terrain: undefined };
    const p = new PlayerController();
    p.knock(1, 0, 12, 5);
    expect(p.grounded).toBe(false);
    for (let i = 0; i < 120; i++) p.step(1 / 60, { forward: 0, strafe: 0, sprint: false, crouch: false, jump: false }, world as never);
    expect(p.x).toBeGreaterThan(3);
    expect(p.grounded).toBe(true);
    expect(Math.abs(p.kx)).toBeLessThan(0.5);
    const x = p.x;
    for (let i = 0; i < 120; i++) p.step(1 / 60, { forward: 0, strafe: 0, sprint: false, crouch: false, jump: false }, world as never);
    expect(p.x - x).toBeLessThan(0.2);
  });
});

describe('ceilings', () => {
  it('stop an upward launch at the ceiling (no passing through)', async () => {
    const { PlayerController } = await import('../src/player/controller');
    const floor = { x0: -100, z0: -100, x1: 100, z1: 100, y: 0 };
    const ceiling = { x0: -100, z0: -100, x1: 100, z1: 100, y: 4 };
    const world = { boxes: () => [], floors: () => [floor], ceilings: () => [ceiling] };
    const p = new PlayerController();
    p.vy = 15;
    p.grounded = false;
    let top = 0;
    for (let i = 0; i < 120; i++) {
      p.step(1 / 60, { forward: 0, strafe: 0, sprint: false, crouch: false, jump: false }, world as never);
      top = Math.max(top, p.y);
    }
    expect(top + 1.8).toBeLessThanOrEqual(4.01);
    expect(p.y).toBeCloseTo(0);
  });
});
