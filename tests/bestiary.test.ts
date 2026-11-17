import { describe, expect, it } from 'vitest';
import { Bestiary } from '../src/systems/bestiary';

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
};

describe('bestiary (shared by every run)', () => {
  it('remembers entities across runs: stored on its own key, reloaded by a new instance', () => {
    const store = mem();
    const a = new Bestiary(store);
    a.load();
    expect(a.meet({ id: '1', title: 'Level 1' }, { key: 'hound', kind: 'hound', name: 'ハウンド' })).toBe(true);
    expect(a.meet({ id: '2', title: 'Level 2' }, { key: 'hound', kind: 'hound', name: 'ハウンド' })).toBe(false);
    a.meet({ id: '2', title: 'Level 2' }, { key: 'chimera:9', kind: 'chimera', name: 'x', genome: { seed: 9 } });
    a.defeat('hound');
    // A new run (a new instance) still sees all of it.
    const b = new Bestiary(store);
    b.load();
    expect(b.entries.map((e) => e.key)).toEqual(['hound', 'chimera:9']);
    expect(b.entries[0].levels).toEqual([
      { id: '1', title: 'Level 1' },
      { id: '2', title: 'Level 2' },
    ]);
    expect(b.entries[0].defeated).toBe(1);
    expect(b.entries[1].genome).toEqual({ seed: 9 });
  });

  it("merges a run journal's creatures without duplicating", () => {
    const b = new Bestiary(mem());
    b.load();
    b.meet({ id: '1', title: 'Level 1' }, { key: 'smiler', kind: 'smiler', name: 'スマイラー' });
    b.merge([{ key: 'smiler', kind: 'smiler', name: 'スマイラー', levels: ['1', '3'], firstMet: 0, defeated: 2 }, { key: 'giant', kind: 'giant', name: 'ダイダラ', levels: ['303'], firstMet: 0, defeated: 0 }], (id) => 'Level ' + id);
    expect(b.entries.map((e) => e.key)).toEqual(['smiler', 'giant']);
    expect(b.entries[0].levels.map((l) => l.id)).toEqual(['1', '3']);
  });

  it('survives broken storage', () => {
    const store = mem();
    store.set('bestiary', '{not json');
    const b = new Bestiary(store);
    b.load();
    expect(b.entries).toEqual([]);
  });
});
