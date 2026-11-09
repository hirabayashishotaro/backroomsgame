import { describe, expect, it } from 'vitest';
import { latestSlot, listSlots, readSlot, validateSave, writeSlot, SAVE_VERSION, type SaveData } from '../src/core/save';
import { DEFAULT_SETTINGS, findConflict, rebind, sanitizeSettings } from '../src/core/settings';

const sample = (over: Partial<SaveData> = {}): SaveData => ({
  version: SAVE_VERSION,
  savedAt: 1000,
  playTime: 60,
  worldSeed: 42,
  levelId: '0',
  levelTitle: 'Level 0',
  levelName: 'The Lobby',
  player: { x: 1, y: 0, z: 2, yaw: 0.5, pitch: 0 },
  entry: { x: 2, y: 0, z: 2, yaw: 0 },
  stats: { health: 77, stamina: 50 },
  inventory: { slots: ['almond_water', null, null, null], selected: 0 },
  deltas: { '0': { '0,0': { taken: ['1,2'], flags: {} } } },
  anchors: {},
  history: ['0'],
  ...over,
});

describe('save slots', () => {
  it('round-trips a save through a slot', () => {
    writeSlot(2, sample());
    const r = readSlot(2)!;
    expect(r.stats.health).toBe(77);
    expect(r.deltas['0']['0,0'].taken).toEqual(['1,2']);
    expect(r.inventory.slots[0]).toBe('almond_water');
  });
  it('rejects broken or old-version data', () => {
    expect(validateSave(null)).toBeNull();
    expect(validateSave({ ...sample(), version: 0 })).toBeNull();
    expect(validateSave({ ...sample(), player: { x: 'a' } })).toBeNull();
  });
  it('finds the most recent slot', () => {
    writeSlot(1, sample({ savedAt: 5 }));
    writeSlot(3, sample({ savedAt: 9 }));
    writeSlot(2, sample({ savedAt: 7 }));
    expect(latestSlot()).toBe(3);
    expect(listSlots().length).toBe(3);
  });
});

describe('settings schema and rebinding', () => {
  it('defaults are valid and out-of-range values are clamped', () => {
    const s = sanitizeSettings({ fov: 500, resolutionScale: 0.1, displayMode: 'weird' as never, fpsLimit: 77 });
    expect(s.fov).toBe(110);
    expect(s.resolutionScale).toBe(0.5);
    expect(s.displayMode).toBe('window');
    expect(s.fpsLimit).toBe(DEFAULT_SETTINGS.fpsLimit);
  });
  it('legacy fullscreen flag becomes the fullscreen display mode', () => {
    expect(sanitizeSettings({ fullscreen: true } as never).displayMode).toBe('fullscreen');
  });
  it('detects conflicts and swaps or overrides keys', () => {
    const b = DEFAULT_SETTINGS.bindings;
    expect(findConflict(b, 'jump', 'KeyW')).toBe('forward');
    const swapped = rebind(b, 'jump', 0, 'KeyW', 'swap');
    expect(swapped.jump[0]).toBe('KeyW');
    expect(swapped.forward[0]).toBe('Space');
    const over = rebind(b, 'jump', 0, 'KeyW', 'override');
    expect(over.forward.length).toBe(0);
    expect(over.jump).toContain('KeyW');
  });
});
