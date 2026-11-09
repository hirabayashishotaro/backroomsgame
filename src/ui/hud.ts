/** HUD (SPEC §17): health + dash bars, 4-slot item bar, level title card, prompts, fades. */
import { ITEMS } from '../items/itemDefs';
import { SLOTS, type Inventory } from '../player/inventory';
import type { Stats } from '../player/stats';
import { itemIcon } from '../proc-tex/icons';
import { t } from './i18n';

const CSS = `
.hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; color: #efe6bf; text-shadow: 0 1px 2px #000; }
.hud-bars { position: absolute; left: 20px; bottom: 20px; width: 240px; }
.hud-bar-row { margin: 6px 0; }
.hud-bar-row span { font-size: 12px; letter-spacing: 0.15em; opacity: 0.85; }
.hud-bar { height: 9px; margin-top: 3px; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.18); }
.hud-bar > i { display: block; height: 100%; transition: width 0.15s linear; }
.hud-bar.low > i { animation: hudpulse 1s ease-in-out infinite; }
@keyframes hudpulse { 50% { opacity: 0.4; } }
.hud-slots { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 6px; }
.hud-slot { width: 62px; height: 62px; background: rgba(10,9,4,0.6); border: 2px solid rgba(255,240,180,0.15);
  border-radius: 6px; position: relative; display: flex; align-items: center; justify-content: center; }
.hud-slot.sel { border-color: #f3dc7a; box-shadow: 0 0 10px rgba(243,220,122,0.45); }
.hud-slot .k { position: absolute; left: 5px; top: 2px; font-size: 11px; opacity: 0.55; }
.hud-slot img { width: 52px; height: 52px; image-rendering: auto; }
.hud-held { position: absolute; left: 50%; bottom: 90px; transform: translateX(-50%); font-size: 14px; opacity: 0.9; }
.hud-msg { position: absolute; left: 50%; top: 64%; transform: translateX(-50%); text-align: center; transition: opacity 0.5s;
  font-size: 15px; }
.hud-prompt { position: absolute; left: 50%; top: 55%; transform: translateX(-50%); font-size: 15px;
  background: rgba(0,0,0,0.45); padding: 4px 12px; border-radius: 4px; }
.hud-cross { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%;
  background: rgba(255,250,220,0.6); }
.hud-hint { position: absolute; right: 20px; bottom: 20px; text-align: right; opacity: 0.6; line-height: 1.8; font-size: 12px;
  white-space: pre-line; transition: opacity 2s; }
.hud-title { position: fixed; inset: 0; z-index: 25; pointer-events: none; display: flex; flex-direction: column;
  align-items: center; justify-content: center; opacity: 0; color: #f4ecd0; text-shadow: 0 0 24px rgba(0,0,0,0.9), 0 2px 4px #000; }
.hud-title .lv { font-size: clamp(48px, 9vw, 120px); letter-spacing: 0.18em; font-weight: 300; line-height: 1.1;
  font-family: "Segoe UI", "Yu Gothic UI", sans-serif; }
.hud-title .nm { margin-top: 10px; font-size: clamp(16px, 2.2vw, 26px); letter-spacing: 0.35em; opacity: 0.85; }
.hud-title .cls { margin-top: 8px; font-size: 13px; letter-spacing: 0.3em; opacity: 0.55; }
.hud-overlay { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center;
  flex-direction: column; background: rgba(0,0,0,0.92); color: #efe6bf; font-size: 24px; letter-spacing: 0.15em; }
.hud-overlay small { margin-top: 12px; font-size: 13px; opacity: 0.6; letter-spacing: 0.05em; }
.hud-fade { position: fixed; inset: 0; z-index: 28; pointer-events: none; background: #000; opacity: 0; }
.hud-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%); opacity: 0.45; }
.hud-hurt { position: fixed; inset: 0; pointer-events: none; z-index: 11;
  background: radial-gradient(ellipse at center, rgba(120,0,0,0) 50%, rgba(120,0,0,0.55) 100%); opacity: 0; }
`;

export class Hud {
  readonly root: HTMLDivElement;
  private healthBar: HTMLElement;
  private dashBar: HTMLElement;
  private slots: HTMLDivElement[] = [];
  private held: HTMLDivElement;
  private msg: HTMLDivElement;
  private prompt: HTMLDivElement;
  private hint: HTMLDivElement;
  private title: HTMLDivElement;
  private fade: HTMLDivElement;
  private hurt: HTMLDivElement;
  private deadOverlay: HTMLDivElement;
  private msgTimer = 0;
  private titleTime = -1;
  private lastInvKey = '';
  /** Current fade opacity target and speed (per second). */
  private fadeValue = 0;
  private fadeTarget = 0;
  private fadeSpeed = 2;
  private fadeColor = '#000';

  constructor(parent: HTMLElement, private inv: Inventory) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const vignette = this.div('hud-vignette');
    this.hurt = this.div('hud-hurt');
    this.root = this.div('hud');

    const bars = this.div('hud-bars');
    const mkBar = (label: string, color: string) => {
      const row = this.div('hud-bar-row');
      const l = document.createElement('span');
      l.textContent = label;
      const bar = this.div('hud-bar');
      const fill = document.createElement('i');
      fill.style.background = color;
      bar.appendChild(fill);
      row.append(l, bar);
      bars.appendChild(row);
      return bar;
    };
    this.healthBar = mkBar(t('stat.health'), 'linear-gradient(90deg,#b8323a,#e0565c)');
    this.dashBar = mkBar(t('stat.dash'), 'linear-gradient(90deg,#c9b23a,#f0dc6a)');

    const slotRow = this.div('hud-slots');
    for (let i = 0; i < SLOTS; i++) {
      const s = this.div('hud-slot');
      slotRow.appendChild(s);
      this.slots.push(s);
    }
    this.held = this.div('hud-held');
    this.msg = this.div('hud-msg');
    this.prompt = this.div('hud-prompt');
    this.prompt.style.display = 'none';
    this.hint = this.div('hud-hint');
    this.hint.textContent = t('hud.hint');
    this.root.append(bars, slotRow, this.held, this.msg, this.prompt, this.hint, this.div('hud-cross'));

    this.title = this.div('hud-title');
    this.fade = this.div('hud-fade');
    this.deadOverlay = this.div('hud-overlay');
    parent.append(vignette, this.hurt, this.root, this.title, this.fade, this.deadOverlay);
    setTimeout(() => (this.hint.style.opacity = '0'), 45000);
  }

  private div(cls: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    return d;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  message(text: string, seconds = 2.5): void {
    this.msg.textContent = text;
    this.msg.style.opacity = '1';
    this.msgTimer = seconds;
  }

  setPrompt(text: string | null): void {
    if (text) {
      this.prompt.textContent = text;
      this.prompt.style.display = '';
    } else this.prompt.style.display = 'none';
  }

  /** Big level title that fades in, holds, then slowly fades out. */
  showTitle(level: string, name: string, threat: number): void {
    this.title.innerHTML = '';
    const a = this.div('lv');
    a.textContent = level;
    const b = this.div('nm');
    b.textContent = name;
    const c = this.div('cls');
    c.textContent = t('title.threat', { n: threat });
    this.title.append(a, b, c);
    this.titleTime = 0;
  }

  /** Fade the screen to `opacity` (0..1) at `speed` per second. */
  fadeTo(opacity: number, speed = 2, color = '#000'): void {
    this.fadeTarget = opacity;
    this.fadeSpeed = speed;
    if (color !== this.fadeColor) {
      this.fadeColor = color;
      this.fade.style.background = color;
    }
  }

  get fadeDone(): boolean {
    return Math.abs(this.fadeValue - this.fadeTarget) < 0.01;
  }

  update(dt: number, stats: Stats): void {
    (this.healthBar.firstChild as HTMLElement).style.width = stats.health.toFixed(1) + '%';
    (this.dashBar.firstChild as HTMLElement).style.width = stats.stamina.toFixed(1) + '%';
    this.healthBar.classList.toggle('low', stats.health < 25);

    const key = this.inv.slots.join(',');
    if (key !== this.lastInvKey) {
      this.lastInvKey = key;
      this.slots.forEach((el, i) => {
        el.innerHTML = '';
        const k = document.createElement('span');
        k.className = 'k';
        k.textContent = String(i + 1);
        el.appendChild(k);
        const id = this.inv.slots[i];
        if (id) {
          const img = document.createElement('img');
          img.src = itemIcon(id, 104);
          img.alt = ITEMS[id].name;
          el.appendChild(img);
        }
      });
    }
    this.slots.forEach((el, i) => el.classList.toggle('sel', i === this.inv.selected));
    const h = this.inv.held;
    this.held.textContent = h ? ITEMS[h].name : '';

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.style.opacity = '0';
    }

    // Title card: 0.8s fade in, 2.2s hold, 3s fade out.
    if (this.titleTime >= 0) {
      this.titleTime += dt;
      const tt = this.titleTime;
      const o = tt < 0.8 ? tt / 0.8 : tt < 3 ? 1 : Math.max(0, 1 - (tt - 3) / 3);
      this.title.style.opacity = o.toFixed(3);
      this.title.style.transform = `scale(${1 + tt * 0.012})`;
      if (tt > 6.2) this.titleTime = -1;
    }

    // Screen fade
    if (this.fadeValue !== this.fadeTarget) {
      const step = this.fadeSpeed * dt;
      this.fadeValue =
        this.fadeValue < this.fadeTarget ? Math.min(this.fadeTarget, this.fadeValue + step) : Math.max(this.fadeTarget, this.fadeValue - step);
      this.fade.style.opacity = this.fadeValue.toFixed(3);
    }

    this.hurt.style.opacity = stats.health < 30 ? String((1 - stats.health / 30) * 0.8) : '0';
  }

  showDeath(text: string, sub: string): void {
    this.deadOverlay.innerHTML = '';
    const a = document.createElement('div');
    a.textContent = text;
    const b = document.createElement('small');
    b.textContent = sub;
    this.deadOverlay.append(a, b);
    this.deadOverlay.style.display = 'flex';
  }

  hideDeath(): void {
    this.deadOverlay.style.display = 'none';
  }
}
