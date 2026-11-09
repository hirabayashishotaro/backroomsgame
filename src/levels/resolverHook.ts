/** Late-bound level lookup, so generators (chaos) can borrow other levels without import cycles. */
import type { GenContext, LevelDefinition } from './levelDefinition';

let resolve: ((id: string) => LevelDefinition) | null = null;
let makeCtx: ((seed: number, level: LevelDefinition) => GenContext) | null = null;

export function setLevelResolver(r: (id: string) => LevelDefinition, m: (seed: number, level: LevelDefinition) => GenContext): void {
  resolve = r;
  makeCtx = m;
}

export function lookupLevel(id: string): LevelDefinition {
  if (!resolve) throw new Error('level resolver not set');
  return resolve(id);
}

export function contextFor(seed: number, level: LevelDefinition): GenContext {
  if (!makeCtx) throw new Error('level resolver not set');
  return makeCtx(seed, level);
}
