/** First-person movement with collision (renderer-independent). */
import { resolveCylinder, type WBox } from '../world/collision';

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  sprint: boolean;
  crouch: boolean;
}

export const PLAYER_RADIUS = 0.3;
export const EYE_HEIGHT = 1.65;
export const CROUCH_EYE = 1.0;
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
  /** Horizontal distance walked in the current level (for walk exits later). */
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

  step(dt: number, input: MoveInput, boxesNear: (x: number, z: number) => Iterable<WBox>, floorY = 0): void {
    const targetEye = input.crouch ? CROUCH_EYE : EYE_HEIGHT;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    let fx = input.forward;
    let sx = input.strafe;
    const len = Math.hypot(fx, sx);
    if (len > 1) {
      fx /= len;
      sx /= len;
    }
    const spd = input.crouch ? CROUCH : input.sprint && fx > 0 ? RUN : WALK;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const mx = (-sin * fx + cos * sx) * spd * dt;
    const mz = (-cos * fx - sin * sx) * spd * dt;

    // Sub-step so fast movement never tunnels through thin walls.
    const dist = Math.hypot(mx, mz);
    const steps = Math.max(1, Math.ceil(dist / 0.1));
    const px = this.x;
    const pz = this.z;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + mx / steps;
      const nz = this.z + mz / steps;
      const r = resolveCylinder(nx, this.y, nz, PLAYER_RADIUS, 1.8, boxesNear(nx, nz));
      this.x = r.x;
      this.z = r.z;
    }
    const moved = Math.hypot(this.x - px, this.z - pz);
    this.distanceWalked += moved;
    this.speed = dt > 0 ? moved / dt : 0;
    this.bobPhase += moved * 2.2;

    // Simple gravity against a flat floor (groundless levels come later).
    this.vy -= 20 * dt;
    this.y += this.vy * dt;
    if (this.y <= floorY) {
      this.y = floorY;
      this.vy = 0;
    }
  }
}
