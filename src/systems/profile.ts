/**
 * The player's profile, shared by every run: the outfit in use and the
 * outfits won (cosplays, trophies, random ones), and how many clears.
 * Stored on its own key. Pure data.
 */
import { getStore, type KeyValueStore } from '../core/storage';
import { COSPLAYS, GOLD, randomSkinId, SILVER, SKINS, type Skin } from '../player/skins';

export interface ProfileData {
  skin: Skin;
  /** Won outfits (cosplays, trophies, random 'rand:<seed>' ones), in the order won. */
  won: Skin[];
  clears: number;
}

const KEY = 'profile';

export class Profile {
  data: ProfileData = { skin: 'suit', won: [], clears: 0 };

  constructor(private store: KeyValueStore | null = null) {}

  private get kv(): KeyValueStore {
    return this.store ?? getStore();
  }

  load(fallbackSkin?: string): void {
    try {
      const raw = this.kv.get(KEY);
      const d = raw ? JSON.parse(raw) : null;
      this.data = {
        skin: typeof d?.skin === 'string' ? d.skin : fallbackSkin && typeof fallbackSkin === 'string' ? fallbackSkin : 'suit',
        won: Array.isArray(d?.won) ? d.won.filter((x: unknown) => typeof x === 'string') : [],
        clears: Number.isFinite(d?.clears) ? d.clears : 0,
      };
    } catch {
      this.data = { skin: 'suit', won: [], clears: 0 };
    }
  }

  save(): void {
    this.kv.set(KEY, JSON.stringify(this.data));
  }

  /** May this skin be worn? (Everyday outfits always; the rest once won; everything with the developer passphrase.) */
  owns(skin: Skin, dev = false): boolean {
    return dev || SKINS.some(([id]) => id === skin) || this.data.won.includes(skin);
  }

  setSkin(skin: Skin): void {
    this.data.skin = skin;
    this.save();
  }

  give(skin: Skin): boolean {
    if (this.data.won.includes(skin)) return false;
    this.data.won.push(skin);
    this.save();
    return true;
  }
}

export interface RunRecord {
  deaths: number;
  /** Times hurt by an entity (contact, shots, spells, blasts...). */
  hurt: number;
}

/**
 * What a clear wins (and records): one cosplay not yet owned (or, sometimes /
 * once they are all owned, a brand-new random outfit); the silver trophy for
 * a clear without dying; the gold trophy for a clear without being hurt by
 * an entity. Returns the new skins.
 */
export function grantClearRewards(p: Profile, run: RunRecord, rng: () => number): Skin[] {
  const out: Skin[] = [];
  p.data.clears++;
  const missing = COSPLAYS.map(([id]) => id).filter((id) => !p.data.won.includes(id));
  let reward: Skin;
  if (missing.length && rng() < 0.65) reward = missing[Math.floor(rng() * missing.length)];
  else {
    let seed = Math.floor(rng() * 0x7fffffff);
    while (p.data.won.includes(randomSkinId(seed))) seed = (seed + 1) >>> 0;
    reward = randomSkinId(seed);
  }
  if (p.give(reward)) out.push(reward);
  if (run.deaths === 0 && p.give(SILVER)) out.push(SILVER);
  if (run.hurt === 0 && p.give(GOLD)) out.push(GOLD);
  p.save();
  return out;
}
