import ja from './ja.json';

const dict: Record<string, string> = ja;

/** Look up a UI string (Japanese dictionary; English can be added later). */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = dict[key] ?? key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', String(vars[k]));
  return s;
}
