/** Journal screen (SPEC §4.4): visited levels and the route map (§5.4.7). */
import { layoutGraph, type Journal } from '../systems/journal';
import { resolveLevel } from '../levels/registry';
import { t } from './i18n';

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
  private tab: 'list' | 'map' = 'list';
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private journal: Journal) {
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

  show(onClose: () => void): void {
    this.onClose = onClose;
    this.root.style.display = 'flex';
    this.render();
  }

  hide(): void {
    if (!this.visible) return;
    this.root.style.display = 'none';
    this.onClose();
  }

  private render(): void {
    this.countEl.textContent = t('journal.count', { n: this.journal.count });
    this.tabs.innerHTML = '';
    for (const id of ['list', 'map'] as const) {
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
    if (!this.journal.count) {
      const e = document.createElement('div');
      e.className = 'jr-empty';
      e.textContent = t('journal.empty');
      this.body.appendChild(e);
      return;
    }
    if (this.tab === 'list') this.renderList();
    else this.renderMap();
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
