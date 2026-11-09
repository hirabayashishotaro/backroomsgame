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
});
