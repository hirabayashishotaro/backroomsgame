/**
 * Entity behaviour (pure, unit-tested): from what the entity perceives,
 * decide its mode and how fast to move toward (or away from) the player.
 */
import { ENTITIES, type EntityKind } from './entityDefs';

export type Mode = 'idle' | 'stalk' | 'chase' | 'frozen' | 'fade' | 'flee' | 'stagger';

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
}

export function newBrain(kind: EntityKind): BrainState {
  return { kind, mode: 'idle', t: 0, watch: 0, heard: 99, hp: ENTITIES[kind].hp, alpha: 0 };
}

export interface Decision {
  /** Speed toward the player (negative = away). */
  speed: number;
  /** True when the entity should be removed. */
  gone: boolean;
}

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
  if (b.kind === 'hound' || b.kind === 'skinstealer') {
    b.mode = 'stagger';
    b.t = 0;
  } else if (b.kind === 'smiler' || b.kind === 'duller' || b.kind === 'faceling') {
    // Shooting it wakes it up.
    if (b.mode !== 'chase') {
      b.mode = 'chase';
      b.t = 0;
    }
  }
  return false;
}
