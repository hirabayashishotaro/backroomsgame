/**
 * Save slots (SPEC §10.5): 3 slots, autosaved on level transitions and at an
 * interval. Electron writes userData/saves/save_N.json, browsers use
 * localStorage (both via the KeyValueStore).
 */
import { getStore } from './storage';
import type { ItemId } from '../items/itemDefs';
import type { DeltaData } from '../world/deltas';

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

export interface SavedPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SavedAnchor {
  x: number;
  y: number;
  z: number;
  rotY: number;
  back: { levelId: string } & SavedPoint;
}

export interface SaveData {
  version: number;
  savedAt: number;
  /** Seconds played in this save. */
  playTime: number;
  worldSeed: number;
  levelId: string;
  /** For the slot list. */
  levelTitle: string;
  levelName: string;
  player: SavedPoint & { pitch: number };
  entry: SavedPoint;
  stats: { health: number; stamina: number };
  inventory: { slots: Array<ItemId | null>; selected: number };
  deltas: DeltaData;
  anchors: Record<string, SavedAnchor[]>;
  /** Recent level history (debug, SPEC §10.5 遷移履歴の一部). */
  history: string[];
}

export interface SlotInfo {
  slot: number;
  data: SaveData | null;
}

const key = (slot: number) => `save:${slot}`;

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p: unknown): p is SavedPoint => !!p && typeof p === 'object' && ['x', 'y', 'z', 'yaw'].every((k) => isNum((p as Record<string, unknown>)[k]));

function pitchOf(p: unknown): number {
  const v = (p as { pitch?: unknown }).pitch;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Validate parsed JSON. Returns null for anything that is not a usable save. */
export function validateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== SAVE_VERSION) return null;
  if (!isNum(r.worldSeed) || typeof r.levelId !== 'string' || !isPoint(r.player) || !isPoint(r.entry)) return null;
  const stats = r.stats as Record<string, unknown> | undefined;
  if (!stats || !isNum(stats.health) || !isNum(stats.stamina)) return null;
  const inv = r.inventory as Record<string, unknown> | undefined;
  if (!inv || !Array.isArray(inv.slots)) return null;
  return {
    version: SAVE_VERSION,
    savedAt: isNum(r.savedAt) ? (r.savedAt as number) : 0,
    playTime: isNum(r.playTime) ? (r.playTime as number) : 0,
    worldSeed: r.worldSeed as number,
    levelId: r.levelId,
    levelTitle: typeof r.levelTitle === 'string' ? r.levelTitle : 'Level ' + r.levelId,
    levelName: typeof r.levelName === 'string' ? r.levelName : '',
    player: { ...(r.player as SavedPoint), pitch: pitchOf(r.player) },
    entry: r.entry as SavedPoint,
    stats: { health: stats.health as number, stamina: stats.stamina as number },
    inventory: { slots: inv.slots as Array<ItemId | null>, selected: isNum(inv.selected) ? (inv.selected as number) : 0 },
    deltas: r.deltas && typeof r.deltas === 'object' ? (r.deltas as DeltaData) : {},
    anchors: r.anchors && typeof r.anchors === 'object' ? (r.anchors as Record<string, SavedAnchor[]>) : {},
    history: Array.isArray(r.history) ? (r.history as unknown[]).filter((x): x is string => typeof x === 'string').slice(-50) : [],
  };
}

export function readSlot(slot: number): SaveData | null {
  const raw = getStore().get(key(slot));
  if (!raw) return null;
  try {
    return validateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSlot(slot: number, data: SaveData): void {
  getStore().set(key(slot), JSON.stringify(data));
}

export function deleteSlot(slot: number): void {
  getStore().set(key(slot), '');
}

export function listSlots(): SlotInfo[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot: i + 1, data: readSlot(i + 1) }));
}

/** The most recently saved slot, or null if there are no saves. */
export function latestSlot(): number | null {
  let best: SlotInfo | null = null;
  for (const s of listSlots()) if (s.data && (!best || s.data.savedAt > best.data!.savedAt)) best = s;
  return best?.slot ?? null;
}

export function formatPlayTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}
