import { describe, expect, it } from 'vitest';
import { makeGenContext, resolveLevel } from '../src/levels/registry';
import { PlayerController, type MoveInput, type WorldQuery } from '../src/player/controller';
import { sampleTerrain } from '../src/world/terrain';
import type { ChunkData } from '../src/world/chunkData';
import type { FloorRect, WBox } from '../src/world/collision';
import { MANSION_SLAB, POOL_SLAB } from '../src/levels/shapes/vertical';

/** A world query that generates chunks on demand (like the game's ensureGround). */
function worldFor(id: string): WorldQuery {
  const L = resolveLevel(id);
  const ctx = makeGenContext(31, L);
  const S = L.chunkSize;
  const slab = L.vertical?.slab;
  const cache = new Map<string, ChunkData>();
  const chunk = (cx: number, cz: number, cy: number) => {
    const k = `${cx},${cz},${cy}`;
    let d = cache.get(k);
    if (!d) cache.set(k, (d = L.generator(ctx, cx, cz, cy)));
    return d;
  };
  let py = 0;
  const column = (x: number, z: number) => {
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    if (!slab) return [chunk(cx, cz, 0)];
    const cy = Math.floor(py / slab);
    return [chunk(cx, cz, cy - 1), chunk(cx, cz, cy), chunk(cx, cz, cy + 1)];
  };
  return {
    boxes: (x, z) => {
      const out: WBox[] = [];
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const d of column(x + dx, z + dz)) {
            const ox = d.cx * S;
            const oz = d.cz * S;
            for (const b of d.solids) out.push({ minX: b.minX + ox, maxX: b.maxX + ox, minY: b.minY, maxY: b.maxY, minZ: b.minZ + oz, maxZ: b.maxZ + oz });
          }
      return out;
    },
    floors: (x, z) => {
      const out: FloorRect[] = [];
      for (const d of column(x, z)) for (const f of d.floors) out.push({ x0: f.x0 + d.cx * S, x1: f.x1 + d.cx * S, z0: f.z0 + d.cz * S, z1: f.z1 + d.cz * S, y: f.y });
      return out;
    },
    terrain: (x, z) => {
      const d = chunk(Math.floor(x / S), Math.floor(z / S), 0);
      return d.terrain ? sampleTerrain(d.terrain, x - d.cx * S, z - d.cz * S) : null;
    },
    // test hook: keep the slab window around the player
    ...{ setY: (y: number) => (py = y) },
  } as WorldQuery & { setY: (y: number) => void };
}

const go = (o: Partial<MoveInput> = {}): MoveInput => ({ forward: 1, strafe: 0, sprint: false, crouch: false, jump: false, ...o });

function walk(p: PlayerController, w: WorldQuery & { setY?: (y: number) => void }, seconds: number, yaw: number): number {
  p.yaw = yaw;
  let minY = p.y;
  for (let i = 0; i < seconds / 0.02; i++) {
    w.setY?.(p.y);
    p.step(0.02, go(), w);
    minY = Math.min(minY, p.y);
  }
  return minY;
}

describe('walking the vertical worlds (no holes on the intended route)', () => {
  it('mansion: climb the switchback stairs through several floors', () => {
    const w = worldFor('512') as WorldQuery & { setY: (y: number) => void };
    const p = new PlayerController();
    // Start on floor 0 east of the stairwell in the north lane (even floors climb toward -x).
    p.x = 9.5;
    p.z = 15;
    p.y = 0;
    for (let floor = 0; floor < 4; floor++) {
      const even = floor % 2 === 0;
      const y0 = floor * MANSION_SLAB;
      const lane = even ? 15 : 17;
      p.z = lane;
      p.x = even ? 9.0 : 0.8;
      p.y = y0;
      p.vy = 0;
      p.grounded = true;
      const minY = walk(p, w, 2.6, even ? Math.PI / 2 : -Math.PI / 2); // yaw pi/2 faces -x
      expect(minY, `floor ${floor}`).toBeGreaterThanOrEqual(y0 - 0.01);
      expect(p.y, `floor ${floor}`).toBeCloseTo(y0 + MANSION_SLAB, 1);
      expect(p.grounded).toBe(true);
    }
  });

  it('stacked poolrooms: the stairs end on solid floor of the slab above', () => {
    const w = worldFor('37.2') as WorldQuery & { setY: (y: number) => void };
    // Find the stair start in chunk (0,0) for slabs 0..3 from the generated boxes.
    const L = resolveLevel('37.2');
    const ctx = makeGenContext(31, L);
    for (let cy = 0; cy < 4; cy++) {
      const d = L.generator(ctx, 0, 0, cy);
      const steps = d.solids.filter((b) => b.mat === 'tile-white' && b.maxZ - b.minZ === 0.5 && b.maxX - b.minX > 3);
      steps.sort((a, b) => a.maxY - b.maxY);
      const first = steps[0];
      const p = new PlayerController();
      p.x = (first.minX + first.maxX) / 2;
      p.z = first.minZ - 0.6;
      p.y = cy * POOL_SLAB;
      walk(p, w, 7, Math.PI); // yaw pi faces +z
      expect(p.y, `slab ${cy}`).toBeCloseTo((cy + 1) * POOL_SLAB, 1);
      expect(p.grounded).toBe(true);
    }
  });
});

describe('smooth terrain', () => {
  it('the mountain trail is walkable uphill without steps and the camera-free physics climbs smoothly', () => {
    const L = resolveLevel('303');
    const ctx = makeGenContext(31, L);
    const w = worldFor('303');
    const a = L.arrival(ctx, 5);
    const p = new PlayerController();
    p.x = a.x;
    p.y = a.y;
    p.z = a.z;
    let maxJump = 0;
    let prev = p.y;
    p.yaw = -Math.PI / 2; // +x is uphill
    for (let i = 0; i < 400; i++) {
      p.step(0.02, go(), w);
      maxJump = Math.max(maxJump, Math.abs(p.y - prev));
      prev = p.y;
    }
    expect(p.y).toBeGreaterThan(a.y + 1); // went uphill
    expect(maxJump).toBeLessThan(0.1); // no stair-like jumps
  });

  it('terrain is continuous across chunk borders', () => {
    const L = resolveLevel('303');
    const ctx = makeGenContext(31, L);
    const A = L.generator(ctx, 2, 0).terrain!;
    const B = L.generator(ctx, 3, 0).terrain!;
    for (let z = 0; z <= 32; z += 3.3) expect(sampleTerrain(A, 32, z)).toBeCloseTo(sampleTerrain(B, 0, z)!, 6);
  });

  it('too-steep slopes block like walls', () => {
    const p = new PlayerController();
    const w: WorldQuery = { boxes: () => [], floors: () => [], terrain: (x) => (x > 1 ? (x - 1) * 3 : 0) };
    p.yaw = -Math.PI / 2;
    for (let i = 0; i < 100; i++) p.step(0.02, go(), w);
    expect(p.x).toBeLessThan(1.2);
    expect(p.y).toBeLessThan(0.5);
  });
});
