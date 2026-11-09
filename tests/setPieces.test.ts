import { describe, expect, it } from 'vitest';
import { makeGenContext } from '../src/levels/registry';
import { CELLS_PER_CHUNK, corridorOpenSide, level0, pieceForChunk, wallX, wallZ, type Piece } from '../src/levels/hand/level0';

const ctx = makeGenContext(777, level0);
const seed = ctx.levelSeed;

function pieces(range: number): Piece[] {
  const out: Piece[] = [];
  for (let cx = -range; cx < range; cx++)
    for (let cz = -range; cz < range; cz++) {
      const p = pieceForChunk(seed, cx, cz);
      if (p) out.push(p);
    }
  return out;
}

/** Border edges of a piece as [kind, side]. */
function border(p: Piece): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let gz = p.gz0; gz <= p.gz1; gz++) {
    out.push([wallX(seed, p.gx0, gz), 3]);
    out.push([wallX(seed, p.gx1 + 1, gz), 1]);
  }
  for (let gx = p.gx0; gx <= p.gx1; gx++) {
    out.push([wallZ(seed, gx, p.gz0), 0]);
    out.push([wallZ(seed, gx, p.gz1 + 1), 2]);
  }
  return out;
}

describe('Level 0 set pieces', () => {
  const all = pieces(16);

  it('defines at least 5 kinds and all of them appear in a 512m square', () => {
    expect(level0.setPieces.length).toBeGreaterThanOrEqual(5);
    const kinds = new Set(all.map((p) => p.kind));
    for (const sp of level0.setPieces) expect(kinds.has(sp.id as Piece['kind'])).toBe(true);
  });

  it('pieces stay strictly inside their chunk (cells 1..6)', () => {
    for (const p of all) {
      const cx = Math.floor(p.gx0 / CELLS_PER_CHUNK);
      const cz = Math.floor(p.gz0 / CELLS_PER_CHUNK);
      expect(p.gx0 - cx * CELLS_PER_CHUNK).toBeGreaterThanOrEqual(1);
      expect(p.gx1 - cx * CELLS_PER_CHUNK).toBeLessThanOrEqual(6);
      expect(p.gz0 - cz * CELLS_PER_CHUNK).toBeGreaterThanOrEqual(1);
      expect(p.gz1 - cz * CELLS_PER_CHUNK).toBeLessThanOrEqual(6);
    }
  });

  it('enclosed rooms have exactly one doorway; corridors exactly one open end', () => {
    for (const p of all) {
      const b = border(p);
      if (p.kind === 'manila' || p.kind === 'chalk-room') {
        expect(b.filter(([k]) => k === 2).length).toBe(1);
        expect(b.filter(([k]) => k === 0).length).toBe(0);
      }
      if (p.kind === 'light-corridor') {
        const open = b.filter(([k]) => k !== 1);
        expect(open.length).toBe(1);
        expect(open[0][1]).toBe(corridorOpenSide(p));
      }
    }
  });

  it('every chunk with a piece exposes a zone, and door pieces a prop', () => {
    for (let cx = -6; cx < 6; cx++)
      for (let cz = -6; cz < 6; cz++) {
        const p = pieceForChunk(seed, cx, cz);
        const d = level0.generator(ctx, cx, cz);
        expect(d.zones.filter((z) => z.kind !== 'thin-floor').length).toBe(p ? 1 : 0);
        if (p && (p.kind === 'exit-door' || p.kind === 'glass-door')) expect(d.props.length).toBe(1);
      }
  });

  it('item uids are unique within each chunk and items are generated', () => {
    let total = 0;
    for (let cx = -5; cx < 5; cx++)
      for (let cz = -5; cz < 5; cz++) {
        const d = level0.generator(ctx, cx, cz);
        const uids = d.items.map((i) => i.uid);
        expect(new Set(uids).size).toBe(uids.length);
        total += uids.length;
      }
    expect(total).toBeGreaterThan(50);
  });
});
