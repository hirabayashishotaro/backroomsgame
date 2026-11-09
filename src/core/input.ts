import type { Action, Settings } from './settings';
import { MouseSpikeFilter } from './mouseFilter';

/** Keyboard + mouse input with rebindable actions and pointer lock. */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  private spikeFilter = new MouseSpikeFilter();

  constructor(private target: HTMLElement, private getSettings: () => Settings) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (!this.down.has(code)) this.pressedThisFrame.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const m = this.spikeFilter.filter(e.movementX, e.movementY);
      if (!m) return;
      this.mouseDX += m.dx;
      this.mouseDY += m.dy;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (this.locked) this.spikeFilter.reset();
    });
  }

  requestLock(): void {
    if (this.locked || !this.target.requestPointerLock) return;
    // Raw (unaccelerated) input avoids OS cursor re-centring jumps where supported.
    try {
      const p = (this.target.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void)
        .call(this.target, { unadjustedMovement: true });
      if (p && typeof p.catch === 'function') p.catch(() => this.target.requestPointerLock());
    } catch {
      this.target.requestPointerLock();
    }
  }

  isDown(action: Action): boolean {
    return this.getSettings().bindings[action].some((c) => this.down.has(c));
  }

  wasPressed(action: Action): boolean {
    return this.getSettings().bindings[action].some((c) => this.pressedThisFrame.has(c));
  }

  /** Call at end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
