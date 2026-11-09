/**
 * Weapon state machine (pure, unit-tested): magazines, reserves, reloading,
 * fire rate and the magnum's "kick, then the next shot returns" recoil.
 */
import { AMMO_MAX, AMMO_PICKUP, WEAPONS, type AmmoType, type WeaponDef, type WeaponId } from './weaponDefs';

export interface FireResult {
  def: WeaponDef;
  /** Aim correction to apply BEFORE firing (radians, + = down): the reticle returns. */
  returnPitch: number;
  /** Kick to apply AFTER firing (radians, + = up). */
  kick: number;
}

export interface ArsenalData {
  mags: Partial<Record<WeaponId, number>>;
  reserve: Record<AmmoType, number>;
}

export class Arsenal {
  mags: Partial<Record<WeaponId, number>> = {};
  reserve: Record<AmmoType, number> = { pistol: 0, magnum: 0, kunai: 0 };
  /** Seconds until the held weapon may fire again. */
  cooldown = 0;
  /** Reload in progress: weapon and time left. */
  reloading: { id: WeaponId; left: number } | null = null;
  /** Outstanding magnum kick (radians) the next shot will take back. */
  recoilDebt = 0;

  /** Picking up a weapon: a fresh magazine. A duplicate weapon becomes ammo. */
  gainWeapon(id: WeaponId, alreadyOwned: boolean): void {
    const def = WEAPONS[id];
    if (id === 'kunai') {
      this.addAmmo('kunai', AMMO_PICKUP.kunai);
      return;
    }
    if (alreadyOwned) {
      if (def.ammo) this.addAmmo(def.ammo, def.mag);
      return;
    }
    if (def.mag > 0) this.mags[id] = def.mag;
  }

  addAmmo(t: AmmoType, n: number): number {
    const before = this.reserve[t];
    this.reserve[t] = Math.min(AMMO_MAX[t], before + n);
    return this.reserve[t] - before;
  }

  /** Rounds available to fire right now. */
  loaded(id: WeaponId): number {
    const def = WEAPONS[id];
    if (def.kind === 'melee') return Infinity;
    if (def.mag === 0) return this.reserve[def.ammo!];
    return this.mags[id] ?? 0;
  }

  canReload(id: WeaponId): boolean {
    const def = WEAPONS[id];
    return def.mag > 0 && !this.reloading && (this.mags[id] ?? 0) < def.mag && this.reserve[def.ammo!] > 0;
  }

  startReload(id: WeaponId): boolean {
    if (!this.canReload(id)) return false;
    this.reloading = { id, left: WEAPONS[id].reloadTime };
    return true;
  }

  /** Switching weapons cancels a reload. */
  cancelReload(): void {
    this.reloading = null;
  }

  /** Advance timers. Returns true when a reload finished this step. */
  update(dt: number): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading) {
      this.reloading.left -= dt;
      if (this.reloading.left <= 0) {
        const id = this.reloading.id;
        const def = WEAPONS[id];
        const need = def.mag - (this.mags[id] ?? 0);
        const take = Math.min(need, this.reserve[def.ammo!]);
        this.reserve[def.ammo!] -= take;
        this.mags[id] = (this.mags[id] ?? 0) + take;
        this.reloading = null;
        return true;
      }
    }
    return false;
  }

  /**
   * The player pulled the aim down by `rad` (mouse/stick): that pays off part
   * of the outstanding kick, so manual recoil control is respected.
   */
  aimedDown(rad: number): void {
    if (rad > 0) this.recoilDebt = Math.max(0, this.recoilDebt - rad);
  }

  /** Try to fire. Returns null if not possible (cooldown, reloading, empty). */
  fire(id: WeaponId): FireResult | 'empty' | null {
    const def = WEAPONS[id];
    if (this.cooldown > 0 || (this.reloading && def.kind !== 'melee')) return null;
    if (def.kind !== 'melee') {
      if (this.loaded(id) <= 0) return 'empty';
      if (def.mag > 0) this.mags[id] = (this.mags[id] ?? 0) - 1;
      else this.reserve[def.ammo!] -= 1;
    }
    this.cooldown = def.interval;
    // Magnum: first take back the previous kick (the reticle returns), then kick again.
    const returnPitch = def.kick ? this.recoilDebt : 0;
    const kick = def.kick ?? 0;
    this.recoilDebt = kick;
    return { def, returnPitch, kick };
  }

  toJSON(): ArsenalData {
    return { mags: { ...this.mags }, reserve: { ...this.reserve } };
  }

  load(d: ArsenalData | undefined): void {
    this.mags = { ...(d?.mags ?? {}) };
    this.reserve = { pistol: 0, magnum: 0, kunai: 0, ...(d?.reserve ?? {}) };
    this.cooldown = 0;
    this.reloading = null;
    this.recoilDebt = 0;
  }
}

/** Projectile integration step (semi-implicit Euler). */
export function stepProjectile(p: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, g: number, dt: number): void {
  p.vy -= g * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
}
