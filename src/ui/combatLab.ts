/**
 * Developer mode 2 (combat lab): pick entities and weapons from the pause
 * menu and fight them in a closed test hall. Also shows a live readout of
 * every entity's state while in the hall.
 */
import { ALL_ENTITIES, ENTITIES, type EntityKind } from '../entities/entityDefs';
import { t } from './i18n';

export interface LabOptions {
  god: boolean;
  infiniteAmmo: boolean;
  aiStopped: boolean;
  /** Spawn distance in front of the player (m). */
  distance: number;
}

export interface LabCallbacks {
  inArena: () => boolean;
  enterArena: () => void;
  spawn: (kind: EntityKind) => void;
  clearEntities: () => void;
  refillWeapons: () => void;
  resume: () => void;
  optionsChanged: (o: LabOptions) => void;
}

export interface LabEntityInfo {
  kind: EntityKind;
  mode: string;
  hp: number;
  maxHp: number;
  dist: number;
  alpha: number;
}

const CSS = `
.lab { position: fixed; inset: 0; z-index: 45; display: none; align-items: center; justify-content: center;
  background: rgba(8,7,3,0.97); color: #e9dfae; }
.lab-panel { width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 40px); overflow: auto; padding: 24px; }
.lab h2 { margin: 0 0 4px; font-weight: 400; letter-spacing: 0.12em; }
.lab h3 { margin: 18px 0 8px; font-size: 14px; opacity: 0.7; font-weight: 400; letter-spacing: 0.1em; }
.lab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
.lab-btn { text-align: left; padding: 8px 10px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; font: inherit; }
.lab-btn:hover { background: #2e2912; border-color: #c8b35c; }
.lab-btn.on { border-color: #c8b35c; background: #3a3315; }
.lab-btn small { display: block; opacity: 0.6; font-size: 11px; margin-top: 2px; line-height: 1.5; }
.lab-row { display: flex; flex-wrap: wrap; gap: 6px; }
.lab-note { font-size: 12px; opacity: 0.6; line-height: 1.6; }
.lab-info { position: fixed; top: 12px; right: 12px; z-index: 30; display: none; pointer-events: none;
  font: 12px/1.6 monospace; color: #f2e9bf; background: rgba(0,0,0,0.55); padding: 8px 10px; white-space: pre; }
`;

const MODE_LABEL: Record<string, string> = {
  idle: '待機',
  stalk: '忍び寄り',
  chase: '追跡',
  frozen: '静止',
  fade: '消えかけ',
  flee: '退散',
  stagger: 'ひるみ',
};

export class CombatLab {
  readonly options: LabOptions = { god: true, infiniteAmmo: true, aiStopped: false, distance: 20 };
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private info: HTMLDivElement;

  constructor(parent: HTMLElement, private cb: LabCallbacks) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'lab';
    this.panel = document.createElement('div');
    this.panel.className = 'lab-panel';
    this.root.appendChild(this.panel);
    parent.appendChild(this.root);
    this.info = document.createElement('div');
    this.info.className = 'lab-info';
    parent.appendChild(this.info);
  }

  private btn(parent: HTMLElement, label: string, sub: string, onClick: () => void, on = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'lab-btn' + (on ? ' on' : '');
    b.textContent = label;
    if (sub) {
      const sm = document.createElement('small');
      sm.textContent = sub;
      b.appendChild(sm);
    }
    b.onclick = onClick;
    parent.appendChild(b);
    return b;
  }

  private heading(text: string): void {
    const h3 = document.createElement('h3');
    h3.textContent = text;
    this.panel.appendChild(h3);
  }

  private render(): void {
    const p = this.panel;
    p.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = t('lab.title');
    const note = document.createElement('div');
    note.className = 'lab-note';
    note.textContent = t('lab.help');
    p.append(h, note);

    const inArena = this.cb.inArena();
    if (!inArena) {
      this.heading(t('lab.start'));
      const row = document.createElement('div');
      row.className = 'lab-row';
      this.btn(row, t('lab.enter'), t('lab.enterSub'), () => {
        this.hide();
        this.cb.enterArena();
      });
      p.appendChild(row);
    }

    this.heading(t('lab.spawn'));
    const grid = document.createElement('div');
    grid.className = 'lab-grid';
    for (const kind of ALL_ENTITIES) {
      this.btn(grid, ENTITIES[kind].name, ENTITIES[kind].hint, () => {
        this.hide();
        if (!this.cb.inArena()) this.cb.enterArena();
        this.cb.spawn(kind);
        this.cb.resume();
      });
    }
    p.appendChild(grid);

    this.heading(t('lab.distance'));
    const drow = document.createElement('div');
    drow.className = 'lab-row';
    for (const d of [6, 12, 20, 35]) {
      this.btn(drow, `${d} m`, '', () => {
        this.options.distance = d;
        this.changed();
      }, this.options.distance === d);
    }
    p.appendChild(drow);

    this.heading(t('lab.tools'));
    const trow = document.createElement('div');
    trow.className = 'lab-grid';
    this.btn(trow, t('lab.refill'), t('lab.refillSub'), () => {
      this.hide();
      if (!this.cb.inArena()) this.cb.enterArena();
      this.cb.refillWeapons();
      this.cb.resume();
    });
    this.btn(trow, t('lab.clear'), '', () => {
      this.cb.clearEntities();
      this.render();
    });
    const toggle = (key: 'god' | 'infiniteAmmo' | 'aiStopped', label: string, sub: string) =>
      this.btn(trow, `${label}: ${this.options[key] ? 'ON' : 'OFF'}`, sub, () => {
        this.options[key] = !this.options[key];
        this.changed();
      }, this.options[key]);
    toggle('god', t('lab.god'), t('lab.godSub'));
    toggle('infiniteAmmo', t('lab.ammo'), t('lab.ammoSub'));
    toggle('aiStopped', t('lab.stop'), t('lab.stopSub'));
    p.appendChild(trow);

    const close = document.createElement('div');
    close.className = 'lab-row';
    close.style.marginTop = '18px';
    this.btn(close, t('lab.close'), '', () => this.hide());
    if (inArena)
      this.btn(close, t('lab.resume'), '', () => {
        this.hide();
        this.cb.resume();
      });
    p.appendChild(close);
  }

  private changed(): void {
    this.cb.optionsChanged(this.options);
    this.render();
  }

  show(): void {
    this.render();
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  /** Live readout (call every frame; pass null outside the arena). */
  updateInfo(list: LabEntityInfo[] | null): void {
    if (!list) {
      if (this.info.style.display !== 'none') this.info.style.display = 'none';
      return;
    }
    this.info.style.display = 'block';
    const lines = [t('lab.infoHead')];
    if (!list.length) lines.push(t('lab.none'));
    for (const e of list) {
      const name = ENTITIES[e.kind].name.padEnd(9, '　').slice(0, 9);
      lines.push(`${name} ${(MODE_LABEL[e.mode] ?? e.mode).padEnd(5, '　')} HP ${String(Math.max(0, Math.round(e.hp))).padStart(3)}/${e.maxHp}  ${e.dist.toFixed(1).padStart(5)}m  ${Math.round(e.alpha * 100)}%`);
    }
    const opts = [this.options.god ? t('lab.god') : '', this.options.infiniteAmmo ? t('lab.ammo') : '', this.options.aiStopped ? t('lab.stop') : ''].filter(Boolean);
    if (opts.length) lines.push('[' + opts.join(' / ') + ']');
    const text = lines.join('\n');
    if (this.info.textContent !== text) this.info.textContent = text;
  }
}
