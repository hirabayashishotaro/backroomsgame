import { describe, expect, it } from 'vitest';
import { CHIMERA_MAX_H_NARROW, chimeraGenome, chimeraSpecies } from '../src/entities/chimera';
import { CHIMERA_HAND_WEIGHT, entityTableFor, giantAllowed, pickKind } from '../src/entities/director';
import { MOD_LOWPASS, MOD_TONE_MAX } from '../src/systems/audio';
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
    expect(seen.effect.size).toBe(6);
    expect(seen.pattern.size).toBe(7);
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
      const o = chimeraGenome(s * 31 + 5, { giant: true });
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
    const a = chimeraSpecies('482', {});
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(chimeraSpecies('482', {})).toEqual(a);
    expect(chimeraSpecies('483', {}).map((g) => g.name)).not.toEqual(a.map((g) => g.name));
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

  it('slashers also dash-cut from afar, like namahage (only in sight)', () => {
    let checked = 0;
    for (let s = 0; s < 2000 && checked < 10; s++) {
      const g = chimeraGenome(s * 31 + 5);
      if (g.attack !== 'slash') continue;
      checked++;
      const b = newBrain('chimera', g);
      let dashes = 0;
      for (let t = 0; t < 16; t += 0.05) if (think(b, P({ dist: 16 }), 0.05).dash) dashes++;
      expect(dashes, g.name).toBeGreaterThanOrEqual(1);
      const hidden = newBrain('chimera', g);
      for (let t = 0; t < 10; t += 0.05) expect(think(hidden, P({ dist: 16, los: false }), 0.05).dash).toBeFalsy();
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("never use the Bug's look: no missing-texture pattern, no glitching, no glitch noise", () => {
    for (let s = 0; s < 3000; s++) {
      const g = chimeraGenome(s * 97 + 1);
      expect(g.pattern as string).not.toBe('missing');
      expect(g.effect as string).not.toBe('glitch');
      expect(g.voice as string).not.toBe('glitch');
    }
  });

  it('their attacks look their own: colours, shapes and patterns vary', () => {
    const looks = new Set<string>();
    const shapes = new Set<string>();
    for (let s = 0; s < 300; s++) {
      const f = chimeraGenome(s * 61 + 7).fx;
      looks.add([f.main, f.second, f.warn].join(','));
      shapes.add(f.shape);
    }
    expect(looks.size).toBeGreaterThan(290);
    expect(shapes.size).toBe(6);
  });

  it('their sounds are their own and never shrill: own pitch (mostly lower), own cue / attack / impact sounds', () => {
    const combos = new Set<string>();
    for (let s = 0; s < 500; s++) {
      const snd = chimeraGenome(s * 29 + 3).sound;
      expect(snd.pitch).toBeGreaterThanOrEqual(0.6);
      expect(snd.pitch).toBeLessThanOrEqual(1.15);
      // The thin, high sounds are never chosen as their own cues or attack sounds.
      expect(['aim', 'zap', 'glitch', 'skitter', 'giggle']).not.toContain(snd.cue);
      expect(['aim', 'zap', 'glitch', 'skitter', 'giggle']).not.toContain(snd.fire);
      combos.add([snd.pitch.toFixed(2), snd.cue, snd.fire, snd.impact].join('/'));
    }
    expect(combos.size).toBeGreaterThan(300);
    expect(MOD_TONE_MAX).toBeLessThanOrEqual(1500);
    expect(MOD_LOWPASS).toBeLessThanOrEqual(3000);
  });

  it('also live in hand-made levels with entities, picked as often as each of the level\'s own kinds; empty levels stay empty', () => {
    for (const id of ['1', '2', 'sento', 'vaporwave', '303', '666', 'chaos']) expect(entityTableFor(id, { dark: false, safe: false })).toContain('chimera');
    for (const id of ['0', 'shibuya', 'arena', 'frontrooms']) expect(entityTableFor(id, { dark: false, safe: false })).toEqual([]);
    const table = entityTableFor('2', { dark: false, safe: false });
    const n = 20000;
    let chim = 0;
    let other = 0;
    for (let i = 0; i < n; i++) {
      const k = pickKind(table, CHIMERA_HAND_WEIGHT, (i + 0.5) / n);
      if (k === 'chimera') chim++;
      else if (k === table[0]) other++;
    }
    expect(chim).toBeGreaterThan(0);
    expect(chim / other).toBeCloseTo(CHIMERA_HAND_WEIGHT, 1);
  });

  it('count toward the kills of the escape condition, but are not one of the kinds to defeat', () => {
    expect(ALL_ENTITIES).not.toContain('chimera');
    const e = new EscapeProgress();
    for (let i = 0; i < 40; i++) e.recordKill('chimera');
    expect(e.status([]).kills).toBe(40);
    expect(e.status([]).kinds).toBe(0);
  });

  it('where the giant cannot go they stay corridor-sized; where it can, some are huge', () => {
    let huge = 0;
    for (let s = 0; s < 1000; s++) {
      expect(chimeraGenome(s * 7 + 2).height).toBeLessThanOrEqual(CHIMERA_MAX_H_NARROW + 1e-9);
      if (chimeraGenome(s * 7 + 2, { giant: true }).height > 4) huge++;
    }
    expect(huge).toBeGreaterThan(40);
    expect(giantAllowed('900', false)).toBe(true); // hand-made table with the giant
    expect(giantAllowed('37', true)).toBe(false); // hand-made table without it
    expect(giantAllowed('482', true)).toBe(true);
    expect(giantAllowed('482', false)).toBe(false);
  });

  it("borrow only the traits of entities that do not live in the level", () => {
    const here = ['gunman', 'witch', 'giant', 'namahage', 'hound'] as const;
    for (let s = 0; s < 500; s++) {
      const g = chimeraGenome(s * 11 + 4, { exclude: here });
      expect(['shoot', 'lightning', 'stomp', 'boulder', 'slash']).not.toContain(g.attack);
      expect(g.close).toBe('none'); // the witch's wind burst
      expect(g.move).not.toBe('hopper'); // the hound's leap
    }
  });
});
