import { describe, expect, it } from 'vitest';
import { resolveCylinder, groundHeight, type WBox, type FloorRect } from '../src/world/collision';
import { PlayerController, type MoveInput } from '../src/player/controller';

const wall: WBox = { minX: -0.1, maxX: 0.1, minY: 0, maxY: 3, minZ: -10, maxZ: 10 };
const floor: FloorRect = { x0: -50, z0: -50, x1: 50, z1: 50, y: 0 };
const input = (o: Partial<MoveInput> = {}): MoveInput => ({ forward: 0, strafe: 0, sprint: false, crouch: false, jump: false, ...o });
const world = (boxes: WBox[], floors: FloorRect[] = [floor]) => ({ boxes: () => boxes, floors: () => floors });

function run(p: PlayerController, seconds: number, inp: MoveInput, w: ReturnType<typeof world>, jumpEvery = 0): void {
  for (let i = 0; i < seconds / 0.02; i++) p.step(0.02, { ...inp, jump: jumpEvery > 0 && i % jumpEvery === 0 }, w);
}

describe('collision', () => {
  it('pushes a cylinder out of a wall', () => {
    expect(resolveCylinder(0.2, 0, 0, 0.3, 1.8, [wall]).x).toBeCloseTo(0.4, 5);
  });
  it('ignores boxes above the player', () => {
    expect(resolveCylinder(0.0, 0, 0, 0.3, 1.8, [{ ...wall, minY: 2.2 }]).x).toBe(0);
  });
  it('player cannot walk through a thin wall even when sprinting with a long frame', () => {
    const p = new PlayerController();
    p.x = -1;
    p.yaw = -Math.PI / 2; // facing +X
    for (let i = 0; i < 60; i++) p.step(0.05, input({ forward: 1, sprint: true }), world([wall]));
    expect(p.x).toBeLessThan(-0.39);
  });
  it('groundHeight finds the highest surface under the feet, or -Infinity over a pit', () => {
    const step: WBox = { minX: 1, maxX: 2, minY: 0, maxY: 0.4, minZ: -1, maxZ: 1 };
    expect(groundHeight(1.5, 0, 0.25, 0.45, [floor], [step])).toBeCloseTo(0.4);
    expect(groundHeight(5, 5, 0.25, 0.45, [], [step])).toBe(-Infinity);
  });
});

describe('movement: steps, jumping, falling', () => {
  it('walks up a low step without jumping', () => {
    const p = new PlayerController();
    p.yaw = -Math.PI / 2;
    const step: WBox = { minX: 1, maxX: 20, minY: 0, maxY: 0.4, minZ: -2, maxZ: 2 };
    run(p, 1.5, input({ forward: 1 }), world([step]));
    expect(p.x).toBeGreaterThan(1.5);
    expect(p.y).toBeCloseTo(0.4);
  });
  it('a 1m box blocks walking but can be jumped onto', () => {
    const block: WBox = { minX: 1, maxX: 20, minY: 0, maxY: 1.0, minZ: -2, maxZ: 2 };
    const a = new PlayerController();
    a.yaw = -Math.PI / 2;
    run(a, 1.5, input({ forward: 1 }), world([block]));
    expect(a.x).toBeLessThan(1);
    const b = new PlayerController();
    b.yaw = -Math.PI / 2;
    run(b, 1, input({ forward: 1 }), world([block]), 10);
    run(b, 0.6, input({ forward: 1 }), world([block]));
    expect(b.x).toBeGreaterThan(1.2);
    expect(b.y).toBeCloseTo(1.0);
  });
  it('a 1.5m box cannot be jumped onto', () => {
    const block: WBox = { minX: 1, maxX: 4, minY: 0, maxY: 1.5, minZ: -2, maxZ: 2 };
    const p = new PlayerController();
    p.yaw = -Math.PI / 2;
    run(p, 2, input({ forward: 1 }), world([block]), 10);
    expect(p.x).toBeLessThan(1);
  });
  it('falls into a hole in the floor', () => {
    const p = new PlayerController();
    p.yaw = -Math.PI / 2;
    const floors: FloorRect[] = [{ x0: -50, z0: -50, x1: 2, z1: 50, y: 0 }];
    run(p, 2, input({ forward: 1 }), world([], floors));
    expect(p.y).toBeLessThan(-3);
  });
});
