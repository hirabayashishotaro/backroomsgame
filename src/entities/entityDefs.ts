/** Entities (SPEC §7). Behaviour is original; Wiki descriptions are not copied. */
export type EntityKind = 'smiler' | 'hound' | 'duller' | 'faceling' | 'skinstealer';

export interface EntityDef {
  kind: EntityKind;
  name: string;
  hp: number;
  /** Damage on contact. */
  damage: number;
  walk: number;
  run: number;
  /** Seconds the entity lives before fading away if nothing happens. */
  life: number;
  /** Hint shown in the journal / when first seen (self-written). */
  hint: string;
  /** Prefers dark places. */
  dark?: boolean;
}

export const ENTITIES: Record<EntityKind, EntityDef> = {
  smiler: {
    kind: 'smiler',
    name: 'スマイラー',
    hp: 90,
    damage: 30,
    walk: 1.2,
    run: 6.6,
    life: 80,
    dark: true,
    hint: '暗がりに浮かぶ笑顔。目を逸らさずに後ずさると消えていく。背を向けて走ると追ってくる。',
  },
  hound: {
    kind: 'hound',
    name: 'ハウンド',
    hp: 70,
    damage: 20,
    walk: 2.2,
    run: 7.0,
    life: 90,
    hint: '四つ足の影。走る足音を聞きつけて追ってくる。しゃがんで静かに歩けば見失う。撃たれると怯む。',
  },
  duller: {
    kind: 'duller',
    name: 'ダラー',
    hp: 120,
    damage: 25,
    walk: 2.0,
    run: 2.6,
    life: 100,
    hint: '動かない灰色の人影。見つめ続けていると、少しずつこちらへ近づいてくる。',
  },
  faceling: {
    kind: 'faceling',
    name: 'フェイスリング',
    hp: 100,
    damage: 25,
    walk: 3.6,
    run: 4.4,
    life: 100,
    hint: '顔のない人影。見ている間は動かない。目を離すと距離を詰めてくる。',
  },
  skinstealer: {
    kind: 'skinstealer',
    name: 'スキンスティーラー',
    hp: 150,
    damage: 35,
    walk: 1.6,
    run: 7.4,
    life: 90,
    hint: '「助けて」と言いながら近づく人。足音がしない。近づかれる前に見分けること。',
  },
};

export const ALL_ENTITIES: EntityKind[] = ['smiler', 'hound', 'duller', 'faceling', 'skinstealer'];
