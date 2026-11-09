/** 16-slot inventory: slots 0-7 are the hotbar, 8-15 the backpack (SPEC §8.2). */
import { ITEMS, type ItemId } from '../items/itemDefs';

export interface Slot {
  id: ItemId;
  count: number;
  /** Remaining uses (chalk) or note index. */
  meta?: number;
}

export const HOTBAR = 8;
export const SLOTS = 16;

export class Inventory {
  slots: Array<Slot | null> = new Array(SLOTS).fill(null);
  selected = 0;

  get held(): Slot | null {
    return this.slots[this.selected];
  }

  count(id: ItemId): number {
    return this.slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  has(id: ItemId): boolean {
    return this.count(id) > 0;
  }

  /** Add an item. Returns false if there is no room. */
  add(id: ItemId, meta?: number): boolean {
    const def = ITEMS[id];
    if (def.stack > 1 && meta === undefined) {
      for (const s of this.slots) {
        if (s && s.id === id && s.count < def.stack && s.meta === undefined) {
          s.count++;
          return true;
        }
      }
    }
    const free = this.slots.indexOf(null);
    if (free < 0) return false;
    this.slots[free] = { id, count: 1, meta: meta ?? def.uses };
    return true;
  }

  /** Remove one item from a slot. */
  takeOne(index: number): Slot | null {
    const s = this.slots[index];
    if (!s) return null;
    s.count--;
    if (s.count <= 0) this.slots[index] = null;
    return { id: s.id, count: 1, meta: s.meta };
  }

  /** Remove one of the given item from anywhere (prefers backpack). */
  consume(id: ItemId): boolean {
    for (let i = SLOTS - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        this.takeOne(i);
        return true;
      }
    }
    return false;
  }

  swap(a: number, b: number): void {
    const t = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = t;
  }

  select(i: number): void {
    this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR;
  }

  /**
   * Death penalty: lose half of all items (rounded down), chosen
   * deterministically by `pick(n)` which returns an index in [0, n).
   */
  loseHalf(pick: (n: number) => number): Array<{ id: ItemId; count: number }> {
    const units: Array<{ slot: number }> = [];
    this.slots.forEach((s, i) => {
      if (s) for (let k = 0; k < s.count; k++) units.push({ slot: i });
    });
    const lose = Math.floor(units.length / 2);
    const lost: Array<{ id: ItemId; count: number }> = [];
    for (let k = 0; k < lose; k++) {
      const u = units.splice(pick(units.length), 1)[0];
      const s = this.slots[u.slot]!;
      lost.push({ id: s.id, count: 1 });
      this.takeOne(u.slot);
      // Re-index remaining units of an emptied slot is unnecessary: counts only shrink.
      if (!this.slots[u.slot]) {
        for (let j = units.length - 1; j >= 0; j--) if (units[j].slot === u.slot) units.splice(j, 1);
      }
    }
    return lost;
  }

  toJSON(): { slots: Array<Slot | null>; selected: number } {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), selected: this.selected };
  }

  load(data: { slots: Array<Slot | null>; selected: number }): void {
    this.slots = new Array(SLOTS).fill(null).map((_, i) => {
      const s = data.slots?.[i];
      return s && s.id in ITEMS ? { ...s } : null;
    });
    this.selected = data.selected ?? 0;
  }
}
