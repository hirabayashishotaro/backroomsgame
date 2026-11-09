/**
 * Hallucinations (SPEC §9.3): harmless events that grow with low sanity.
 * Whispers, footsteps that are not yours, a figure at the edge of vision,
 * a door that is there for a moment. Timing uses a seeded RNG (not world gen).
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { AudioSystem } from './audio';

export interface HallucinationEnv {
  sanity: number;
  /** Level multiplier (Level 0 is high). */
  rate: number;
  /** Player eye position (world) and facing yaw. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Distance to the first wall along a horizontal ray, or Infinity. */
  rayWall: (x: number, z: number, dx: number, dz: number, max: number) => { t: number; nx: number; nz: number } | null;
  toRender: (x: number, z: number) => [number, number];
}

interface Active {
  obj: THREE.Object3D;
  wx: number;
  wz: number;
  ttl: number;
  vanishOnLook: boolean;
}

export class Hallucinations {
  private rng = new Rng(0xbacc);
  private cooldown = 20;
  private active: Active[] = [];
  private figureMat = new THREE.MeshBasicMaterial({ color: 0x050403 });
  private doorMat = new THREE.MeshBasicMaterial({ color: 0x2a1e12 });
  private figureGeo = new THREE.CapsuleGeometry(0.28, 1.15, 4, 8);
  private headGeo = new THREE.SphereGeometry(0.17, 10, 8);
  private doorGeo = new THREE.BoxGeometry(0.95, 2.05, 0.04);

  /** Called with 'whisper' | 'steps' | 'humDip' when a sound plays (for subtitles). */
  onSound: (kind: 'whisper' | 'steps' | 'humDip') => void = () => {};

  constructor(private root: THREE.Object3D, private audio: AudioSystem) {}

  /** Intensity 0..1 from sanity. */
  static intensity(sanity: number): number {
    return Math.max(0, Math.min(1, (65 - sanity) / 55));
  }

  update(dt: number, env: HallucinationEnv): void {
    // Expire / vanish.
    const fx = -Math.sin(env.yaw);
    const fz = -Math.cos(env.yaw);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.ttl -= dt;
      const [rx, rz] = env.toRender(a.wx, a.wz);
      a.obj.position.x = rx;
      a.obj.position.z = rz;
      let gone = a.ttl <= 0;
      if (a.vanishOnLook) {
        const dx = a.wx - env.x;
        const dz = a.wz - env.z;
        const d = Math.hypot(dx, dz) || 1;
        if ((dx * fx + dz * fz) / d > 0.94) gone = true; // looked straight at it
      }
      if (gone) {
        a.obj.removeFromParent();
        this.active.splice(i, 1);
      }
    }

    const k = Hallucinations.intensity(env.sanity) * env.rate;
    this.cooldown -= dt;
    if (k <= 0 || this.cooldown > 0) return;
    // Mean time between events: ~60s at mild, ~12s at worst.
    if (this.rng.float() > dt * (0.015 + k * 0.07)) return;
    this.cooldown = 6 + this.rng.range(0, 10) / Math.max(0.3, k);
    const roll = this.rng.float();
    const pan = this.rng.range(-1, 1);
    if (roll < 0.3) {
      this.audio.whisper(pan, 0.03 + k * 0.05);
      this.onSound('whisper');
    } else if (roll < 0.55) {
      this.audio.distantSteps(pan, 3 + this.rng.int(0, 4));
      this.onSound('steps');
    }
    else if (roll < 0.8) this.spawnFigure(env);
    else if (roll < 0.92) this.spawnDoor(env);
    else {
      this.audio.humDip(1 + this.rng.float() * 1.5);
      this.onSound('humDip');
    }
  }

  private spawnFigure(env: HallucinationEnv): void {
    // At the edge of vision, 50-75 degrees off-centre; try a few spots.
    let spot: { wx: number; wz: number } | null = null;
    let side = 1;
    for (let attempt = 0; attempt < 8 && !spot; attempt++) {
      side = this.rng.chance(0.5) ? 1 : -1;
      const a = env.yaw + side * this.rng.range(0.85, 1.35);
      const dx = -Math.sin(a);
      const dz = -Math.cos(a);
      const want = this.rng.range(7, 18);
      const hit = env.rayWall(env.x, env.z, dx, dz, want + 1);
      const dist = hit ? hit.t - 0.8 : want;
      if (dist >= 4.5) spot = { wx: env.x + dx * dist, wz: env.z + dz * dist };
    }
    if (!spot) {
      this.audio.whisper(side * 0.8, 0.05);
      return;
    }
    const { wx, wz } = spot;
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.figureGeo, this.figureMat);
    body.position.y = 0.85;
    const head = new THREE.Mesh(this.headGeo, this.figureMat);
    head.position.y = 1.62;
    g.add(body, head);
    g.position.y = env.y;
    this.root.add(g);
    this.active.push({ obj: g, wx, wz, ttl: 2.5 + this.rng.float() * 2, vanishOnLook: true });
  }

  private spawnDoor(env: HallucinationEnv): void {
    const a = env.yaw + this.rng.range(-0.5, 0.5);
    const dx = -Math.sin(a);
    const dz = -Math.cos(a);
    const hit = env.rayWall(env.x, env.z, dx, dz, 14);
    if (!hit || hit.t < 3) return;
    const door = new THREE.Mesh(this.doorGeo, this.doorMat);
    door.position.y = 1.03;
    door.rotation.y = Math.atan2(hit.nx, hit.nz);
    const g = new THREE.Group();
    g.add(door);
    const wx = env.x + dx * (hit.t - 0.03);
    const wz = env.z + dz * (hit.t - 0.03);
    this.root.add(g);
    // Vanishes after a moment or when looked at directly for too long.
    this.active.push({ obj: g, wx, wz, ttl: 1.2 + this.rng.float(), vanishOnLook: false });
  }

  clear(): void {
    for (const a of this.active) a.obj.removeFromParent();
    this.active = [];
  }
}
