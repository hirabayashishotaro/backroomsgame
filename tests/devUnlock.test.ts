import { describe, expect, it } from 'vitest';
import { devHash, feedDevKey, isDevUnlocked } from '../src/core/devUnlock';

// The passphrase itself is deliberately not in the repository.
describe('hidden developer menus', () => {
  it('are hidden by default and ordinary typing does not show them', () => {
    expect(isDevUnlocked()).toBe(false);
    for (const c of 'devmode debug level0 backrooms wasdwasdwasd 1234567890') expect(feedDevKey(c)).toBe(null);
    expect(isDevUnlocked()).toBe(false);
  });
  it('the hash is stable', () => {
    expect(devHash('abc')).toBe(devHash('abc'));
    expect(devHash('abc')).not.toBe(devHash('abd'));
  });
});
