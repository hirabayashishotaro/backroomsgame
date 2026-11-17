/**
 * Entity director (SPEC §7.1): keeps encounters rare, always warns before an
 * entity appears, and picks a spawn point out of sight and far enough away.
 */
import { hashString, Rng } from '../core/rng';
import { ALL_ENTITIES, type EntityKind } from './entityDefs';

export interface DirectorTuning {
  /** Multiplier on spawn frequency (difficulty). */
  rate: number;
  /** Max simultaneous entities. */
  maxActive: number;
  /** How likely a random entity is picked compared with each other kind (1 = the same). */
  chimeraWeight?: number;
}

/** Random entities in hand-made levels: as likely as each of the level's own kinds (user request). */
export const CHIMERA_HAND_WEIGHT = 1;

/** Pick a kind from the table; random entities count `w` times as much as each other kind. */
export function pickKind(table: EntityKind[], w: number, r: number): EntityKind {
  const total = table.reduce((s, k) => s + (k === 'chimera' ? w : 1), 0);
  let x = r * total;
  for (const k of table) {
    x -= k === 'chimera' ? w : 1;
    if (x < 0) return k;
  }
  return table[table.length - 1];
}

export type DirectorEvent = { type: 'omen'; kind: EntityKind } | { type: 'spawn'; kind: EntityKind } | null;

export class Director {
  /** Seconds until the next encounter may begin. */
  cooldown = 70;
  /** Omen in progress (seconds left) and which entity is coming. */
  omen: { left: number; kind: EntityKind } | null = null;
  private rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed ^ 0x3e7);
  }

  /** New level: a calm period before anything can happen. */
  reset(levelHasEntities: boolean): void {
    this.cooldown = levelHasEntities ? 8 + this.rng.float() * 10 : Infinity;
    this.omen = null;
  }

  /** Called after an encounter ends (attack, death, fade). */
  encounterOver(t: DirectorTuning): void {
    // Frequent encounters (user request): a new one every ~12-32 s.
    this.cooldown = (12 + this.rng.float() * 20) / Math.max(0.2, t.rate);
  }

  /** Advance. `table` = entities allowed in this level; `active` = currently alive. */
  update(dt: number, table: EntityKind[], active: number, tuning: DirectorTuning, safe: boolean): DirectorEvent {
    if (!table.length) return null;
    if (this.omen) {
      this.omen.left -= dt;
      if (this.omen.left <= 0) {
        const kind = this.omen.kind;
        this.omen = null;
        this.encounterOver(tuning);
        return { type: 'spawn', kind };
      }
      return null;
    }
    if (active >= tuning.maxActive || safe) return null;
    this.cooldown -= dt;
    if (this.cooldown > 0) return null;
    const kind = pickKind(table, tuning.chimeraWeight ?? 1, this.rng.float());
    this.omen = { left: 2.5 + this.rng.float() * 2, kind };
    return { type: 'omen', kind };
  }

  /** Called if a spawn could not be placed: try again shortly. */
  retrySoon(): void {
    this.cooldown = 3;
  }
}

/** Which entities appear in a level (SPEC §7.1: Level 0 has none, per the Wiki). */
const FIXED: Record<string, EntityKind[]> = {
  '0': [],
  frontrooms: [],
  arena: [],
  shibuya: [],
  vaporwave: ['faceling', 'witch', 'bloater'],
  memphis: ['skinstealer', 'duller', 'bomber'],
  sento: ['faceling', 'skinstealer', 'smiler'],
  '1000': [],
  '1': ['hound', 'skinstealer', 'duller', 'bloater', 'gunman'],
  '2': ['hound', 'smiler', 'skinstealer', 'bloater', 'witch'],
  '27': ['smiler', 'hound'],
  '139': ['faceling', 'smiler'],
  '14': ['smiler', 'faceling'],
  '186': ['skinstealer', 'faceling', 'smiler'],
  '37': ['duller'],
  '37.2': ['duller'],
  u3: ['duller'],
  '808': [],
  '313': ['smiler'],
  '512': ['skinstealer', 'faceling', 'duller', 'bloater', 'witch'],
  '900': ['giant', 'bloater'],
  '303': ['giant', 'hound', 'witch'],
  '666': ['giant', 'bloater', 'gunman', 'bomber'],
  '77': ['hound', 'smiler', 'bomber'],
  '120': ['smiler', 'hound', 'bomber'],
  void: ['smiler'],
  null: ['faceling'],
  chaos: ALL_ENTITIES,
};

/**
 * Can Daidara (the giant) appear in this level? Hand-made levels say so in
 * their table; elsewhere it needs open sky or a very high ceiling. Random
 * entities use the same rule for their size.
 */
export function isHandTable(levelId: string): boolean {
  return levelId in FIXED;
}

export function giantAllowed(levelId: string, open: boolean): boolean {
  return levelId in FIXED ? FIXED[levelId].includes('giant') : open;
}

export function entityTableFor(levelId: string, opts: { dark: boolean; safe: boolean; open?: boolean }): EntityKind[] {
  const fixed = FIXED;
  // Hand-made levels: their own entities, plus random entities (picked as often as each of their own kinds, see CHIMERA_HAND_WEIGHT).
  // Levels with no entities at all (Level 0, the ending, the test hall, ...) stay empty.
  if (levelId in fixed) return fixed[levelId].length ? [...fixed[levelId], 'chimera'] : [];
  if (opts.safe) return [];
  // Generated and other levels: 1-3 kinds from the id; smilers only where it is dark,
  // giants only under open sky or very high ceilings.
  const rng = new Rng(hashString('entities:' + levelId));
  const pool = ALL_ENTITIES.filter((k) => (k !== 'smiler' || opts.dark) && (k !== 'giant' || opts.open));
  const n = rng.int(1, 3);
  const out: EntityKind[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  // Random entities (not part of any condition) live in most random levels too.
  if (rng.chance(0.7)) out.push('chimera');
  return out;
}
