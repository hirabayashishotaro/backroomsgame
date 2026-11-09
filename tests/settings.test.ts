import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/core/settings';

describe('settings', () => {
  it('clamps out-of-range values', () => {
    const s = sanitizeSettings({ sensitivityX: 50, sensitivityY: -2, fov: 10, renderDistance: 99 });
    expect(s.sensitivityX).toBe(10);
    expect(s.sensitivityY).toBe(0.1);
    expect(s.fov).toBe(60);
    expect(s.renderDistance).toBe(6);
  });
  it('fills defaults for missing keys', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
