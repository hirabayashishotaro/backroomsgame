/** Title screen, pause menu, save-slot lists and credits (SPEC §11). */
import { formatPlayTime, latestSlot, listSlots } from '../core/save';
import { getNative } from '../core/storage';
import { feedDevKey, isDevUnlocked } from '../core/devUnlock';
import { COSPLAYS, GOLD, randomSkinId, SILVER, SKINS, TROPHIES, skinLabel, type Skin } from '../player/skins';
import { buildAvatar } from '../player/avatar';
import { ModelViewer } from './modelViewer';
import type * as THREE from 'three';
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
  /** The bestiary shared by all runs. */
  onBestiary: () => void;
  /** The player's outfit: read and change it (saved with the settings). */
  getSkin: () => Skin;
  setSkin: (s: Skin) => void;
  /** May this outfit be worn (won, everyday, or the developer passphrase)? */
  ownsSkin: (s: Skin) => boolean;
  /** Outfits won so far (cosplays, trophies, random ones). */
  wonSkins: () => Skin[];
  /** Developer: add a brand-new random outfit. */
  giveSkin: (s: Skin) => void;
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
.sc-skins { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.sc-skin { background: rgba(30,27,12,0.85); border: 1px solid #4d4420; color: #e9dfae; padding: 4px; cursor: pointer; font: inherit; font-size: 11px; line-height: 1.3; }
.sc-skin:hover:not(:disabled) { border-color: #c8b35c; }
.sc-skin.on { border-color: #c8b35c; background: #3a3416; }
.sc-skin:disabled { opacity: 0.45; cursor: default; }
.sc-skin img, .sc-skin .ph { width: 100%; aspect-ratio: 1; display: block; background: radial-gradient(circle at 50% 40%, #3a3418, #0d0c06); }
.sc-skin .ph { display: flex; align-items: center; justify-content: center; font-size: 26px; opacity: 0.5; }
.sc-sect { font-size: 12px; opacity: 0.65; margin: 10px 0 4px; letter-spacing: 0.1em; }
.sc-credit { font-size: 13px; line-height: 2; white-space: pre-line; }
`;

type View = 'title' | 'pause' | 'new' | 'load' | 'credits' | 'confirm' | 'mode' | 'skin' | 'reward';

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
    // The hidden passphrase (title / pause screen only) shows or hides the developer menus.
    window.addEventListener('keydown', (e) => {
      if (!this.visible || (this.view !== 'title' && this.view !== 'pause')) return;
      if (feedDevKey(e.key) !== null) this.render(this.view);
    });
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
    this.viewer?.stop();
  }

  private viewer: ModelViewer | null = null;

  /** Free a preview model's geometries, materials and textures. */
  private static disposeModel(o: THREE.Object3D): void {
    o.removeFromParent();
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mt = m.material as THREE.MeshBasicMaterial;
      mt.map?.dispose();
      mt.dispose();
    });
  }

  private thumbViewer: ModelViewer | null = null;
  private thumbs = new Map<string, string | null>();

  /** A small front picture of an outfit (cached). */
  private skinThumb(id: Skin): string | null {
    if (!this.thumbs.has(id)) {
      if (!this.thumbViewer) this.thumbViewer = new ModelViewer(120, 120);
      this.thumbs.set(id, this.thumbViewer.snapshot(buildAvatar(id), Screens.disposeModel));
    }
    return this.thumbs.get(id) ?? null;
  }

  private skinCard(grid: HTMLElement, id: Skin, current: Skin, owned: boolean, onPick: () => void): void {
    const b = document.createElement('button');
    b.className = 'sc-skin' + (id === current ? ' on' : '');
    b.disabled = !owned;
    const url = owned ? this.skinThumb(id) : null;
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      b.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = owned ? '' : '？';
      b.appendChild(ph);
    }
    const nm = document.createElement('div');
    nm.textContent = owned ? skinLabel(id) : '？？？';
    b.appendChild(nm);
    b.onclick = onPick;
    grid.appendChild(b);
  }

  /**
   * Skin selection: the outfit in use turning in 3D above, every outfit below
   * as a picture. Ones not won yet show as ？？？ (random ones only once won).
   */
  private renderSkins(): void {
    this.panel.style.maxHeight = 'calc(100vh - 24px)';
    this.panel.style.overflowY = 'auto';
    this.heading(t('menu.skin'), t('menu.skinSub'));
    if (!this.viewer) this.viewer = new ModelViewer(240, 240);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;margin-bottom:6px;';
    wrap.appendChild(this.viewer.canvas);
    const current = this.cb.getSkin();
    const cap = document.createElement('div');
    cap.style.cssText = 'margin-top:4px;font-size:14px;';
    cap.textContent = skinLabel(current);
    wrap.appendChild(cap);
    this.panel.appendChild(wrap);
    this.viewer.show(buildAvatar(current), Screens.disposeModel);
    this.viewer.start();
    const pick = (id: Skin) => () => {
      this.cb.setSkin(id);
      this.render('skin');
    };
    const section = (title: string, ids: Skin[]) => {
      if (!ids.length) return;
      const h = document.createElement('div');
      h.className = 'sc-sect';
      h.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'sc-skins';
      for (const id of ids) this.skinCard(grid, id, current, this.cb.ownsSkin(id), pick(id));
      this.panel.append(h, grid);
    };
    section(t('skin.sect.base'), SKINS.map(([id]) => id));
    section(t('skin.sect.cosplay'), COSPLAYS.map(([id]) => id));
    section(t('skin.sect.trophy'), TROPHIES.map(([id]) => id));
    section(t('skin.sect.random'), this.cb.wonSkins().filter((id) => id.startsWith('rand:')));
    this.note(t('menu.skinNote') + (this.cb.getSkin() === SILVER || this.cb.getSkin() === GOLD ? '\n' + t('skin.trophyNote') : ''));
    if (isDevUnlocked())
      this.btn(t('skin.devRandom'), () => {
        const id = randomSkinId(Math.floor(Math.random() * 0x7fffffff));
        this.cb.giveSkin(id);
        this.cb.setSkin(id);
        this.render('skin');
      });
    this.btn(t('menu.back'), () => this.render(this.back));
  }

  private rewards: { won: Skin[]; deaths: number; hurt: number } | null = null;

  /** After the credits: what this clear won. */
  showRewards(won: Skin[], run: { deaths: number; hurt: number }): void {
    this.rewards = { won, ...run };
    this.back = 'title';
    this.render('reward');
    this.root.style.display = 'flex';
  }

  private renderRewards(): void {
    const r = this.rewards!;
    this.heading(t('reward.title'), t('reward.sub', { d: r.deaths, h: r.hurt }));
    const grid = document.createElement('div');
    grid.className = 'sc-skins';
    for (const id of r.won) this.skinCard(grid, id, '', true, () => {
      this.cb.setSkin(id);
      this.render('skin');
    });
    this.panel.appendChild(grid);
    const lines = r.won.map((id) => (id === SILVER ? t('reward.silver') : id === GOLD ? t('reward.gold') : t('reward.new', { name: skinLabel(id) })));
    this.note(lines.join('\n'));
    this.btn(t('reward.wear'), () => this.render('skin'), { primary: true });
    this.btn(t('menu.back'), () => this.render('title'));
  }

  private skinLabel(): string {
    return skinLabel(this.cb.getSkin());
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
    if (view !== 'skin') this.viewer?.stop();
    this.panel.style.maxHeight = '';
    this.panel.style.overflowY = '';
    if (view === 'skin') return this.renderSkins();
    if (view === 'reward') return this.renderRewards();
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
        this.btn(t('menu.skin'), () => this.render('skin'), { sub: this.skinLabel() });
        this.btn(t('menu.bestiary'), () => this.cb.onBestiary(), { sub: t('menu.bestiarySub') });
        if (isDevUnlocked()) {
          this.btn(t('dev.open'), () => this.cb.onLevelSelect());
          this.btn(t('lab.open'), () => this.cb.onCombatLab());
          this.btn(t('ending.open'), () => this.cb.onEndingTest(), { sub: t('ending.openSub') });
        }
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
        this.btn(t('menu.skin'), () => this.render('skin'), { sub: this.skinLabel() });
        if (isDevUnlocked()) {
          this.btn(t('dev.open'), () => this.cb.onLevelSelect());
          this.btn(t('lab.open'), () => this.cb.onCombatLab());
          this.btn(t('ending.open'), () => this.cb.onEndingTest(), { sub: t('ending.openSub') });
        }
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
