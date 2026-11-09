/**
 * Per-level, per-chunk record of what the player changed (SPEC §3.1).
 * Re-applied whenever a chunk is regenerated; serialisable for saves.
 */
import type { ItemId } from '../items/itemDefs';

export interface DroppedItem {
  uid: string;
  id: ItemId;
  meta?: number;
  /** Local chunk coordinates. */
  x: number;
  y: number;
  z: number;
}

export interface ChalkMark {
  /** Local chunk coordinates of the mark centre. */
  x: number;
  y: number;
  z: number;
  /** Surface normal (axis-aligned). */
  nx: number;
  ny: number;
  nz: number;
  /** Variant: 0 arrow, 1 cross, 2 circle. */
  kind: number;
  /** Rotation in the surface plane (radians). */
  rot: number;
}

export interface ChunkDelta {
  taken: string[];
  dropped: DroppedItem[];
  marks: ChalkMark[];
  flags: Record<string, boolean>;
}

export type DeltaData = Record<string, Record<string, ChunkDelta>>;

export class WorldDeltas {
  data: DeltaData = {};
  private counter = 0;

  get(levelId: string, key: string): ChunkDelta | undefined {
    return this.data[levelId]?.[key];
  }

  private ensure(levelId: string, key: string): ChunkDelta {
    const lv = (this.data[levelId] ??= {});
    return (lv[key] ??= { taken: [], dropped: [], marks: [], flags: {} });
  }

  isTaken(levelId: string, key: string, itemUid: string): boolean {
    return this.get(levelId, key)?.taken.includes(itemUid) ?? false;
  }

  /** Mark a generated item as taken, or remove a dropped one. */
  take(levelId: string, key: string, itemUid: string): void {
    const d = this.ensure(levelId, key);
    const i = d.dropped.findIndex((x) => x.uid === itemUid);
    if (i >= 0) d.dropped.splice(i, 1);
    else if (!d.taken.includes(itemUid)) d.taken.push(itemUid);
  }

  drop(levelId: string, key: string, item: Omit<DroppedItem, 'uid'>): DroppedItem {
    const d = this.ensure(levelId, key);
    const full = { ...item, uid: `d${Date.now().toString(36)}${(this.counter++).toString(36)}` };
    d.dropped.push(full);
    return full;
  }

  mark(levelId: string, key: string, m: ChalkMark): void {
    const d = this.ensure(levelId, key);
    d.marks.push(m);
    if (d.marks.length > 200) d.marks.shift();
  }

  setFlag(levelId: string, key: string, flag: string, v = true): void {
    this.ensure(levelId, key).flags[flag] = v;
  }

  toJSON(): DeltaData {
    return this.data;
  }

  load(d: DeltaData): void {
    this.data = d ?? {};
  }
}
