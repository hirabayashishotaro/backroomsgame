/**
 * Keyboard, mouse and gamepad input with rebindable actions (SPEC §10.1).
 * Codes: KeyboardEvent.code, 'Mouse0..4', 'WheelUp' / 'WheelDown'.
 * Gamepad: standard mapping, polled each frame.
 */
import type { Action, Settings } from './settings';
import { MouseSpikeFilter } from './mouseFilter';

export type Capture = { kind: 'key'; code: string } | { kind: 'pad'; button: number };

export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  private spikeFilter = new MouseSpikeFilter();
  private capture: ((c: Capture) => void) | null = null;
  // Gamepad state
  private padDown = new Set<number>();
  private padPressed = new Set<number>();
  /** Left stick (move) and right stick (look), after dead zone. */
  padMove = { x: 0, y: 0 };
  padLook = { x: 0, y: 0 };
  padConnected = false;

  constructor(private target: HTMLElement, private getSettings: () => Settings) {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        this.finishCapture({ kind: 'key', code: e.code });
        return;
      }
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (this.capture) {
        e.preventDefault();
        this.finishCapture({ kind: 'key', code });
        return;
      }
      if (!this.down.has(code)) this.pressedThisFrame.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
    window.addEventListener('contextmenu', (e) => {
      if (this.locked || this.capture) e.preventDefault();
    });
    window.addEventListener(
      'wheel',
      (e) => {
        const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
        if (this.capture) {
          this.finishCapture({ kind: 'key', code });
          return;
        }
        if (this.locked) {
          this.wheel += Math.sign(e.deltaY);
          this.pressedThisFrame.add(code);
        }
      },
      { passive: true },
    );
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

  /** Wait for the next key / mouse button / wheel / gamepad button (rebinding). */
  captureNext(cb: (c: Capture) => void): void {
    this.capture = cb;
  }
  cancelCapture(): void {
    this.capture = null;
  }
  private finishCapture(c: Capture): void {
    const cb = this.capture;
    this.capture = null;
    cb?.(c);
  }

  requestLock(): void {
    if (this.locked || !this.target.requestPointerLock) return;
    // Raw (unaccelerated) input avoids OS cursor re-centring jumps where supported.
    try {
      const p = (this.target.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void).call(this.target, {
        unadjustedMovement: true,
      });
      if (p && typeof p.catch === 'function') p.catch(() => this.target.requestPointerLock());
    } catch {
      this.target.requestPointerLock();
    }
  }

  /** Poll gamepads; call once per frame before reading input. */
  pollGamepad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected) ?? null;
    this.padConnected = !!pad;
    this.padPressed.clear();
    if (!pad) {
      this.padDown.clear();
      this.padMove = { x: 0, y: 0 };
      this.padLook = { x: 0, y: 0 };
      return;
    }
    const dz = this.getSettings().padDeadzone;
    const stick = (x: number, y: number) => {
      const m = Math.hypot(x, y);
      if (m < dz) return { x: 0, y: 0 };
      const k = (m - dz) / (1 - dz) / m;
      return { x: x * k, y: y * k };
    };
    this.padMove = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    this.padLook = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    pad.buttons.forEach((b, i) => {
      const pressed = b.pressed || b.value > 0.5;
      if (pressed && !this.padDown.has(i)) {
        if (this.capture) {
          this.finishCapture({ kind: 'pad', button: i });
          return;
        }
        this.padPressed.add(i);
      }
      if (pressed) this.padDown.add(i);
      else this.padDown.delete(i);
    });
  }

  isDown(action: Action): boolean {
    const s = this.getSettings();
    return s.bindings[action].some((c) => this.down.has(c)) || (s.padBindings[action] ?? []).some((b) => this.padDown.has(b));
  }

  wasPressed(action: Action): boolean {
    const s = this.getSettings();
    return (
      s.bindings[action].some((c) => this.pressedThisFrame.has(c)) || (s.padBindings[action] ?? []).some((b) => this.padPressed.has(b))
    );
  }

  /** Call at end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

/** Human-readable name of an input code. */
export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: '左Shift',
    ShiftRight: '右Shift',
    ControlLeft: '左Ctrl',
    ControlRight: '右Ctrl',
    AltLeft: '左Alt',
    AltRight: '右Alt',
    Escape: 'Esc',
    Tab: 'Tab',
    Enter: 'Enter',
    Backspace: 'BackSpace',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Mouse0: '左クリック',
    Mouse1: 'ホイールクリック',
    Mouse2: '右クリック',
    Mouse3: 'マウス4',
    Mouse4: 'マウス5',
    WheelUp: 'ホイール上',
    WheelDown: 'ホイール下',
  };
  return map[code] ?? code;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', '十字↑', '十字↓', '十字←', '十字→', 'Home'];
export function padLabel(i: number): string {
  return PAD_NAMES[i] ?? `ボタン${i}`;
}
