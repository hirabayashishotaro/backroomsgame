/**
 * Key/value persistence.
 * - Electron: the preload script exposes `window.backroomsNative.storage`
 *   which writes JSON files under app.getPath('userData').
 * - Browser: localStorage.
 * - Tests / no storage: in-memory map.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

interface NativeBridge {
  storage?: KeyValueStore;
  isElectron?: boolean;
  setFullscreen?: (on: boolean) => void;
  quit?: () => void;
  args?: string[];
}

declare global {
  interface Window {
    backroomsNative?: NativeBridge;
  }
}

class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
  }
}

class LocalStore implements KeyValueStore {
  get(key: string) {
    try {
      return localStorage.getItem('backrooms:' + key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string) {
    try {
      localStorage.setItem('backrooms:' + key, value);
    } catch {
      /* storage unavailable; ignore */
    }
  }
}

let store: KeyValueStore | null = null;

export function getStore(): KeyValueStore {
  if (store) return store;
  if (typeof window !== 'undefined' && window.backroomsNative?.storage) {
    store = window.backroomsNative.storage;
  } else if (typeof localStorage !== 'undefined') {
    store = new LocalStore();
  } else {
    store = new MemoryStore();
  }
  return store;
}

export function getNative(): NativeBridge | undefined {
  return typeof window !== 'undefined' ? window.backroomsNative : undefined;
}
