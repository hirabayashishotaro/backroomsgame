/**
 * Hidden developer menus. The level select and developer modes 2 and 3 are
 * only shown once the passphrase has been typed on the title or pause screen
 * (typing it again hides them). Only a hash of the passphrase is stored here,
 * so reading the public source does not give it away. The unlock is
 * remembered per install / browser.
 */
import { getStore } from './storage';

const KEY = 'dev-unlocked';
const PASS_LEN = 10;
const PASS_HASH = 'aedbfc4c6c4fb';

/** 53-bit string hash (cyrb53), as hex. */
export function devHash(s: string): string {
  let h1 = 0xdeadbeef ^ 0x5eed;
  let h2 = 0x41c6ce57 ^ 0x5eed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function isDevUnlocked(): boolean {
  return getStore().get(KEY) === '1';
}

let typed = '';

/**
 * Feed one typed character. Returns the new state when the passphrase was
 * just completed (true = now shown, false = now hidden), otherwise null.
 */
export function feedDevKey(ch: string): boolean | null {
  if (ch.length !== 1) return null;
  typed = (typed + ch.toLowerCase()).slice(-PASS_LEN);
  if (typed.length < PASS_LEN || devHash(typed) !== PASS_HASH) return null;
  typed = '';
  const on = !isDevUnlocked();
  getStore().set(KEY, on ? '1' : '0');
  return on;
}
