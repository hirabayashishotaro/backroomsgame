/** HUD: stat bars (bottom-left), hotbar (bottom-centre), messages, prompts, overlays. */
import { ITEMS, NOTES } from '../items/itemDefs';
import { HOTBAR, SLOTS, type Inventory } from '../player/inventory';
import type { Stats } from '../player/stats';
import { t } from './i18n';

const CSS = `
.hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; font-size: 13px; color: #efe6bf;
  text-shadow: 0 1px 2px #000; }
.hud-stats { position: absolute; left: 16px; bottom: 16px; width: 190px; }
.hud-stat { display: grid; grid-template-columns: 54px 1fr; align-items: center; gap: 6px; margin: 3px 0; }
.hud-bar { height: 6px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); }
.hud-bar > i { display: block; height: 100%; }
.hud-bar.low > i { animation: hudpulse 1.2s ease-in-out infinite; }
@keyframes hudpulse { 50% { opacity: 0.45; } }
.hud-hotbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 4px; }
.hud-slot { width: 46px; height: 46px; background: rgba(10,9,4,0.55); border: 1px solid rgba(255,240,180,0.18);
  position: relative; display: flex; align-items: center; justify-content: center; }
.hud-slot.sel { border-color: #f3dc7a; box-shadow: 0 0 6px rgba(243,220,122,0.5); }
.hud-slot .k { position: absolute; left: 3px; top: 1px; font-size: 10px; opacity: 0.5; }
.hud-slot .n { position: absolute; right: 3px; bottom: 1px; font-size: 11px; }
.hud-icon { width: 24px; height: 24px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.5); }
.hud-held { position: absolute; left: 50%; bottom: 68px; transform: translateX(-50%); font-size: 13px; opacity: 0.85; }
.hud-msg { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); text-align: center; transition: opacity 0.4s; }
.hud-prompt { position: absolute; left: 50%; top: 54%; transform: translateX(-50%); font-size: 14px;
  background: rgba(0,0,0,0.4); padding: 3px 10px; border-radius: 3px; }
.hud-cross { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%;
  background: rgba(255,250,220,0.6); }
.hud-hint { white-space: pre-line; transition: opacity 2s; position: absolute; right: 16px; bottom: 16px; text-align: right; opacity: 0.6; line-height: 1.7; font-size: 12px; }
.hud-compass { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); font-size: 15px; letter-spacing: 0.3em; }
.hud-overlay { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.72); color: #efe6bf; }
.hud-note { width: min(440px, calc(100vw - 32px)); background: #efe8d0; color: #2b261a; padding: 28px 30px; line-height: 2;
  font-size: 16px; box-shadow: 0 10px 40px #000; transform: rotate(-0.6deg); }
.hud-note small { display: block; margin-top: 14px; opacity: 0.55; font-size: 12px; }
.inv-panel { width: min(560px, calc(100vw - 32px)); }
.inv-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; margin: 8px 0 18px; }
.inv-grid .hud-slot { width: auto; aspect-ratio: 1; pointer-events: auto; cursor: pointer; }
.inv-grid .hud-slot.pick { border-color: #8fd; }
.inv-desc { min-height: 48px; font-size: 13px; opacity: 0.85; line-height: 1.6; }
.dead { flex-direction: column; background: rgba(0,0,0,0.92); font-size: 22px; letter-spacing: 0.15em; }
.dead small { margin-top: 12px; font-size: 13px; opacity: 0.6; letter-spacing: 0.05em; }
.hud-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%); opacity: 0.5; }
`;

const STAT_COLORS: Record<string, string> = {
  hydration: '#5fb3e6',
  hunger: '#d9a04a',
  stamina: '#9ad46a',
  sanity: '#c79ae8',
  battery: '#e8e07a',
};

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export class Hud {
  readonly root: HTMLDivElement;
  private bars: Record<string, HTMLElement> = {};
  private slots: HTMLDivElement[] = [];
  private held: HTMLDivElement;
  private msg: HTMLDivElement;
  private prompt: HTMLDivElement;
  private hint: HTMLDivElement;
  private compass: HTMLDivElement;
  readonly vignette: HTMLDivElement;
  private noteOverlay: HTMLDivElement;
  private invOverlay: HTMLDivElement;
  private invGrid: HTMLDivElement;
  private invDesc: HTMLDivElement;
  private deadOverlay: HTMLDivElement;
  private msgTimer = 0;
  private invPick: number | null = null;
  private lastInvKey = '';
  inventoryOpen = false;
  noteOpen = false;

  constructor(parent: HTMLElement, private inv: Inventory) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.vignette = document.createElement('div');
    this.vignette.className = 'hud-vignette';
    this.root = document.createElement('div');
    this.root.className = 'hud';

    const stats = document.createElement('div');
    stats.className = 'hud-stats';
    for (const key of ['hydration', 'hunger', 'stamina', 'sanity', 'battery']) {
      const row = document.createElement('div');
      row.className = 'hud-stat';
      const label = document.createElement('span');
      label.textContent = t('stat.' + key);
      const bar = document.createElement('div');
      bar.className = 'hud-bar';
      const fill = document.createElement('i');
      fill.style.background = STAT_COLORS[key];
      bar.appendChild(fill);
      row.append(label, bar);
      stats.appendChild(row);
      this.bars[key] = bar;
    }

    const hotbar = document.createElement('div');
    hotbar.className = 'hud-hotbar';
    for (let i = 0; i < HOTBAR; i++) {
      const s = document.createElement('div');
      s.className = 'hud-slot';
      hotbar.appendChild(s);
      this.slots.push(s);
    }
    this.held = this.div('hud-held');
    this.msg = this.div('hud-msg');
    this.prompt = this.div('hud-prompt');
    this.prompt.style.display = 'none';
    this.hint = this.div('hud-hint');
    this.hint.textContent = t('hud.hint');
    this.compass = this.div('hud-compass');
    this.compass.style.display = 'none';
    const cross = this.div('hud-cross');
    this.root.append(stats, hotbar, this.held, this.msg, this.prompt, this.hint, this.compass, cross);

    // Note reader
    this.noteOverlay = this.div('hud-overlay');
    // Inventory
    this.invOverlay = this.div('hud-overlay');
    const panel = this.div('inv-panel');
    const title = document.createElement('div');
    title.textContent = t('inv.title');
    title.style.cssText = 'font-size:18px;letter-spacing:0.15em;';
    const sub = document.createElement('div');
    sub.textContent = t('inv.help');
    sub.style.cssText = 'font-size:12px;opacity:0.6;margin-top:4px;';
    this.invGrid = this.div('inv-grid');
    this.invDesc = this.div('inv-desc');
    panel.append(title, sub, this.invGrid, this.invDesc);
    this.invOverlay.appendChild(panel);
    for (let i = 0; i < SLOTS; i++) {
      const s = document.createElement('div');
      s.className = 'hud-slot';
      s.onclick = () => this.onInvClick(i);
      s.onmouseenter = () => this.describe(i);
      this.invGrid.appendChild(s);
    }
    // Death screen
    this.deadOverlay = this.div('hud-overlay dead');

    parent.append(this.vignette, this.root, this.noteOverlay, this.invOverlay, this.deadOverlay);
    setTimeout(() => (this.hint.style.opacity = '0'), 40000);
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

  setCompass(text: string | null): void {
    this.compass.style.display = text ? '' : 'none';
    if (text) this.compass.textContent = text;
  }

  private fillSlot(el: HTMLDivElement, i: number, showKey: boolean): void {
    const s = this.inv.slots[i];
    el.innerHTML = '';
    if (showKey) {
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = String(i + 1);
      el.appendChild(k);
    }
    if (!s) return;
    const icon = document.createElement('div');
    icon.className = 'hud-icon';
    icon.style.background = hex(ITEMS[s.id].color);
    icon.title = ITEMS[s.id].name;
    el.appendChild(icon);
    const n = document.createElement('span');
    n.className = 'n';
    if (s.count > 1) n.textContent = String(s.count);
    else if (s.id === 'chalk' && s.meta !== undefined) n.textContent = String(s.meta);
    el.appendChild(n);
  }

  update(dt: number, stats: Stats, flashlightOn: boolean): void {
    const vals: Record<string, number> = {
      hydration: stats.hydration,
      hunger: stats.hunger,
      stamina: stats.stamina,
      sanity: stats.sanity,
      battery: stats.battery,
    };
    for (const k in vals) {
      const bar = this.bars[k];
      (bar.firstChild as HTMLElement).style.width = vals[k].toFixed(1) + '%';
      bar.classList.toggle('low', vals[k] < 20 && k !== 'stamina');
    }
    (this.bars.battery.parentElement as HTMLElement).style.opacity = this.inv.has('flashlight') ? '1' : '0.35';
    void flashlightOn;

    const key = JSON.stringify(this.inv.toJSON());
    if (key !== this.lastInvKey) {
      this.lastInvKey = key;
      this.slots.forEach((el, i) => this.fillSlot(el, i, true));
      if (this.inventoryOpen) this.renderInventory();
      const h = this.inv.held;
      this.held.textContent = h ? ITEMS[h.id].name : '';
    }
    this.slots.forEach((el, i) => el.classList.toggle('sel', i === this.inv.selected));

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.style.opacity = '0';
    }
    // Vignette deepens with low sanity.
    this.vignette.style.opacity = String(0.45 + (1 - stats.sanity / 100) * 0.5);
  }

  // --- Inventory screen -----------------------------------------------------
  openInventory(): void {
    this.inventoryOpen = true;
    this.invPick = null;
    this.renderInventory();
    this.invOverlay.style.display = 'flex';
  }
  closeInventory(): void {
    this.inventoryOpen = false;
    this.invOverlay.style.display = 'none';
  }
  private renderInventory(): void {
    [...this.invGrid.children].forEach((el, i) => {
      this.fillSlot(el as HTMLDivElement, i, i < HOTBAR);
      el.classList.toggle('pick', i === this.invPick);
      el.classList.toggle('sel', i === this.inv.selected);
    });
  }
  private describe(i: number): void {
    const s = this.inv.slots[i];
    this.invDesc.textContent = s ? `${ITEMS[s.id].name} — ${ITEMS[s.id].desc}` : '';
  }
  private onInvClick(i: number): void {
    if (this.invPick === null) {
      if (this.inv.slots[i]) this.invPick = i;
    } else {
      this.inv.swap(this.invPick, i);
      this.invPick = null;
    }
    this.renderInventory();
    this.lastInvKey = '';
  }

  // --- Notes ----------------------------------------------------------------
  showNote(index: number): void {
    this.noteOpen = true;
    this.noteOverlay.innerHTML = '';
    const n = this.div('hud-note');
    n.textContent = NOTES[index % NOTES.length];
    const s = document.createElement('small');
    s.textContent = t('note.close');
    n.appendChild(s);
    this.noteOverlay.appendChild(n);
    this.noteOverlay.style.display = 'flex';
  }
  closeNote(): void {
    this.noteOpen = false;
    this.noteOverlay.style.display = 'none';
  }

  // --- Death ----------------------------------------------------------------
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
