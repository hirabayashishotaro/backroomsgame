import { describe, expect, it } from 'vitest';
import { MouseSpikeFilter } from '../src/core/mouseFilter';

describe('MouseSpikeFilter', () => {
  it('drops the first event after lock and isolated spikes', () => {
    const f = new MouseSpikeFilter();
    expect(f.filter(500, 0)).toBeNull(); // first after lock
    for (let i = 0; i < 10; i++) expect(f.filter(5, 2)).toEqual({ dx: 5, dy: 2 });
    expect(f.filter(-640, 0)).toBeNull(); // isolated jump
    expect(f.filter(6, 1)).toEqual({ dx: 6, dy: 1 });
  });
  it('keeps genuine fast flicks (consecutive large movements)', () => {
    const f = new MouseSpikeFilter();
    f.filter(0, 0);
    f.filter(3, 0);
    let applied = 0;
    for (let i = 0; i < 6; i++) if (f.filter(300, 0)) applied++;
    expect(applied).toBeGreaterThanOrEqual(5);
  });
});
