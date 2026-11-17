import { describe, expect, it } from 'vitest';
import { BLOATER, BOMBER, FANMAN, GUNMAN, NAMAHAGE, PEEKER, WITCH, hurt, inSlash, newBrain, think, type Perception } from '../src/entities/brain';
import { ENTITIES } from '../src/entities/entityDefs';
import { Director, entityTableFor } from '../src/entities/director';

const P = (o: Partial<Perception> = {}): Perception => ({ dist: 20, watched: false, los: true, playerRunning: false, playerCrouching: false, playerRetreat: 0, ...o });

function run(b: ReturnType<typeof newBrain>, p: Perception, seconds: number) {
  let d = think(b, p, 0.05);
  for (let i = 1; i < seconds / 0.05 && !d.gone; i++) d = think(b, p, 0.05);
  return d;
}

describe('entity behaviour', () => {
  it('smiler fades if you hold its gaze and back away, chases if you turn and run', () => {
    const a = newBrain('smiler');
    expect(run(a, P({ watched: true, playerRetreat: 1.5 }), 12).gone).toBe(true);
    const b = newBrain('smiler');
    run(b, P({ watched: false, playerRunning: true }), 1);
    expect(b.mode).toBe('chase');
  });

  it('hound chases running players and loses quiet, crouching ones', () => {
    const h = newBrain('hound');
    run(h, P({ playerRunning: true, dist: 30 }), 1);
    expect(h.mode).toBe('chase');
    run(h, P({ playerCrouching: true, dist: 20 }), 8);
    expect(h.mode).toBe('stalk');
  });

  it('duller only moves while watched', () => {
    const d = newBrain('duller');
    expect(run(d, P({ watched: false }), 3).speed).toBe(0);
    expect(run(d, P({ watched: true, dist: 10 }), 3).speed).toBeGreaterThan(0);
  });

  it('faceling freezes while watched and approaches otherwise', () => {
    const f = newBrain('faceling');
    expect(run(f, P({ watched: true }), 1).speed).toBe(0);
    expect(run(f, P({ watched: false }), 1).speed).toBeGreaterThan(0);
  });

  it('skin-stealer lunges when close', () => {
    const s = newBrain('skinstealer');
    run(s, P({ dist: 3 }), 0.2);
    expect(s.mode).toBe('chase');
  });

  it('damage kills; only heavy hits make hounds stagger', () => {
    const h = newBrain('hound');
    expect(hurt(h, 30)).toBe(false);
    expect(h.mode).toBe('chase');
    expect(hurt(h, 60)).toBe(false);
    expect(h.mode).toBe('stagger');
    expect(hurt(h, 5000)).toBe(true);
  });

  it('entities are tough: five times the original health', () => {
    expect(newBrain('hound').hp).toBe(350);
    expect(newBrain('skinstealer').hp).toBe(750);
    expect(newBrain('giant').hp).toBeGreaterThanOrEqual(2000);
  });

  it('bloater lights its fuse up close, bursts after the fuse, and backing off cancels it', () => {
    const a = newBrain('bloater');
    run(a, P({ dist: 10 }), 0.5);
    expect(a.mode).toBe('stalk');
    let d = think(a, P({ dist: BLOATER.trigger - 0.5 }), 0.05);
    expect(a.mode).toBe('fuse');
    for (let t = 0; t < BLOATER.fuse + 0.2 && !d.gone; t += 0.05) d = think(a, P({ dist: 2 }), 0.05);
    expect(d.explode).toBe(true);
    const b = newBrain('bloater');
    think(b, P({ dist: 2 }), 0.05);
    expect(b.mode).toBe('fuse');
    d = think(b, P({ dist: BLOATER.cancel + 1 }), 0.05);
    expect(b.mode).toBe('stalk');
    expect(d.explode).toBeFalsy();
  });

  it('gunman keeps its distance, strafes, and fires bursts of six with a reload', () => {
    const g = newBrain('gunman');
    const times: number[] = [];
    let strafed = false;
    for (let t = 0; t < 12; t += 0.05) {
      const d = think(g, P({ dist: 15 }), 0.05);
      if (d.fire) times.push(t);
      if (Math.abs(d.strafe ?? 0) > 0) strafed = true;
    }
    expect(strafed).toBe(true);
    expect(times.length).toBeGreaterThanOrEqual(GUNMAN.mag * 2);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(GUNMAN.reload - 0.1);
    expect(Math.min(...gaps)).toBeLessThan(GUNMAN.rate + 0.06);
    // Too close: backs away. Out of sight: comes looking.
    expect(think(newBrain('gunman'), P({ dist: 4 }), 0.05).speed).toBeLessThan(0);
    expect(think(newBrain('gunman'), P({ dist: 15, los: false }), 0.05).speed).toBeGreaterThan(0);
  });

  it('witch casts lightning only with line of sight, on a cooldown', () => {
    const w = newBrain('witch');
    let casts = 0;
    for (let t = 0; t < 20; t += 0.05) if (think(w, P({ dist: 20 }), 0.05).cast) casts++;
    expect(casts).toBeGreaterThanOrEqual(3);
    expect(casts).toBeLessThanOrEqual(Math.ceil(20 / WITCH.cooldown) + 1);
    const hidden = newBrain('witch');
    for (let t = 0; t < 10; t += 0.05) expect(think(hidden, P({ dist: 20, los: false }), 0.05).cast).toBeFalsy();
  });

  it('bomber keeps its distance and lobs bombs on a cooldown', () => {
    const b = newBrain('bomber');
    let tosses = 0;
    for (let t = 0; t < 12; t += 0.05) if (think(b, P({ dist: 15 }), 0.05).toss) tosses++;
    expect(tosses).toBeGreaterThanOrEqual(3);
    expect(tosses).toBeLessThanOrEqual(Math.ceil(12 / BOMBER.cooldown) + 1);
    expect(think(newBrain('bomber'), P({ dist: 4 }), 0.05).speed).toBeLessThan(0);
  });

  it('peeker stands still and aims (laser) before every sniper shot, and losing sight breaks the aim', () => {
    const b = newBrain('peeker');
    let shots = 0;
    let aimed = 0;
    for (let t = 0; t < 20; t += 0.05) {
      const d = think(b, P({ dist: 30 }), 0.05);
      if (d.aim !== undefined) {
        aimed += 0.05;
        expect(d.speed).toBe(0);
        expect(d.strafe ?? 0).toBe(0);
      }
      if (d.snipe) shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(2);
    expect(shots).toBeLessThanOrEqual(Math.ceil(20 / (PEEKER.aim + PEEKER.cooldown)) + 1);
    expect(aimed).toBeGreaterThanOrEqual(shots * PEEKER.aim - 0.2);
    // Ducking out of sight mid-aim: no shot.
    const c = newBrain('peeker');
    for (let t = 0; t < 3; t += 0.05) think(c, P({ dist: 30 }), 0.05);
    for (let t = 0; t < 3; t += 0.05) expect(think(c, P({ dist: 30, los: false }), 0.05).snipe).toBeFalsy();
  });

  it('peeker deals half the health; the spider is very fast and fragile', () => {
    expect(ENTITIES.peeker.damage).toBe(50);
    expect(ENTITIES.spider.run).toBeGreaterThan(ENTITIES.skinstealer.run + 2);
    expect(ENTITIES.spider.hp).toBeLessThan(ENTITIES.bloater.hp);
    const sp = newBrain('spider');
    expect(run(sp, P({ dist: 15 }), 1).speed).toBe(ENTITIES.spider.run);
  });

  it('namahage raises its blade in reach, swings after the wind-up, then recovers', () => {
    const b = newBrain('namahage');
    expect(think(b, P({ dist: 20 }), 0.05).speed).toBe(ENTITIES.namahage.run);
    let slashes = 0;
    let firstAt = -1;
    for (let t = 0; t < 6; t += 0.05) {
      const d = think(b, P({ dist: 2 }), 0.05);
      if (d.slash) {
        slashes++;
        if (firstAt < 0) firstAt = t;
      }
    }
    expect(firstAt).toBeGreaterThanOrEqual(NAMAHAGE.windup - 0.1);
    expect(slashes).toBeGreaterThanOrEqual(2);
    expect(slashes).toBeLessThanOrEqual(Math.ceil(6 / (NAMAHAGE.windup + NAMAHAGE.recover)) + 1);
    // Getting shot does not cancel a raised blade.
    const c = newBrain('namahage');
    think(c, P({ dist: 2 }), 0.05);
    expect(c.mode).toBe('attack');
    hurt(c, 10);
    expect(c.mode).toBe('attack');
  });

  it("namahage's cut is a big box in front: hits a few metres ahead and to the side, not behind", () => {
    // Facing -z (yaw 0).
    expect(inSlash(0, 0, 0, 0, 0, 0, -4)).toBe(true); // 4 m ahead
    expect(inSlash(0, 0, 0, 0, 1.6, 0, -2)).toBe(true); // ahead and to the side
    expect(inSlash(0, 0, 0, 0, 0, 0, -5.2)).toBe(false); // out of reach
    expect(inSlash(0, 0, 0, 0, 0, 0, 2)).toBe(false); // behind
    expect(inSlash(0, 0, 0, 0, 2.4, 0, -2)).toBe(false); // too far aside
    expect(inSlash(0, 0, 0, 0, 0, 3, -2)).toBe(false); // high above
    // Turned to face +x.
    expect(inSlash(0, 0, 0, -Math.PI / 2, 3.5, 0, 0)).toBe(true);
    expect(NAMAHAGE.reach).toBeLessThan(NAMAHAGE.len); // it starts swinging from inside its reach
  });

  it('fanman keeps its distance and blows slow wind on a cooldown', () => {
    const b = newBrain('fanman');
    let blows = 0;
    for (let t = 0; t < 12; t += 0.05) if (think(b, P({ dist: 14 }), 0.05).blow) blows++;
    expect(blows).toBeGreaterThanOrEqual(3);
    expect(blows).toBeLessThanOrEqual(Math.ceil(12 / FANMAN.cooldown) + 1);
    expect(FANMAN.speed).toBeLessThan(10); // slow enough to sidestep
    expect(think(newBrain('fanman'), P({ dist: 4 }), 0.05).speed).toBeLessThan(0);
  });

  it('a stunned entity cannot move or act for the stun time', () => {
    const g = newBrain('gunman');
    g.alpha = 1;
    g.cd = 0;
    g.stunT = 1;
    let fired = false;
    for (let t = 0; t < 0.95; t += 0.05) {
      const d = think(g, P({ dist: 15 }), 0.05);
      expect(d.speed).toBe(0);
      if (d.fire) fired = true;
    }
    expect(fired).toBe(false);
    let after = false;
    for (let t = 0; t < 0.5; t += 0.05) if (think(g, P({ dist: 15 }), 0.05).fire) after = true;
    expect(after).toBe(true);
  });

  it('giant walks in, winds up and stomps with a cooldown', () => {
    const g = newBrain('giant');
    expect(think(g, P({ dist: 20 }), 0.05).speed).toBeGreaterThan(0);
    let stomps = 0;
    for (let t = 0; t < 6; t += 0.05) if (think(g, P({ dist: 2.5 }), 0.05).stomp) stomps++;
    expect(stomps).toBeGreaterThanOrEqual(1);
    expect(stomps).toBeLessThanOrEqual(3);
  });

  it('entities give up and fade after their lifetime', () => {
    const d = newBrain('duller');
    expect(run(d, P(), 200).gone).toBe(true);
  });
});

describe('director', () => {
  const tune = { rate: 1, maxActive: 1 };
  it('always warns (omen) before a spawn, and keeps a long cooldown between encounters', () => {
    const d = new Director(1);
    d.reset(true);
    const events: string[] = [];
    let t = 0;
    for (; t < 1200; t += 0.5) {
      const e = d.update(0.5, ['hound'], 0, tune, false);
      if (e) events.push(e.type + '@' + t);
    }
    expect(events.length).toBeGreaterThan(2);
    for (let i = 0; i < events.length; i += 2) {
      expect(events[i].startsWith('omen')).toBe(true);
      expect(events[i + 1]?.startsWith('spawn') ?? true).toBe(true);
    }
    // frequent, but never back to back: spawns are 12-32 s apart, the first within ~20 s
    const spawns = events.filter((e) => e.startsWith('spawn')).map((e) => Number(e.split('@')[1]));
    expect(spawns[0]).toBeLessThan(25);
    for (let i = 1; i < spawns.length; i++) {
      expect(spawns[i] - spawns[i - 1]).toBeGreaterThan(10);
      expect(spawns[i] - spawns[i - 1]).toBeLessThan(40);
    }
  });

  it('never spawns in Level 0, safe levels or while at the limit', () => {
    expect(entityTableFor('0', { dark: false, safe: false })).toEqual([]);
    expect(entityTableFor('1000', { dark: false, safe: false })).toEqual([]);
    const d = new Director(2);
    d.reset(true);
    for (let t = 0; t < 600; t++) expect(d.update(1, ['hound'], 1, tune, false)).toBeNull();
    const e = new Director(3);
    e.reset(true);
    for (let t = 0; t < 600; t++) expect(e.update(1, ['hound'], 0, tune, true)).toBeNull();
  });

  it('generated levels get 1-3 entity kinds, deterministically; giants only in open levels', () => {
    for (let n = 3; n < 60; n++) {
      const a = entityTableFor(String(n), { dark: true, safe: false });
      expect(a).toEqual(entityTableFor(String(n), { dark: true, safe: false }));
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(a.length).toBeLessThanOrEqual(3);
      expect(a).not.toContain('giant');
    }
    const open = Array.from({ length: 200 }, (_, n) => entityTableFor(String(n + 3), { dark: false, safe: false, open: true }));
    expect(open.some((t) => t.includes('giant'))).toBe(true);
  });
});
