/**
 * Settings (SPEC §10). A single schema drives validation and the settings
 * screen, so every option is clamped/sanitised the same way and shows up in
 * the UI automatically.
 */
import { getStore } from './storage';
import type { Difficulty } from '../player/stats';

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'crouch'
  | 'jump'
  | 'interact'
  | 'use'
  | 'attack'
  | 'aim'
  | 'reload'
  | 'pause'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'prevSlot'
  | 'nextSlot'
  | 'journal';

export const ACTIONS: Action[] = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sprint',
  'crouch',
  'attack',
  'aim',
  'reload',
  'interact',
  'use',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'slot5',
  'slot6',
  'prevSlot',
  'nextSlot',
  'journal',
  'pause',
];

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  sprint: ['ShiftLeft'],
  crouch: ['ControlLeft', 'KeyC'],
  jump: ['Space'],
  interact: ['KeyE'],
  use: ['KeyQ'],
  attack: ['Mouse0'],
  aim: ['Mouse2'],
  reload: ['KeyR'],
  pause: ['Escape'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  slot6: ['Digit6'],
  prevSlot: ['WheelUp'],
  nextSlot: ['WheelDown'],
  journal: ['Tab', 'KeyJ'],
};

/**
 * Gamepad button indices (standard mapping): 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB,
 * 6 LT, 7 RT, 8 Back, 9 Start, 10 LS, 11 RS, 12-15 D-pad.
 */
export const DEFAULT_PAD_BINDINGS: Partial<Record<Action, number[]>> = {
  jump: [0],
  crouch: [11],
  reload: [1],
  interact: [2],
  use: [3],
  aim: [6],
  attack: [7],
  sprint: [10],
  prevSlot: [4],
  nextSlot: [5],
  pause: [9],
  journal: [8],
};

export type DisplayMode = 'window' | 'fullscreen' | 'borderless';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  // Controls
  sensitivityX: number;
  sensitivityY: number;
  invertY: boolean;
  fov: number;
  sprintToggle: boolean;
  crouchToggle: boolean;
  padSensitivity: number;
  padDeadzone: number;
  padInvertY: boolean;
  adsSensitivity: number;
  crosshairSize: number;
  crosshairColor: 'white' | 'green' | 'yellow' | 'cyan' | 'red';
  crosshairDot: boolean;
  jumpscare: 'off' | 'mild' | 'full';
  bindings: Record<Action, string[]>;
  padBindings: Partial<Record<Action, number[]>>;
  // Video
  displayMode: DisplayMode;
  resolutionScale: number;
  renderDistance: number;
  quality: Quality;
  fpsLimit: number; // 0 = unlimited
  vsync: boolean;
  brightness: number;
  gamma: number;
  filmGrain: boolean;
  chromaticAberration: boolean;
  headBob: number;
  reduceShake: boolean;
  reduceFlicker: boolean;
  // Audio
  masterVolume: number;
  ambienceVolume: number;
  sfxVolume: number;
  entityVolume: number;
  humStrength: number;
  // Game
  difficulty: Difficulty;
  subtitles: boolean;
  showHud: boolean;
  hudScale: number;
  language: 'ja';
  nonEuclidean: boolean;
  worldSeed: string;
  autosaveMinutes: number; // 0 = off
}

type Field =
  | { key: keyof Settings; type: 'range'; min: number; max: number; step: number; def: number; tab: Tab; label: string; fmt?: (v: number) => string; note?: string }
  | { key: keyof Settings; type: 'bool'; def: boolean; tab: Tab; label: string; note?: string }
  | { key: keyof Settings; type: 'select'; options: Array<[string | number, string]>; def: string | number; tab: Tab; label: string; note?: string }
  | { key: keyof Settings; type: 'text'; def: string; tab: Tab; label: string; note?: string };

export type Tab = 'controls' | 'video' | 'audio' | 'game';

const pct = (v: number) => Math.round(v * 100) + '%';

/** The settings schema (order = order on screen). */
export const SETTINGS_SCHEMA: Field[] = [
  { key: 'sensitivityX', type: 'range', min: 0.1, max: 10, step: 0.1, def: 1, tab: 'controls', label: 'マウス感度(横 X)' },
  { key: 'sensitivityY', type: 'range', min: 0.1, max: 10, step: 0.1, def: 1, tab: 'controls', label: 'マウス感度(縦 Y)' },
  { key: 'invertY', type: 'bool', def: false, tab: 'controls', label: 'Y軸反転' },
  { key: 'fov', type: 'range', min: 60, max: 110, step: 1, def: 75, tab: 'controls', label: '視野角(FOV)' },
  { key: 'sprintToggle', type: 'bool', def: false, tab: 'controls', label: 'ダッシュをトグルにする', note: 'オフ: 押している間だけ / オン: 押すたびに切り替え' },
  { key: 'crouchToggle', type: 'bool', def: false, tab: 'controls', label: 'しゃがみをトグルにする' },
  { key: 'adsSensitivity', type: 'range', min: 0.1, max: 3, step: 0.05, def: 1, tab: 'controls', label: 'エイム時の感度倍率', note: '右クリックで覗き込んでいるときの感度(ズーム率に合わせて補正済み)' },
  { key: 'crosshairSize', type: 'range', min: 0.5, max: 2, step: 0.05, def: 1, tab: 'controls', label: 'レティクルの大きさ', fmt: pct },
  { key: 'crosshairColor', type: 'select', options: [['white', '白'], ['green', '緑'], ['yellow', '黄'], ['cyan', '水色'], ['red', '赤']], def: 'white', tab: 'controls', label: 'レティクルの色' },
  { key: 'crosshairDot', type: 'bool', def: true, tab: 'controls', label: 'レティクルの中心点' },
  { key: 'padSensitivity', type: 'range', min: 0.1, max: 10, step: 0.1, def: 2.5, tab: 'controls', label: 'ゲームパッド感度' },
  { key: 'padDeadzone', type: 'range', min: 0, max: 0.5, step: 0.01, def: 0.15, tab: 'controls', label: 'ゲームパッドのデッドゾーン' },
  { key: 'padInvertY', type: 'bool', def: false, tab: 'controls', label: 'ゲームパッドのY軸反転' },

  { key: 'displayMode', type: 'select', options: [['window', 'ウィンドウ'], ['fullscreen', 'フルスクリーン'], ['borderless', 'ボーダーレス']], def: 'window', tab: 'video', label: '画面モード' },
  { key: 'quality', type: 'select', options: [['low', '低'], ['medium', '中'], ['high', '高']], def: 'medium', tab: 'video', label: '品質プリセット', note: '解像度・描画距離などをまとめて変更' },
  { key: 'resolutionScale', type: 'range', min: 0.5, max: 1, step: 0.05, def: 1, tab: 'video', label: '解像度スケール', fmt: pct },
  { key: 'renderDistance', type: 'range', min: 2, max: 6, step: 1, def: 3, tab: 'video', label: '描画距離(チャンク)' },
  { key: 'fpsLimit', type: 'select', options: [[30, '30'], [60, '60'], [120, '120'], [144, '144'], [0, '無制限']], def: 0, tab: 'video', label: 'フレームレート上限' },
  { key: 'vsync', type: 'bool', def: true, tab: 'video', label: '垂直同期', note: 'exe 版のみ。再起動後に反映' },
  { key: 'brightness', type: 'range', min: 0.5, max: 1.5, step: 0.05, def: 1, tab: 'video', label: '明るさ', fmt: pct },
  { key: 'gamma', type: 'range', min: 0.6, max: 1.6, step: 0.05, def: 1, tab: 'video', label: 'ガンマ' },
  { key: 'filmGrain', type: 'bool', def: false, tab: 'video', label: 'フィルムグレイン' },
  { key: 'chromaticAberration', type: 'bool', def: false, tab: 'video', label: '色収差' },
  { key: 'headBob', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6, tab: 'video', label: '視点の揺れ(ヘッドボブ)', fmt: pct },
  { key: 'reduceShake', type: 'bool', def: false, tab: 'video', label: '画面揺れを軽減' },
  { key: 'reduceFlicker', type: 'bool', def: false, tab: 'video', label: '点滅を軽減' },

  { key: 'masterVolume', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, tab: 'audio', label: 'マスター音量', fmt: pct },
  { key: 'ambienceVolume', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, tab: 'audio', label: '環境音', fmt: pct },
  { key: 'sfxVolume', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, tab: 'audio', label: '効果音', fmt: pct },
  { key: 'entityVolume', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, tab: 'audio', label: 'エンティティの音', fmt: pct },
  { key: 'humStrength', type: 'range', min: 0, max: 1, step: 0.05, def: 0.6, tab: 'audio', label: 'ハム音の強さ', fmt: pct },

  { key: 'difficulty', type: 'select', options: [['easy', 'やさしい'], ['normal', 'ふつう'], ['hard', 'むずかしい']], def: 'normal', tab: 'game', label: '難易度' },
  { key: 'jumpscare', type: 'select', options: [['off', 'なし'], ['mild', '控えめ'], ['full', '強い']], def: 'mild', tab: 'game', label: 'ジャンプスケア', note: '捕まったときの驚かせ演出の強さ' },
  { key: 'subtitles', type: 'bool', def: false, tab: 'game', label: '字幕(環境音・声の文字化)' },
  { key: 'showHud', type: 'bool', def: true, tab: 'game', label: 'HUD を表示' },
  { key: 'hudScale', type: 'range', min: 0.7, max: 1.5, step: 0.05, def: 1, tab: 'game', label: 'HUD の大きさ', fmt: pct },
  { key: 'nonEuclidean', type: 'bool', def: true, tab: 'game', label: '非ユークリッドな迷路(Level 0)', note: '遠くまで歩くと、来た道の形が変わっていく' },
  { key: 'language', type: 'select', options: [['ja', '日本語']], def: 'ja', tab: 'game', label: '言語', note: '英語は今後対応予定' },
  { key: 'worldSeed', type: 'text', def: '', tab: 'game', label: 'ワールドシード', note: '空欄ならランダム。次のニューゲームから反映' },
  { key: 'autosaveMinutes', type: 'select', options: [[0, 'オフ'], [1, '1分'], [2, '2分'], [5, '5分'], [10, '10分']], def: 2, tab: 'game', label: 'オートセーブ間隔', note: 'レベル移動時は常に保存' },
];

export const QUALITY_PRESETS: Record<Quality, Partial<Settings>> = {
  low: { resolutionScale: 0.7, renderDistance: 2, filmGrain: false, chromaticAberration: false },
  medium: { resolutionScale: 0.9, renderDistance: 3 },
  high: { resolutionScale: 1, renderDistance: 4 },
};

function defaults(): Settings {
  const s: Record<string, unknown> = {};
  for (const f of SETTINGS_SCHEMA) {
    s[f.key] = f.def;
  }
  s.bindings = structuredClone(DEFAULT_BINDINGS);
  s.padBindings = structuredClone(DEFAULT_PAD_BINDINGS);
  return s as unknown as Settings;
}

export const DEFAULT_SETTINGS: Settings = defaults();

/** Validate/clamp a possibly-partial settings object. */
export function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = defaults() as unknown as Record<string, unknown>;
  for (const f of SETTINGS_SCHEMA) {
    const v = r[f.key];
    switch (f.type) {
      case 'range':
        if (typeof v === 'number' && Number.isFinite(v)) {
          let n = Math.min(f.max, Math.max(f.min, v));
          if (f.step >= 1) n = Math.round(n);
          out[f.key] = n;
        }
        break;
      case 'bool':
        if (typeof v === 'boolean') out[f.key] = v;
        break;
      case 'select':
        if (f.options.some(([o]) => o === v)) out[f.key] = v;
        break;
      case 'text':
        if (typeof v === 'string') out[f.key] = v.slice(0, 64);
        break;
    }
  }
  // Legacy: older versions stored "fullscreen: boolean".
  if (r.fullscreen === true && r.displayMode === undefined) out.displayMode = 'fullscreen';
  const bindings = out.bindings as Record<Action, string[]>;
  if (r.bindings && typeof r.bindings === 'object') {
    for (const k of ACTIONS) {
      const b = (r.bindings as Record<string, unknown>)[k];
      if (Array.isArray(b) && b.every((x) => typeof x === 'string')) bindings[k] = (b as string[]).slice(0, 2);
    }
    // Older versions drank with the left mouse button; it now fires the weapon.
    if (!('attack' in (r.bindings as object))) bindings.use = bindings.use.filter((c) => c !== 'Mouse0');
  }
  const pad = out.padBindings as Partial<Record<Action, number[]>>;
  if (r.padBindings && typeof r.padBindings === 'object') {
    for (const k of ACTIONS) {
      const b = (r.padBindings as Record<string, unknown>)[k];
      if (Array.isArray(b) && b.every((x) => Number.isInteger(x))) pad[k] = (b as number[]).slice(0, 2);
    }
  }
  return out as unknown as Settings;
}

/** Which other action already uses this input code (for rebind conflict warnings). */
export function findConflict(bindings: Record<Action, string[]>, action: Action, code: string): Action | null {
  for (const a of ACTIONS) if (a !== action && bindings[a].includes(code)) return a;
  return null;
}

/**
 * Bind `code` to `action` in slot `slot`. mode 'swap' gives the conflicting
 * action this action's previous key; 'override' just removes it there.
 */
export function rebind(bindings: Record<Action, string[]>, action: Action, slot: number, code: string, mode: 'swap' | 'override'): Record<Action, string[]> {
  const b = structuredClone(bindings);
  const prev = b[action][slot];
  const other = findConflict(b, action, code);
  if (other) {
    const i = b[other].indexOf(code);
    if (mode === 'swap' && prev) b[other][i] = prev;
    else b[other].splice(i, 1);
  }
  b[action][slot] = code;
  b[action] = b[action].filter((x, i, arr) => x && arr.indexOf(x) === i);
  return b;
}

const KEY = 'settings';

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
