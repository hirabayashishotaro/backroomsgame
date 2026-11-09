/**
 * Chunk streaming (SPEC §3.1), in 3D: chunks are (cx, cz, cy). Flat levels
 * only ever use cy = 0; vertical levels (spiral stairs, towers, caves, the
 * oesophagus...) also stream slabs above and below the player.
 * - Chunks within `radius` (and `vRadius` vertically) are generated
 *   (time-budgeted, prioritised by distance and heading).
 * - Chunks farther than radius + 1 are disposed.
 * Renderer-independent: the caller supplies build/dispose callbacks.
 */
import { chunkKey, type ChunkData } from './chunkData';

export interface LoadedChunk<H> {
  data: ChunkData;
  handle: H;
}

export interface AsyncChunkSource<H> {
  /** Start generating a chunk elsewhere (worker). */
  request: (cx: number, cz: number, cy: number) => Promise<unknown>;
  /** Turn a finished result into chunk data + handle (main thread). */
  build: (result: unknown) => { data: ChunkData; handle: H };
  maxInFlight: number;
}

export interface ChunkManagerOptions<H> {
  chunkSize: number;
  radius: number;
  budgetMs: number;
  generate: (cx: number, cz: number, cy: number) => ChunkData;
  build: (data: ChunkData) => H;
  dispose: (handle: H, data: ChunkData) => void;
  now?: () => number;
  /** Optional off-thread generation; loadAllSync still uses the sync path. */
  async?: AsyncChunkSource<H>;
  /** Vertical streaming: number of slabs above/below to load (0 = flat level). */
  vRadius?: number;
  /** Height of one vertical slab (m). */
  slab?: number;
}

interface QueueItem {
  cx: number;
  cz: number;
  cy: number;
  key: string;
}

export class ChunkManager<H> {
  readonly chunks = new Map<string, LoadedChunk<H>>();
  private queue: QueueItem[] = [];
  private queued = new Set<string>();
  private lastCenter = '';
  private opts: ChunkManagerOptions<H>;
  private now: () => number;
  private inFlight = new Set<string>();
  private generation = 0;
  private ccx = 0;
  private ccz = 0;
  private ccy = 0;

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

  get vRadius(): number {
    return this.opts.vRadius ?? 0;
  }

  /** Upper bound on simultaneously loaded chunks. */
  get maxChunks(): number {
    const side = 2 * (this.opts.radius + 1) + 1;
    const layers = this.vRadius > 0 ? 2 * (this.vRadius + 1) + 1 : 1;
    return side * side * layers;
  }

  get pending(): number {
    return this.queue.length + this.inFlight.size;
  }

  chunkCoord(v: number): number {
    return Math.floor(v / this.opts.chunkSize);
  }

  slabCoord(y: number): number {
    return this.vRadius > 0 ? Math.floor(y / (this.opts.slab ?? this.opts.chunkSize)) : 0;
  }

  get(cx: number, cz: number, cy = 0): LoadedChunk<H> | undefined {
    return this.chunks.get(chunkKey(cx, cz, cy));
  }

  /** All loaded chunks of a column near the player's slab (vertical levels). */
  column(cx: number, cz: number): LoadedChunk<H>[] {
    if (this.vRadius === 0) {
      const c = this.get(cx, cz);
      return c ? [c] : [];
    }
    const out: LoadedChunk<H>[] = [];
    for (let cy = this.ccy - this.vRadius - 1; cy <= this.ccy + this.vRadius + 1; cy++) {
      const c = this.get(cx, cz, cy);
      if (c) out.push(c);
    }
    return out;
  }

  /** Per-frame update. dirX/dirZ: player's facing (for priority); py: height. */
  update(px: number, pz: number, dirX = 0, dirZ = 0, py = 0): void {
    const ccx = this.chunkCoord(px);
    const ccz = this.chunkCoord(pz);
    const ccy = this.slabCoord(py);
    this.ccx = ccx;
    this.ccz = ccz;
    this.ccy = ccy;
    const center = ccx + ',' + ccz + ',' + ccy + ',' + this.opts.radius;
    if (center !== this.lastCenter) {
      this.lastCenter = center;
      this.unloadFar();
      this.rebuildQueue(px, pz, dirX, dirZ);
    }
    this.processQueue();
  }

  /** Synchronously load everything within `radius` (used on level entry). */
  loadAllSync(px: number, pz: number, radius = this.opts.radius, py = 0): void {
    const ccx = this.chunkCoord(px);
    const ccz = this.chunkCoord(pz);
    const ccy = this.slabCoord(py);
    this.ccx = ccx;
    this.ccz = ccz;
    this.ccy = ccy;
    const vr = Math.min(1, this.vRadius);
    for (let dy = -vr; dy <= vr; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        for (let dz = -radius; dz <= radius; dz++) this.load(ccx + dx, ccz + dz, ccy + dy);
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

  private load(cx: number, cz: number, cy: number): void {
    const key = chunkKey(cx, cz, cy);
    if (this.chunks.has(key)) return;
    const data = this.opts.generate(cx, cz, cy);
    const handle = this.opts.build(data);
    this.chunks.set(key, { data, handle });
  }

  private wanted(cx: number, cz: number, cy: number, extra: number): boolean {
    const r = this.opts.radius + extra;
    const vr = this.vRadius > 0 ? this.vRadius + extra : 0;
    return Math.abs(cx - this.ccx) <= r && Math.abs(cz - this.ccz) <= r && Math.abs(cy - this.ccy) <= vr;
  }

  private unloadFar(): void {
    for (const [key, c] of this.chunks) {
      if (!this.wanted(c.data.cx, c.data.cz, c.data.cy ?? 0, 1)) {
        this.opts.dispose(c.handle, c.data);
        this.chunks.delete(key);
      }
    }
  }

  private rebuildQueue(px: number, pz: number, dirX: number, dirZ: number): void {
    const r = this.opts.radius;
    const vr = this.vRadius;
    const size = this.opts.chunkSize;
    const items: Array<QueueItem & { score: number }> = [];
    for (let dy = -vr; dy <= vr; dy++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const cx = this.ccx + dx;
          const cz = this.ccz + dz;
          const cy = this.ccy + dy;
          const key = chunkKey(cx, cz, cy);
          if (this.chunks.has(key) || this.inFlight.has(key)) continue;
          const mx = (cx + 0.5) * size - px;
          const mz = (cz + 0.5) * size - pz;
          const dist = Math.hypot(mx, mz);
          const facing = dist > 0 ? (mx * dirX + mz * dirZ) / dist : 1;
          items.push({ cx, cz, cy, key, score: dist - facing * size * 0.75 + Math.abs(dy) * size * 0.6 });
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
        a.request(item.cx, item.cz, item.cy).then(
          (r) => {
            if (gen !== this.generation) return; // level changed meanwhile
            this.inFlight.delete(item.key);
            if (this.chunks.has(item.key) || !this.wanted(item.cx, item.cz, item.cy, 1)) return;
            const { data, handle } = a.build(r);
            this.chunks.set(item.key, { data, handle });
          },
          () => {
            if (gen !== this.generation) return;
            // Worker failed: fall back to generating here.
            this.inFlight.delete(item.key);
            this.load(item.cx, item.cz, item.cy);
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
      this.load(item.cx, item.cz, item.cy);
      done++;
    }
  }
}
