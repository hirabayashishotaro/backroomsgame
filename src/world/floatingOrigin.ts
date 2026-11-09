/**
 * Floating origin (SPEC §3.3).
 * World (logical) coordinates are JS doubles. The render origin is kept as an
 * integer multiple of the chunk size; when the player strays more than
 * `threshold` metres from it, the origin jumps to the player's chunk.
 */
export class FloatingOrigin {
  offsetX = 0;
  offsetZ = 0;
  constructor(public chunkSize: number, public threshold = 1000) {}

  /** Returns true if the origin moved (callers must re-position scene objects). */
  update(worldX: number, worldZ: number): boolean {
    const rx = worldX - this.offsetX;
    const rz = worldZ - this.offsetZ;
    if (Math.abs(rx) < this.threshold && Math.abs(rz) < this.threshold) return false;
    this.offsetX = Math.floor(worldX / this.chunkSize) * this.chunkSize;
    this.offsetZ = Math.floor(worldZ / this.chunkSize) * this.chunkSize;
    return true;
  }

  reset(chunkSize: number): void {
    this.chunkSize = chunkSize;
    this.offsetX = 0;
    this.offsetZ = 0;
  }

  toRenderX(x: number): number {
    return x - this.offsetX;
  }
  toRenderZ(z: number): number {
    return z - this.offsetZ;
  }
}
