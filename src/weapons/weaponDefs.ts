/**
 * Weapons (user design). Pure data.
 * - Pistol: hitscan (instant), damage falls off with distance, 12-round
 *   magazine, no recoil.
 * - Magnum: projectile with travel time, no damage falloff, 6 rounds; each
 *   shot kicks the aim up, and the next shot fires from where you were aiming
 *   before the kick (the reticle returns).
 * - Kunai: thrown, arcs under gravity, picked up in bundles of 10, can be
 *   collected again after throwing.
 * - Axe: melee.
 * - Rocket launcher (rare): slow rocket that explodes; the blast throws
 *   everything back - including you (rocket jumps), without hurting you.
 */
export type WeaponId = 'pistol' | 'magnum' | 'kunai' | 'axe' | 'rocket';
export type AmmoType = 'pistol' | 'magnum' | 'kunai' | 'rocket';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: 'hitscan' | 'projectile' | 'thrown' | 'melee';
  /** Rounds per magazine (0 = no magazine: kunai uses the reserve directly, axe none). */
  mag: number;
  ammo?: AmmoType;
  /** Seconds between shots / throws / swings. */
  interval: number;
  reloadTime: number;
  damage: number;
  /** Hitscan falloff: full damage up to `near`, linear down to `minFactor` at `far`. */
  falloff?: { near: number; far: number; minFactor: number };
  /** Projectile speed (m/s) and gravity (m/s^2). */
  speed?: number;
  gravity?: number;
  /** Upward aim kick per shot (radians). */
  kick?: number;
  /** Spread (radians, half-angle) when firing from the hip / aiming down sights. */
  hipSpread: number;
  adsSpread: number;
  /** FOV multiplier while aiming. */
  adsZoom: number;
  headMultiplier: number;
  /** Melee reach (m). */
  reach?: number;
  /** Max range for hitscan / projectile life (m). */
  range: number;
  /** Keeps firing while the button is held. */
  auto?: boolean;
  /** Spare rounds that come with the weapon when picked up. */
  bundle?: number;
  /** Explodes on impact: blast radius (m), knockback on entities and on the player (m/s). */
  explosive?: { radius: number; knock: number; selfKnock: number };
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'ピストル',
    kind: 'hitscan',
    mag: 12,
    ammo: 'pistol',
    interval: 0.14,
    reloadTime: 1.4,
    damage: 30,
    falloff: { near: 12, far: 60, minFactor: 0.4 },
    hipSpread: 0.012,
    adsSpread: 0,
    adsZoom: 0.72,
    headMultiplier: 2,
    range: 250,
  },
  magnum: {
    id: 'magnum',
    name: 'マグナム',
    kind: 'projectile',
    mag: 6,
    ammo: 'magnum',
    interval: 0.55,
    reloadTime: 2.3,
    damage: 95,
    speed: 180,
    gravity: 0,
    kick: 0.06,
    hipSpread: 0.02,
    adsSpread: 0,
    adsZoom: 0.6,
    headMultiplier: 2,
    range: 400,
  },
  kunai: {
    id: 'kunai',
    name: 'クナイ',
    kind: 'thrown',
    mag: 0,
    ammo: 'kunai',
    interval: 0.5, // 2 per second
    auto: true,
    reloadTime: 0,
    damage: 55,
    speed: 45,
    // Flies straight (user request); past its range it drops so it can be collected.
    gravity: 0,
    hipSpread: 0.006,
    adsSpread: 0,
    adsZoom: 0.85,
    headMultiplier: 2.5,
    range: 70,
  },
  rocket: {
    id: 'rocket',
    name: 'ロケットランチャー',
    kind: 'projectile',
    mag: 1,
    ammo: 'rocket',
    bundle: 4, // 5 rockets in all
    interval: 0.9,
    reloadTime: 1.4,
    damage: 150,
    speed: 36, // 0.8x the kunai
    gravity: 0,
    hipSpread: 0.008,
    adsSpread: 0,
    adsZoom: 0.8,
    headMultiplier: 1,
    range: 200,
    explosive: { radius: 4.5, knock: 18, selfKnock: 18 },
  },
  axe: {
    id: 'axe',
    name: '斧',
    kind: 'melee',
    mag: 0,
    interval: 0.7,
    reloadTime: 0,
    damage: 55,
    reach: 2.1,
    hipSpread: 0,
    adsSpread: 0,
    adsZoom: 1,
    headMultiplier: 1.5,
    range: 2.1,
  },
};

/** Ammo found lying around / in a pickup. */
export const AMMO_PICKUP: Record<AmmoType, number> = { pistol: 12, magnum: 6, kunai: 10, rocket: 5 };
/** Reserve limit (user request: 999 for everything). */
export const AMMO_MAX: Record<AmmoType, number> = { pistol: 999, magnum: 999, kunai: 999, rocket: 999 };

/** Damage multiplier at distance d for a hitscan weapon. */
export function falloffFactor(def: WeaponDef, d: number): number {
  const f = def.falloff;
  if (!f) return 1;
  if (d <= f.near) return 1;
  if (d >= f.far) return f.minFactor;
  return 1 - ((d - f.near) / (f.far - f.near)) * (1 - f.minFactor);
}
