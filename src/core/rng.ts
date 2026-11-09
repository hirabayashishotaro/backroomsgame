/**
 * Seeded, deterministic random utilities.
 * World generation must never use Math.random() (SPEC §0.6).
 */

/** mulberry32 PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small seeded RNG object with helpers. */
export class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** Mix a 32-bit integer (murmur3 finalizer). */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash a string to a 32-bit unsigned integer (FNV-1a + mix). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h);
}

/**
 * Hash any number of integers into one 32-bit unsigned integer.
 * Coordinates may be negative or very large; they are folded into 32 bits
 * using both low and high parts so that far-away coordinates stay distinct.
 */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) {
    const lo = v | 0;
    const hi = Math.floor(v / 4294967296) | 0;
    h = mix32(h ^ lo) + 0x7f4a7c15;
    h = mix32(h ^ hi);
  }
  return h >>> 0;
}

/** Hash integers to a float in [0, 1). */
export function hash01(...values: number[]): number {
  return hashInts(...values) / 4294967296;
}
