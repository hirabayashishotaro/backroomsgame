import { describe, expect, it } from 'vitest';
import { Journal, layoutGraph } from '../src/systems/journal';

const info = (id: string) => ({ id, title: 'Level ' + id, name: 'n', threat: 1, kind: 'k' });

describe('journal', () => {
  it('records discoveries, pieces, exits and edges', () => {
    const j = new Journal();
    expect(j.visit(info('0'))).toBe(true);
    expect(j.visit(info('0'))).toBe(false);
    expect(j.seePiece('0', 'manila')).toBe(true);
    expect(j.seePiece('0', 'manila')).toBe(false);
    j.visit(info('1'));
    j.travel('0', '1', 'walk', 'text');
    j.travel('0', '1', 'walk', 'text');
    expect(j.count).toBe(2);
    expect(j.data.edges[0].count).toBe(2);
    expect(j.data.levels['0'].exits.length).toBe(1);
  });
  it('reports milestones at 10 discoveries', () => {
    const j = new Journal();
    for (let i = 0; i < 9; i++) j.visit(info(String(i)));
    expect(j.milestone()).toBeNull();
    j.visit(info('x'));
    expect(j.milestone()).toBe(10);
  });
  it('round-trips through JSON and lays out the graph inside the area', () => {
    const j = new Journal();
    for (let i = 0; i < 12; i++) j.visit(info(String(i)));
    for (let i = 0; i < 11; i++) j.travel(String(i), String(i + 1), 'door', '');
    const k = new Journal();
    k.load(JSON.parse(JSON.stringify(j.toJSON())));
    expect(k.count).toBe(12);
    const pos = layoutGraph(k.data, 600, 400);
    for (const p of Object.values(pos)) {
      expect(p.x).toBeGreaterThanOrEqual(30);
      expect(p.x).toBeLessThanOrEqual(570);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(370);
    }
  });

  it('the bestiary remembers every entity met, where, and how many were defeated (random ones with their genome)', () => {
    const j = new Journal();
    j.visit({ id: '1', title: 'Level 1', name: 'a', threat: 1, kind: 'x' });
    j.visit({ id: '2', title: 'Level 2', name: 'b', threat: 1, kind: 'x' });
    expect(j.meet('1', { key: 'hound', kind: 'hound', name: 'ハウンド' })).toBe(true);
    expect(j.meet('1', { key: 'hound', kind: 'hound', name: 'ハウンド' })).toBe(false);
    expect(j.meet('2', { key: 'hound', kind: 'hound', name: 'ハウンド' })).toBe(true);
    j.meet('2', { key: 'chimera:7', kind: 'chimera', name: '雷を呼ぶ青い一つ目', genome: { seed: 7 } });
    j.defeat('hound');
    j.defeat('hound');
    const list = j.toJSON().creatures!;
    expect(list.map((c) => c.key)).toEqual(['hound', 'chimera:7']);
    expect(list[0].levels).toEqual(['1', '2']);
    expect(list[0].defeated).toBe(2);
    expect(list[1].genome).toEqual({ seed: 7 });
    expect(j.creatureName('chimera:7')).toBe('雷を呼ぶ青い一つ目');
    // Saved and loaded with the run
    const k = new Journal();
    k.load(JSON.parse(JSON.stringify(j.toJSON())));
    expect(k.toJSON().creatures!.length).toBe(2);
  });

  it('older saves get their bestiary rebuilt from the levels', () => {
    const j = new Journal();
    j.visit({ id: '1', title: 'Level 1', name: 'a', threat: 1, kind: 'x' });
    const old = JSON.parse(JSON.stringify(j.toJSON()));
    old.levels['1'].entities = ['smiler'];
    delete old.creatures;
    const k = new Journal();
    k.load(old, (kind) => (kind === 'smiler' ? 'スマイラー' : kind));
    expect(k.toJSON().creatures).toEqual([expect.objectContaining({ key: 'smiler', name: 'スマイラー', levels: ['1'] })]);
  });
});
