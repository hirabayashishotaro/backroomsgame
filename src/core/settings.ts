import { getStore } from './storage';
import type { Difficulty } from '../player/stats';

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'crouch'
  | 'interact'
  | 'use'
  | 'pause'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  sprint: ['ShiftLeft'],
  crouch: ['ControlLeft', 'KeyC'],
  interact: ['KeyE'],
  use: ['KeyQ', 'Mouse0'],
  pause: ['Escape'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
};

export interface Settings {
  sensitivityX: number; // 0.1 - 10
  sensitivityY: number; // 0.1 - 10
  invertY: boolean;
  fov: number; // 60 - 110
  renderDistance: number; // chunk radius 2 - 6
  masterVolume: number; // 0 - 1
  ambienceVolume: number;
  sfxVolume: number;
  humStrength: number; // 0 - 1
  headBob: number; // 0 - 1
  fullscreen: boolean;
  worldSeed: string; // empty = random
  difficulty: Difficulty;
  showHud: boolean;
  bindings: Record<Action, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivityX: 1.0,
  sensitivityY: 1.0,
  invertY: false,
  fov: 75,
  renderDistance: 3,
  masterVolume: 0.8,
  ambienceVolume: 0.8,
  sfxVolume: 0.8,
  humStrength: 0.6,
  headBob: 0.6,
  fullscreen: false,
  worldSeed: '',
  difficulty: 'normal',
  showHud: true,
  bindings: DEFAULT_BINDINGS,
};

const KEY = 'settings';

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Validate/clamp a possibly-partial settings object. */
export function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const r = raw ?? {};
  const d = DEFAULT_SETTINGS;
  const bindings = { ...d.bindings };
  if (r.bindings && typeof r.bindings === 'object') {
    for (const k of Object.keys(bindings) as Action[]) {
      const b = (r.bindings as Record<string, unknown>)[k];
      if (Array.isArray(b) && b.every((x) => typeof x === 'string')) bindings[k] = b as string[];
    }
  }
  return {
    sensitivityX: clamp(r.sensitivityX, 0.1, 10, d.sensitivityX),
    sensitivityY: clamp(r.sensitivityY, 0.1, 10, d.sensitivityY),
    invertY: typeof r.invertY === 'boolean' ? r.invertY : d.invertY,
    fov: clamp(r.fov, 60, 110, d.fov),
    renderDistance: Math.round(clamp(r.renderDistance, 2, 6, d.renderDistance)),
    masterVolume: clamp(r.masterVolume, 0, 1, d.masterVolume),
    ambienceVolume: clamp(r.ambienceVolume, 0, 1, d.ambienceVolume),
    sfxVolume: clamp(r.sfxVolume, 0, 1, d.sfxVolume),
    humStrength: clamp(r.humStrength, 0, 1, d.humStrength),
    headBob: clamp(r.headBob, 0, 1, d.headBob),
    fullscreen: typeof r.fullscreen === 'boolean' ? r.fullscreen : d.fullscreen,
    worldSeed: typeof r.worldSeed === 'string' ? r.worldSeed : d.worldSeed,
    difficulty: r.difficulty === 'easy' || r.difficulty === 'hard' || r.difficulty === 'normal' ? r.difficulty : d.difficulty,
    showHud: typeof r.showHud === 'boolean' ? r.showHud : d.showHud,
    bindings,
  };
}

export function loadSettings(): Settings {
  const raw = getStore().get(KEY);
  if (!raw) return sanitizeSettings(null);
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(s: Settings): void {
  getStore().set(KEY, JSON.stringify(s));
}
