import ja from './ja.json';

const dict: Record<string, string> = ja;

/** Look up a UI string (Japanese dictionary; English can be added later). */
export function t(key: string): string {
  return dict[key] ?? key;
}
