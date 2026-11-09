/** Minimal start / pause menu with core settings (full settings screen is Phase 6). */
import type { Settings } from '../core/settings';
import { t } from './i18n';

export interface MenuCallbacks {
  onResume: () => void;
  onChange: (s: Settings) => void;
  onFullscreen: (on: boolean) => void;
}

export class Menu {
  readonly root: HTMLDivElement;
  private title: HTMLDivElement;
  private body: HTMLDivElement;
  private resumeBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, private settings: Settings, private cb: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'br-menu';
    const style = document.createElement('style');
    style.textContent = `
      .br-menu { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background: radial-gradient(ellipse at center, rgba(40,34,12,0.82), rgba(0,0,0,0.94)); z-index: 40; }
      .br-panel { width: min(520px, calc(100vw - 32px)); padding: 28px; color: #e9dfae; }
      .br-title { font-size: 30px; letter-spacing: 0.12em; margin-bottom: 4px; }
      .br-sub { opacity: 0.6; margin-bottom: 22px; font-size: 13px; letter-spacing: 0.2em; }
      .br-row { display: grid; grid-template-columns: 1fr 160px 56px; gap: 10px; align-items: center; margin: 8px 0; font-size: 14px; }
      .br-row input[type=range] { width: 100%; }
      .br-row input[type=number] { width: 56px; background: #1d1a0c; color: #e9dfae; border: 1px solid #5d5225; }
      .br-btn { margin-top: 20px; width: 100%; padding: 12px; font-size: 16px; background: #c8b35c; color: #1a1606;
        border: none; cursor: pointer; letter-spacing: 0.1em; }
      .br-btn:hover { background: #e2cc6e; }
      .br-hint { margin-top: 14px; font-size: 12px; opacity: 0.55; line-height: 1.6; }
      .br-credit { margin-top: 10px; font-size: 11px; opacity: 0.4; }
    `;
    document.head.appendChild(style);
    const panel = document.createElement('div');
    panel.className = 'br-panel';
    this.title = document.createElement('div');
    this.title.className = 'br-title';
    this.title.textContent = 'THE BACKROOMS: ENDLESS';
    const sub = document.createElement('div');
    sub.className = 'br-sub';
    sub.textContent = t('menu.subtitle');
    this.body = document.createElement('div');
    this.resumeBtn = document.createElement('button');
    this.resumeBtn.className = 'br-btn';
    this.resumeBtn.textContent = t('menu.start');
    this.resumeBtn.onclick = () => this.cb.onResume();
    const hint = document.createElement('div');
    hint.className = 'br-hint';
    hint.textContent = t('menu.controls');
    const credit = document.createElement('div');
    credit.className = 'br-credit';
    credit.textContent = 'Inspired by the Backrooms Wiki community (backrooms.fandom.com)';
    panel.append(this.title, sub, this.body, this.resumeBtn, hint, credit);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.buildRows();
  }

  private slider(label: string, key: keyof Settings, min: number, max: number, step: number): void {
    const row = document.createElement('label');
    row.className = 'br-row';
    const name = document.createElement('span');
    name.textContent = label;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(this.settings[key]);
    const num = document.createElement('input');
    num.type = 'number';
    num.min = range.min;
    num.max = range.max;
    num.step = range.step;
    num.value = range.value;
    const set = (v: string) => {
      let n = Number(v);
      if (!Number.isFinite(n)) return;
      n = Math.min(max, Math.max(min, n));
      (this.settings as unknown as Record<string, number>)[key] = n;
      range.value = num.value = String(n);
      this.cb.onChange(this.settings);
    };
    range.oninput = () => set(range.value);
    num.onchange = () => set(num.value);
    row.append(name, range, num);
    this.body.appendChild(row);
  }

  private toggle(label: string, key: 'invertY' | 'fullscreen' | 'showHud'): void {
    const row = document.createElement('label');
    row.className = 'br-row';
    const name = document.createElement('span');
    name.textContent = label;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.settings[key];
    box.onchange = () => {
      this.settings[key] = box.checked;
      if (key === 'fullscreen') this.cb.onFullscreen(box.checked);
      this.cb.onChange(this.settings);
    };
    row.append(name, box, document.createElement('span'));
    this.body.appendChild(row);
  }

  private select(label: string, key: 'difficulty', options: string[]): void {
    const row = document.createElement('label');
    row.className = 'br-row';
    const name = document.createElement('span');
    name.textContent = label;
    const sel = document.createElement('select');
    sel.style.cssText = 'background:#1d1a0c;color:#e9dfae;border:1px solid #5d5225;padding:3px;';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = t(key + '.' + o);
      sel.appendChild(opt);
    }
    sel.value = this.settings[key];
    sel.onchange = () => {
      (this.settings as unknown as Record<string, string>)[key] = sel.value;
      this.cb.onChange(this.settings);
    };
    row.append(name, sel, document.createElement('span'));
    this.body.appendChild(row);
  }

  private buildRows(): void {
    this.select(t('settings.difficulty'), 'difficulty', ['easy', 'normal', 'hard']);
    this.slider(t('settings.sensX'), 'sensitivityX', 0.1, 10, 0.1);
    this.slider(t('settings.sensY'), 'sensitivityY', 0.1, 10, 0.1);
    this.toggle(t('settings.invertY'), 'invertY');
    this.slider(t('settings.fov'), 'fov', 60, 110, 1);
    this.slider(t('settings.renderDistance'), 'renderDistance', 2, 6, 1);
    this.slider(t('settings.master'), 'masterVolume', 0, 1, 0.05);
    this.slider(t('settings.hum'), 'humStrength', 0, 1, 0.05);
    this.slider(t('settings.headBob'), 'headBob', 0, 1, 0.05);
    this.toggle(t('settings.fullscreen'), 'fullscreen');
    this.toggle(t('settings.showHud'), 'showHud');
  }

  show(paused: boolean): void {
    this.resumeBtn.textContent = paused ? t('menu.resume') : t('menu.start');
    this.root.style.display = 'flex';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
}
