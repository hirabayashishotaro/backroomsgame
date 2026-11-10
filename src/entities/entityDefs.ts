/** Entities (SPEC §7). Behaviour is original; Wiki descriptions are not copied. */
export type EntityKind = 'smiler' | 'hound' | 'duller' | 'faceling' | 'skinstealer' | 'bloater' | 'giant' | 'gunman' | 'witch' | 'bomber' | 'bug';

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
  /** Needs open sky or a very high ceiling. */
  tall?: boolean;
}

/** Entity health multiplier (user request: entities were too weak). */
export const HP_SCALE = 5;

export const ENTITIES: Record<EntityKind, EntityDef> = {
  smiler: {
    kind: 'smiler',
    name: 'スマイラー',
    hp: 90 * HP_SCALE,
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
    hp: 70 * HP_SCALE,
    damage: 20,
    walk: 2.2,
    run: 7.0,
    life: 90,
    hint: '四つ足の影。走る足音を聞きつけて追ってくる。しゃがんで静かに歩けば見失う。撃たれると怯む。',
  },
  duller: {
    kind: 'duller',
    name: 'ダラー',
    hp: 120 * HP_SCALE,
    damage: 25,
    walk: 2.0,
    run: 2.6,
    life: 100,
    hint: '動かない灰色の人影。見つめ続けていると、少しずつこちらへ近づいてくる。',
  },
  faceling: {
    kind: 'faceling',
    name: 'フェイスリング',
    hp: 100 * HP_SCALE,
    damage: 25,
    walk: 3.6,
    run: 4.4,
    life: 100,
    hint: '顔のない人影。見ている間は動かない。目を離すと距離を詰めてくる。',
  },
  skinstealer: {
    kind: 'skinstealer',
    name: 'スキンスティーラー',
    hp: 150 * HP_SCALE,
    damage: 35,
    walk: 1.6,
    run: 7.4,
    life: 90,
    hint: '「助けて」と言いながら近づく人。足音がしない。近づかれる前に見分けること。',
  },
  bloater: {
    kind: 'bloater',
    name: 'フクレ',
    hp: 40 * HP_SCALE,
    damage: 60,
    walk: 2.4,
    run: 3.4,
    life: 90,
    hint: '膨れた袋のような人影。音もなく寄ってきて、すぐそばで膨らみ、破裂する。シューという音がしたら離れること。',
  },
  giant: {
    kind: 'giant',
    name: 'ダイダラ',
    hp: 600 * HP_SCALE,
    damage: 40,
    walk: 1.5,
    run: 3.2,
    life: 160,
    tall: true,
    hint: '見上げるほど大きな人影。歩みは遅いが、足元に近づくと踏みつけてくる。地響きが聞こえたら距離を取れ。',
  },
  gunman: {
    kind: 'gunman',
    name: 'ガンマン',
    hp: 110 * HP_SCALE,
    damage: 12,
    walk: 3.0,
    run: 4.8,
    life: 120,
    hint: 'つば広帽の人影。距離を保って横に動きながら、マグナムを6連射してくる。弾は見て避けられる。撃ち尽くした後の装填が狙い目。',
  },
  witch: {
    kind: 'witch',
    name: 'ウィッチャー',
    hp: 90 * HP_SCALE,
    damage: 35,
    walk: 2.6,
    run: 3.8,
    life: 120,
    hint: '杖を持つ黒衣の人影。遠くから、足元に光る輪を描き、そこへ雷を落とす。輪が見えたらすぐ外へ出ること。',
  },
  bomber: {
    kind: 'bomber',
    name: 'ボマー',
    hp: 100 * HP_SCALE,
    damage: 30,
    walk: 2.8,
    run: 4.2,
    life: 120,
    hint: '背中に袋を背負った人影。山なりに爆弾を投げてくる。爆弾は落ちてから少しして爆発し、周りのものを吹き飛ばす。赤い点滅から離れること。',
  },
  bug: {
    kind: 'bug',
    name: 'バグ',
    hp: 60 * HP_SCALE,
    damage: 0,
    walk: 2.2,
    run: 4.6,
    life: 100000,
    hint: '黒と紫の格子模様の人型。テクスチャが読み込めなかったような姿で、ときどき跳ぶように位置がずれる。襲ってはこない。世界のほつれそのもの。',
  },
};

/** Every ordinary kind (the escape condition counts these; the Bug is special). */
export const ALL_ENTITIES: EntityKind[] = ['smiler', 'hound', 'duller', 'faceling', 'skinstealer', 'bloater', 'giant', 'gunman', 'witch', 'bomber'];
