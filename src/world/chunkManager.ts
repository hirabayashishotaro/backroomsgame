/**
 * Chunk streaming (SPEC §3.1).
 * - Chunks within `radius` of the player are generated (time-budgeted queue,
 *   prioritised by distance and the player's heading).
 * - Chunks farther than `radius + 1` are disposed.
 * Renderer-independent: the caller supplies build/dispose callbacks.
 */
import { chunkKey, type ChunkData } from './chunkData';

export interface LoadedChunk<H> {
  data: ChunkData;
  handle: H;
}

export interface AsyncChunkSource<H> {
  /** Start generating a chunk elsewhere (worker). */
  request: (cx: number, cz: number) => Promise<unknown>;
  /** Turn a finished result into chunk data + handle (main thread). */
  build: (result: unknown) => { data: ChunkData; handle: H };
  maxInFlight: number;
}

export interface ChunkManagerOptions<H> {
  chunkSize: number;
  radius: number;
  budgetMs: number;
  generate: (cx: number, cz: number) => ChunkData;
  build: (data: ChunkData) => H;
  dispose: (handle: H, data: ChunkData) => void;
  now?: () => number;
  /** Optional off-thread generation; loadAllSync still uses the sync path. */
  async?: AsyncChunkSource<H>;
}

export class ChunkManager<H> {
  readonly chunks = new Map<string, LoadedChunk<H>>();
  private queue: Array<{ cx: number; cz: number; key: string }> = [];
  private queued = new Set<string>();
  private lastCenter = '';
  private inFlight = new Set<string>();
  private generation = 0;
  private ccx = 0;
  private ccz = 0;
  private opts: ChunkManagerOptions<H>;
  private now: () => number;

  constructor(opts: ChunkManagerOptions<H>) {
    this.opts = opts;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  get radius(): number {
    return this.opts.radius;
  }
  set radius(r: number) {
    this.opts.radius = r;
    this.lastCenter = '';
  }

  /** Upper bound on simultaneously loaded chunks. */
  get maxChunks(): number {
    const side = 2 * (this.opts.radius + 1) + 1;
    return side * side;
  }

  get pending(): number {
    return this.queue.length + this.inFlight.size;
  }

  chunkCoord(v: number): number {
    return Math.floor(v / this.opts.chunkSize);
  }

  get(cx: number, cz: number): LoadedChunk<H> | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** Per-frame update. dirX/dirZ: player's facing (for priority). */
  update(px: number, pz: number, dirX = 0, dirZ = 0): void {
    const ccx = this.chunkCoord(px);
    const ccz = this.chunkCoord(pz);
    this.ccx = ccx;
    this.ccz = ccz;
    const center = ccx + ',' + ccz + ',' + this.opts.radius;
    if (center !== this.lastCenter) {
      this.lastCenter = center;
      this.unloadFar(ccx, ccz);
      this.rebuildQueue(ccx, ccz, px, pz, dirX, dirZ);
    }
    this.processQueue();
  }

  /** Synchronously load everything within `radius` (used on level entry). */
  loadAllSync(px: number, pz: number, radius = this.opts.radius): void {
    const ccx = this.chunkCoord(px);
    const ccz = this.chunkCoord(pz);
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) this.load(ccx + dx, ccz + dz);
  }

  clear(): void {
    for (const c of this.chunks.values()) this.opts.dispose(c.handle, c.data);
    this.chunks.clear();
    this.queue = [];
    this.queued.clear();
    this.inFlight.clear();
    this.generation++;
    this.lastCenter = '';
  }

  private load(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) return;
    const data = this.opts.generate(cx, cz);
    const handle = this.opts.build(data);
    this.chunks.set(key, { data, handle });
  }

  private unloadFar(ccx: number, ccz: number): void {
    const keep = this.opts.radius + 1;
    for (const [key, c] of this.chunks) {
      if (Math.abs(c.data.cx - ccx) > keep || Math.abs(c.data.cz - ccz) > keep) {
        this.opts.dispose(c.handle, c.data);
        this.chunks.delete(key);
      }
    }
  }

  private rebuildQueue(ccx: number, ccz: number, px: number, pz: number, dirX: number, dirZ: number): void {
    const r = this.opts.radius;
    const size = this.opts.chunkSize;
    const items: Array<{ cx: number; cz: number; key: string; score: number }> = [];
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = chunkKey(cx, cz);
        if (this.chunks.has(key) || this.inFlight.has(key)) continue;
        const mx = (cx + 0.5) * size - px;
        const mz = (cz + 0.5) * size - pz;
        const dist = Math.hypot(mx, mz);
        const facing = dist > 0 ? (mx * dirX + mz * dirZ) / dist : 1;
        items.push({ cx, cz, key, score: dist - facing * size * 0.75 });
      }
    items.sort((a, b) => a.score - b.score);
    this.queue = items;
    this.queued = new Set(items.map((i) => i.key));
  }

  private processQueue(): void {
    const a = this.opts.async;
    if (a) {
      while (this.queue.length && this.inFlight.size < a.maxInFlight) {
        const item = this.queue.shift()!;
        this.queued.delete(item.key);
        if (this.chunks.has(item.key) || this.inFlight.has(item.key)) continue;
        this.inFlight.add(item.key);
        const gen = this.generation;
        a.request(item.cx, item.cz).then(
          (r) => {
            if (gen !== this.generation) return; // level changed meanwhile
            this.inFlight.delete(item.key);
            const keep = this.opts.radius + 1;
            if (this.chunks.has(item.key) || Math.abs(item.cx - this.ccx) > keep || Math.abs(item.cz - this.ccz) > keep) return;
            const { data, handle } = a.build(r);
            this.chunks.set(item.key, { data, handle });
          },
          () => {
            if (gen !== this.generation) return;
            // Worker failed: fall back to generating here.
            this.inFlight.delete(item.key);
            this.load(item.cx, item.cz);
          },
        );
      }
      return;
    }
    const start = this.now();
    let done = 0;
    while (this.queue.length) {
      // Always make progress on at least one chunk per frame.
      if (done > 0 && this.now() - start > this.opts.budgetMs) break;
      const item = this.queue.shift()!;
      this.queued.delete(item.key);
      this.load(item.cx, item.cz);
      done++;
    }
  }
}
