import { describe, expect, it } from 'vitest';
import { Profile, grantClearRewards } from '../src/systems/profile';
import { COSPLAYS, GOLD, outfitGenome, randomSkinId, SILVER, skinLabel } from '../src/player/skins';
import { WEAPONS } from '../src/weapons/weaponDefs';
import { Arsenal } from '../src/weapons/weaponLogic';

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
};

describe('outfits and clear rewards', () => {
  it('every clear wins an outfit: cosplays not owned yet, or a brand-new random one', () => {
    const p = new Profile(mem());
    p.load();
    const got = new Set<string>();
    let r = 0.1;
    const rng = () => (r = (r * 9301 + 0.49297) % 1);
    for (let i = 0; i < 20; i++) for (const s of grantClearRewards(p, { deaths: 1, hurt: 3 }, rng)) got.add(s);
    expect(p.data.clears).toBe(20);
    expect(got.size).toBe(20); // one new outfit every time, never a repeat
    for (const [id] of COSPLAYS) expect(got.has(id)).toBe(true);
    expect([...got].some((s) => s.startsWith('rand:'))).toBe(true);
    expect(got.has(SILVER) || got.has(GOLD)).toBe(false);
  });

  it('silver for a clear without dying, gold for one without being hurt by an entity - always', () => {
    const p = new Profile(mem());
    p.load();
    expect(grantClearRewards(p, { deaths: 0, hurt: 5 }, () => 0.3)).toContain(SILVER);
    const q = new Profile(mem());
    q.load();
    const won = grantClearRewards(q, { deaths: 0, hurt: 0 }, () => 0.3);
    expect(won).toContain(SILVER);
    expect(won).toContain(GOLD);
    expect(q.owns(GOLD)).toBe(true);
    expect(q.owns('cos:smiler') || q.owns('cos:hound') || q.data.won.some((x) => x.startsWith('rand:') || x.startsWith('cos:'))).toBe(true);
  });

  it('the developer passphrase can wear anything; others only the everyday outfits and what they won', () => {
    const p = new Profile(mem());
    p.load();
    expect(p.owns('suit')).toBe(true);
    expect(p.owns(GOLD)).toBe(false);
    expect(p.owns(GOLD, true)).toBe(true);
    expect(p.owns('cos:witch', true)).toBe(true);
  });

  it('the profile is kept across runs (its own storage key)', () => {
    const store = mem();
    const p = new Profile(store);
    p.load();
    p.give('cos:fanman');
    p.setSkin('cos:fanman');
    const q = new Profile(store);
    q.load();
    expect(q.data.skin).toBe('cos:fanman');
    expect(q.owns('cos:fanman')).toBe(true);
  });

  it('random outfits are deterministic and varied, with readable names', () => {
    expect(outfitGenome(5)).toEqual(outfitGenome(5));
    const names = new Set(Array.from({ length: 200 }, (_, i) => outfitGenome(i * 31 + 1).name));
    expect(names.size).toBeGreaterThan(100);
    expect(skinLabel(randomSkinId(7))).toBe(outfitGenome(7).name);
    expect(skinLabel(GOLD)).toBe('ゴールドトロフィー');
  });

  it('trophy pistols never run out; the gold one hits 1.5x harder and twice as hard again on the head', () => {
    const a = new Arsenal();
    a.gainWeapon('silver_pistol', false);
    for (let i = 0; i < 100; i++) {
      a.cooldown = 0;
      expect(a.fire('silver_pistol')).not.toBe('empty');
    }
    expect(a.loaded('gold_pistol')).toBe(Infinity);
    expect(a.canReload('silver_pistol')).toBe(false);
    expect(WEAPONS.gold_pistol.damage).toBe(WEAPONS.pistol.damage * 1.5);
    expect(WEAPONS.gold_pistol.headMultiplier).toBe(WEAPONS.pistol.headMultiplier * 2);
    expect(WEAPONS.silver_pistol.damage).toBe(WEAPONS.pistol.damage);
  });
});
