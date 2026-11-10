/**
 * Developer level select (SPEC §5.3 debug start, extended per user request):
 * hand-made levels plus one example of every generated world type.
 */
import { HAND_LEVEL_IDS, hasHandLevel, resolveLevel } from '../levels/registry';
import { genomeOf, GRAMMAR_LABEL, makeGeneratedLevel, SKY_LABEL } from '../levels/procedural/generated';
import { t } from './i18n';

export interface LevelEntry {
  id: string;
  label: string;
  sub: string;
}

export function handLevelEntries(): LevelEntry[] {
  return HAND_LEVEL_IDS.map((id) => {
    const L = resolveLevel(id);
    return { id, label: `${L.title} — ${L.subtitle ?? L.name}`, sub: L.kindLabel ?? (id === '0' ? '屋内迷路(手作り)' : '手作り') };
  });
}

/** First generated id for each kind of world (grammar x variant x sky). */
export function generatedExamples(): LevelEntry[] {
  const seen = new Set<string>();
  const out: LevelEntry[] = [];
  for (let n = 3; n < 3000 && out.length < 90; n++) {
    const id = String(n);
    if (['0', '1', '2'].includes(id) || hasHandLevel(id)) continue;
    const g = genomeOf(id);
    const sub = makeGeneratedLevel(id).kindLabel ?? `${GRAMMAR_LABEL[g.grammar]}${g.sky ? '・' + SKY_LABEL[g.sky] : ''}`;
    if (seen.has(sub)) continue;
    seen.add(sub);
    out.push({ id, label: `Level ${id}`, sub });
  }
  return out.sort((a, b) => a.sub.localeCompare(b.sub, 'ja'));
}

const CSS = `
.ls { position: fixed; inset: 0; z-index: 45; display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.88); color: #e9dfae; }
.ls-panel { width: min(860px, calc(100vw - 32px)); max-height: calc(100vh - 40px); overflow: auto; padding: 24px; }
.ls h2 { margin: 0 0 4px; font-weight: 400; letter-spacing: 0.12em; }
.ls h3 { margin: 18px 0 8px; font-size: 14px; opacity: 0.7; font-weight: 400; letter-spacing: 0.1em; }
.ls-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; }
.ls-btn { text-align: left; padding: 8px 10px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; }
.ls-btn:hover { background: #2e2912; border-color: #c8b35c; }
.ls-btn small { display: block; opacity: 0.6; font-size: 11px; margin-top: 2px; }
.ls-row { display: flex; gap: 8px; margin-top: 10px; }
.ls-row input { flex: 1; padding: 8px; background: #1d1a0c; color: #e9dfae; border: 1px solid #5d5225; }
.ls-close { margin-top: 18px; }
`;

export class LevelSelect {
  private root: HTMLDivElement;

  constructor(parent: HTMLElement, private onPick: (id: string) => void) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'ls';
    const panel = document.createElement('div');
    panel.className = 'ls-panel';
    const h = document.createElement('h2');
    h.textContent = t('dev.title');
    const p = document.createElement('div');
    p.style.cssText = 'font-size:12px;opacity:0.6';
    p.textContent = t('dev.help');
    panel.append(h, p);
    const section = (title: string, entries: LevelEntry[]) => {
      const h3 = document.createElement('h3');
      h3.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'ls-grid';
      for (const e of entries) {
        const b = document.createElement('button');
        b.className = 'ls-btn';
        b.textContent = e.label;
        const sm = document.createElement('small');
        sm.textContent = e.sub;
        b.appendChild(sm);
        b.onclick = () => this.pick(e.id);
        grid.appendChild(b);
      }
      panel.append(h3, grid);
    };
    section(t('dev.hand'), handLevelEntries());
    section(t('dev.generated'), generatedExamples());
    const h3 = document.createElement('h3');
    h3.textContent = t('dev.any');
    const row = document.createElement('div');
    row.className = 'ls-row';
    const input = document.createElement('input');
    input.placeholder = '例: 482 / 33.7 / -3 / void';
    const go = document.createElement('button');
    go.className = 'ls-btn';
    go.textContent = t('dev.go');
    go.onclick = () => input.value.trim() && this.pick(input.value.trim());
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) this.pick(input.value.trim());
    };
    row.append(input, go);
    const close = document.createElement('button');
    close.className = 'ls-btn ls-close';
    close.textContent = t('dev.close');
    close.onclick = () => this.hide();
    panel.append(h3, row, close);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  private pick(id: string): void {
    this.hide();
    this.onPick(id);
  }

  show(): void {
    this.root.style.display = 'flex';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
}
