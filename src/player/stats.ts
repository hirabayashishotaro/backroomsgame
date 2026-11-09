/** Player stats (SPEC §17): health and dash stamina only. Pure logic, unit-tested. */

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY: Record<Difficulty, { drain: number; entity: number }> = {
  easy: { drain: 0.6, entity: 0.6 },
  normal: { drain: 1.0, entity: 1.0 },
  hard: { drain: 1.6, entity: 1.4 },
};

export interface StatEnv {
  running: boolean;
  /** Per-level multiplier on how fast health drains (e.g. hostile levels). */
  drainMul: number;
  difficulty: Difficulty;
}

export type DeathCause = 'exhaustion' | 'entity' | 'fall';

/** Health drained per second on Normal: 100 -> 0 in about 9 minutes. */
export const BASE_DRAIN = 0.185;

export class Stats {
  health = 100;
  stamina = 100;
  private sinceRun = 10;

  get canRun(): boolean {
    return this.stamina > 3;
  }

  /** Advance stats. Returns a death cause if the player died this step. */
  update(dt: number, env: StatEnv): DeathCause | null {
    this.health -= dt * BASE_DRAIN * DIFFICULTY[env.difficulty].drain * env.drainMul;
    if (env.running) {
      this.stamina -= dt * 20;
      this.sinceRun = 0;
    } else {
      this.sinceRun += dt;
      if (this.sinceRun > 0.8) this.stamina += dt * 25;
    }
    this.clamp();
    return this.health <= 0 ? 'exhaustion' : null;
  }

  heal(n: number): void {
    this.health += n;
    this.clamp();
  }

  damage(n: number): void {
    this.health -= n;
    this.clamp();
  }

  clamp(): void {
    this.health = Math.min(100, Math.max(0, this.health));
    this.stamina = Math.min(100, Math.max(0, this.stamina));
  }

  respawn(): void {
    this.health = 70;
    this.stamina = 100;
  }

  toJSON() {
    return { health: this.health, stamina: this.stamina };
  }

  load(d: Partial<ReturnType<Stats['toJSON']>>): void {
    Object.assign(this, d);
    this.clamp();
  }
}
