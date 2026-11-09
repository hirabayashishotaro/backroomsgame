import { describe, expect, it } from 'vitest';
import { Arsenal, stepProjectile } from '../src/weapons/weaponLogic';
import { WEAPONS, falloffFactor } from '../src/weapons/weaponDefs';

describe('weapons', () => {
  it('pistol: 12-round magazine, reload from reserve, no recoil', () => {
    const a = new Arsenal();
    a.gainWeapon('pistol', false);
    a.addAmmo('pistol', 20);
    let shots = 0;
    for (let i = 0; i < 20; i++) {
      const r = a.fire('pistol');
      if (r && r !== 'empty') {
        shots++;
        expect(r.kick).toBe(0);
        expect(r.returnPitch).toBe(0);
      }
      a.update(0.2);
    }
    expect(shots).toBe(12);
    expect(a.fire('pistol')).toBe('empty');
    expect(a.startReload('pistol')).toBe(true);
    expect(a.fire('pistol')).toBeNull(); // cannot fire while reloading
    a.update(1.5);
    expect(a.loaded('pistol')).toBe(12);
    expect(a.reserve.pistol).toBe(8);
  });

  it('pistol damage falls off with distance', () => {
    const p = WEAPONS.pistol;
    expect(falloffFactor(p, 5)).toBe(1);
    expect(falloffFactor(p, 36)).toBeCloseTo(0.7);
    expect(falloffFactor(p, 200)).toBeCloseTo(0.4);
    expect(falloffFactor(WEAPONS.magnum, 200)).toBe(1); // no falloff
  });

  it('magnum: 6 rounds; each shot kicks up and the next shot returns the reticle', () => {
    const a = new Arsenal();
    a.gainWeapon('magnum', false);
    const r1 = a.fire('magnum');
    expect(r1 && r1 !== 'empty' && r1.returnPitch).toBe(0);
    expect(r1 && r1 !== 'empty' && r1.kick).toBeGreaterThan(0);
    a.update(1);
    const r2 = a.fire('magnum');
    expect(r2 && r2 !== 'empty' && r2.returnPitch).toBeCloseTo(WEAPONS.magnum.kick!);
    // If the player already pulled down, the return is smaller.
    a.update(1);
    a.aimedDown(0.04);
    const r3 = a.fire('magnum');
    expect(r3 && r3 !== 'empty' && r3.returnPitch).toBeCloseTo(WEAPONS.magnum.kick! - 0.04);
    a.update(1);
    for (let i = 0; i < 3; i++) {
      a.fire('magnum');
      a.update(1);
    }
    expect(a.fire('magnum')).toBe('empty');
  });

  it('kunai: bundles of 10 from the reserve; duplicate weapons become ammo', () => {
    const a = new Arsenal();
    a.gainWeapon('kunai', false);
    expect(a.loaded('kunai')).toBe(10);
    a.fire('kunai');
    a.update(1);
    expect(a.loaded('kunai')).toBe(9);
    a.gainWeapon('pistol', false);
    a.gainWeapon('pistol', true);
    expect(a.reserve.pistol).toBe(12);
  });

  it('axe never runs out', () => {
    const a = new Arsenal();
    for (let i = 0; i < 50; i++) {
      expect(a.fire('axe')).not.toBe('empty');
      a.update(1);
    }
  });

  it('kunai: two per second while the button is held', () => {
    expect(WEAPONS.kunai.auto).toBe(true);
    expect(WEAPONS.kunai.interval).toBeCloseTo(0.5);
    const a = new Arsenal();
    a.gainWeapon('kunai', false);
    let thrown = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      a.update(1 / 60);
      const r = a.fire('kunai');
      if (r && r !== 'empty') thrown++;
    }
    expect(thrown).toBeGreaterThanOrEqual(4);
    expect(thrown).toBeLessThanOrEqual(5);
  });

  it('magnum and kunai fly straight (no gravity)', () => {
    expect(WEAPONS.kunai.gravity).toBe(0);
    expect(WEAPONS.magnum.gravity ?? 0).toBe(0);
  });

  it('projectiles fly straight without gravity and arc with it', () => {
    const m = { x: 0, y: 1, z: 0, vx: 180, vy: 0, vz: 0 };
    for (let i = 0; i < 60; i++) stepProjectile(m, 0, 1 / 60);
    expect(m.x).toBeCloseTo(180);
    expect(m.y).toBeCloseTo(1);
    const k = { x: 0, y: 1, z: 0, vx: 38, vy: 0, vz: 0 };
    for (let i = 0; i < 30; i++) stepProjectile(k, 9.8, 1 / 60);
    expect(k.y).toBeLessThan(0);
  });

  it('round-trips through JSON', () => {
    const a = new Arsenal();
    a.gainWeapon('pistol', false);
    a.addAmmo('magnum', 5);
    const b = new Arsenal();
    b.load(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.loaded('pistol')).toBe(12);
    expect(b.reserve.magnum).toBe(5);
  });
});
