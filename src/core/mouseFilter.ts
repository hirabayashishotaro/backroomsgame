/**
 * Filters bogus mouse-movement spikes under pointer lock.
 *
 * Chromium on Windows sometimes reports one huge movementX/Y when the hidden
 * cursor is re-centred (typically every few hundred pixels of motion), which
 * shows up as a sudden jerk of the camera. A real fast flick produces several
 * large events in a row, while the bug produces one isolated outlier, so an
 * isolated outlier far above the recent average is dropped.
 */
export class MouseSpikeFilter {
  private avg = 0;
  private lastWasLarge = false;
  private skipNext = true;

  /** Call when pointer lock is (re)acquired: the first event is often a jump. */
  reset(): void {
    this.avg = 0;
    this.lastWasLarge = false;
    this.skipNext = true;
  }

  /** Returns the movement to apply, or null if the event should be ignored. */
  filter(dx: number, dy: number): { dx: number; dy: number } | null {
    if (this.skipNext) {
      this.skipNext = false;
      return null;
    }
    const mag = Math.hypot(dx, dy);
    const outlier = mag > 120 && mag > this.avg * 6 + 40;
    if (outlier && !this.lastWasLarge) {
      this.lastWasLarge = true;
      return null;
    }
    this.lastWasLarge = outlier;
    this.avg = this.avg * 0.8 + mag * 0.2;
    return { dx, dy };
  }
}
