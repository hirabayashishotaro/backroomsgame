/** Journal screen (SPEC §4.4): visited levels and the route map (§5.4.7). */
import { layoutGraph, type Journal } from '../systems/journal';
import { resolveLevel } from '../levels/registry';
import { t } from './i18n';
import { ModelViewer } from './modelViewer';
import { buildChimeraMesh, buildEntityMesh, disposeEntityMesh } from '../entities/models';
import { ENTITIES, type EntityKind } from '../entities/entityDefs';
import type { ChimeraGenome } from '../entities/chimera';
import type * as THREE from 'three';
import type { Bestiary, BestiaryEntry } from '../systems/bestiary';

const CSS = `
.jr { position: fixed; inset: 0; z-index: 44; display: none; align-items: center; justify-content: center;
  background: rgba(10,9,4,0.96); color: #e9dfae; }
.jr-panel { width: min(900px, calc(100vw - 24px)); height: min(640px, calc(100vh - 24px)); display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; }
.jr-head { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
.jr-head h2 { margin: 0; font-weight: 300; letter-spacing: 0.14em; }
.jr-count { opacity: 0.7; font-size: 14px; }
.jr-tabs { display: flex; gap: 4px; margin: 12px 0; }
.jr-tab { padding: 7px 14px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; }
.jr-tab.on { background: #c8b35c; color: #1a1606; }
.jr-body { flex: 1; overflow: auto; }
.jr-card { border: 1px solid rgba(255,240,180,0.12); padding: 10px 14px; margin-bottom: 8px; background: rgba(30,27,12,0.5); }
.jr-card h3 { margin: 0; font-size: 16px; font-weight: 400; letter-spacing: 0.06em; }
.jr-card .meta { font-size: 12px; opacity: 0.6; margin: 3px 0 6px; }
.jr-card .line { font-size: 13px; line-height: 1.7; opacity: 0.9; }
.jr-card .found { color: #cfe8a0; }
.jr-card .hidden { opacity: 0.35; }
.jr-empty { opacity: 0.6; padding: 30px; text-align: center; }
.jr svg text { fill: #e9dfae; font-size: 11px; font-family: inherit; }
.jr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.jr-cardb { background: rgba(30,27,12,0.6); border: 1px solid #4d4420; cursor: pointer; padding: 6px; text-align: center; color: #e9dfae; font: inherit; }
.jr-cardb:hover { border-color: #c8b35c; background: #3a3416; }
.jr-cardb img, .jr-cardb .ph { width: 100%; aspect-ratio: 1; display: block; background: radial-gradient(circle at 50% 40%, #3a3418, #0d0c06); object-fit: contain; }
.jr-cardb .nm { font-size: 13px; margin-top: 5px; line-height: 1.35; }
.jr-cardb .sub { font-size: 11px; opacity: 0.6; }
.jr-back { padding: 7px 14px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; margin-bottom: 10px; }
.jr-bestiary { display: flex; gap: 14px; height: 100%; }
.jr-blist { width: 230px; flex: none; overflow: auto; }
.jr-bitem { display: block; width: 100%; text-align: left; padding: 7px 10px; margin-bottom: 4px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; font-size: 13px; }
.jr-bitem.on { background: #c8b35c; color: #1a1606; }
.jr-bitem small { display: block; opacity: 0.6; font-size: 11px; }
.jr-bview { flex: 1; min-width: 0; overflow: auto; }
.jr-bview h3 { margin: 10px 0 4px; font-weight: 400; }
.jr-bview .line { font-size: 13px; line-height: 1.7; opacity: 0.9; }
@media (max-width: 640px) { .jr-bestiary { flex-direction: column; } .jr-blist { width: auto; max-height: 160px; } }
.jr-close { margin-top: 12px; align-self: flex-start; padding: 9px 18px; background: #c8b35c; color: #1a1606; border: none; cursor: pointer; }
`;

const EXIT_LABEL: Record<string, string> = {
  walk: '長距離の歩行',
  wall: '壁抜け',
  floor: '床抜け・落下',
  door: '扉',
  special: '特別な場所',
  return: '戻り口',
};

export class JournalScreen {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private countEl: HTMLDivElement;
  private tabs: HTMLDivElement;
  private tab: 'list' | 'map' | 'creatures' = 'list';
  private viewer: ModelViewer | null = null;
  private picked: string | null = null;
  private onClose: () => void = () => {};

  /** Cached list thumbnails (one image per entity key). */
  private thumbs = new Map<string, string | null>();
  private thumbViewer: ModelViewer | null = null;
  /** Opened from the title screen: only the bestiary. */
  private only = false;

  constructor(parent: HTMLElement, private journal: Journal, private bestiary: Bestiary) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'jr';
    const panel = document.createElement('div');
    panel.className = 'jr-panel';
    const head = document.createElement('div');
    head.className = 'jr-head';
    const h = document.createElement('h2');
    h.textContent = t('journal.title');
    this.countEl = document.createElement('div');
    this.countEl.className = 'jr-count';
    head.append(h, this.countEl);
    this.tabs = document.createElement('div');
    this.tabs.className = 'jr-tabs';
    this.body = document.createElement('div');
    this.body.className = 'jr-body';
    const close = document.createElement('button');
    close.className = 'jr-close';
    close.textContent = t('settings.close');
    close.onclick = () => this.hide();
    panel.append(head, this.tabs, this.body, close);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.visible && e.code === 'Escape') this.hide();
    });
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  show(onClose: () => void, opts: { bestiaryOnly?: boolean } = {}): void {
    this.onClose = onClose;
    this.only = !!opts.bestiaryOnly;
    if (this.only) this.tab = 'creatures';
    this.picked = null;
    this.root.style.display = 'flex';
    this.render();
  }

  hide(): void {
    if (!this.visible) return;
    this.root.style.display = 'none';
    this.viewer?.stop();
    this.onClose();
  }

  private render(): void {
    this.countEl.textContent = this.only ? t('journal.creatureCount', { n: this.bestiary.entries.length }) : t('journal.count', { n: this.journal.count });
    this.tabs.innerHTML = '';
    for (const id of this.only ? (['creatures'] as const) : (['list', 'map', 'creatures'] as const)) {
      const b = document.createElement('button');
      b.className = 'jr-tab' + (this.tab === id ? ' on' : '');
      b.textContent = t('journal.tab.' + id);
      b.onclick = () => {
        this.tab = id;
        this.render();
      };
      this.tabs.appendChild(b);
    }
    this.body.innerHTML = '';
    if (this.tab !== 'creatures') this.viewer?.stop();
    if (!this.journal.count && this.tab !== 'creatures') {
      const e = document.createElement('div');
      e.className = 'jr-empty';
      e.textContent = t('journal.empty');
      this.body.appendChild(e);
      return;
    }
    if (this.tab === 'list') this.renderList();
    else if (this.tab === 'map') this.renderMap();
    else this.renderCreatures();
  }

  private renderList(): void {
    const d = this.journal.data;
    for (const id of [...d.order].reverse()) {
      const l = d.levels[id];
      const card = document.createElement('div');
      card.className = 'jr-card';
      const h = document.createElement('h3');
      h.textContent = `${l.title} — ${l.name}`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${l.kind} / 脅威度 ${l.threat} / 訪問 ${l.visits} 回`;
      card.append(h, meta);
      // Structures: found ones by name, the rest as "？？？" so players know more exist.
      let all: Array<{ id: string; name: string }> = [];
      try {
        all = resolveLevel(id).setPieces.map((p) => ({ id: p.id, name: p.name }));
      } catch {
        all = [];
      }
      if (all.length) {
        const line = document.createElement('div');
        line.className = 'line';
        line.append(document.createTextNode(t('journal.pieces', { a: l.pieces.length, b: all.length }) + ' '));
        all.forEach((p, i) => {
          const sp = document.createElement('span');
          const found = l.pieces.includes(p.id);
          sp.className = found ? 'found' : 'hidden';
          sp.textContent = (found ? p.name : '？？？') + (i < all.length - 1 ? '、' : '');
          line.appendChild(sp);
        });
        card.appendChild(line);
      }
      if (l.entities.length) {
        const line = document.createElement('div');
        line.className = 'line';
        line.textContent = t('journal.met') + ' ' + l.entities.map((k) => this.journal.creatureName(k) ?? ENTITIES[k as EntityKind]?.name ?? k).join('、');
        card.appendChild(line);
      }
      for (const e of l.exits) {
        const line = document.createElement('div');
        line.className = 'line';
        const to = d.levels[e.to];
        line.textContent = `→ ${to ? to.title : 'Level ' + e.to}(${EXIT_LABEL[e.kind] ?? e.kind}): ${e.text}`;
        card.appendChild(line);
      }
      this.body.appendChild(card);
    }
  }

  private modelOf(c: BestiaryEntry): THREE.Group {
    try {
      return c.genome ? buildChimeraMesh(c.genome as ChimeraGenome) : buildEntityMesh(c.kind as EntityKind);
    } catch {
      return buildEntityMesh('bug');
    }
  }

  private thumb(c: BestiaryEntry): string | null {
    if (!this.thumbs.has(c.key)) {
      if (!this.thumbViewer) this.thumbViewer = new ModelViewer(180, 180);
      this.thumbs.set(c.key, this.thumbViewer.snapshot(this.modelOf(c), (o) => disposeEntityMesh(o as THREE.Group)));
    }
    return this.thumbs.get(c.key) ?? null;
  }

  /**
   * The bestiary (shared by all runs): a grid of every entity met, each with
   * its picture; pick one to turn it around in 3D and read about it.
   */
  private renderCreatures(): void {
    const list = this.bestiary.entries;
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'jr-empty';
      e.textContent = t('journal.noCreatures');
      this.body.appendChild(e);
      return;
    }
    const c = this.picked ? list.find((x) => x.key === this.picked) : undefined;
    if (!c) {
      this.viewer?.stop();
      const grid = document.createElement('div');
      grid.className = 'jr-grid';
      for (const e of list) {
        const b = document.createElement('button');
        b.className = 'jr-cardb';
        const url = this.thumb(e);
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = e.name;
          b.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'ph';
          b.appendChild(ph);
        }
        const nm = document.createElement('div');
        nm.className = 'nm';
        nm.textContent = e.name;
        const sub = document.createElement('div');
        sub.className = 'sub';
        sub.textContent = (e.kind === 'chimera' ? t('journal.randomEntity') + ' / ' : '') + t('journal.defeated', { n: e.defeated });
        b.append(nm, sub);
        b.onclick = () => {
          this.picked = e.key;
          this.render();
        };
        grid.appendChild(b);
      }
      this.body.appendChild(grid);
      return;
    }
    // One entity: big, turning, with its description.
    const back = document.createElement('button');
    back.className = 'jr-back';
    back.textContent = t('journal.backToList');
    back.onclick = () => {
      this.picked = null;
      this.render();
    };
    const wrap = document.createElement('div');
    wrap.className = 'jr-bestiary';
    const view = document.createElement('div');
    if (!this.viewer) this.viewer = new ModelViewer(380, 340);
    view.appendChild(this.viewer.canvas);
    this.viewer.show(this.modelOf(c), (o) => disposeEntityMesh(o as THREE.Group));
    this.viewer.start();
    const info = document.createElement('div');
    info.className = 'jr-bview';
    const h = document.createElement('h3');
    h.textContent = c.name;
    const hint = document.createElement('div');
    hint.className = 'line';
    // (The Bug's description would hint at the way out: kept a mystery.)
    hint.textContent = c.genome ? (c.genome as ChimeraGenome).hint : c.kind === 'bug' ? '？？？' : (ENTITIES[c.kind as EntityKind]?.hint ?? '');
    const where = document.createElement('div');
    where.className = 'line';
    where.textContent = t('journal.metIn') + ' ' + c.levels.map((l) => l.title).join('、');
    const def = document.createElement('div');
    def.className = 'line';
    def.textContent = t('journal.defeated', { n: c.defeated }) + (c.kind === 'chimera' ? ' / ' + t('journal.randomEntity') : '');
    const tip = document.createElement('div');
    tip.className = 'line';
    tip.style.opacity = '0.55';
    tip.textContent = t('journal.dragHint');
    info.append(h, hint, where, def, tip);
    wrap.append(view, info);
    this.body.append(back, wrap);
  }

  private renderMap(): void {
    const w = Math.max(400, this.body.clientWidth - 10);
    const h = Math.max(320, this.body.clientHeight - 10);
    const d = this.journal.data;
    const pos = layoutGraph(d, w, h);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="jr-arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8a7c44"/></marker>';
    svg.appendChild(defs);
    for (const e of d.edges) {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) continue;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      line.setAttribute('stroke', e.kind === 'return' ? '#5a6a7a' : '#8a7c44');
      line.setAttribute('stroke-width', String(Math.min(4, 1 + e.count * 0.5)));
      line.setAttribute('marker-end', 'url(#jr-arrow)');
      if (e.kind === 'return') line.setAttribute('stroke-dasharray', '4 4');
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${EXIT_LABEL[e.kind] ?? e.kind} ×${e.count}`;
      line.appendChild(title);
      svg.appendChild(line);
    }
    for (const id of d.order) {
      const p = pos[id];
      const l = d.levels[id];
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(p.x));
      c.setAttribute('cy', String(p.y));
      c.setAttribute('r', '9');
      c.setAttribute('fill', ['#4a6a3a', '#8a8a3a', '#a8782a', '#a8502a', '#a82a2a', '#6a1a3a'][Math.min(5, l.threat)]);
      c.setAttribute('stroke', '#e9dfae');
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${l.title} — ${l.name}`;
      c.appendChild(title);
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(p.x + 12));
      label.setAttribute('y', String(p.y + 4));
      label.textContent = l.title.replace('Level ', '');
      svg.append(c, label);
    }
    this.body.appendChild(svg);
  }
}
