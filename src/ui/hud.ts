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
.hud-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.hud-cross i { position: absolute; background: var(--xc, #fff); box-shadow: 0 0 0 1px rgba(0,0,0,0.7), 0 0 3px rgba(0,0,0,0.8); }
.hud-cross .ring { background: none; border: 1.5px solid var(--xc, #fff); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.55); }
.hud-cross .dot { width: 3px; height: 3px; left: -1.5px; top: -1.5px; border-radius: 50%; }
.hud-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; transition: opacity 0.12s; }
.hud-hit i { position: absolute; width: 10px; height: 2px; background: #fff; box-shadow: 0 0 2px #000; }
.hud-ammo { position: absolute; right: 22px; bottom: 96px; text-align: right; font-variant-numeric: tabular-nums; }
.hud-ammo .n { font-size: 34px; font-weight: 300; letter-spacing: 0.04em; }
.hud-ammo .r { font-size: 16px; opacity: 0.7; }
.hud-ammo .w { font-size: 12px; opacity: 0.7; letter-spacing: 0.15em; }
.hud-scare { position: fixed; inset: 0; z-index: 27; pointer-events: none; opacity: 0; display: flex; align-items: center; justify-content: center; }
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
.hud-objective { position: absolute; left: 20px; top: 16px; font-size: 13px; opacity: 0.8; letter-spacing: 0.05em; }
.hud-credits { position: fixed; inset: 0; z-index: 35; display: none; overflow: hidden; pointer-events: none;
  background: linear-gradient(rgba(0,0,0,0.0), rgba(0,0,0,0.75) 30%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0)); color: #f4ecd0; }
.hud-credits div { position: absolute; left: 0; right: 0; top: 100%; text-align: center; line-height: 2.4; font-size: 17px;
  letter-spacing: 0.12em; white-space: pre-line; animation: credits-roll 26s linear forwards; }
@keyframes credits-roll { to { transform: translateY(-260%); } }
.hud-subs { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 21; pointer-events: none;
  font-size: 15px; background: rgba(0,0,0,0.55); padding: 3px 12px; border-radius: 3px; color: #f4ecd0; transition: opacity 0.4s; opacity: 0; }
.hud-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%); opacity: 0.45; }
.hud-hurt { position: fixed; inset: 0; pointer-events: none; z-index: 11;
  background: radial-gradient(ellipse at center, rgba(120,0,0,0) 50%, rgba(120,0,0,0.55) 100%); opacity: 0; }
`;

/** Mojibake: replace a fraction of characters with garbled ones and stack combining marks. */
const MOJI = '縺繧譁蟄怜喧縺代€ｱ鬮倥＠縺ｯ繝ｬ繝吶Ν蜷榊燕驕主悉竊鍋ｴ逍ｲ譛ｪ遏･□■◆¿ÿØ¤§¶';
const MARKS = ['\u0336', '\u0337', '\u0338', '\u0334', '\u0315', '\u0322', '\u0327', '\u0361', '\u0489'];
export function garble(s: string, amount: number): string {
  let out = '';
  for (const ch of s) {
    const r = Math.random();
    if (r < amount * 0.6) out += MOJI[Math.floor(Math.random() * MOJI.length)];
    else out += ch;
    if (Math.random() < amount * 0.5) out += MARKS[Math.floor(Math.random() * MARKS.length)];
  }
  return out;
}

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
  private cross!: HTMLDivElement;
  private hit!: HTMLDivElement;
  private ammo!: HTMLDivElement;
  private hitT = 0;
  private scare!: HTMLDivElement;
  private scareT = 0;
  private subs: HTMLDivElement;
  private objective: HTMLDivElement;
  private credits: HTMLDivElement;
  private subTimer = 0;
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
    this.cross = this.div('hud-cross');
    for (let i = 0; i < 6; i++) this.cross.appendChild(document.createElement('i'));
    (this.cross.children[4] as HTMLElement).className = 'dot';
    (this.cross.children[5] as HTMLElement).className = 'ring';
    this.hit = this.div('hud-hit');
    for (let i = 0; i < 4; i++) {
      const l = document.createElement('i');
      const a = 45 + i * 90;
      l.style.transform = `rotate(${a}deg) translateX(7px)`;
      l.style.transformOrigin = '0 50%';
      this.hit.appendChild(l);
    }
    this.ammo = this.div('hud-ammo');
    this.root.append(bars, slotRow, this.held, this.msg, this.prompt, this.hint, this.cross, this.hit, this.ammo);

    this.title = this.div('hud-title');
    this.fade = this.div('hud-fade');
    this.deadOverlay = this.div('hud-overlay');
    this.subs = this.div('hud-subs');
    this.objective = this.div('hud-objective');
    this.root.appendChild(this.objective);
    this.credits = this.div('hud-credits');
    this.scare = this.div('hud-scare');
    parent.append(this.scare, vignette, this.hurt, this.root, this.title, this.fade, this.deadOverlay, this.subs, this.credits);
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

  /** HUD size (SPEC §10.4). Scales the bars and item bar around their corners. */
  setScale(k: number): void {
    const bars = this.root.querySelector('.hud-bars') as HTMLElement;
    const slots = this.root.querySelector('.hud-slots') as HTMLElement;
    bars.style.transformOrigin = 'left bottom';
    bars.style.transform = `scale(${k})`;
    slots.style.transform = `translateX(-50%) scale(${k})`;
    slots.style.transformOrigin = 'center bottom';
    this.held.style.bottom = `${Math.round(26 + 66 * k)}px`;
  }

  /**
   * Reticle: four lines whose gap follows the current spread (pixels), an
   * optional centre dot. Hidden for melee or empty hands.
   */
  setCrosshair(gapPx: number, visible: boolean, size: number, color: string, dot: boolean, ads: number): void {
    this.cross.style.display = visible ? '' : 'none';
    if (!visible) return;
    this.cross.style.setProperty('--xc', { white: '#ffffff', green: '#5cff7a', yellow: '#ffe25c', cyan: '#5cf0ff', red: '#ff5c5c' }[color] ?? '#fff');
    // Aiming down sights: the reticle stays fully visible, gets a ring and a dot.
    const len = 7 * size * (1 - ads * 0.25);
    const th = Math.max(1.5, 2 * size);
    const g = gapPx + 3 * size;
    const lines = this.cross.children;
    const set = (el: Element, x: number, y: number, w: number, h: number, op = 1) =>
      Object.assign((el as HTMLElement).style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, opacity: String(op) });
    set(lines[0], -th / 2, -g - len, th, len);
    set(lines[1], -th / 2, g, th, len);
    set(lines[2], -g - len, -th / 2, len, th);
    set(lines[3], g, -th / 2, len, th);
    const dotOn = dot || ads > 0.3;
    const ds = 3 + ads * 1.5 * size;
    (lines[4] as HTMLElement).style.display = dotOn ? '' : 'none';
    if (dotOn) set(lines[4], -ds / 2, -ds / 2, ds, ds);
    const ring = lines[5] as HTMLElement;
    ring.style.display = ads > 0.05 ? '' : 'none';
    if (ads > 0.05) {
      const rr = g + len + 4 * size;
      set(ring, -rr, -rr, rr * 2, rr * 2, Math.min(1, ads * 1.4));
      ring.style.boxSizing = 'border-box';
    }
  }

  /** Hit marker: white = body, red = head, larger = kill. */
  hitMarker(head: boolean, kill: boolean): void {
    this.hitT = kill ? 0.45 : 0.22;
    this.hit.style.opacity = '1';
    for (const l of [...this.hit.children]) (l as HTMLElement).style.background = head || kill ? '#ff3a3a' : '#ffffff';
    this.hit.style.transform = `scale(${kill ? 1.6 : 1})`;
  }

  /** Ammo: loaded / reserve and weapon name (null hides). */
  setAmmo(name: string | null, loaded: string, reserve: string, reloading: boolean): void {
    this.ammo.style.display = name ? '' : 'none';
    if (!name) return;
    this.ammo.innerHTML = '';
    const w = document.createElement('div');
    w.className = 'w';
    w.textContent = reloading ? t('msg.reload') : name;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = loaded;
    const r = document.createElement('span');
    r.className = 'r';
    r.textContent = reserve ? ' / ' + reserve : '';
    this.ammo.append(w, n, r);
  }

  /** Jump scare overlay: a face rushing at the screen, then a red fade. */
  jumpscare(strength: 'off' | 'mild' | 'full', color: string): void {
    if (strength === 'off') {
      this.scareT = 0.35;
      this.scare.style.background = 'rgba(120,0,0,0.5)';
      this.scare.innerHTML = '';
      return;
    }
    this.scareT = strength === 'full' ? 1.1 : 0.6;
    this.scare.style.background = strength === 'full' ? '#000' : 'rgba(40,0,0,0.75)';
    this.scare.innerHTML = '';
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    // An abstract face: pale oval, two black eyes, an over-wide mouth.
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(128, 128, 80, 104, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#000';
    for (const x of [96, 160]) {
      g.beginPath();
      g.ellipse(x, 104, 16, 24, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(128, 178, 50, 14, 0, 0, Math.PI * 2);
    g.fill();
    c.style.width = strength === 'full' ? '90vmin' : '55vmin';
    c.style.filter = 'blur(1px) contrast(1.4)';
    this.scare.appendChild(c);
  }

  /** Escape-mode objective line (empty string hides it). */
  setObjective(text: string): void {
    this.objective.textContent = text;
  }

  /** Scrolling staff roll for the ending (SPEC §12). */
  showCredits(text: string): void {
    this.credits.innerHTML = '';
    const d = document.createElement('div');
    d.textContent = text;
    this.credits.appendChild(d);
    this.credits.style.display = 'block';
    this.rootDisplay = this.root.style.display;
    this.root.style.display = 'none';
  }

  hideCredits(): void {
    if (this.credits.style.display === 'none') return;
    this.credits.style.display = 'none';
    this.root.style.display = this.rootDisplay;
  }
  private rootDisplay = '';

  /** Subtitle for sounds (SPEC §11 字幕). */
  subtitle(text: string, seconds = 3): void {
    this.subs.textContent = text;
    this.subs.style.opacity = '1';
    this.subTimer = seconds;
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

  /** Big level title that fades in, holds, then slowly fades out. Bug levels garble it. */
  showTitle(level: string, name: string, threat: number, glitch = false): void {
    this.title.innerHTML = '';
    const a = this.div('lv');
    const b = this.div('nm');
    const c = this.div('cls');
    this.title.append(a, b, c);
    this.titleTime = 0;
    this.glitchText = glitch ? [level, name, t('title.threat', { n: threat })] : null;
    a.textContent = glitch ? garble(level, 0.5) : level;
    b.textContent = glitch ? garble(name, 0.6) : name;
    c.textContent = glitch ? garble(t('title.threat', { n: threat }), 0.8) : t('title.threat', { n: threat });
  }
  private glitchText: string[] | null = null;
  private glitchTick = 0;

  /** Large banner using the title-card style (journal milestones etc.). */
  showBanner(big: string, sub: string): void {
    this.title.innerHTML = '';
    const a = this.div('lv');
    a.style.fontSize = 'clamp(30px, 5vw, 64px)';
    a.textContent = big;
    const b = this.div('nm');
    b.textContent = sub;
    this.title.append(a, b);
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

    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.hit.style.opacity = '0';
    }
    if (this.scareT > 0) {
      this.scareT -= dt;
      this.scare.style.opacity = String(Math.max(0, Math.min(1, this.scareT * 3)));
      const img = this.scare.firstChild as HTMLElement | null;
      if (img) img.style.transform = `scale(${1 + (1 - this.scareT) * 0.4}) translate(${(Math.random() - 0.5) * 12}px, ${(Math.random() - 0.5) * 12}px)`;
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.subs.style.opacity = '0';
    }
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.style.opacity = '0';
    }

    // Garbled titles keep re-garbling while they are visible.
    if (this.glitchText && this.titleTime >= 0) {
      this.glitchTick += dt;
      if (this.glitchTick > 0.12) {
        this.glitchTick = 0;
        const els = this.title.children;
        this.glitchText.forEach((txt, i) => ((els[i] as HTMLElement).textContent = garble(txt, 0.35 + Math.random() * 0.5)));
        this.title.style.filter = Math.random() < 0.3 ? `hue-rotate(${Math.floor(Math.random() * 360)}deg)` : '';
        this.title.style.translate = `${(Math.random() - 0.5) * 12}px ${(Math.random() - 0.5) * 6}px`;
      }
    } else if (this.title.style.filter) {
      this.title.style.filter = '';
      this.title.style.translate = '';
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
