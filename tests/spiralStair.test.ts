import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveLevel } from '../src/levels/registry';
import { PlayerController } from '../src/player/controller';
import type { LevelDefinition } from '../src/levels/levelDefinition';

/** Walk up a pool-room spiral stair with the real player physics, following the step centres. */
function climb(L: LevelDefinition, seed: number): { found: boolean; reached: boolean; top: number; H: number } {
  const ctx = makeGenContext(seed, L);
  for (let cx = -12; cx < 12; cx++)
    for (let cz = -12; cz < 12; cz++) {
      const d = L.generator(ctx, cx, cz, 0);
      const z = d.zones.find((q) => q.kind === 'piece' && q.name === 'spiral-stair');
      if (!z) continue;
      const S = d.size;
      const ox = cx * S;
      const oz = cz * S;
      const boxes = d.solids.map((b) => ({ ...b, minX: b.minX + ox, maxX: b.maxX + ox, minZ: b.minZ + oz, maxZ: b.maxZ + oz }));
      const floors = d.floors.map((f) => ({ x0: f.x0 + ox, x1: f.x1 + ox, z0: f.z0 + oz, z1: f.z1 + oz, y: f.y }));
      const ceilings = d.ceilings.map((f) => ({ x0: f.x0 + ox, x1: f.x1 + ox, z0: f.z0 + oz, z1: f.z1 + oz, y: f.y }));
      const world = { boxes: () => boxes, floors: () => floors, ceilings: () => ceilings };
      const mx = ox + 16;
      const mz = oz + 16;
      // The lowest step boxes tell us where the stair starts.
      const steps = boxes.filter((b) => b.mat === 'wall' && b.maxX - b.minX < 1.3 && b.maxY - b.minY < 0.3 && Math.hypot((b.minX + b.maxX) / 2 - mx, (b.minZ + b.maxZ) / 2 - mz) < 3.5);
      const first = steps.reduce((a, b) => (b.maxY < a.maxY ? b : a));
      let ang = Math.atan2((first.minZ + first.maxZ) / 2 - mz, (first.minX + first.maxX) / 2 - mx);
      const H = Math.max(...steps.map((b) => b.maxY));
      const p = new PlayerController();
      // Start on the floor just before the first step.
      p.x = mx + Math.cos(ang - 0.6) * 2.7;
      p.z = mz + Math.sin(ang - 0.6) * 2.7;
      p.y = 0;
      let top = 0;
      for (let i = 0; i < 60 * 40; i++) {
        // Aim a little ahead along the circle (counter-clockwise, the way the steps rise).
        const cur = Math.atan2(p.z - mz, p.x - mx);
        ang = cur + 0.35;
        const tx = mx + Math.cos(ang) * 2.7;
        const tz = mz + Math.sin(ang) * 2.7;
        p.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
        p.step(1 / 60, { forward: 1, strafe: 0, sprint: false, crouch: false, jump: false }, world as never);
        top = Math.max(top, p.y);
        if (p.y >= H - 0.05) return { found: true, reached: true, top, H };
      }
      return { found: true, reached: false, top, H };
    }
  return { found: false, reached: false, top: 0, H: 0 };
}

describe('pool rooms spiral stair', () => {
  it('can be walked all the way up without getting stuck (Level 37 and random pool rooms)', () => {
    let tested = 0;
    for (const id of ['37', '37.2']) {
      for (const seed of [1, 2, 3]) {
        const r = climb(resolveLevel(id), seed);
        if (!r.found) continue;
        tested++;
        expect(r.reached, `${id} seed ${seed}: reached ${r.top.toFixed(2)} of ${r.H}`).toBe(true);
      }
    }
    expect(tested).toBeGreaterThan(0);
  });
});
