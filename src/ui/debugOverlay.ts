/** `?debug=1` overlay: level, chunk, FPS, loaded chunks (SPEC §5.3). */
export class DebugOverlay {
  private el: HTMLDivElement;
  private frames = 0;
  private acc = 0;
  private fps = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      padding: '6px 8px',
      background: 'rgba(0,0,0,0.55)',
      color: '#cfe',
      font: '12px/1.4 Consolas, monospace',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      zIndex: '50',
    } as CSSStyleDeclaration);
    parent.appendChild(this.el);
  }

  update(dt: number, info: Record<string, string | number>): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
      this.el.textContent =
        `FPS ${this.fps.toFixed(0)}\n` +
        Object.entries(info)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
    }
  }
}
