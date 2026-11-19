import { describe, expect, it } from 'vitest';
import { ENDING_LEVEL, ESCAPE_GOALS, EscapeProgress } from '../src/systems/escape';
import { ALL_ENTITIES } from '../src/entities/entityDefs';

const levels = (n: number, withVoid: boolean) => [...Array.from({ length: n }, (_, i) => String(i + 10)), ...(withVoid ? ['void'] : [])];

describe('escape mode', () => {
  it('needs 50 levels and 30 kills including every kind and one random entity before the Bug appears (no Void needed)', () => {
    const e = new EscapeProgress();
    for (let i = 0; i < 40; i++) e.recordKill('hound');
    expect(e.check(levels(60, false))).toBeNull(); // not every kind yet
    for (const k of ALL_ENTITIES) e.recordKill(k);
    expect(e.check(levels(60, false))).toBeNull(); // no random entity yet
    e.recordKill('chimera');
    expect(e.check(levels(49, false))).toBeNull(); // 49 levels
    expect(e.check(['arena', 'shibuya', 'frontrooms', ...levels(50, false)])).toBe('bug'); // 50 counted, without the Void
    expect(e.stage).toBe('bug');
    expect(ESCAPE_GOALS.kills).toBe(30);
    expect(ESCAPE_GOALS.randomKills).toBe(1);
  });

  it('the Bug is not counted toward kills, and defeating it opens the way home', () => {
    const e = new EscapeProgress();
    expect(e.recordKill('bug')).toBeNull(); // not yet in the bug stage
    e.reset('bug');
    expect(e.overrideTarget('37', 'door')).toBeNull();
    expect(e.recordKill('bug')).toBe('return');
    // Any exit, from anywhere, leads to Level 0
    expect(e.overrideTarget('37', 'floor')).toBe('0');
    expect(e.overrideTarget('0', 'door')).toBe('0');
    // Every door opens now (even locked ones) and leads home
    expect(e.doorTarget('0')).toBe('0');
    expect(e.doorTarget('37')).toBe('0');
    // The glitched doors only appear once you are back in Level 0
    expect(e.realityLeaking('0')).toBe(false);
    expect(e.arrive('0')).toBe('home');
    expect(e.realityLeaking('0')).toBe(true);
    expect(e.doorTarget('0')).toBe(ENDING_LEVEL);
    // From home, a door leads out; other ways keep you in Level 0
    expect(e.overrideTarget('0', 'door')).toBe(ENDING_LEVEL);
    expect(e.overrideTarget('0', 'wall')).toBe('0');
    expect(e.arrive(ENDING_LEVEL)).toBe('ending');
  });

  it('round-trips through a save', () => {
    const e = new EscapeProgress();
    e.recordKill('witch');
    e.reset('home');
    const f = new EscapeProgress();
    f.load(JSON.parse(JSON.stringify(e.toJSON())));
    expect(f.stage).toBe('home');
    f.load(undefined);
    expect(f.stage).toBe('collect');
  });

  it('the lecture hall is an ending too', () => {
    const e = new EscapeProgress();
    e.reset('home');
    expect(e.arrive('lecture')).toBe('ending');
  });
});
