/** First-person movement with collision, stepping, jumping and falling (renderer-independent). */
import { ceilingHeight, groundHeight, resolveCylinder, type FloorRect, type WBox } from '../world/collision';

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  /** Exact speed (m/s) instead of walk/run/crouch (used by entities). */
  speed?: number;
}

export interface WorldQuery {
  boxes: (x: number, z: number) => WBox[];
  floors: (x: number, z: number) => FloorRect[];
  /** Smooth terrain height at a point (null = none there). */
  terrain?: (x: number, z: number) => number | null;
}

/** Steepest walkable terrain slope (rise / run): about 47 degrees. */
export const MAX_SLOPE = 1.05;

export const PLAYER_RADIUS = 0.3;
export const BODY_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.65;
export const CROUCH_EYE = 1.0;
export const STEP_HEIGHT = 0.45;
export const JUMP_SPEED = 6.0; // ~1.1m jump
export const GRAVITY = 16;
const WALK = 3.2;
const RUN = 6.0;
const CROUCH = 1.6;

export class PlayerController {
  x = 0;
  y = 0;
  z = 0;
  vy = 0;
  yaw = 0; // radians, 0 = facing -Z
  pitch = 0;
  eye = EYE_HEIGHT;
  grounded = true;
  /** Vertical speed at the last landing (negative = downward), consumed by the game. */
  landingSpeed = 0;
  /** Horizontal distance walked in the current level (for walk exits). */
  distanceWalked = 0;
  bobPhase = 0;
  speed = 0;

  get dirX(): number {
    return -Math.sin(this.yaw);
  }
  get dirZ(): number {
    return -Math.cos(this.yaw);
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy));
  }

  step(dt: number, input: MoveInput, world: WorldQuery): void {
    const targetEye = input.crouch ? CROUCH_EYE : EYE_HEIGHT;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    let fx = input.forward;
    let sx = input.strafe;
    const len = Math.hypot(fx, sx);
    if (len > 1) {
      fx /= len;
      sx /= len;
    }
    const spd = input.speed ?? (input.crouch ? CROUCH : input.sprint && fx > 0 ? RUN : WALK);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const mx = (-sin * fx + cos * sx) * spd * dt;
    const mz = (-cos * fx - sin * sx) * spd * dt;

    // Horizontal: sub-step so fast movement never tunnels through thin walls.
    const dist = Math.hypot(mx, mz);
    const steps = Math.max(1, Math.ceil(dist / 0.1));
    const px = this.x;
    const pz = this.z;
    const step = this.grounded ? STEP_HEIGHT : 0.05;
    const subLen = dist / steps;
    // Height we are walking from on smooth terrain (updated as we climb).
    let ref = this.y;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + mx / steps;
      const nz = this.z + mz / steps;
      const r = resolveCylinder(nx, this.y, nz, PLAYER_RADIUS, BODY_HEIGHT, world.boxes(nx, nz), step);
      if (world.terrain) {
        // Terrain too steep to climb acts like a wall; slide along it if possible.
        const lim = ref + (this.grounded ? Math.max(0.04, subLen * MAX_SLOPE) : 0.03);
        const ok = (x: number, z: number) => {
          const th = world.terrain!(x, z);
          return th === null || th <= lim;
        };
        if (ok(r.x, r.z)) {
          this.x = r.x;
          this.z = r.z;
        } else if (ok(r.x, this.z)) this.x = r.x;
        else if (ok(this.x, r.z)) this.z = r.z;
        const th = world.terrain(this.x, this.z);
        if (this.grounded && th !== null && th > ref) ref = th;
        continue;
      }
      this.x = r.x;
      this.z = r.z;
    }
    const moved = Math.hypot(this.x - px, this.z - pz);
    this.distanceWalked += moved;
    this.speed = dt > 0 ? moved / dt : 0;
    if (this.grounded) this.bobPhase += moved * 2.2;

    // Vertical
    const boxes = world.boxes(this.x, this.z);
    const terrainH = world.terrain ? world.terrain(this.x, this.z) : null;
    const withTerrain = (g: number, maxY: number) => (terrainH !== null && terrainH <= maxY && terrainH > g ? terrainH : g);
    const ground = withTerrain(groundHeight(this.x, this.z, PLAYER_RADIUS * 0.8, this.y + STEP_HEIGHT, world.floors(this.x, this.z), boxes), this.y + STEP_HEIGHT);
    if (this.grounded && input.jump) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }
    if (this.grounded) {
      if (ground >= this.y - STEP_HEIGHT && ground > -Infinity) {
        this.y = ground; // follow steps up and down
        this.vy = 0;
      } else {
        this.grounded = false; // walked off an edge
      }
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      let ny = this.y + this.vy * dt;
      if (this.vy > 0) {
        const ceil = ceilingHeight(this.x, this.z, PLAYER_RADIUS * 0.9, this.y + BODY_HEIGHT - 0.05, boxes);
        if (ny + BODY_HEIGHT > ceil) {
          ny = ceil - BODY_HEIGHT;
          this.vy = 0;
        }
      }
      const top = Math.max(this.y, ny) + 0.01;
      const g = withTerrain(groundHeight(this.x, this.z, PLAYER_RADIUS * 0.8, top, world.floors(this.x, this.z), boxes), top + 0.05);
      if (this.vy <= 0 && ny <= g) {
        this.landingSpeed = this.vy;
        this.y = g;
        this.vy = 0;
        this.grounded = true;
      } else this.y = ny;
    }
  }
}
