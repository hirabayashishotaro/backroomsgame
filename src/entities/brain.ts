/**
 * Entity behaviour (pure, unit-tested): from what the entity perceives,
 * decide its mode and how fast to move toward (or away from) the player.
 */
import { ENTITIES, type EntityKind } from './entityDefs';

export type Mode = 'idle' | 'stalk' | 'chase' | 'frozen' | 'fade' | 'flee' | 'stagger' | 'fuse' | 'attack';

export interface Perception {
  dist: number;
  /** The player is looking at the entity (in the centre of the view). */
  watched: boolean;
  /** The entity can see the player (no wall between). */
  los: boolean;
  playerRunning: boolean;
  playerCrouching: boolean;
  /** The player is moving away from the entity (speed component away, m/s). */
  playerRetreat: number;
}

export interface BrainState {
  kind: EntityKind;
  mode: Mode;
  /** Generic timer for the current mode (s). */
  t: number;
  /** Accumulated "being watched" time (duller) or "fade" progress (smiler). */
  watch: number;
  /** Hound: seconds since it last heard the player. */
  heard: number;
  hp: number;
  /** 1 = fully visible, 0 = gone. */
  alpha: number;
  /** Ranged attackers: seconds until the next shot/spell, rounds left, strafe side and its timer. */
  cd: number;
  n: number;
  side: number;
  sideT: number;
}

export function newBrain(kind: EntityKind): BrainState {
  return { kind, mode: 'idle', t: 0, watch: 0, heard: 99, hp: ENTITIES[kind].hp, alpha: 0, cd: 1.5, n: GUNMAN.mag, side: 1, sideT: 0 };
}

export interface Decision {
  /** Speed toward the player (negative = away). */
  speed: number;
  /** True when the entity should be removed. */
  gone: boolean;
  /** Bloater: burst now (area damage around it). */
  explode?: boolean;
  /** Giant: stomp now (area damage around it). */
  stomp?: boolean;
  /** Sideways speed (m/s, + = to its right). */
  strafe?: number;
  /** Gunman: fire one shot now. */
  fire?: boolean;
  /** Witch: call down lightning on the player's position now. */
  cast?: boolean;
  /** Bomber: lob a bomb at the player now. */
  toss?: boolean;
}

/** Bomber: throw cooldown, fuse after landing, blast radius, knockback, preferred range. */
export const BOMBER = { cooldown: 3.2, fuse: 1.3, radius: 4.5, knock: 13, near: 9, far: 22, maxRange: 30 };
/** Knockback of the bloater's burst (m/s outward). */
export const BLAST_KNOCK = 15;

/** Gunman: magazine, time between shots in a burst, reload, preferred range. */
export const GUNMAN = { mag: 6, rate: 0.28, reload: 2.6, near: 8, far: 20, maxRange: 38 };
/** Witch: spell cooldown, warning time before the strike, blast radius, preferred range. */
export const WITCH = { cooldown: 4.2, warn: 1.1, radius: 3.5, near: 13, far: 26, maxRange: 42 };

/** Keep a preferred distance and strafe side to side, switching direction now and then. */
function keepRange(b: BrainState, p: Perception, dt: number, near: number, far: number, walk: number, run: number): Decision {
  b.sideT -= dt;
  if (b.sideT <= 0) {
    b.side = -b.side;
    b.sideT = 1.2 + ((b.t * 7.31) % 1.3);
  }
  if (!p.los || p.dist > far + 2) {
    if (b.mode !== 'chase') set(b, 'chase');
    return { speed: run, gone: false };
  }
  if (b.mode !== 'attack') set(b, 'attack');
  if (p.dist < near) return { speed: -walk, gone: false, strafe: b.side * walk };
  return { speed: 0, gone: false, strafe: b.side * walk * 1.2 };
}

/** Bloater: distance that starts the fuse, fuse time, distance that cancels it, blast radius. */
export const BLOATER = { trigger: 2.8, fuse: 1.5, cancel: 6.5, radius: 5.5 };
/** Giant: stomp reach, wind-up and cooldown (s). */
export const GIANT = { reach: 3.8, windup: 0.9, cooldown: 2.4 };

/** Advance the brain by dt. */
export function think(b: BrainState, p: Perception, dt: number): Decision {
  const def = ENTITIES[b.kind];
  b.t += dt;
  // Fade in when it appears, fade out when leaving.
  if (b.mode === 'fade' || b.mode === 'flee') b.alpha = Math.max(0, b.alpha - dt * (b.mode === 'flee' ? 0.6 : 0.35));
  else b.alpha = Math.min(1, b.alpha + dt * 0.8);
  if ((b.mode === 'fade' || b.mode === 'flee') && b.alpha <= 0) return { speed: 0, gone: true };
  if (b.mode === 'stagger') {
    if (b.t > 0.6) set(b, 'chase');
    return { speed: -1.5, gone: false };
  }
  if (b.mode === 'flee') return { speed: -def.run, gone: false };
  if (b.mode === 'fade') return { speed: 0, gone: false };
  if (b.t > def.life && b.mode !== 'chase') {
    set(b, 'fade');
    return { speed: 0, gone: false };
  }

  switch (b.kind) {
    case 'smiler': {
      // Hold its gaze and back away: it fades. Turn and run: it gives chase.
      if (b.mode !== 'chase') {
        if (p.watched && p.playerRetreat > 0.5) b.watch += dt;
        if (b.watch > 3.5) {
          set(b, 'fade');
          return { speed: 0, gone: false };
        }
        if (!p.watched && p.playerRunning && p.dist < 35) set(b, 'chase');
        return { speed: p.watched ? 0 : def.walk, gone: false };
      }
      if (p.watched && !p.playerRunning && p.playerRetreat > 0.5) b.watch += dt * 0.5;
      if (b.watch > 4) set(b, 'fade');
      return { speed: def.run, gone: false };
    }
    case 'hound': {
      // Hears running; crouch-walking makes it lose the trail.
      const hearing = p.playerRunning ? 40 : p.playerCrouching ? 4 : 14;
      if (p.dist < hearing) b.heard = 0;
      else b.heard += dt;
      if (b.mode === 'chase' && b.heard > 6) set(b, 'stalk');
      if (b.mode !== 'chase' && b.heard < 0.5 && (p.playerRunning || p.dist < 10)) set(b, 'chase');
      if (b.mode === 'chase') return { speed: def.run, gone: false };
      return { speed: b.heard < 3 ? def.walk : 0.8, gone: false };
    }
    case 'duller': {
      // Moves only while you stare at it.
      if (p.watched && p.dist < 30) {
        b.watch += dt;
        return { speed: b.watch > 1.5 ? def.walk : 0, gone: false };
      }
      b.watch = Math.max(0, b.watch - dt * 0.5);
      return { speed: 0, gone: false };
    }
    case 'faceling': {
      // Freezes while watched, closes in when you look away.
      if (p.watched) {
        b.mode = 'frozen';
        return { speed: 0, gone: false };
      }
      if (b.mode === 'frozen') set(b, 'stalk');
      return { speed: p.dist < 12 ? def.run : def.walk, gone: false };
    }
    case 'skinstealer': {
      // Walks up asking for help; lunges when close.
      if (b.mode !== 'chase' && p.dist < 4.5) set(b, 'chase');
      if (b.mode === 'chase') return { speed: def.run, gone: false };
      return { speed: p.dist > 3 ? def.walk : 0, gone: false };
    }
    case 'bloater': {
      // Creeps up silently; next to you it swells and bursts. Back off to stop the fuse.
      if (b.mode === 'fuse') {
        if (p.dist > BLOATER.cancel) {
          set(b, 'stalk');
          return { speed: def.walk, gone: false };
        }
        if (b.t >= BLOATER.fuse) return { speed: 0, gone: true, explode: true };
        return { speed: 0, gone: false };
      }
      if (p.dist < BLOATER.trigger) {
        set(b, 'fuse');
        return { speed: 0, gone: false };
      }
      if (b.mode !== 'stalk') set(b, 'stalk');
      return { speed: p.dist < 15 ? def.run : def.walk, gone: false };
    }
    case 'gunman': {
      // Keeps its distance, strafes, and empties its revolver in bursts.
      const d = keepRange(b, p, dt, GUNMAN.near, GUNMAN.far, def.walk, def.run);
      b.cd -= dt;
      if (p.los && p.dist < GUNMAN.maxRange && b.cd <= 0 && b.alpha > 0.6) {
        b.n--;
        b.cd = GUNMAN.rate;
        if (b.n <= 0) {
          b.n = GUNMAN.mag;
          b.cd = GUNMAN.reload;
        }
        d.fire = true;
      }
      return d;
    }
    case 'witch': {
      // Hangs back and calls lightning down where you stand.
      const d = keepRange(b, p, dt, WITCH.near, WITCH.far, def.walk, def.run);
      b.cd -= dt;
      if (p.los && p.dist < WITCH.maxRange && b.cd <= 0 && b.alpha > 0.6) {
        b.cd = WITCH.cooldown;
        d.cast = true;
      }
      return d;
    }
    case 'bomber': {
      // Hangs back and lobs bombs that blow you off your feet.
      const d = keepRange(b, p, dt, BOMBER.near, BOMBER.far, def.walk, def.run);
      b.cd -= dt;
      if (p.los && p.dist < BOMBER.maxRange && b.cd <= 0 && b.alpha > 0.6) {
        b.cd = BOMBER.cooldown;
        d.toss = true;
      }
      return d;
    }
    case 'bug': {
      // Harmless: drifts around at a distance, sidestepping; never attacks, never leaves.
      return keepRange(b, p, dt, 6, 16, def.walk, def.run);
    }
    case 'giant': {
      // Slow, relentless; stomps when you are at its feet.
      if (b.mode === 'attack') {
        if (b.t >= GIANT.windup) {
          set(b, 'chase');
          b.watch = GIANT.cooldown;
          return { speed: 0, gone: false, stomp: true };
        }
        return { speed: 0, gone: false };
      }
      b.watch = Math.max(0, b.watch - dt);
      if (p.dist < GIANT.reach && b.watch <= 0) {
        set(b, 'attack');
        return { speed: 0, gone: false };
      }
      if (b.mode !== 'chase') set(b, 'chase');
      return { speed: p.dist < 2 ? 0 : p.dist < 30 ? def.run : def.walk, gone: false };
    }
  }
}

function set(b: BrainState, m: Mode): void {
  b.mode = m;
  b.t = m === 'chase' || m === 'stalk' ? b.t : 0;
}

/** Apply damage. Returns true if it died. Hits make hounds and smilers stagger. */
export function hurt(b: BrainState, dmg: number): boolean {
  b.hp -= dmg;
  if (b.hp <= 0) {
    b.mode = 'flee';
    return true;
  }
  // Only heavy hits (magnum, kunai, axe) make them stagger, so pistol fire cannot stun-lock.
  if ((b.kind === 'hound' || b.kind === 'skinstealer') && dmg >= 50) {
    b.mode = 'stagger';
    b.t = 0;
  } else if (b.kind !== 'bloater' && b.kind !== 'giant' && b.kind !== 'gunman' && b.kind !== 'witch' && b.kind !== 'bomber' && b.kind !== 'bug' && b.mode !== 'stagger') {
    // Shooting it wakes it up.
    if (b.mode !== 'chase') {
      b.mode = 'chase';
      b.t = 0;
    }
  }
  return false;
}
