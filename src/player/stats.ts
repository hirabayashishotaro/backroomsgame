/** Player survival stats (SPEC §6.1). Pure logic, unit-tested. */

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY: Record<Difficulty, { drain: number; entity: number; deathDelay: number }> = {
  easy: { drain: 0.6, entity: 0.6, deathDelay: 120 },
  normal: { drain: 1.0, entity: 1.0, deathDelay: 60 },
  hard: { drain: 1.5, entity: 1.4, deathDelay: 30 },
};

export interface StatEnv {
  running: boolean;
  moving: boolean;
  /** Perceived light level 0..~1.2 at the player (with flashlight). */
  light: number;
  flashlightOn: boolean;
  /** Per-level modifiers. */
  hydrationMul: number;
  sanityDrain: number; // baseline monotony drain per second
  staminaRegenMul: number;
  difficulty: Difficulty;
}

export type DeathCause = 'dehydration' | 'starvation' | 'poison' | 'entity' | 'fall';

export class Stats {
  hydration = 100;
  hunger = 100; // 100 = full
  stamina = 100;
  sanity = 100;
  battery = 100;
  /** Seconds left of nausea (expired water). */
  nausea = 0;
  private sinceRun = 10;
  private zeroHydration = 0;
  private zeroHunger = 0;

  get staminaMax(): number {
    // Hunger at 0 lowers the stamina cap.
    return this.hunger <= 0 ? 40 : this.hunger < 25 ? 70 : 100;
  }

  get canRun(): boolean {
    return this.stamina > 5;
  }

  /** Advance stats. Returns a death cause if the player died this step. */
  update(dt: number, env: StatEnv): DeathCause | null {
    const d = DIFFICULTY[env.difficulty];
    const k = d.drain;
    const nauseaMul = this.nausea > 0 ? 2 : 1;
    this.hydration -= dt * 0.08 * k * env.hydrationMul * (env.running ? 2.2 : 1) * nauseaMul;
    this.hunger -= dt * 0.045 * k * (env.running ? 1.5 : 1);
    if (this.nausea > 0) this.nausea = Math.max(0, this.nausea - dt);

    if (env.running && env.moving) {
      this.stamina -= dt * 14;
      this.sinceRun = 0;
    } else {
      this.sinceRun += dt;
      // Dehydration stops stamina regeneration.
      if (this.sinceRun > 1 && this.hydration > 0) this.stamina += dt * 16 * env.staminaRegenMul;
    }

    // Sanity: darkness and monotony.
    let sanityDelta = -env.sanityDrain * k;
    if (env.light < 0.22) sanityDelta -= 0.35 * k * (1 - env.light / 0.22);
    else if (env.light > 0.6) sanityDelta += 0.01;
    this.sanity += sanityDelta * dt;

    if (env.flashlightOn) this.battery -= dt * 0.35;

    this.clamp();

    this.zeroHydration = this.hydration <= 0 ? this.zeroHydration + dt : 0;
    this.zeroHunger = this.hunger <= 0 ? this.zeroHunger + dt : 0;
    if (this.zeroHydration > d.deathDelay) return 'dehydration';
    if (this.zeroHunger > d.deathDelay * 1.5) return 'starvation';
    return null;
  }

  clamp(): void {
    const c = (v: number, max = 100) => Math.min(max, Math.max(0, v));
    this.hydration = c(this.hydration);
    this.hunger = c(this.hunger);
    this.stamina = c(this.stamina, this.staminaMax);
    this.sanity = c(this.sanity);
    this.battery = c(this.battery);
  }

  /** Reset after death/respawn. */
  respawn(): void {
    this.hydration = 60;
    this.hunger = 60;
    this.stamina = 100;
    this.sanity = Math.max(40, this.sanity);
    this.nausea = 0;
    this.zeroHydration = 0;
    this.zeroHunger = 0;
    this.clamp();
  }

  toJSON() {
    const { hydration, hunger, stamina, sanity, battery, nausea } = this;
    return { hydration, hunger, stamina, sanity, battery, nausea };
  }

  load(d: Partial<ReturnType<Stats['toJSON']>>): void {
    Object.assign(this, d);
    this.clamp();
  }
}
