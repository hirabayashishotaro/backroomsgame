import { describe, expect, it } from 'vitest';
import { chimeraGenome, chimeraSpecies } from '../src/entities/chimera';
import { chimeraReach, newBrain, think, type Perception } from '../src/entities/brain';
import { ALL_ENTITIES } from '../src/entities/entityDefs';
import { EscapeProgress } from '../src/systems/escape';

const P = (o: Partial<Perception> = {}): Perception => ({ dist: 20, watched: false, los: true, playerRunning: false, playerCrouching: false, playerRetreat: 0, ...o });

describe('random entities', () => {
  it('are deterministic from their seed, and almost every one is a different combination', () => {
    expect(chimeraGenome(42)).toEqual(chimeraGenome(42));
    const combos = new Set<string>();
    const names = new Set<string>();
    for (let s = 0; s < 300; s++) {
      const g = chimeraGenome(s * 7919 + 1);
      combos.add([g.lower, g.upper, g.head, g.attack, g.move, g.effect, g.pattern].join('/'));
      names.add(g.name);
    }
    expect(combos.size).toBeGreaterThan(280);
    expect(names.size).toBeGreaterThan(250);
  });

  it('every part, technique, movement, effect and pattern shows up', () => {
    const seen = { lower: new Set(), upper: new Set(), head: new Set(), attack: new Set(), move: new Set(), effect: new Set(), pattern: new Set() };
    for (let s = 0; s < 2000; s++) {
      const g = chimeraGenome(s * 104729 + 3);
      for (const k of Object.keys(seen) as Array<keyof typeof seen>) seen[k].add(g[k]);
    }
    expect(seen.lower.size).toBe(7);
    expect(seen.upper.size).toBe(6);
    expect(seen.head.size).toBe(10);
    expect(seen.attack.size).toBe(10);
    expect(seen.move.size).toBe(5);
    expect(seen.effect.size).toBe(7);
    expect(seen.pattern.size).toBe(8);
  });

  it('sizes, speeds and health vary but stay sane; big ones only where there is room', () => {
    let small = 0;
    let big = 0;
    for (let s = 0; s < 1000; s++) {
      const g = chimeraGenome(s * 31 + 5);
      expect(g.scale).toBeLessThanOrEqual(1.5);
      expect(g.run).toBeGreaterThan(0.9);
      expect(g.run).toBeLessThanOrEqual(11);
      expect(g.hp).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThan(0.4);
      if (g.scale < 0.8) small++;
      const o = chimeraGenome(s * 31 + 5, { open: true });
      if (o.scale > 1.8) big++;
    }
    expect(small).toBeGreaterThan(100);
    expect(big).toBeGreaterThan(50);
  });

  it('weapons need hands: no slashing, lobbing or boulder throwing without arms', () => {
    for (let s = 0; s < 1000; s++) {
      const g = chimeraGenome(s * 17 + 9);
      if (g.arms === 0) expect(['slash', 'lob', 'boulder']).not.toContain(g.attack);
    }
  });

  it('each level has 1-3 species of its own, the same every visit', () => {
    const a = chimeraSpecies('482', false);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(chimeraSpecies('482', false)).toEqual(a);
    expect(chimeraSpecies('483', false).map((g) => g.name)).not.toEqual(a.map((g) => g.name));
  });

  it('their brains use their technique: ranged ones fire on a cooldown, melee ones close in', () => {
    let checked = 0;
    for (let s = 0; s < 400 && checked < 40; s++) {
      const g = chimeraGenome(s * 13 + 1);
      const b = newBrain('chimera', g);
      expect(b.hp).toBe(g.hp);
      let acted = false;
      let moved = false;
      const dist = ['shoot', 'lob', 'lightning', 'wind'].includes(g.attack) ? 14 : g.attack === 'snipe' ? 25 : g.attack === 'boulder' ? 20 : chimeraReach(g) * 0.7;
      for (let t = 0; t < 12; t += 0.05) {
        const d = think(b, P({ dist }), 0.05);
        if (d.fire || d.toss || d.cast || d.blow || d.hurl || d.snipe || d.slash || d.stomp || d.explode) acted = true;
        if (d.speed !== 0 || (d.strafe ?? 0) !== 0) moved = true;
        if (d.gone) break;
      }
      if (g.attack !== 'contact') expect(acted, `${g.name} (${g.attack}/${g.move})`).toBe(true);
      else expect(moved || g.move === 'creep').toBe(true);
      checked++;
    }
  });

  it('are not part of the escape condition', () => {
    expect(ALL_ENTITIES).not.toContain('chimera');
    const e = new EscapeProgress();
    for (let i = 0; i < 40; i++) e.recordKill('chimera');
    expect(e.status([]).kills).toBe(0);
  });
});
