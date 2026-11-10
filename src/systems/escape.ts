/**
 * Escape mode (the run with an ending; user design, replaces the fixed route):
 *  1. Collect: see 50 levels, see the Void, and defeat 30 entities including
 *     at least one of every kind.
 *  2. Bug: a glitched, harmless figure ("バグ") starts appearing. Defeat one.
 *  3. Return: whatever way you leave the level, you come back to Level 0.
 *  4. Home: Level 0's doors are glitched and the sounds of the real world leak
 *     in. Open a door...
 *  5. Ending: a crowded side street in the city, then the credits.
 * Pure logic (no three.js), unit-tested.
 */
import { ALL_ENTITIES, type EntityKind } from '../entities/entityDefs';

export type EscapeStage = 'collect' | 'bug' | 'return' | 'home' | 'ending';

export const ESCAPE_GOALS = { levels: 50, kills: 30, voidId: 'void' };
/** The ending level. */
export const ENDING_LEVEL = 'shibuya';
/** Levels that do not count as "seen" (test hall, the ending, the old break room). */
const NOT_COUNTED = new Set(['arena', ENDING_LEVEL, 'frontrooms']);

export interface EscapeData {
  stage: EscapeStage;
  kills: Partial<Record<EntityKind, number>>;
}

export interface EscapeStatus {
  levels: number;
  voidSeen: boolean;
  kills: number;
  kinds: number;
  kindsTotal: number;
  done: boolean;
}

export class EscapeProgress {
  data: EscapeData = { stage: 'collect', kills: {} };

  get stage(): EscapeStage {
    return this.data.stage;
  }

  reset(stage: EscapeStage = 'collect'): void {
    this.data = { stage, kills: {} };
  }

  load(d: EscapeData | undefined): void {
    this.data = d ? { stage: d.stage, kills: { ...d.kills } } : { stage: 'collect', kills: {} };
  }

  toJSON(): EscapeData {
    return { stage: this.data.stage, kills: { ...this.data.kills } };
  }

  /** Progress toward the conditions, given the ids of every level seen this run. */
  status(levelIds: Iterable<string>): EscapeStatus {
    let levels = 0;
    let voidSeen = false;
    for (const id of levelIds) {
      if (NOT_COUNTED.has(id)) continue;
      levels++;
      if (id === ESCAPE_GOALS.voidId) voidSeen = true;
    }
    const kills = ALL_ENTITIES.reduce((s, k) => s + (this.data.kills[k] ?? 0), 0);
    const kinds = ALL_ENTITIES.filter((k) => (this.data.kills[k] ?? 0) > 0).length;
    const done = levels >= ESCAPE_GOALS.levels && voidSeen && kills >= ESCAPE_GOALS.kills && kinds === ALL_ENTITIES.length;
    return { levels, voidSeen, kills, kinds, kindsTotal: ALL_ENTITIES.length, done };
  }

  /** An entity died. Returns the new stage if this changed it. */
  recordKill(kind: EntityKind): EscapeStage | null {
    if (kind === 'bug') {
      if (this.data.stage !== 'bug') return null;
      this.data.stage = 'return';
      return 'return';
    }
    this.data.kills[kind] = (this.data.kills[kind] ?? 0) + 1;
    return null;
  }

  /** Check the conditions (after a kill or arriving somewhere). Returns 'bug' when they were just met. */
  check(levelIds: Iterable<string>): EscapeStage | null {
    if (this.data.stage !== 'collect' || !this.status(levelIds).done) return null;
    this.data.stage = 'bug';
    return 'bug';
  }

  /** Where a transition really goes, or null to keep its own target. */
  overrideTarget(from: string, exitKind: string): string | null {
    const s = this.data.stage;
    if (s === 'return') return '0';
    if (s === 'home') return from === '0' && exitKind === 'door' ? ENDING_LEVEL : '0';
    return null;
  }

  /** Arrived in a level. Returns the new stage if this changed it. */
  arrive(levelId: string): EscapeStage | null {
    if (this.data.stage === 'return' && levelId === '0') {
      this.data.stage = 'home';
      return 'home';
    }
    if (this.data.stage === 'home' && levelId === ENDING_LEVEL) {
      this.data.stage = 'ending';
      return 'ending';
    }
    return null;
  }

  /** Level 0 shows glitched doors and the sounds of the city (stage return/home). */
  realityLeaking(levelId: string): boolean {
    return levelId === '0' && (this.data.stage === 'return' || this.data.stage === 'home');
  }
}
