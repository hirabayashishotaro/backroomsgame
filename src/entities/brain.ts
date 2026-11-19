/**
 * Entity behaviour (pure, unit-tested): from what the entity perceives,
 * decide its mode and how fast to move toward (or away from) the player.
 */
import { ENTITIES, type EntityKind } from './entityDefs';
import type { ChimeraGenome } from './chimera';

export type Mode = 'idle' | 'stalk' | 'chase' | 'frozen' | 'fade' | 'flee' | 'stagger' | 'fuse' | 'attack' | 'dash';

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
  /** Stunned (seconds left): cannot move or act. */
  stunT: number;
  /** A second cooldown (giant: rock throw, witch: wind burst). */
  cd2: number;
  /** Random entities: the genome that decides its body and behaviour. */
  g?: ChimeraGenome;
}

export function newBrain(kind: EntityKind, g?: ChimeraGenome): BrainState {
  return { kind, mode: 'idle', t: 0, watch: 0, heard: 99, hp: g ? g.hp : ENTITIES[kind].hp, alpha: 0, cd: 1.5, n: g ? g.burst : GUNMAN.mag, side: 1, sideT: 0, stunT: 0, cd2: 2.5, g };
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
  /** Peeker: aiming progress 0..1 (the red laser), or undefined when not aiming. */
  aim?: number;
  /** Peeker: fire the sniper round now (along the locked aim). */
  snipe?: boolean;
  /** Namahage: the blade comes down now (an arc in front of it). */
  slash?: boolean;
  /** Namahage: the dash cut starts now (it shoots along its locked line). */
  dash?: boolean;
  /** Fanman: blow a slow ball of wind at the player now. */
  blow?: boolean;
  /** Giant: hurl a boulder at where the player stands now. */
  hurl?: boolean;
  /** Witch: a burst of wind in eight directions around it now. */
  gust?: boolean;
}

/** Giant's boulder: cooldown, range, flight speed (m/s along the ground), impact radius, damage, knockback. */
export const BOULDER = { cooldown: 5.5, min: 9, max: 45, speed: 15, radius: 3.4, damage: 35, knock: 11 };
/** Witch's wind burst: triggers when you are this close; cooldown; the eight gusts' speed, range and knockback. */
export const GUST = { trigger: 6, cooldown: 4.5, speed: 10, range: 11, knock: 15, lift: 4, damage: 8 };

/**
 * Namahage's dash cut (user request): from 6-24 m away it holds the blade
 * level, then shoots up to `range` m along a straight line in `dur` s and
 * cuts whatever is within `width` of it. Its own cooldown.
 */
export const NAMAHAGE_DASH = { min: 6, max: 24, windup: 0.75, dur: 0.28, range: 26, width: 1.3, damage: 45, cooldown: 5, recover: 1.1 };

/** Namahage: reach, wind-up (blade raised), recovery after the swing, the arc it covers (rad from forward). */
export const NAMAHAGE = { reach: 3.6, windup: 0.55, recover: 1.1, len: 4.4, halfW: 1.6, height: 2.6 };

/**
 * Is a point inside the namahage's cut: a box reaching `len` ahead of it,
 * `halfW` to either side (plus the target's body radius `r`), `height` tall?
 * `yaw` uses the entities' convention (forward = (-sin yaw, -cos yaw)).
 */
export function inSlash(ex: number, ey: number, ez: number, yaw: number, px: number, py: number, pz: number, r = 0.3, k = 1): boolean {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const dx = px - ex;
  const dz = pz - ez;
  const ahead = dx * fx + dz * fz;
  const side = dx * -fz + dz * fx;
  return ahead > -0.4 - r && ahead < NAMAHAGE.len * k + r && Math.abs(side) < NAMAHAGE.halfW * k + r && py > ey - 1.2 && py < ey + NAMAHAGE.height * k;
}
/** Fanman: shot cooldown, ball speed (slow), knockback (m/s sideways + up), preferred range. */
export const FANMAN = { cooldown: 2.6, speed: 7, knock: 17, lift: 4.5, near: 8, far: 20, maxRange: 32 };

/** Bomber: throw cooldown, fuse after landing, blast radius, knockback, preferred range. */
export const BOMBER = { cooldown: 3.2, fuse: 1.3, radius: 4.5, knock: 13, near: 9, far: 22, maxRange: 30 };
/** Knockback of the bloater's burst (m/s outward). */
export const BLAST_KNOCK = 15;

/** Gunman: magazine, time between shots in a burst, reload, preferred range. */
export const GUNMAN = { mag: 6, rate: 0.28, reload: 2.6, near: 8, far: 20, maxRange: 38 };
/**
 * Peeker: aim time (the laser follows you), the moment it locks before the
 * shot (aim fraction), cooldown between shots, preferred range.
 */
export const PEEKER = { aim: 1.7, lock: 0.8, cooldown: 4.2, near: 16, far: 38, maxRange: 75 };
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
  if (b.stunT > 0 && b.hp > 0) {
    // Stunned (the staff's lightning): frozen in place, timers paused.
    b.stunT -= dt;
    b.t -= dt;
    return { speed: 0, gone: false };
  }
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

  if (b.kind === 'chimera' && b.g) return thinkChimera(b, b.g, p, dt);
  switch (b.kind) {
    case 'chimera':
      return { speed: def.walk, gone: false };
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
      b.cd2 -= dt;
      // Too close: blow everything away with a burst of wind in eight directions.
      if (p.dist < GUST.trigger && b.cd2 <= 0 && b.alpha > 0.6) {
        b.cd2 = GUST.cooldown;
        d.gust = true;
        return d;
      }
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
    case 'peeker': {
      // Keeps far away; stops, aims the red laser for a while, locks, fires.
      b.cd -= dt;
      if (b.watch > 0) {
        // Aiming: stand still. Losing sight of you breaks the aim.
        if (!p.los || p.dist > PEEKER.maxRange) {
          b.watch = 0;
          b.cd = 1.2;
          return keepRange(b, p, dt, PEEKER.near, PEEKER.far, def.walk, def.run);
        }
        b.watch += dt;
        if (b.watch >= PEEKER.aim) {
          b.watch = 0;
          b.cd = PEEKER.cooldown;
          return { speed: 0, gone: false, snipe: true, aim: 1 };
        }
        return { speed: 0, gone: false, aim: b.watch / PEEKER.aim };
      }
      const d = keepRange(b, p, dt, PEEKER.near, PEEKER.far, def.walk, def.run);
      if (p.los && p.dist < PEEKER.maxRange && b.cd <= 0 && b.alpha > 0.6) {
        b.watch = 0.0001;
        return { speed: 0, gone: false, aim: 0 };
      }
      return d;
    }
    case 'spider': {
      // Always rushing in, very fast (the approach weaves); fragile.
      if (b.mode !== 'chase') set(b, 'chase');
      return { speed: p.dist < 25 ? def.run : def.walk, gone: false };
    }
    case 'namahage': {
      // Dash cut: blade held level for the wind-up, then the dash (the entity system moves it), then a pause.
      if (b.mode === 'dash') {
        const D = NAMAHAGE_DASH;
        if (b.t < D.windup) return { speed: 0, gone: false };
        if (b.n === 1) {
          b.n = 0;
          return { speed: 0, gone: false, dash: true };
        }
        if (b.t < D.windup + D.dur) return { speed: 0, gone: false };
        set(b, 'chase');
        b.watch = D.recover;
        b.cd2 = D.cooldown;
        return { speed: 0, gone: false };
      }
      // Stamps toward you; in reach it raises the blade, then brings it down.
      if (b.mode === 'attack') {
        if (b.t >= NAMAHAGE.windup) {
          set(b, 'chase');
          b.watch = NAMAHAGE.recover;
          return { speed: 0, gone: false, slash: true };
        }
        return { speed: 0.6, gone: false };
      }
      b.watch = Math.max(0, b.watch - dt);
      if (b.watch > 0) return { speed: 0.8, gone: false };
      if (p.dist < NAMAHAGE.reach) {
        set(b, 'attack');
        return { speed: 0, gone: false };
      }
      // Far off but in sight: the dash cut.
      b.cd2 -= dt;
      if (p.los && p.dist > NAMAHAGE_DASH.min && p.dist < NAMAHAGE_DASH.max && b.cd2 <= 0 && b.alpha > 0.6) {
        set(b, 'dash');
        b.t = 0;
        b.n = 1;
        return { speed: 0, gone: false };
      }
      if (b.mode !== 'chase') set(b, 'chase');
      return { speed: p.dist < 25 ? def.run : def.walk, gone: false };
    }
    case 'fanman': {
      // Keeps its distance and blows slow balls of wind.
      const d = keepRange(b, p, dt, FANMAN.near, FANMAN.far, def.walk, def.run);
      b.cd -= dt;
      if (p.los && p.dist < FANMAN.maxRange && b.cd <= 0 && b.alpha > 0.6) {
        b.cd = FANMAN.cooldown;
        d.blow = true;
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
      // Out of reach: now and then it tears up a boulder and hurls it (still walking in to stomp).
      b.cd2 -= dt;
      if (p.los && p.dist > BOULDER.min && p.dist < BOULDER.max && b.cd2 <= 0 && b.alpha > 0.6) {
        b.cd2 = BOULDER.cooldown;
        if (b.mode !== 'chase') set(b, 'chase');
        return { speed: 0, gone: false, hurl: true };
      }
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
  } else if (b.kind === 'chimera') {
    // Random entities: shooting it wakes it up, unless it is mid-technique or keeps its distance.
    if (b.g?.move !== 'range' && b.mode !== 'attack' && b.mode !== 'fuse' && b.mode !== 'chase') {
      b.mode = 'chase';
      b.t = 0;
    }
  } else if (b.kind !== 'bloater' && b.kind !== 'giant' && b.kind !== 'gunman' && b.kind !== 'witch' && b.kind !== 'bomber' && b.kind !== 'peeker' && b.kind !== 'fanman' && b.kind !== 'namahage' && b.kind !== 'bug' && b.mode !== 'stagger') {
    // Shooting it wakes it up.
    if (b.mode !== 'chase') {
      b.mode = 'chase';
      b.t = 0;
    }
  }
  return false;
}

/** Reach of a random entity's melee techniques (m), from its size. */
export function chimeraReach(g: ChimeraGenome): number {
  return g.attack === 'slash' ? 2.2 + g.scale * 1.2 : g.attack === 'stomp' ? 1.6 + g.scale * 1.4 : g.attack === 'burst' ? 1.8 + g.scale : 1.15 * Math.max(1, g.scale * 0.8);
}

/** Random entities: movement from the genome's move, then its technique. */
function thinkChimera(b: BrainState, g: ChimeraGenome, p: Perception, dt: number): Decision {
  // A close-range wind burst (cd2), for ranged ones that hate being crowded.
  b.cd2 -= dt;
  if (g.close === 'gust' && p.dist < GUST.trigger && b.cd2 <= 0 && b.alpha > 0.6 && b.mode !== 'attack') {
    b.cd2 = GUST.cooldown;
    return { speed: 0, gone: false, gust: true };
  }
  const reach = chimeraReach(g);
  // Techniques with a wind-up hold the entity in 'attack' / 'fuse'.
  // Slashers also have namahage's dash cut (cd2 is free: the wind burst is only for ranged ones).
  if (g.attack === 'slash' && b.mode === 'dash') {
    const D = NAMAHAGE_DASH;
    if (b.t < D.windup) return { speed: 0, gone: false };
    if (b.n === 1) {
      b.n = 0;
      return { speed: 0, gone: false, dash: true };
    }
    if (b.t < D.windup + D.dur) return { speed: 0, gone: false };
    set(b, 'chase');
    b.watch = D.recover;
    b.cd2 = D.cooldown + g.cooldown;
    return { speed: 0, gone: false };
  }
  if (g.attack === 'slash' || g.attack === 'stomp') {
    if (b.mode === 'attack') {
      if (b.t >= (g.attack === 'slash' ? 0.6 : 0.8)) {
        set(b, 'chase');
        b.watch = g.cooldown;
        return g.attack === 'slash' ? { speed: 0, gone: false, slash: true } : { speed: 0, gone: false, stomp: true };
      }
      return { speed: 0, gone: false };
    }
    b.watch = Math.max(0, b.watch - dt);
    if (b.watch <= 0 && p.dist < reach) {
      set(b, 'attack');
      return { speed: 0, gone: false };
    }
    if (g.attack === 'slash' && b.watch <= 0 && p.los && p.dist > Math.max(NAMAHAGE_DASH.min, reach + 2) && p.dist < NAMAHAGE_DASH.max && b.cd2 <= 0 && b.alpha > 0.6) {
      set(b, 'dash');
      b.t = 0;
      b.n = 1;
      return { speed: 0, gone: false };
    }
  }
  if (g.attack === 'burst') {
    if (b.mode === 'fuse') {
      if (p.dist > reach + 3.5) {
        set(b, 'stalk');
        return { speed: g.walk, gone: false };
      }
      if (b.t >= BLOATER.fuse) return { speed: 0, gone: true, explode: true };
      return { speed: 0, gone: false };
    }
    if (p.dist < reach) {
      set(b, 'fuse');
      return { speed: 0, gone: false };
    }
  }
  if (g.attack === 'snipe' && b.watch > 0) {
    if (!p.los || p.dist > PEEKER.maxRange) {
      b.watch = 0;
      b.cd = 1.2;
    } else {
      b.watch += dt;
      if (b.watch >= PEEKER.aim) {
        b.watch = 0;
        b.cd = g.cooldown;
        return { speed: 0, gone: false, snipe: true, aim: 1 };
      }
      return { speed: 0, gone: false, aim: b.watch / PEEKER.aim };
    }
  }
  // Movement
  let d: Decision;
  switch (g.move) {
    case 'range':
      d = keepRange(b, p, dt, g.near, g.far, g.walk, g.run);
      break;
    case 'creep':
      if (p.watched) {
        b.mode = 'frozen';
        return { speed: 0, gone: false };
      }
      if (b.mode !== 'chase') set(b, 'chase');
      d = { speed: p.dist < 12 ? g.run : g.walk, gone: false };
      break;
    case 'drift':
      if (b.mode !== 'stalk') set(b, 'stalk');
      // Ranged drifters hover in their band; melee drifters float slowly toward you.
      d = { speed: g.far > 0 ? (p.dist < g.near ? -g.walk : p.dist > g.far ? g.walk : 0) : g.walk, gone: false };
      break;
    default:
      // rush / hopper (the hop itself is done by the entity system)
      if (b.mode !== 'chase') set(b, 'chase');
      d = { speed: p.dist < 25 ? g.run : g.walk, gone: false };
  }
  // Ranged techniques on their cooldown, only with a line of sight.
  b.cd -= dt;
  const ready = p.los && b.cd <= 0 && b.alpha > 0.6;
  switch (g.attack) {
    case 'shoot':
      if (ready && p.dist < Math.max(30, g.far + 10)) {
        b.n--;
        b.cd = 0.3;
        if (b.n <= 0) {
          b.n = g.burst;
          b.cd = g.cooldown;
        }
        d.fire = true;
      }
      break;
    case 'snipe':
      if (ready && p.dist < PEEKER.maxRange) {
        b.watch = 0.0001;
        return { speed: 0, gone: false, aim: 0 };
      }
      break;
    case 'lob':
      if (ready && p.dist < BOMBER.maxRange) {
        b.cd = g.cooldown;
        d.toss = true;
      }
      break;
    case 'lightning':
      if (ready && p.dist < WITCH.maxRange) {
        b.cd = g.cooldown;
        d.cast = true;
      }
      break;
    case 'wind':
      if (ready && p.dist < FANMAN.maxRange) {
        b.cd = g.cooldown;
        d.blow = true;
      }
      break;
    case 'boulder':
      if (ready && p.dist > BOULDER.min && p.dist < BOULDER.max) {
        b.cd = g.cooldown;
        d.hurl = true;
      }
      break;
  }
  return d;
}
