/**
 * Per-level, per-chunk record of what the player changed (SPEC §3.1).
 * Re-applied whenever a chunk is regenerated; serialisable for saves.
 */
export interface ChunkDelta {
  taken: string[];
  flags: Record<string, boolean>;
}

export type DeltaData = Record<string, Record<string, ChunkDelta>>;

export class WorldDeltas {
  data: DeltaData = {};

  get(levelId: string, key: string): ChunkDelta | undefined {
    return this.data[levelId]?.[key];
  }

  private ensure(levelId: string, key: string): ChunkDelta {
    const lv = (this.data[levelId] ??= {});
    return (lv[key] ??= { taken: [], flags: {} });
  }

  isTaken(levelId: string, key: string, itemUid: string): boolean {
    return this.get(levelId, key)?.taken.includes(itemUid) ?? false;
  }

  take(levelId: string, key: string, itemUid: string): void {
    const d = this.ensure(levelId, key);
    if (!d.taken.includes(itemUid)) d.taken.push(itemUid);
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
