/**
 * Journal — "放浪者の記録" (SPEC §4.4, §5.4.7): visited levels, what was
 * found there, exits used, and the route graph. Pure data; saved with the run.
 */
export interface JournalLevel {
  id: string;
  title: string;
  name: string;
  threat: number;
  kind: string;
  firstVisit: number;
  visits: number;
  /** Set piece ids seen in this level. */
  pieces: string[];
  /** Exit kinds used to leave this level, with the (self-written) discovery text. */
  exits: Array<{ kind: string; to: string; text: string }>;
  /** Entities seen (reserved for Phase 7). */
  entities: string[];
}

export interface JournalEdge {
  from: string;
  to: string;
  kind: string;
  count: number;
}

export interface JournalData {
  levels: Record<string, JournalLevel>;
  edges: JournalEdge[];
  /** Order of discovery. */
  order: string[];
}

export const MILESTONES = [10, 50, 100];

export class Journal {
  data: JournalData = { levels: {}, edges: [], order: [] };

  get count(): number {
    return this.data.order.length;
  }

  /** Record arriving in a level. Returns true if it is a new discovery. */
  visit(info: { id: string; title: string; name: string; threat: number; kind: string }, now = Date.now()): boolean {
    const l = this.data.levels[info.id];
    if (l) {
      l.visits++;
      return false;
    }
    this.data.levels[info.id] = { ...info, firstVisit: now, visits: 1, pieces: [], exits: [], entities: [] };
    this.data.order.push(info.id);
    return true;
  }

  /** Record a set piece seen in a level. Returns true if new. */
  seePiece(levelId: string, piece: string): boolean {
    const l = this.data.levels[levelId];
    if (!l || l.pieces.includes(piece)) return false;
    l.pieces.push(piece);
    return true;
  }

  /** Record leaving `from` for `to` through an exit of `kind`. */
  travel(from: string, to: string, kind: string, text: string): void {
    const l = this.data.levels[from];
    if (l && !l.exits.some((e) => e.kind === kind && e.to === to)) l.exits.push({ kind, to, text });
    const e = this.data.edges.find((x) => x.from === from && x.to === to && x.kind === kind);
    if (e) e.count++;
    else this.data.edges.push({ from, to, kind, count: 1 });
  }

  /** A milestone reached by the latest discovery, if any. */
  milestone(): number | null {
    return MILESTONES.includes(this.count) ? this.count : null;
  }

  toJSON(): JournalData {
    return this.data;
  }

  load(d: JournalData | undefined | null): void {
    this.data = d && typeof d === 'object' && d.levels && Array.isArray(d.edges) && Array.isArray(d.order) ? d : { levels: {}, edges: [], order: [] };
  }
}

/**
 * Simple deterministic layout for the route map: nodes on rings by discovery
 * order, then a few relaxation steps so connected levels sit closer.
 */
export function layoutGraph(data: JournalData, w: number, h: number): Record<string, { x: number; y: number }> {
  const ids = data.order;
  const pos: Record<string, { x: number; y: number }> = {};
  const cx = w / 2;
  const cy = h / 2;
  ids.forEach((id, i) => {
    const ring = Math.floor(Math.sqrt(i));
    const a = i * 2.399963; // golden angle
    const r = 40 + ring * Math.min(w, h) * 0.12;
    pos[id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  for (let it = 0; it < 120; it++) {
    for (const e of data.edges) {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b || a === b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - 90) * 0.01;
      a.x += (dx / d) * f;
      a.y += (dy / d) * f;
      b.x -= (dx / d) * f;
      b.y -= (dy / d) * f;
    }
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]];
        const b = pos[ids[j]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy || 1;
        if (d2 > 140 * 140) continue;
        const d = Math.sqrt(d2);
        const f = (140 - d) * 0.03;
        a.x -= (dx / d) * f;
        a.y -= (dy / d) * f;
        b.x += (dx / d) * f;
        b.y += (dy / d) * f;
      }
    for (const id of ids) {
      pos[id].x = Math.min(w - 30, Math.max(30, pos[id].x));
      pos[id].y = Math.min(h - 30, Math.max(30, pos[id].y));
    }
  }
  return pos;
}
