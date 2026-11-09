/**
 * Entities in the world, projectiles and hit detection. The game supplies a
 * Host with world queries, the player, audio and HUD; this module keeps the
 * per-frame logic in one place.
 */
import * as THREE from 'three';
import { PlayerController, type WorldQuery } from '../player/controller';
import { groundHeight, rayBox, type WBox } from '../world/collision';
import { ENTITIES, type EntityKind } from './entityDefs';
import { hurt, newBrain, think, type BrainState } from './brain';
import { animateEntity, buildEntityMesh, disposeEntityMesh, setEntityAlpha } from './models';
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
  onSeen: (kind: EntityKind) => void;
  onKilled: (kind: EntityKind) => void;
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
}

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
  x: number;
  y: number;
  z: number;
}

/** Hit volumes in entity space: forward offset f, height range, half-size, head flag. */
const HITBOXES: Record<EntityKind, Array<{ f: number; y0: number; y1: number; r: number; head: boolean }>> = {
  smiler: [
    { f: 0, y0: 1.15, y1: 1.95, r: 0.4, head: false },
    { f: -0.35, y0: 1.65, y1: 1.92, r: 0.26, head: true },
  ],
  hound: [
    { f: 0, y0: 0.05, y1: 1.0, r: 0.45, head: false },
    { f: -0.75, y0: 0.82, y1: 1.18, r: 0.2, head: true },
  ],
  duller: [
    { f: 0, y0: 0, y1: 1.47, r: 0.3, head: false },
    { f: 0, y0: 1.47, y1: 1.8, r: 0.16, head: true },
  ],
  faceling: [
    { f: 0, y0: 0, y1: 1.47, r: 0.3, head: false },
    { f: 0, y0: 1.47, y1: 1.8, r: 0.16, head: true },
  ],
  skinstealer: [
    { f: 0, y0: 0, y1: 1.63, r: 0.28, head: false },
    { f: 0, y0: 1.63, y1: 2.0, r: 0.17, head: true },
  ],
};

export interface RayHit {
  t: number;
  entity: Entity | null;
  head: boolean;
}

export class EntitySystem {
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  readonly kunai: LooseKunai[] = [];
  private sparks: Spark[] = [];
  private prevPX = 0;
  private prevPZ = 0;
  private sparkGeo = new THREE.SphereGeometry(0.04, 6, 4);

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
      if (boxes.some((b) => b.maxY > g + 0.3 && b.minY < g + 1.9 && x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5)) continue;
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
    this.entities.push({ kind, brain: newBrain(kind), body, mesh, phase: 0, flash: 0, seen: false, voiceT: 2, stuck: 0, detour: 0, detourT: 0 });
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
      const chestY = b.y + 1.3;
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
      const d = think(e.brain, { dist, watched, los, playerRunning: running, playerCrouching: crouching, playerRetreat: retreat }, dt);
      if (d.gone || dist > 110) {
        disposeEntityMesh(e.mesh);
        this.entities.splice(i, 1);
        continue;
      }
      // Movement toward (or away from) the player, with a simple detour when stuck.
      let yaw = Math.atan2(-dx, -dz); // face the player (forward = (-sin, -cos))
      if (e.detourT > 0) {
        e.detourT -= dt;
        yaw += e.detour;
      }
      // Never walk through the player: hold just short of contact range.
      const speed = d.speed > 0 && dist < 0.85 ? 0 : Math.abs(d.speed);
      const dir = d.speed >= 0 ? 1 : -1;
      const ox = b.x;
      const oz = b.z;
      b.yaw = yaw;
      if (speed > 0.01) {
        b.step(dt, { forward: dir, strafe: 0, sprint: false, crouch: false, jump: false, speed }, this.host.world);
        if (this.host.isSafe(b.x, b.z)) {
          b.x = ox;
          b.z = oz;
        }
        const moved = Math.hypot(b.x - ox, b.z - oz);
        if (moved < speed * dt * 0.3) e.stuck += dt;
        else e.stuck = Math.max(0, e.stuck - dt);
        if (e.stuck > 0.4 && e.detourT <= 0) {
          e.detour = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.7);
          e.detourT = 0.9;
          e.stuck = 0;
          if (b.grounded) b.vy = 5; // hop over small obstacles
        }
        e.phase += moved * 3;
      } else b.step(dt, { forward: 0, strafe: 0, sprint: false, crouch: false, jump: false }, this.host.world);
      if (b.y < p.y - 30) {
        // fell out of the world
        disposeEntityMesh(e.mesh);
        this.entities.splice(i, 1);
        continue;
      }
      // Contact attack, then it leaves (SPEC: escapable encounters).
      const vertical = Math.abs(b.y - p.y) < 1.6;
      if (dist < 1.15 && vertical && e.brain.alpha > 0.35 && e.brain.mode !== 'fade' && e.brain.mode !== 'flee' && e.brain.mode !== 'frozen') {
        this.host.onPlayerHit(e.kind, ENTITIES[e.kind].damage);
        e.brain.mode = 'flee';
        e.brain.t = 0;
      }
      // Voices
      e.voiceT -= dt;
      if (e.voiceT <= 0 && e.brain.alpha > 0.3) {
        const pan = this.panTo(b.x, b.z);
        const kind = e.kind === 'hound' ? 'growl' : e.kind === 'smiler' ? 'giggle' : e.kind === 'skinstealer' ? 'help' : e.kind === 'duller' ? 'hum' : 'step';
        this.host.audio.entityVoice(kind, pan, dist);
        e.voiceT = e.brain.mode === 'chase' ? 1.6 + Math.random() : 4 + Math.random() * 5;
      }
      // Render
      const [rx, rz] = this.host.toRender(b.x, b.z);
      e.mesh.position.set(rx, b.y, rz);
      e.mesh.rotation.y = yaw;
      e.flash = Math.max(0, e.flash - dt * 5);
      setEntityAlpha(e.mesh, e.brain.alpha);
      animateEntity(e.mesh, e.kind, e.phase, speed, e.flash, dt);
    }
    this.updateProjectiles(dt);
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
      const fx = -Math.sin(b.yaw);
      const fz = -Math.cos(b.yaw);
      for (const hb of HITBOXES[e.kind]) {
        const cx = b.x - fx * hb.f;
        const cz = b.z - fz * hb.f;
        const box: WBox = { minX: cx - hb.r, maxX: cx + hb.r, minY: b.y + hb.y0, maxY: b.y + hb.y1, minZ: cz - hb.r, maxZ: cz + hb.r };
        const h = rayBox(ox, oy, oz, dx, dy, dz, box, max);
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
    if (dead) this.host.onKilled(e.kind);
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
          if (hit.entity) this.damage(hit.entity, pr.def, pr.def.damage, hit.head, at);
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
      if (!done && (pr.travelled > pr.def.range || pr.y < this.host.player.y - 60)) {
        pr.mesh.removeFromParent();
        done = true;
      }
      if (done) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const [rx, rz] = this.host.toRender(pr.x, pr.z);
      // The tracer drifts from the muzzle onto the true path over the first metres.
      const blend = Math.min(1, pr.travelled / 6);
      const target = new THREE.Vector3(rx, pr.y, rz);
      pr.mesh.position.lerp(target, pr.def.kind === 'thrown' ? 1 : 0.35 + 0.65 * blend);
      pr.mesh.lookAt(pr.mesh.position.x + pr.vx, pr.mesh.position.y + pr.vy, pr.mesh.position.z + pr.vz);
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

  private spark(x: number, y: number, z: number, color: number): void {
    const mesh = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    this.host.fx.add(mesh);
    this.sparks.push({ mesh, t: 0.25, x, y, z });
  }

  private updateFx(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t -= dt;
      const [rx, rz] = this.host.toRender(s.x, s.z);
      s.mesh.position.set(rx, s.y, rz);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.t * 4);
      s.mesh.scale.setScalar(1 + (0.25 - s.t) * 6);
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
