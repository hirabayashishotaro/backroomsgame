/**
 * The bestiary (エンティティ図鑑), shared by every run (user request): every
 * entity ever met - random ones with their whole genome so their model can
 * be rebuilt - the levels where it was met, and how many were defeated.
 * Pure data, stored on its own key (not in the run's save).
 */
import { getStore, type KeyValueStore } from '../core/storage';

export interface BestiaryEntry {
  /** The kind, or 'chimera:<seed>' for a random entity. */
  key: string;
  kind: string;
  name: string;
  genome?: unknown;
  /** Where it was met (level id and its title at the time). */
  levels: Array<{ id: string; title: string }>;
  firstMet: number;
  defeated: number;
}

const KEY = 'bestiary';

export class Bestiary {
  entries: BestiaryEntry[] = [];

  constructor(private store: KeyValueStore | null = null) {}

  private get kv(): KeyValueStore {
    return this.store ?? getStore();
  }

  load(): void {
    try {
      const raw = this.kv.get(KEY);
      const d = raw ? JSON.parse(raw) : null;
      this.entries = Array.isArray(d?.entries) ? d.entries.filter((e: BestiaryEntry) => e && typeof e.key === 'string' && Array.isArray(e.levels)) : [];
    } catch {
      this.entries = [];
    }
  }

  save(): void {
    this.kv.set(KEY, JSON.stringify({ entries: this.entries }));
  }

  /** Met an entity in a level. Returns true if it is new to the bestiary. */
  meet(level: { id: string; title: string }, c: { key: string; kind: string; name: string; genome?: unknown }, now = Date.now()): boolean {
    let e = this.entries.find((x) => x.key === c.key);
    const isNew = !e;
    if (!e) {
      e = { key: c.key, kind: c.kind, name: c.name, genome: c.genome, levels: [], firstMet: now, defeated: 0 };
      this.entries.push(e);
    }
    if (!e.levels.some((l) => l.id === level.id)) e.levels.push({ id: level.id, title: level.title });
    this.save();
    return isNew;
  }

  defeat(key: string): void {
    const e = this.entries.find((x) => x.key === key);
    if (!e) return;
    e.defeated++;
    this.save();
  }

  /** Bring in what a run's journal remembers (older saves, runs from before the shared bestiary). */
  merge(list: Array<{ key: string; kind: string; name: string; genome?: unknown; levels: string[]; firstMet: number; defeated: number }>, titleOf: (id: string) => string): void {
    let changed = false;
    for (const c of list) {
      let e = this.entries.find((x) => x.key === c.key);
      if (!e) {
        e = { key: c.key, kind: c.kind, name: c.name, genome: c.genome, levels: [], firstMet: c.firstMet, defeated: c.defeated };
        this.entries.push(e);
        changed = true;
      }
      for (const id of c.levels)
        if (!e.levels.some((l) => l.id === id)) {
          e.levels.push({ id, title: titleOf(id) });
          changed = true;
        }
    }
    if (changed) this.save();
  }
}
