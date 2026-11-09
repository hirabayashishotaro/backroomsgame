/// <reference lib="webworker" />
/**
 * Web Worker: generates chunk data and builds its geometry arrays (baked
 * lighting included) off the main thread (SPEC §3.1, Phase 10).
 */
import { makeGenContext, resolveLevel } from '../levels/registry';
import type { GenContext } from '../levels/levelDefinition';
import { buildChunkArrays, transferables } from './chunkGeometry';

export interface ChunkRequest {
  id: number;
  levelId: string;
  worldSeed: number;
  epoch: number;
  cx: number;
  cz: number;
  cy: number;
}

const contexts = new Map<string, GenContext>();

self.onmessage = (e: MessageEvent<ChunkRequest>) => {
  const { id, levelId, worldSeed, epoch, cx, cz, cy } = e.data;
  const key = levelId + ':' + worldSeed;
  let ctx = contexts.get(key);
  if (!ctx) {
    ctx = makeGenContext(worldSeed, resolveLevel(levelId));
    contexts.set(key, ctx);
    if (contexts.size > 16) contexts.delete(contexts.keys().next().value!);
  }
  ctx.epoch = epoch;
  const level = ctx.level;
  const data = level.generator(ctx, cx, cz, cy);
  const arrays = buildChunkArrays(data, level.palette, level.ceilingHeight, level.lightSampler(ctx, cx, cz, cy), level.meshDetail);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, data, arrays }, transferables(arrays));
};
