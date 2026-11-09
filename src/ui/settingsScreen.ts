/**
 * Settings screen (SPEC §10): tabs for controls, key bindings, video, audio
 * and game. Rows are generated from SETTINGS_SCHEMA; every change is applied
 * and saved immediately.
 */
import {
  ACTIONS,
  DEFAULT_SETTINGS,
  QUALITY_PRESETS,
  SETTINGS_SCHEMA,
  findConflict,
  rebind,
  type Action,
  type Settings,
  type Tab,
} from '../core/settings';
import { codeLabel, padLabel, type Input } from '../core/input';
import { t } from './i18n';

const CSS = `
.st { position: fixed; inset: 0; z-index: 46; display: none; align-items: center; justify-content: center;
  background: rgba(8,7,3,0.97); color: #e9dfae; }
.st-panel { width: min(760px, calc(100vw - 24px)); height: min(640px, calc(100vh - 24px)); display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; }
.st-head { display: flex; align-items: baseline; gap: 16px; }
.st-head h2 { margin: 0; font-weight: 300; letter-spacing: 0.12em; }
.st-tabs { display: flex; gap: 4px; margin: 14px 0 10px; flex-wrap: wrap; }
.st-tab { padding: 8px 14px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; }
.st-tab.on { background: #c8b35c; color: #1a1606; border-color: #c8b35c; }
.st-body { flex: 1; overflow: auto; padding-right: 6px; }
.st-row { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(160px, 1.3fr) 64px; gap: 10px; align-items: center;
  padding: 7px 0; border-bottom: 1px solid rgba(255,240,180,0.07); font-size: 14px; }
.st-row small { display: block; opacity: 0.5; font-size: 11px; margin-top: 2px; }
.st-row input[type=range] { width: 100%; }
.st-row select, .st-row input[type=text], .st-row input[type=number] { background: #1d1a0c; color: #e9dfae; border: 1px solid #5d5225; padding: 4px; }
.st-row input[type=number] { width: 60px; }
.st-keys { width: 100%; border-collapse: collapse; font-size: 14px; }
.st-keys td { padding: 5px 4px; border-bottom: 1px solid rgba(255,240,180,0.07); }
.st-key { min-width: 96px; padding: 6px 8px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; }
.st-key.wait { border-color: #8fd; color: #8fd; }
.st-foot { display: flex; gap: 8px; margin-top: 12px; }
.st-foot button { padding: 9px 16px; background: #1d1a0c; color: #e9dfae; border: 1px solid #4d4420; cursor: pointer; }
.st-foot button.primary { background: #c8b35c; color: #1a1606; }
.st-msg { min-height: 20px; font-size: 13px; color: #8fd; margin-top: 8px; }
.st-msg button { margin-left: 8px; padding: 4px 10px; background: #1d1a0c; color: #e9dfae; border: 1px solid #5d5225; cursor: pointer; }
`;

type TabId = Tab | 'keys';
const TABS: TabId[] = ['controls', 'keys', 'video', 'audio', 'game'];

export class SettingsScreen {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private tabsEl: HTMLDivElement;
  private msg: HTMLDivElement;
  private tab: TabId = 'controls';
  private onClose: () => void = () => {};

  constructor(
    parent: HTMLElement,
    private settings: Settings,
    private input: Input,
    private onChange: (s: Settings) => void,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'st';
    const panel = document.createElement('div');
    panel.className = 'st-panel';
    const head = document.createElement('div');
    head.className = 'st-head';
    const h = document.createElement('h2');
    h.textContent = t('settings.title');
    head.appendChild(h);
    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'st-tabs';
    this.body = document.createElement('div');
    this.body.className = 'st-body';
    this.msg = document.createElement('div');
    this.msg.className = 'st-msg';
    const foot = document.createElement('div');
    foot.className = 'st-foot';
    const reset = document.createElement('button');
    reset.textContent = t('settings.reset');
    reset.onclick = () => this.resetTab();
    const close = document.createElement('button');
    close.className = 'primary';
    close.textContent = t('settings.close');
    close.onclick = () => this.hide();
    foot.append(close, reset);
    panel.append(head, this.tabsEl, this.body, this.msg, foot);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.visible && e.code === 'Escape' && !this.waiting) this.hide();
    });
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  private waiting = false;

  show(onClose: () => void): void {
    this.onClose = onClose;
    this.root.style.display = 'flex';
    this.render();
  }

  hide(): void {
    this.input.cancelCapture();
    this.waiting = false;
    this.root.style.display = 'none';
    this.onClose();
  }

  private commit(): void {
    this.onChange(this.settings);
  }

  private render(): void {
    this.tabsEl.innerHTML = '';
    for (const id of TABS) {
      const b = document.createElement('button');
      b.className = 'st-tab' + (id === this.tab ? ' on' : '');
      b.textContent = t('settings.tab.' + id);
      b.onclick = () => {
        this.tab = id;
        this.msg.textContent = '';
        this.render();
      };
      this.tabsEl.appendChild(b);
    }
    this.body.innerHTML = '';
    if (this.tab === 'keys') this.renderKeys();
    else for (const f of SETTINGS_SCHEMA.filter((x) => x.tab === this.tab)) this.renderField(f);
  }

  private renderField(f: (typeof SETTINGS_SCHEMA)[number]): void {
    const s = this.settings as unknown as Record<string, unknown>;
    const row = document.createElement('div');
    row.className = 'st-row';
    const label = document.createElement('div');
    label.textContent = f.label;
    if ('note' in f && f.note) {
      const n = document.createElement('small');
      n.textContent = f.note;
      label.appendChild(n);
    }
    const ctl = document.createElement('div');
    const extra = document.createElement('div');
    row.append(label, ctl, extra);
    if (f.type === 'range') {
      const r = document.createElement('input');
      r.type = 'range';
      r.min = String(f.min);
      r.max = String(f.max);
      r.step = String(f.step);
      r.value = String(s[f.key]);
      const num = document.createElement('input');
      num.type = 'number';
      num.min = r.min;
      num.max = r.max;
      num.step = r.step;
      const show = (v: number) => {
        num.value = f.fmt ? String(Math.round(v * 100)) : String(v);
      };
      show(Number(s[f.key]));
      if (f.fmt) {
        num.min = String(f.min * 100);
        num.max = String(f.max * 100);
        num.step = String(f.step * 100);
      }
      const set = (v: number) => {
        if (!Number.isFinite(v)) return;
        v = Math.min(f.max, Math.max(f.min, v));
        if (f.step >= 1) v = Math.round(v);
        s[f.key] = v;
        r.value = String(v);
        show(v);
        this.commit();
      };
      r.oninput = () => set(Number(r.value));
      num.onchange = () => set(f.fmt ? Number(num.value) / 100 : Number(num.value));
      ctl.appendChild(r);
      extra.appendChild(num);
    } else if (f.type === 'bool') {
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = !!s[f.key];
      c.onchange = () => {
        s[f.key] = c.checked;
        this.commit();
      };
      ctl.appendChild(c);
    } else if (f.type === 'select') {
      const sel = document.createElement('select');
      for (const [v, l] of f.options) {
        const o = document.createElement('option');
        o.value = String(v);
        o.textContent = l;
        sel.appendChild(o);
      }
      sel.value = String(s[f.key]);
      sel.onchange = () => {
        const opt = f.options.find(([v]) => String(v) === sel.value);
        if (!opt) return;
        s[f.key] = opt[0];
        if (f.key === 'quality') Object.assign(this.settings, QUALITY_PRESETS[opt[0] as keyof typeof QUALITY_PRESETS]);
        this.commit();
        if (f.key === 'quality') this.render();
      };
      ctl.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = String(s[f.key] ?? '');
      inp.maxLength = 64;
      inp.onchange = () => {
        s[f.key] = inp.value;
        this.commit();
      };
      ctl.appendChild(inp);
    }
    this.body.appendChild(row);
  }

  private renderKeys(): void {
    const status = document.createElement('div');
    status.style.cssText = 'font-size:12px;opacity:0.6;margin-bottom:8px';
    status.textContent = t('settings.padStatus', { state: this.input.padConnected ? t('settings.padOn') : t('settings.padOff') });
    this.body.appendChild(status);
    const table = document.createElement('table');
    table.className = 'st-keys';
    const head = document.createElement('tr');
    for (const h of ['', t('settings.keyboard'), '', t('settings.gamepad')]) {
      const td = document.createElement('td');
      td.textContent = h;
      td.style.opacity = '0.6';
      head.appendChild(td);
    }
    table.appendChild(head);
    for (const a of ACTIONS) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = t('action.' + a);
      tr.appendChild(name);
      for (const slot of [0, 1]) {
        const td = document.createElement('td');
        const b = document.createElement('button');
        b.className = 'st-key';
        const code = this.settings.bindings[a][slot];
        b.textContent = code ? codeLabel(code) : t('settings.none');
        if (a === 'pause') {
          b.disabled = true;
          b.textContent = slot === 0 ? 'Esc' : t('settings.fixed');
        } else b.onclick = () => this.captureKey(a, slot, b);
        td.appendChild(b);
        tr.appendChild(td);
      }
      const td = document.createElement('td');
      const pb = document.createElement('button');
      pb.className = 'st-key';
      const pad = this.settings.padBindings[a];
      pb.textContent = pad?.length ? pad.map(padLabel).join(' / ') : t('settings.none');
      pb.onclick = () => this.capturePad(a, pb);
      td.appendChild(pb);
      tr.appendChild(td);
      table.appendChild(tr);
    }
    this.body.appendChild(table);
  }

  private captureKey(action: Action, slot: number, btn: HTMLButtonElement): void {
    this.waiting = true;
    btn.classList.add('wait');
    btn.textContent = '…';
    this.msg.textContent = t('settings.pressKey');
    this.input.captureNext((c) => {
      this.waiting = false;
      if (c.kind !== 'key' || c.code === 'Escape') {
        this.msg.textContent = '';
        this.render();
        return;
      }
      const other = findConflict(this.settings.bindings, action, c.code);
      if (!other) {
        this.settings.bindings = rebind(this.settings.bindings, action, slot, c.code, 'override');
        this.msg.textContent = '';
        this.commit();
        this.render();
        return;
      }
      // Conflict: ask whether to swap or override.
      this.msg.textContent = t('settings.conflict', { key: codeLabel(c.code), other: t('action.' + other) });
      const mk = (label: string, fn: () => void) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = fn;
        this.msg.appendChild(b);
      };
      const apply = (mode: 'swap' | 'override') => {
        this.settings.bindings = rebind(this.settings.bindings, action, slot, c.code, mode);
        this.msg.textContent = '';
        this.commit();
        this.render();
      };
      mk(t('settings.swap'), () => apply('swap'));
      mk(t('settings.override'), () => apply('override'));
      mk(t('settings.cancel'), () => {
        this.msg.textContent = '';
        this.render();
      });
    });
  }

  private capturePad(action: Action, btn: HTMLButtonElement): void {
    this.waiting = true;
    btn.classList.add('wait');
    btn.textContent = '…';
    this.msg.textContent = t('settings.pressPad');
    this.input.captureNext((c) => {
      this.waiting = false;
      this.msg.textContent = '';
      if (c.kind === 'pad') {
        // A button belongs to one action at a time.
        for (const a of ACTIONS) {
          const list = this.settings.padBindings[a];
          if (list) this.settings.padBindings[a] = list.filter((b) => b !== c.button);
        }
        this.settings.padBindings[action] = [c.button];
        this.commit();
      }
      this.render();
    });
  }

  private resetTab(): void {
    const s = this.settings as unknown as Record<string, unknown>;
    const d = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    if (this.tab === 'keys') {
      this.settings.bindings = structuredClone(DEFAULT_SETTINGS.bindings);
      this.settings.padBindings = structuredClone(DEFAULT_SETTINGS.padBindings);
    } else for (const f of SETTINGS_SCHEMA) if (f.tab === this.tab) s[f.key] = d[f.key];
    this.commit();
    this.render();
  }
}
