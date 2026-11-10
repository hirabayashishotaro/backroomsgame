/**
 * Entities in the world, projectiles and hit detection. The game supplies a
 * Host with world queries, the player, audio and HUD; this module keeps the
 * per-frame logic in one place.
 */
import * as THREE from 'three';
import { PlayerController, type WorldQuery } from '../player/controller';
import { groundHeight, rayBox, type WBox } from '../world/collision';
import { ENTITIES, type EntityKind } from './entityDefs';
import { BLAST_KNOCK, BLOATER, BOMBER, GIANT, WITCH, hurt, newBrain, think, type BrainState } from './brain';
import { animateEntity, buildBombMesh, buildEntityMesh, buildRocketMesh, disposeEntityMesh, setEntityAlpha } from './models';
import { stepProjectile } from '../weapons/weaponLogic';
import { falloffFactor, type WeaponDef } from '../weapons/weaponDefs';
import { buildWeaponModel } from '../weapons/weaponModels';
import type { AudioSystem } from '../systems/audio';

export interface Host {
  fx: THREE.Object3D;
  toRender: (x: number, z: number) => [number, number];
  world: WorldQuery;
  /** Distance to the first world surface along a ray, or null. */
  rayWorld: (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) => number | null;
  player: PlayerController;
  audio: AudioSystem;
  /** Entities may not step here (near return doorways). */
  isSafe: (x: number, z: number) => boolean;
  onPlayerHit: (kind: EntityKind, damage: number) => void;
  /** The player was thrown by their own rocket's blast (no fall damage until they land). */
  onSelfBlast: () => void;
  /** Hit by a ranged attack (bullet, lightning): damage without the jump scare. */
  onRangedHit: (kind: EntityKind, damage: number) => void;
  onSeen: (kind: EntityKind) => void;
  onKilled: (kind: EntityKind, at: { x: number; y: number; z: number }) => void;
  onHit: (head: boolean, kill: boolean) => void;
}

interface Entity {
  kind: EntityKind;
  brain: BrainState;
  body: PlayerController;
  mesh: THREE.Group;
  phase: number;
  flash: number;
  seen: boolean;
  voiceT: number;
  stuck: number;
  detour: number;
  detourT: number;
  /** Footstep counter (giant). */
  lastStep: number;
  /** Consecutive detours (longer each time, same side) and time moving freely. */
  tries: number;
  freeT: number;
  /** Side-to-side weave while approaching (phase and rate). */
  weave: number;
  weaveF: number;
}

interface EnemyShot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  mesh: THREE.Mesh;
}

/** A lightning strike: a glowing ring on the ground, then the bolt. */
interface Strike {
  x: number;
  y: number;
  z: number;
  t: number;
  /** Warning time, radius, damage; who cast it (player strikes never hurt the player). */
  warn: number;
  radius: number;
  damage: number;
  stun: number;
  owner: 'witch' | 'player';
  def: WeaponDef | null;
  ring: THREE.Mesh;
  bolt: THREE.Mesh | null;
}

/** A thrown bomb: flies in an arc, lands, blinks, then explodes. */
interface Bomb {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  landed: boolean;
  fuse: number;
  life: number;
  mesh: THREE.Group;
}

const BOMB_GRAVITY = 14;

/** Max upward speed from your own rocket: v^2 / 2g = 15^2 / 32 = about 7 m of height. */
export const ROCKET_JUMP_VY = 15;

/** Enemy bullet speed (m/s): fast, but you can see it and step aside. */
export const ENEMY_SHOT_SPEED = 55;

interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  def: WeaponDef;
  mesh: THREE.Object3D;
  travelled: number;
}

export interface LooseKunai {
  x: number;
  y: number;
  z: number;
  mesh: THREE.Object3D;
}

interface Spark {
  mesh: THREE.Mesh;
  t: number;
  life: number;
  size: number;
  x: number;
  y: number;
  z: number;
}

/** Hit volumes in entity space: forward offset f, height range, half-size, head flag. */
/**
 * Hit volumes in the entity's own frame (it faces -Z): `f` = offset backward
 * (negative = in front), height range, half-width `r` and half-depth `d`
 * (defaults to r). Boxes follow the model's rotation, so they hug the body:
 * a shot aimed at the head from close below is no longer caught by an
 * invisible slab in front of the chest.
 */
type HitBox = { f: number; y0: number; y1: number; r: number; d?: number; head: boolean };
const HUMAN = (h: number, w = 0.3): HitBox[] => [
  { f: 0, y0: 0, y1: h * 0.815, r: w, d: 0.19, head: false },
  { f: 0, y0: h * 0.815, y1: h, r: 0.17, head: true },
];
const HITBOXES: Record<EntityKind, HitBox[]> = {
  smiler: [
    { f: 0, y0: 1.15, y1: 1.95, r: 0.45, d: 0.45, head: false },
    { f: -0.35, y0: 1.6, y1: 1.95, r: 0.3, d: 0.2, head: true },
  ],
  hound: [
    { f: 0, y0: 0.05, y1: 1.0, r: 0.26, d: 0.68, head: false },
    { f: -0.78, y0: 0.82, y1: 1.18, r: 0.18, d: 0.25, head: true },
  ],
  duller: HUMAN(1.85),
  faceling: HUMAN(1.8),
  skinstealer: HUMAN(2.0, 0.26),
  bloater: [
    { f: 0, y0: 0.1, y1: 1.5, r: 0.6, d: 0.56, head: false },
    { f: 0, y0: 1.5, y1: 1.85, r: 0.2, head: true },
  ],
  giant: [
    { f: 0, y0: 0, y1: 3.1, r: 0.75, d: 0.38, head: false }, // legs
    { f: 0, y0: 3.1, y1: 5.35, r: 1.15, d: 0.48, head: false }, // torso and arms
    { f: 0, y0: 5.3, y1: 6.45, r: 0.58, d: 0.58, head: true },
  ],
  gunman: [
    { f: 0, y0: 0, y1: 1.5, r: 0.3, d: 0.2, head: false },
    { f: -0.45, y0: 1.2, y1: 1.5, r: 0.12, d: 0.45, head: false }, // outstretched arm
    { f: 0, y0: 1.5, y1: 1.9, r: 0.2, head: true },
  ],
  witch: [
    { f: 0, y0: 0, y1: 1.45, r: 0.4, d: 0.4, head: false },
    { f: 0, y0: 1.45, y1: 2.1, r: 0.17, head: true },
  ],
  bomber: [
    { f: 0, y0: 0, y1: 1.42, r: 0.38, d: 0.3, head: false },
    { f: 0.33, y0: 0.85, y1: 1.45, r: 0.3, d: 0.25, head: false }, // sack on the back
    { f: 0, y0: 1.42, y1: 1.76, r: 0.17, head: true },
  ],
  bug: HUMAN(1.8),
};

/** Eye-level height used for line of sight. */
const CHEST: Partial<Record<EntityKind, number>> = { giant: 4.2, bloater: 1.0, hound: 0.8 };

export interface RayHit {
  t: number;
  entity: Entity | null;
  head: boolean;
}

export class EntitySystem {
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  readonly kunai: LooseKunai[] = [];
  readonly shots: EnemyShot[] = [];
  readonly strikes: Strike[] = [];
  readonly bombs: Bomb[] = [];
  /** Developer combat lab: entities stand still and never attack. */
  aiStopped = false;
  private sparks: Spark[] = [];
  private prevPX = 0;
  private prevPZ = 0;
  private sparkGeo = new THREE.SphereGeometry(0.04, 6, 4);
  private shotGeo = new THREE.BoxGeometry(0.05, 0.05, 0.7);
  private ringGeo = new THREE.RingGeometry(0.86, 1, 40);
  private boltGeo = new THREE.CylinderGeometry(0.12, 0.25, 30, 6);

  constructor(private host: Host) {}

  get active(): number {
    return this.entities.length;
  }

  clear(): void {
    for (const e of this.entities) disposeEntityMesh(e.mesh);
    this.entities.length = 0;
    for (const p of this.projectiles) p.mesh.removeFromParent();
    this.projectiles.length = 0;
    for (const k of this.kunai) k.mesh.removeFromParent();
    this.kunai.length = 0;
    for (const s of this.sparks) s.mesh.removeFromParent();
    this.sparks.length = 0;
    for (const s of this.shots) s.mesh.removeFromParent();
    this.shots.length = 0;
    for (const s of this.strikes) {
      s.ring.removeFromParent();
      s.bolt?.removeFromParent();
    }
    this.strikes.length = 0;
    for (const bm of this.bombs) bm.mesh.removeFromParent();
    this.bombs.length = 0;
    if (this.aimRing) this.aimRing.visible = false;
  }

  // ------------------------------------------------------------------ spawn --

  /** Find a spawn point 30-55 m away, on ground at the player's level, out of sight. */
  trySpawn(kind: EntityKind, rng: () => number): boolean {
    const p = this.host.player;
    const fx = p.dirX;
    const fz = p.dirZ;
    for (let k = 0; k < 40; k++) {
      // Prefer behind and to the sides.
      const a = Math.atan2(-fz, -fx) + (rng() - 0.5) * Math.PI * (k < 20 ? 1.2 : 2);
      const d = 30 + rng() * 25;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const floors = this.host.world.floors(x, z);
      const boxes = this.host.world.boxes(x, z);
      const terr = this.host.world.terrain?.(x, z) ?? null;
      if (!floors.length && terr === null && !boxes.length) continue; // not loaded
      let g = groundHeight(x, z, 0.3, p.y + 2.5, floors, boxes);
      if (terr !== null && terr <= p.y + 2.5 && terr > g) g = terr;
      if (!Number.isFinite(g) || Math.abs(g - p.y) > 3) continue;
      const top = kind === 'giant' ? 7 : 1.9;
      const pad = kind === 'giant' ? 1.3 : 0.5;
      if (boxes.some((b) => b.maxY > g + 0.3 && b.minY < g + top && x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad)) continue;
      if (this.host.isSafe(x, z)) continue;
      // Out of sight: behind the player or hidden by a wall.
      const dx = x - p.x;
      const dz = z - p.z;
      const dl = Math.hypot(dx, dz);
      const inFront = (dx * fx + dz * fz) / dl > 0.25;
      if (inFront) {
        const ey = p.y + p.eye;
        const hit = this.host.rayWorld(p.x, ey, p.z, dx / dl, (g + 1.2 - ey) / dl, dz / dl, dl);
        if (hit === null || hit > dl - 1) continue;
      }
      this.spawnAt(kind, x, g, z);
      return true;
    }
    return false;
  }

  spawnAt(kind: EntityKind, x: number, y: number, z: number): void {
    const body = new PlayerController();
    body.x = x;
    body.y = y;
    body.z = z;
    const mesh = buildEntityMesh(kind);
    setEntityAlpha(mesh, 0);
    this.host.fx.add(mesh);
    this.entities.push({ kind, brain: newBrain(kind), body, mesh, phase: 0, flash: 0, seen: false, voiceT: 2, stuck: 0, detour: 0, detourT: 0, lastStep: 0, tries: 0, freeT: 0, weave: Math.random() * 6.28, weaveF: 1.4 + Math.random() * 0.9 });
  }

  // ---------------------------------------------------------------- update --

  update(dt: number): void {
    const p = this.host.player;
    const vx = dt > 0 ? (p.x - this.prevPX) / dt : 0;
    const vz = dt > 0 ? (p.z - this.prevPZ) / dt : 0;
    this.prevPX = p.x;
    this.prevPZ = p.z;
    const ey = p.y + p.eye;
    const cp = Math.cos(p.pitch);
    const lx = -Math.sin(p.yaw) * cp;
    const ly = Math.sin(p.pitch);
    const lz = -Math.cos(p.yaw) * cp;
    const running = p.speed > 4.2;
    const crouching = p.eye < 1.3;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      const b = e.body;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      // Perception
      const chestY = b.y + (CHEST[e.kind] ?? 1.3);
      const tx = b.x - p.x;
      const ty = chestY - ey;
      const tz = b.z - p.z;
      const tl = Math.hypot(tx, ty, tz) || 1;
      const wall = this.host.rayWorld(p.x, ey, p.z, tx / tl, ty / tl, tz / tl, tl);
      const los = wall === null || wall > tl - 0.4;
      const facing = (tx * lx + ty * ly + tz * lz) / tl;
      const watched = los && facing > (e.kind === 'smiler' ? 0.94 : 0.965) && dist < 70;
      const retreat = (vx * -dx + vz * -dz) / dist; // moving away from it
      if (watched && !e.seen && e.brain.alpha > 0.5 && dist < 40) {
        e.seen = true;
        this.host.onSeen(e.kind);
      }
      const stop = this.aiStopped && e.brain.hp > 0;
      const prevMode = e.brain.mode;
      const d = stop
        ? { speed: 0, gone: false }
        : think(e.brain, { dist, watched, los, playerRunning: running, playerCrouching: crouching, playerRetreat: retreat }, dt);
      if (stop) e.brain.alpha = Math.min(1, e.brain.alpha + dt);
      if (d.explode) {
        this.explode(b.x, b.y, b.z, BLOATER.radius, ENTITIES.bloater.damage, BLAST_KNOCK, 'bloater', e);
        disposeEntityMesh(e.mesh);
        this.entities.splice(i, 1);
        continue;
      }
      if (d.stomp) this.stomp(e, dist);
      if (d.fire) this.enemyFire(e, dist);
      if (d.cast) this.cast(e, dist);
      if (d.toss) this.toss(e, dist);
      if (e.brain.mode !== prevMode) {
        if (e.kind === 'bloater' && e.brain.mode === 'fuse') this.host.audio.entityVoice('hiss', this.panTo(b.x, b.z), dist);
        if (e.kind === 'giant' && e.brain.mode === 'attack') this.host.audio.entityVoice('groan', this.panTo(b.x, b.z), dist);
      }
      if (d.gone || dist > 110) {
        disposeEntityMesh(e.mesh);
        this.entities.splice(i, 1);
        continue;
      }
      // Movement toward (or away from) the player, with a simple detour when stuck.
      const face = Math.atan2(-dx, -dz); // face the player (forward = (-sin, -cos))
      let yaw = face;
      if (e.detourT > 0) {
        e.detourT -= dt;
        yaw += e.detour;
      } else if (e.kind !== 'giant' && d.speed > 0 && dist > 3) {
        // Weave from side to side while closing in, as if dodging bullets.
        e.weave += dt * e.weaveF;
        yaw += Math.sin(e.weave) * 1.0 * Math.min(1, (dist - 3) / 4);
      }
      // Never walk through the player: hold just short of contact range.
      const fwd = d.speed > 0 && dist < (e.kind === 'giant' ? 2 : 0.85) ? 0 : d.speed;
      const side = d.strafe ?? 0;
      const speed = Math.hypot(fwd, side);
      const ox = b.x;
      const oz = b.z;
      b.yaw = yaw;
      if (speed > 0.01) {
        b.step(dt, { forward: fwd / speed, strafe: side / speed, sprint: false, crouch: false, jump: false, speed }, this.host.world);
        if (this.host.isSafe(b.x, b.z)) {
          b.x = ox;
          b.z = oz;
        }
        const moved = Math.hypot(b.x - ox, b.z - oz);
        if (moved < speed * dt * 0.3) {
          e.stuck += dt;
          e.freeT = 0;
        } else {
          e.stuck = Math.max(0, e.stuck - dt);
          e.freeT += dt;
          if (e.freeT > 2.5) e.tries = 0;
        }
        if (e.stuck > 0.3 && e.detourT <= 0) {
          // Go around: keep to the same side and walk further each time it is still blocked.
          const side = e.tries > 0 ? Math.sign(e.detour) : Math.random() < 0.5 ? -1 : 1;
          e.detour = side * (1.1 + Math.random() * 0.4);
          e.detourT = Math.min(3.5, 0.8 + 0.7 * e.tries);
          e.tries++;
          e.stuck = 0;
          if (b.grounded) b.vy = 6; // hop over low obstacles
        }
        e.phase += moved * (e.kind === 'giant' ? 1.1 : 3);
        if (e.kind === 'giant' && Math.floor(e.phase / Math.PI) !== e.lastStep) {
          e.lastStep = Math.floor(e.phase / Math.PI);
          this.host.audio.entityVoice('stomp', this.panTo(b.x, b.z), dist);
        }
      } else b.step(dt, { forward: 0, strafe: 0, sprint: false, crouch: false, jump: false }, this.host.world);
      if (b.y < p.y - 30) {
        // fell out of the world
        disposeEntityMesh(e.mesh);
        this.entities.splice(i, 1);
        continue;
      }
      // Contact attack, then it leaves (SPEC: escapable encounters).
      const vertical = Math.abs(b.y - p.y) < 1.6;
      if (!this.aiStopped && e.kind !== 'bloater' && e.kind !== 'giant' && e.kind !== 'gunman' && e.kind !== 'witch' && e.kind !== 'bomber' && e.kind !== 'bug' && dist < 1.15 && vertical && e.brain.alpha > 0.35 && e.brain.mode !== 'fade' && e.brain.mode !== 'flee' && e.brain.mode !== 'frozen') {
        this.host.onPlayerHit(e.kind, ENTITIES[e.kind].damage);
        e.brain.mode = 'flee';
        e.brain.t = 0;
      }
      // Voices
      e.voiceT -= dt;
      if (e.voiceT <= 0 && e.brain.alpha > 0.3) {
        const pan = this.panTo(b.x, b.z);
        const kind = e.kind === 'bug' ? 'glitch' : e.kind === 'hound' ? 'growl' : e.kind === 'smiler' ? 'giggle' : e.kind === 'skinstealer' ? 'help' : e.kind === 'duller' ? 'hum' : e.kind === 'giant' ? 'groan' : 'step';
        if (e.kind !== 'bloater') this.host.audio.entityVoice(kind, pan, dist);
        e.voiceT = e.brain.mode === 'chase' ? 1.6 + Math.random() : 4 + Math.random() * 5;
      }
      // Render
      const [rx, rz] = this.host.toRender(b.x, b.z);
      e.mesh.position.set(rx, b.y, rz);
      e.mesh.rotation.y = e.kind === 'gunman' || e.kind === 'witch' || e.kind === 'bomber' ? face : yaw;
      e.flash = Math.max(0, e.flash - dt * 5);
      if (e.kind === 'bloater') {
        // Swells and flickers while the fuse burns.
        const k = e.brain.mode === 'fuse' ? Math.min(1, e.brain.t / BLOATER.fuse) : 0;
        e.mesh.scale.setScalar(1 + 0.4 * k * k);
        if (k > 0 && Math.sin(e.brain.t * (8 + 30 * k)) > 0) e.flash = Math.max(e.flash, 0.8);
      }
      if (e.kind === 'bug') {
        // Glitch: now and then it skips sideways or flickers out of place for a frame.
        // (Visual only: the body never moves through walls.)
        if (Math.random() < 0.06) e.mesh.position.z += (Math.random() - 0.5) * 0.8;
        e.mesh.scale.set(1, Math.random() < 0.05 ? 0.6 + Math.random() * 0.8 : 1, 1);
        if (Math.random() < 0.04) e.mesh.position.x += (Math.random() - 0.5) * 0.6;
      }
      if (e.kind === 'giant') e.mesh.rotation.x = e.brain.mode === 'attack' ? -0.12 * Math.min(1, e.brain.t / GIANT.windup) : 0;
      setEntityAlpha(e.mesh, e.brain.alpha);
      animateEntity(e.mesh, e.kind, e.phase, speed, e.flash, dt);
    }
    this.updateProjectiles(dt);
    this.updateShots(dt);
    this.updateStrikes(dt);
    this.updateBombs(dt);
    this.updateFx(dt);
  }

  private panTo(x: number, z: number): number {
    const p = this.host.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    return (dx * right.x + dz * right.z) / (Math.hypot(dx, dz) || 1);
  }

  // --------------------------------------------------------------- hitting --

  /** Nearest entity hit along a ray within max, or null. */
  rayEntities(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): RayHit | null {
    let best: RayHit | null = null;
    for (const e of this.entities) {
      if (e.brain.mode === 'flee' && e.brain.hp <= 0) continue;
      const b = e.body;
      // Into the model's frame: x = its right, z = its back (it faces -z).
      const yaw = e.mesh.rotation.y;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const rx = ox - b.x;
      const rz = oz - b.z;
      const lox = rx * c - rz * sn;
      const loz = rx * sn + rz * c;
      const ldx = dx * c - dz * sn;
      const ldz = dx * sn + dz * c;
      const k = e.mesh.scale.x; // bloater swelling
      for (const hb of HITBOXES[e.kind]) {
        const d = (hb.d ?? hb.r) * k;
        const box: WBox = { minX: -hb.r * k, maxX: hb.r * k, minY: b.y + hb.y0 * (e.mesh.scale.y || 1), maxY: b.y + hb.y1 * (e.mesh.scale.y || 1), minZ: hb.f - d, maxZ: hb.f + d };
        const h = rayBox(lox, oy, loz, ldx, dy, ldz, box, max);
        if (h && (!best || h.t < best.t - 1e-4 || (Math.abs(h.t - best.t) < 0.05 && hb.head))) best = { t: h.t, entity: e, head: hb.head };
      }
    }
    return best;
  }

  /** Nearest hit: entity or world. */
  castRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): RayHit | null {
    const w = this.host.rayWorld(ox, oy, oz, dx, dy, dz, max);
    const e = this.rayEntities(ox, oy, oz, dx, dy, dz, w ?? max);
    if (e) return e;
    return w === null ? null : { t: w, entity: null, head: false };
  }

  damage(e: Entity, def: WeaponDef, dmg: number, head: boolean, at: [number, number, number]): void {
    const total = dmg * (head ? def.headMultiplier : 1);
    const dead = hurt(e.brain, total);
    e.flash = 1;
    this.host.audio.impact(true, this.panTo(at[0], at[2]), Math.hypot(at[0] - this.host.player.x, at[2] - this.host.player.z));
    this.host.onHit(head, dead);
    if (dead) this.host.onKilled(e.kind, { x: e.body.x, y: e.body.y, z: e.body.z });
    this.spark(at[0], at[1], at[2], 0xa01010);
  }

  /** Hitscan shot (pistol): instant, damage falls off with distance. */
  hitscan(def: WeaponDef, o: [number, number, number], d: [number, number, number]): void {
    const h = this.castRay(o[0], o[1], o[2], d[0], d[1], d[2], def.range);
    if (!h) return;
    const at: [number, number, number] = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t];
    if (h.entity) this.damage(h.entity, def, def.damage * falloffFactor(def, h.t), h.head, at);
    else {
      this.spark(at[0] - d[0] * 0.03, at[1] - d[1] * 0.03, at[2] - d[2] * 0.03, 0xffe0a0);
      this.host.audio.impact(false, this.panTo(at[0], at[2]), h.t);
    }
  }

  /** Projectile (magnum bullet or thrown kunai). */
  launch(def: WeaponDef, o: [number, number, number], d: [number, number, number], start: THREE.Vector3): void {
    const speed = def.speed ?? 100;
    let mesh: THREE.Object3D;
    if (def.kind === 'thrown') {
      mesh = buildWeaponModel('kunai', 1);
    } else if (def.explosive) {
      mesh = buildRocketMesh();
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1.2), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.85 }));
      mesh = m;
    }
    this.host.fx.add(mesh);
    // Visual starts at the muzzle; the hit test starts at the eye (what you aimed at is what you hit).
    mesh.position.copy(start);
    this.projectiles.push({ x: o[0], y: o[1], z: o[2], vx: d[0] * speed, vy: d[1] * speed, vz: d[2] * speed, g: def.gravity ?? 0, def, mesh, travelled: 0 });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const sub = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy, pr.vz) * dt) / 1.5));
      let done = false;
      for (let s = 0; s < sub && !done; s++) {
        const h = dt / sub;
        const x0 = pr.x;
        const y0 = pr.y;
        const z0 = pr.z;
        stepProjectile(pr, pr.g, h);
        const sx = pr.x - x0;
        const sy = pr.y - y0;
        const sz = pr.z - z0;
        const len = Math.hypot(sx, sy, sz) || 1e-6;
        const hit = this.castRay(x0, y0, z0, sx / len, sy / len, sz / len, len);
        pr.travelled += len;
        if (hit) {
          const at: [number, number, number] = [x0 + (sx / len) * hit.t, y0 + (sy / len) * hit.t, z0 + (sz / len) * hit.t];
          if (pr.def.explosive) {
            // Detonate just in front of the surface it hit.
            const back = 0.15;
            this.rocketBlast(pr.def, [at[0] - (sx / len) * back, at[1] - (sy / len) * back, at[2] - (sz / len) * back], hit.entity);
          } else if (hit.entity) this.damage(hit.entity, pr.def, pr.def.damage, hit.head, at);
          else {
            this.spark(at[0] - sx / len * 0.03, at[1] - sy / len * 0.03, at[2] - sz / len * 0.03, 0xffe0a0);
            this.host.audio.impact(false, this.panTo(at[0], at[2]), Math.hypot(at[0] - this.host.player.x, at[2] - this.host.player.z));
          }
          if (pr.def.kind === 'thrown') {
            // The kunai stays where it hit (or drops at the entity's feet) and can be collected.
            const back = hit.entity ? 0 : 0.08;
            const k = { x: at[0] - (sx / len) * back, y: hit.entity ? hit.entity.body.y + 0.03 : at[1] - (sy / len) * back, z: at[2] - (sz / len) * back, mesh: pr.mesh };
            this.kunai.push(k);
          } else pr.mesh.removeFromParent();
          done = true;
        }
      }
      // A thrown kunai past its range starts to drop (and stays collectable).
      if (!done && pr.def.kind === 'thrown' && pr.travelled > pr.def.range) pr.g = 9.8;
      if (!done && ((pr.def.kind !== 'thrown' && pr.travelled > pr.def.range) || pr.y < this.host.player.y - 60)) {
        pr.mesh.removeFromParent();
        done = true;
      }
      if (done) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const [rx, rz] = this.host.toRender(pr.x, pr.z);
      // The tracer drifts from the muzzle onto the true path over the first metres.
      const blend = Math.min(1, pr.travelled / 2.5);
      const target = new THREE.Vector3(rx, pr.y, rz);
      pr.mesh.position.lerp(target, pr.def.kind === 'thrown' ? 1 : 0.35 + 0.65 * blend);
      pr.mesh.lookAt(pr.mesh.position.x + pr.vx, pr.mesh.position.y + pr.vy, pr.mesh.position.z + pr.vz);
      if (pr.def.explosive) this.spark(pr.x - pr.vx * 0.012, pr.y - pr.vy * 0.012, pr.z - pr.vz * 0.012, Math.random() < 0.3 ? 0xffa040 : 0x9a9a96, 3 + Math.random() * 2, 0.6);
    }
  }

  /** Melee swing: nearest entity in front within reach. */
  melee(def: WeaponDef): boolean {
    const p = this.host.player;
    const ey = p.y + p.eye;
    const cp = Math.cos(p.pitch);
    const d: [number, number, number] = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
    // A few rays in a small fan make the axe forgiving.
    for (const off of [0, -0.12, 0.12, -0.25, 0.25]) {
      const c = Math.cos(off);
      const s = Math.sin(off);
      const dir: [number, number, number] = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
      const h = this.castRay(p.x, ey, p.z, dir[0], dir[1], dir[2], def.reach ?? 2);
      if (h?.entity) {
        this.damage(h.entity, def, def.damage, h.head, [p.x + dir[0] * h.t, ey + dir[1] * h.t, p.z + dir[2] * h.t]);
        return true;
      }
      if (h && off === 0) {
        this.spark(p.x + dir[0] * (h.t - 0.05), ey + dir[1] * (h.t - 0.05), p.z + dir[2] * (h.t - 0.05), 0xffe0a0);
        this.host.audio.impact(false, 0, h.t);
        return false;
      }
    }
    return false;
  }

  /** Collect kunai lying near the player. Returns how many were picked up. */
  collectKunai(): number {
    const p = this.host.player;
    let n = 0;
    for (let i = this.kunai.length - 1; i >= 0; i--) {
      const k = this.kunai[i];
      if (Math.hypot(k.x - p.x, k.z - p.z) < 1.4 && k.y > p.y - 0.5 && k.y < p.y + 2.4) {
        k.mesh.removeFromParent();
        this.kunai.splice(i, 1);
        n++;
      }
    }
    return n;
  }

  private spark(x: number, y: number, z: number, color: number, size = 1, life = 0.25): void {
    const mesh = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    this.host.fx.add(mesh);
    this.sparks.push({ mesh, t: life, life, size, x, y, z });
  }

  /**
   * Explosion (bloater burst, bomber's bomb): damage falls off with distance,
   * and everything inside the radius - player and entities - is blown away.
   */
  private explode(x: number, y: number, z: number, radius: number, damage: number, knock: number, kind: EntityKind, source: Entity | null): void {
    const p = this.host.player;
    const dist = Math.hypot(p.x - x, p.z - z);
    const s = radius / 5.5;
    this.spark(x, y + 1, z, 0xffb050, 55 * s, 0.45);
    this.spark(x, y + 1, z, 0xfff0c0, 25 * s, 0.25);
    for (let k = 0; k < 14; k++) this.spark(x + (Math.random() - 0.5) * 3 * s, y + 0.3 + Math.random() * 2.2, z + (Math.random() - 0.5) * 3 * s, 0x6a5a40, 4, 0.7);
    this.host.audio.entityVoice('boom', this.panTo(x, z), dist);
    if (dist < radius && Math.abs(p.y - y) < 3) {
      const k = 1 - dist / radius;
      const dmg = damage * (0.25 + 0.75 * k);
      if (kind === 'bloater') this.host.onPlayerHit(kind, dmg);
      else this.host.onRangedHit(kind, dmg);
      // Blown back (and a little up): stronger the closer you were.
      p.knock(p.x - x || 0.01, p.z - z, knock * (0.4 + 0.6 * k), 3 + 4 * k);
    }
    for (const e of this.entities) {
      if (e === source || e.brain.hp <= 0) continue;
      const d = Math.hypot(e.body.x - x, e.body.z - z);
      if (d >= radius || Math.abs(e.body.y - y) > 3) continue;
      const k = 1 - d / radius;
      const dead = hurt(e.brain, damage * (0.25 + 0.75 * k));
      e.flash = 1;
      if (dead) this.host.onKilled(e.kind, { x: e.body.x, y: e.body.y, z: e.body.z });
      if (e.kind !== 'giant') e.body.knock(e.body.x - x || 0.01, e.body.z - z, knock * (0.4 + 0.6 * k), 3 + 4 * k);
    }
  }

  /**
   * Rocket blast: full damage to the entity it struck, falloff for the rest,
   * everything thrown outward. The player is thrown too (rocket jumps) but
   * never hurt by their own rocket.
   */
  private rocketBlast(def: WeaponDef, at: [number, number, number], direct: Entity | null): void {
    const ex = def.explosive!;
    const R = ex.radius;
    const [x, y, z] = at;
    const p = this.host.player;
    const s = R / 5.5;
    this.spark(x, y, z, 0xffb050, 55 * s, 0.45);
    this.spark(x, y, z, 0xfff0c0, 25 * s, 0.25);
    for (let k = 0; k < 16; k++) this.spark(x + (Math.random() - 0.5) * 3 * s, y + (Math.random() - 0.3) * 2, z + (Math.random() - 0.5) * 3 * s, 0x5a5048, 4, 0.8);
    this.host.audio.entityVoice('boom', this.panTo(x, z), Math.hypot(p.x - x, p.z - z));
    for (const e of this.entities) {
      if (e.brain.hp <= 0) continue;
      const b = e.body;
      const d = e === direct ? 0 : Math.hypot(b.x - x, b.y + 0.9 - y, b.z - z);
      if (d >= R) continue;
      const k = 1 - d / R;
      this.damage(e, def, e === direct ? def.damage : def.damage * (0.3 + 0.7 * k), false, [b.x, b.y + 1, b.z]);
      if (e.kind !== 'giant') b.knock(b.x - x || 0.01, b.z - z, ex.knock * (0.4 + 0.6 * k), 3 + 5 * k);
    }
    // The shooter: thrown away from the blast along the 3D direction - fire at your feet to fly.
    const dx = p.x - x;
    const dy = p.y + 0.9 - y;
    const dz = p.z - z;
    const d = Math.hypot(dx, dy, dz);
    if (d < R) {
      const k = 1 - d / R;
      const S = ex.selfKnock * (0.35 + 0.65 * k);
      const l = d || 1;
      const up = Math.max(0, (dy / l) * S) + 2 * k;
      p.kx += (dx / l) * S;
      p.kz += (dz / l) * S;
      if (up > 0.5) {
        p.vy = Math.min(ROCKET_JUMP_VY, Math.max(p.vy, 0) + up);
        p.grounded = false;
      }
      this.host.onSelfBlast();
    }
  }

  /** Bomber: lob a bomb so that it lands where the player stands. */
  private toss(e: Entity, dist: number): void {
    const b = e.body;
    const p = this.host.player;
    const ox = b.x - Math.sin(b.yaw) * 0.4;
    const oy = b.y + 1.7;
    const oz = b.z - Math.cos(b.yaw) * 0.4;
    // Lead the target a little and miss by a bit, so moving keeps you safe.
    const T = Math.max(0.8, Math.min(1.6, dist / 13));
    const tx = p.x + (Math.random() - 0.5) * 1.6;
    const tz = p.z + (Math.random() - 0.5) * 1.6;
    const vx = (tx - ox) / T;
    const vz = (tz - oz) / T;
    const vy = (p.y + 0.15 - oy + 0.5 * BOMB_GRAVITY * T * T) / T;
    const mesh = buildBombMesh();
    this.host.fx.add(mesh);
    this.bombs.push({ x: ox, y: oy, z: oz, vx, vy, vz, landed: false, fuse: BOMBER.fuse, life: 6, mesh });
    this.host.audio.throwWhoosh();
    void dist;
  }

  private updateBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bm = this.bombs[i];
      bm.life -= dt;
      if (!bm.landed) {
        const x0 = bm.x;
        const y0 = bm.y;
        const z0 = bm.z;
        bm.vy -= BOMB_GRAVITY * dt;
        bm.x += bm.vx * dt;
        bm.y += bm.vy * dt;
        bm.z += bm.vz * dt;
        const sx = bm.x - x0;
        const sy = bm.y - y0;
        const sz = bm.z - z0;
        const len = Math.hypot(sx, sy, sz) || 1e-6;
        const hit = this.host.rayWorld(x0, y0, z0, sx / len, sy / len, sz / len, len + 0.15);
        if (hit !== null) {
          // Stop at the surface; if it hit a wall, drop to the floor below.
          const back = Math.max(0, hit - 0.2);
          bm.x = x0 + (sx / len) * back;
          bm.z = z0 + (sz / len) * back;
          const yHit = y0 + (sy / len) * back;
          const g = groundHeight(bm.x, bm.z, 0.1, yHit + 0.3, this.host.world.floors(bm.x, bm.z), this.host.world.boxes(bm.x, bm.z));
          const terr = this.host.world.terrain?.(bm.x, bm.z) ?? null;
          let ground = Number.isFinite(g) ? g : yHit;
          if (terr !== null && terr <= yHit + 0.3 && terr > ground) ground = terr;
          bm.y = ground + 0.14;
          bm.landed = true;
          this.host.audio.impact(false, this.panTo(bm.x, bm.z), Math.hypot(bm.x - this.host.player.x, bm.z - this.host.player.z));
        }
      } else bm.fuse -= dt;
      if ((bm.landed && bm.fuse <= 0) || bm.life <= 0) {
        bm.mesh.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material as THREE.Material).dispose() : undefined));
        bm.mesh.removeFromParent();
        this.bombs.splice(i, 1);
        this.explode(bm.x, bm.y - 0.14, bm.z, BOMBER.radius, ENTITIES.bomber.damage, BOMBER.knock, 'bomber', null);
        continue;
      }
      const [rx, rz] = this.host.toRender(bm.x, bm.z);
      bm.mesh.position.set(rx, bm.y, rz);
      if (!bm.landed) bm.mesh.rotation.x += dt * 8;
      // Red light blinks faster as the fuse runs down.
      const light = bm.mesh.getObjectByName('light') as THREE.Mesh;
      const rate = bm.landed ? 4 + (1 - bm.fuse / BOMBER.fuse) * 20 : 3;
      (light.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(performance.now() * 0.001 * rate * Math.PI * 2) > 0 ? 0xff2a1a : 0x401010);
    }
  }

  /** Gunman: one revolver round toward the player's chest, with a little spread. */
  private enemyFire(e: Entity, dist: number): void {
    const b = e.body;
    const p = this.host.player;
    const rx = Math.cos(b.yaw);
    const rz = -Math.sin(b.yaw);
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    const ox = b.x + fx * 0.45 + rx * 0.25;
    const oy = b.y + 1.35;
    const oz = b.z + fz * 0.45 + rz * 0.25;
    let dx = p.x - ox;
    let dy = p.y + 1.15 - oy;
    let dz = p.z - oz;
    const l = Math.hypot(dx, dy, dz) || 1;
    const sp = 0.035;
    dx = dx / l + (Math.random() - 0.5) * sp * 2;
    dy = dy / l + (Math.random() - 0.5) * sp;
    dz = dz / l + (Math.random() - 0.5) * sp * 2;
    const n = Math.hypot(dx, dy, dz);
    const mesh = new THREE.Mesh(this.shotGeo, new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95 }));
    this.host.fx.add(mesh);
    this.shots.push({ x: ox, y: oy, z: oz, vx: (dx / n) * ENEMY_SHOT_SPEED, vy: (dy / n) * ENEMY_SHOT_SPEED, vz: (dz / n) * ENEMY_SHOT_SPEED, life: 1.5, mesh });
    this.spark(ox, oy, oz, 0xffc060, 3, 0.08);
    this.host.audio.entityVoice('shot', this.panTo(b.x, b.z), dist);
  }

  private updateShots(dt: number): void {
    const p = this.host.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      const len = Math.hypot(s.vx, s.vy, s.vz) * dt;
      const dx = s.vx / ENEMY_SHOT_SPEED;
      const dy = s.vy / ENEMY_SHOT_SPEED;
      const dz = s.vz / ENEMY_SHOT_SPEED;
      // Does this step pass through the player (a 0.35 m capsule)?
      const tx = p.x - s.x;
      const tz = p.z - s.z;
      const tc = Math.max(0, Math.min(len, tx * dx + tz * dz));
      const cx = s.x + dx * tc - p.x;
      const cz = s.z + dz * tc - p.z;
      const cy = s.y + dy * tc;
      const hitPlayer = Math.hypot(cx, cz) < 0.35 && cy > p.y && cy < p.y + 1.85;
      const wall = this.host.rayWorld(s.x, s.y, s.z, dx, dy, dz, len);
      let done = s.life <= 0;
      if (hitPlayer && (wall === null || wall > tc)) {
        this.host.onRangedHit('gunman', ENTITIES.gunman.damage);
        done = true;
      } else if (wall !== null) {
        this.spark(s.x + dx * wall, s.y + dy * wall, s.z + dz * wall, 0xffe0a0);
        done = true;
      }
      if (done) {
        (s.mesh.material as THREE.Material).dispose();
        s.mesh.removeFromParent();
        this.shots.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const [rx, rz] = this.host.toRender(s.x, s.z);
      s.mesh.position.set(rx, s.y, rz);
      s.mesh.lookAt(rx + s.vx, s.y + s.vy, rz + s.vz);
    }
  }

  /** Witch: mark the ground under the player; lightning falls there shortly after. */
  private cast(e: Entity, dist: number): void {
    const p = this.host.player;
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    this.host.fx.add(ring);
    this.strikes.push({ x: p.x, y: p.y, z: p.z, t: WITCH.warn, warn: WITCH.warn, radius: WITCH.radius, damage: ENTITIES.witch.damage, stun: 0, owner: 'witch', def: null, ring, bolt: null });
    e.flash = 0.6;
    this.host.audio.entityVoice('zap', this.panTo(p.x, p.z), 0);
    void dist;
  }

  private updateStrikes(dt: number): void {
    const p = this.host.player;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      const before = s.t;
      s.t -= dt;
      const [rx, rz] = this.host.toRender(s.x, s.z);
      s.ring.position.set(rx, s.y + 0.04, rz);
      const ringMat = s.ring.material as THREE.MeshBasicMaterial;
      if (s.t > 0) {
        // Warning: the ring brightens and pulses faster as the strike nears.
        const k = 1 - s.t / s.warn;
        ringMat.opacity = 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(k * 40));
        s.ring.scale.setScalar(s.radius);
      } else if (before > 0) {
        // Strike.
        const bolt = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 1, depthWrite: false }));
        bolt.position.set(rx, s.y + 15, rz);
        this.host.fx.add(bolt);
        s.bolt = bolt;
        this.spark(s.x, s.y + 0.5, s.z, 0xbfe6ff, 60, 0.35);
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        this.host.audio.entityVoice('thunder', this.panTo(s.x, s.z), d);
        if (s.owner === 'witch' && d < s.radius && Math.abs(p.y - s.y) < 3) this.host.onRangedHit('witch', s.damage);
        for (const e of this.entities) {
          // Lightning hurts anything standing in it (a witch is not hurt by its own kind's spell).
          if (e.brain.hp <= 0 || (s.owner === 'witch' && e.kind === 'witch')) continue;
          if (Math.hypot(e.body.x - s.x, e.body.z - s.z) >= s.radius || Math.abs(e.body.y - s.y) > 3) continue;
          if (s.def) this.damage(e, s.def, s.damage, false, [e.body.x, e.body.y + 1, e.body.z]);
          else hurt(e.brain, s.damage);
          if (s.stun > 0) e.brain.stunT = Math.max(e.brain.stunT, s.stun);
        }
      } else {
        const f = Math.max(0, 1 + s.t / 0.35);
        ringMat.opacity = 0.8 * f;
        if (s.bolt) {
          s.bolt.position.set(rx, s.y + 15, rz);
          (s.bolt.material as THREE.MeshBasicMaterial).opacity = f * (0.6 + 0.4 * Math.random());
          s.bolt.scale.x = s.bolt.scale.z = 0.6 + Math.random() * 0.8;
        }
        if (f <= 0) {
          ringMat.dispose();
          s.ring.removeFromParent();
          if (s.bolt) {
            (s.bolt.material as THREE.Material).dispose();
            s.bolt.removeFromParent();
          }
          this.strikes.splice(i, 1);
        }
      }
    }
  }

  // ----------------------------------------------------------- the staff --

  private aimRing: THREE.Mesh | null = null;

  /** Show the staff's magic circle on the ground at (x, y, z), or hide it (null). */
  showSpellCircle(at: [number, number, number] | null, radius = 3.5): void {
    if (!at) {
      if (this.aimRing) this.aimRing.visible = false;
      return;
    }
    if (!this.aimRing) {
      this.aimRing = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xd8a8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      this.aimRing.rotation.x = -Math.PI / 2;
      this.host.fx.add(this.aimRing);
    }
    const [rx, rz] = this.host.toRender(at[0], at[2]);
    this.aimRing.visible = true;
    this.aimRing.position.set(rx, at[1] + 0.05, rz);
    this.aimRing.scale.setScalar(radius);
    this.aimRing.rotation.z += 0.03;
    (this.aimRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.25 * Math.sin(performance.now() * 0.008);
  }

  /** The player's lightning: falls `def.spell.delay` s later on the circle, hurts and stuns entities only. */
  castPlayerStrike(def: WeaponDef, at: [number, number, number]): void {
    const sp = def.spell!;
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xd8a8ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    this.host.fx.add(ring);
    this.strikes.push({ x: at[0], y: at[1], z: at[2], t: sp.delay, warn: sp.delay, radius: sp.radius, damage: def.damage, stun: sp.stun, owner: 'player', def, ring, bolt: null });
    this.host.audio.entityVoice('zap', 0, 0);
  }

  /** Giant stomp: a shockwave around its feet. */
  private stomp(e: Entity, dist: number): void {
    const b = e.body;
    const fx = -Math.sin(b.yaw);
    const fz = -Math.cos(b.yaw);
    this.spark(b.x + fx * 1.2, b.y + 0.2, b.z + fz * 1.2, 0x9a9080, 40, 0.4);
    this.host.audio.entityVoice('stomp', this.panTo(b.x, b.z), Math.max(0, dist - 10));
    const p = this.host.player;
    if (dist < GIANT.reach + 1.2 && Math.abs(p.y - b.y) < 3) this.host.onPlayerHit('giant', ENTITIES.giant.damage);
  }

  private updateFx(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t -= dt;
      const [rx, rz] = this.host.toRender(s.x, s.z);
      s.mesh.position.set(rx, s.y, rz);
      const f = Math.max(0, s.t / s.life);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = f;
      s.mesh.scale.setScalar(s.size * (1 + (1 - f) * 1.5));
      if (s.t <= 0) {
        (s.mesh.material as THREE.Material).dispose();
        s.mesh.removeFromParent();
        this.sparks.splice(i, 1);
      }
    }
    for (const k of this.kunai) {
      const [rx, rz] = this.host.toRender(k.x, k.z);
      k.mesh.position.set(rx, k.y, rz);
    }
  }
}
