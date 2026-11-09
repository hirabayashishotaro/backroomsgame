import { describe, expect, it } from 'vitest';
import { resolveCylinder } from '../src/world/collision';
import { PlayerController } from '../src/player/controller';

const wall = { minX: -0.1, maxX: 0.1, minY: 0, maxY: 3, minZ: -10, maxZ: 10 };

describe('collision', () => {
  it('pushes a cylinder out of a wall', () => {
    const r = resolveCylinder(0.2, 0, 0, 0.3, 1.8, [wall]);
    expect(r.x).toBeCloseTo(0.4, 5);
  });
  it('ignores boxes above the player', () => {
    const lintel = { ...wall, minY: 2.2 };
    const r = resolveCylinder(0.0, 0, 0, 0.3, 1.8, [lintel]);
    expect(r.x).toBe(0);
  });
  it('player cannot walk through a thin wall even when sprinting with a long frame', () => {
    const p = new PlayerController();
    p.x = -1;
    p.yaw = -Math.PI / 2; // facing +X
    for (let i = 0; i < 60; i++) p.step(0.05, { forward: 1, strafe: 0, sprint: true, crouch: false }, () => [wall]);
    expect(p.x).toBeLessThan(-0.39);
  });
});
