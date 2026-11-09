/** 6-slot item bar, one item per slot (SPEC §17, extended for weapons). */
import { ITEMS, type ItemId } from '../items/itemDefs';

export const SLOTS = 6;

export class Inventory {
  slots: Array<ItemId | null> = new Array(SLOTS).fill(null);
  selected = 0;

  get held(): ItemId | null {
    return this.slots[this.selected];
  }

  get count(): number {
    return this.slots.filter(Boolean).length;
  }

  has(id: ItemId): boolean {
    return this.slots.includes(id);
  }

  get full(): boolean {
    return this.count >= SLOTS;
  }

  /** Add an item to the first free slot. Returns false if full. */
  add(id: ItemId): boolean {
    const free = this.slots.indexOf(null);
    if (free < 0) return false;
    this.slots[free] = id;
    return true;
  }

  /** Remove and return the item in a slot. */
  take(index: number): ItemId | null {
    const id = this.slots[index];
    this.slots[index] = null;
    return id;
  }

  select(i: number): void {
    this.selected = ((i % SLOTS) + SLOTS) % SLOTS;
  }

  /** Death penalty: lose half of the items (rounded down), chosen by `pick(n)`. */
  loseHalf(pick: (n: number) => number): ItemId[] {
    const filled = this.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    const lose = Math.floor(filled.length / 2);
    const lost: ItemId[] = [];
    for (let k = 0; k < lose; k++) {
      const idx = filled.splice(pick(filled.length), 1)[0];
      lost.push(this.slots[idx]!);
      this.slots[idx] = null;
    }
    return lost;
  }

  toJSON(): { slots: Array<ItemId | null>; selected: number } {
    return { slots: [...this.slots], selected: this.selected };
  }

  load(data: { slots: Array<ItemId | null>; selected: number }): void {
    this.slots = new Array(SLOTS).fill(null).map((_, i) => {
      const s = data.slots?.[i];
      return s && s in ITEMS ? s : null;
    });
    this.selected = data.selected ?? 0;
  }
}
