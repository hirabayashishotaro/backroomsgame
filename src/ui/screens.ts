/** Title screen, pause menu, save-slot lists and credits (SPEC §11). */
import { formatPlayTime, latestSlot, listSlots } from '../core/save';
import { getNative } from '../core/storage';
import { t } from './i18n';

export interface ScreenCallbacks {
  onNewGame: (slot: number, mode: 'endless' | 'escape') => void;
  onLoad: (slot: number) => void;
  onResume: () => void;
  onToTitle: () => void;
  onSettings: () => void;
  onLevelSelect: () => void;
  onCombatLab: () => void;
  onEndingTest: () => void;
  onJournal: () => void;
  onQuit: () => void;
}

const CSS = `
.sc { position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(40,34,12,0.78), rgba(0,0,0,0.95)); color: #e9dfae; }
.sc-panel { width: min(460px, calc(100vw - 32px)); padding: 28px; }
.sc-title { font-size: clamp(26px, 4.5vw, 40px); letter-spacing: 0.14em; font-weight: 300; }
.sc-sub { opacity: 0.6; margin: 4px 0 26px; font-size: 13px; letter-spacing: 0.2em; }
.sc-btn { display: block; width: 100%; margin: 7px 0; padding: 12px 16px; font-size: 16px; text-align: left; letter-spacing: 0.08em;
  background: rgba(30,27,12,0.85); color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; }
.sc-btn:hover:not(:disabled) { background: #3a3416; border-color: #c8b35c; }
.sc-btn:disabled { opacity: 0.35; cursor: default; }
.sc-btn small { display: block; font-size: 11px; opacity: 0.6; margin-top: 3px; letter-spacing: 0.02em; }
.sc-btn.primary { background: #c8b35c; color: #1a1606; border-color: #c8b35c; }
.sc-btn.primary:hover { background: #e2cc6e; }
.sc-note { font-size: 12px; opacity: 0.55; margin-top: 16px; line-height: 1.7; white-space: pre-line; }
.sc-credit { font-size: 13px; line-height: 2; white-space: pre-line; }
`;

type View = 'title' | 'pause' | 'new' | 'load' | 'credits' | 'confirm' | 'mode';

export class Screens {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private view: View = 'title';
  private back: View = 'title';

  constructor(parent: HTMLElement, private cb: ScreenCallbacks) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'sc';
    this.panel = document.createElement('div');
    this.panel.className = 'sc-panel';
    this.root.appendChild(this.panel);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  show(view: 'title' | 'pause'): void {
    this.back = view;
    this.render(view);
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private btn(label: string, onClick: () => void, opts: { sub?: string; disabled?: boolean; primary?: boolean } = {}): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'sc-btn' + (opts.primary ? ' primary' : '');
    b.textContent = label;
    if (opts.sub) {
      const s = document.createElement('small');
      s.textContent = opts.sub;
      b.appendChild(s);
    }
    b.disabled = !!opts.disabled;
    b.onclick = onClick;
    this.panel.appendChild(b);
    return b;
  }

  private heading(title: string, sub?: string): void {
    const h = document.createElement('div');
    h.className = 'sc-title';
    h.textContent = title;
    this.panel.appendChild(h);
    const s = document.createElement('div');
    s.className = 'sc-sub';
    s.textContent = sub ?? '';
    this.panel.appendChild(s);
  }

  private note(text: string): void {
    const n = document.createElement('div');
    n.className = 'sc-note';
    n.textContent = text;
    this.panel.appendChild(n);
  }

  private render(view: View, arg?: number): void {
    this.view = view;
    this.panel.innerHTML = '';
    const isElectron = !!getNative()?.isElectron;
    switch (view) {
      case 'title': {
        this.heading('THE BACKROOMS: ENDLESS', t('menu.subtitle'));
        const latest = latestSlot();
        this.btn(t('menu.continue'), () => latest && this.cb.onLoad(latest), {
          disabled: !latest,
          primary: !!latest,
          sub: latest ? this.slotSummary(latest) : t('menu.noSave'),
        });
        this.btn(t('menu.newGame'), () => this.render('new'), { primary: !latest });
        this.btn(t('menu.load'), () => this.render('load'), { disabled: !latest });
        this.btn(t('menu.settings'), () => this.cb.onSettings());
        this.btn(t('dev.open'), () => this.cb.onLevelSelect());
        this.btn(t('lab.open'), () => this.cb.onCombatLab());
        this.btn(t('ending.open'), () => this.cb.onEndingTest(), { sub: t('ending.openSub') });
        this.btn(t('menu.credits'), () => this.render('credits'));
        if (isElectron) this.btn(t('menu.quit'), () => this.cb.onQuit());
        this.note(t('menu.controls'));
        break;
      }
      case 'pause':
        this.heading(t('menu.paused'));
        this.btn(t('menu.resume'), () => this.cb.onResume(), { primary: true });
        this.btn(t('menu.journal'), () => this.cb.onJournal());
        this.btn(t('menu.settings'), () => this.cb.onSettings());
        this.btn(t('dev.open'), () => this.cb.onLevelSelect());
        this.btn(t('lab.open'), () => this.cb.onCombatLab());
        this.btn(t('ending.open'), () => this.cb.onEndingTest(), { sub: t('ending.openSub') });
        this.btn(t('menu.toTitle'), () => this.cb.onToTitle(), { sub: t('menu.toTitleSub') });
        if (isElectron) this.btn(t('menu.quit'), () => this.cb.onQuit(), { sub: t('menu.toTitleSub') });
        break;
      case 'new':
        this.heading(t('menu.newGame'), t('menu.pickSlot'));
        for (const s of listSlots())
          this.btn(`${t('menu.slot')} ${s.slot}`, () => (s.data ? this.render('confirm', s.slot) : this.render('mode', s.slot)), {
            sub: s.data ? this.slotSummary(s.slot) + ' — ' + t('menu.overwrite') : t('menu.empty'),
          });
        this.btn(t('menu.back'), () => this.render(this.back));
        break;
      case 'confirm':
        this.heading(t('menu.confirmTitle'), `${t('menu.slot')} ${arg}: ${this.slotSummary(arg!)}`);
        this.btn(t('menu.confirmYes'), () => this.render('mode', arg), { primary: true });
        this.btn(t('menu.back'), () => this.render('new'));
        break;
      case 'mode':
        this.heading(t('menu.mode'), `${t('menu.slot')} ${arg}`);
        this.btn(t('mode.endless'), () => this.cb.onNewGame(arg!, 'endless'), { primary: true, sub: t('mode.endlessSub') });
        this.btn(t('mode.escape'), () => this.cb.onNewGame(arg!, 'escape'), { sub: t('mode.escapeSub') });
        this.btn(t('menu.back'), () => this.render('new'));
        break;
      case 'load':
        this.heading(t('menu.load'));
        for (const s of listSlots())
          this.btn(`${t('menu.slot')} ${s.slot}`, () => s.data && this.cb.onLoad(s.slot), {
            disabled: !s.data,
            sub: s.data ? this.slotSummary(s.slot) : t('menu.empty'),
          });
        this.btn(t('menu.back'), () => this.render(this.back));
        break;
      case 'credits':
        this.heading(t('menu.credits'));
        {
          const c = document.createElement('div');
          c.className = 'sc-credit';
          c.textContent = t('credits.body');
          this.panel.appendChild(c);
        }
        this.btn(t('menu.back'), () => this.render(this.back));
        break;
    }
  }

  private slotSummary(slot: number): string {
    const d = listSlots().find((s) => s.slot === slot)?.data;
    if (!d) return t('menu.empty');
    const date = new Date(d.savedAt);
    const when = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    return `${d.levelTitle} ${d.levelName} / ${formatPlayTime(d.playTime)} / ${when}`;
  }

  /** Re-render the current view (e.g. after a save). */
  refresh(): void {
    if (this.visible && (this.view === 'title' || this.view === 'pause')) this.render(this.view);
  }
}
