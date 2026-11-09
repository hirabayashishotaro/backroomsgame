/** A small pool of chunk workers. Falls back to null when workers are unavailable. */
import ChunkWorker from './chunkWorker?worker&inline';
import type { ChunkData } from './chunkData';
import type { ChunkArrays } from './chunkGeometry';
import type { ChunkRequest } from './chunkWorker';

export interface ChunkResult {
  data: ChunkData;
  arrays: ChunkArrays;
}

export class ChunkWorkerPool {
  private workers: Worker[] = [];
  private next = 0;
  private seq = 0;
  private pending = new Map<number, { resolve: (r: ChunkResult) => void; reject: (e: unknown) => void }>();

  static create(): ChunkWorkerPool | null {
    if (typeof Worker === 'undefined') return null;
    try {
      const pool = new ChunkWorkerPool();
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
      for (let i = 0; i < n; i++) {
        const w = new ChunkWorker();
        w.onmessage = (e: MessageEvent<{ id: number } & ChunkResult>) => {
          const p = pool.pending.get(e.data.id);
          if (!p) return;
          pool.pending.delete(e.data.id);
          p.resolve({ data: e.data.data, arrays: e.data.arrays });
        };
        w.onerror = (e) => {
          for (const p of pool.pending.values()) p.reject(e);
          pool.pending.clear();
        };
        pool.workers.push(w);
      }
      return pool;
    } catch {
      return null;
    }
  }

  get size(): number {
    return this.workers.length;
  }

  request(req: Omit<ChunkRequest, 'id'>): Promise<ChunkResult> {
    const id = ++this.seq;
    const w = this.workers[this.next++ % this.workers.length];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ ...req, id });
    });
  }
}
