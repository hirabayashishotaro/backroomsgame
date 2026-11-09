/**
 * Explicit levels for the many ways a level can extend (user request):
 * vertical, linear, diagonal, closed, chaotic and flat worlds.
 */
import { Rng } from '../../core/rng';
import type { ExitRule, ExitTarget, LevelDefinition } from '../levelDefinition';
import * as W from '../worlds2';

const t = (...ids: Array<string | [string, number]>): ExitTarget[] => ids.map((x) => (typeof x === 'string' ? { levelId: x, weight: 1 } : { levelId: x[0], weight: x[1] }));
const door = (targets: ExitTarget[], discovery: string, prop: 'plain-door' | 'hatch' = 'plain-door'): ExitRule => ({ kind: 'door', prop, targets, discovery });

type Lazy = () => LevelDefinition;

/** id -> builder (built on first use; chaos needs the registry to be ready). */
export const SHAPE_LEVELS: Record<string, Lazy> = {
  '111': () =>
    W.makeSpiral(
      {
        id: '111',
        title: 'Level 111',
        name: '無限螺旋階段',
        subtitle: 'The Endless Stairwell',
        threat: 1,
        kindLabel: '縦に無限(手作り)',
        exits: [
          door(t('0', '512', '120', '14', ['37.2', 1]), '踊り場の扉は、階ごとに別の世界へ開いた。'),
          { kind: 'depth', depth: 90, targets: t('120', '313'), discovery: '階段をひたすら降り(昇り)続けると、別の場所にいた。' },
          { kind: 'floor', targets: t('313'), discovery: '色の違う踊り場が抜け、吹き抜けへ落ちた。' },
        ],
      },
      new Rng(1111),
    ),
  '222': () =>
    W.makeTunnel(
      {
        id: '222',
        title: 'Level 222',
        name: '無限トンネル',
        subtitle: 'The Endless Tunnel',
        threat: 1,
        kindLabel: '一本道(手作り)',
        exits: [
          door(t('1', '2', '14', '186'), 'トンネルの壁の扉は、どこかの地下へ続いていた。'),
          { kind: 'walk', distance: 1500, targets: t('0', '1'), discovery: '一本道を延々と歩くと、景色が変わった。' },
          { kind: 'wall', push: 2.5, targets: t('139'), discovery: '色の違う壁の継ぎ目をすり抜けた。' },
          { kind: 'floor', targets: t('27'), discovery: '線路の間の床が抜けた。' },
        ],
      },
      new Rng(2222),
    ),
  chaos: () =>
    W.makeChaos(
      {
        id: 'chaos',
        title: 'Level ÿ̷̢̛0̴̡̕',
        name: '崩れた世界',
        subtitle: 'Chaos',
        threat: 4,
        kindLabel: 'カオス(手作り)',
        exits: [
          door(t('0', '1', '2', '13', 'null', '451', '77'), 'どこの扉かも分からない扉を開けた。'),
          { kind: 'wall', push: 2, targets: t('0', '139'), discovery: '継ぎ目の壁をすり抜けた。' },
          { kind: 'floor', targets: t('null', 'void'), discovery: '世界の隙間から落ちた。' },
          { kind: 'walk', distance: 800, targets: t('0'), discovery: '歩き続けると、世界が少しずつ形を取り戻した。' },
        ],
      },
      new Rng(4444),
    ),
  '303': () =>
    W.makeMountain(
      {
        id: '303',
        title: 'Level 303',
        name: '雪山',
        subtitle: 'The Endless Slope',
        threat: 2,
        kindLabel: '斜めに無限(手作り)',
        sky: 'day',
        exits: [
          door(t('13', '1', 'u1'), '山小屋の扉を開けると、暖かい空気と一緒に別の場所が広がった。'),
          { kind: 'special', zone: 'gate', seconds: 0.4, targets: t('u1', '9999'), discovery: '石の門の光をくぐると、空の上だった。' },
          { kind: 'walk', distance: 1800, targets: t('77'), discovery: '山を下り続けると、湿った森に入っていた。' },
        ],
      },
      new Rng(3033),
    ),
  '666': () =>
    W.makeVolcano({
      id: '666',
      title: 'Level 666',
      name: '火山',
      subtitle: 'The Caldera',
      threat: 4,
      kindLabel: '限られた道(手作り)',
      exits: [
        door(t('120', '2', '27'), '黒曜石の扉は、ひんやりとした場所に通じていた。'),
        { kind: 'special', zone: 'gate', seconds: 0.4, targets: t('9999', 'void'), discovery: '噴気孔に飛び込むと、熱さを感じる前に暗闇にいた。' },
        { kind: 'walk', distance: 1200, targets: t('303'), discovery: '尾根を歩き続けると、空気が冷たくなった。' },
      ],
    }),
  '1000': () =>
    W.makeTemple({
      id: '1000',
      title: 'Level 1000',
      name: '時の神殿',
      subtitle: 'Temple of Time',
      threat: 0,
      kindLabel: 'ひと部屋だけ(手作り)',
      exits: [
        door(t('0', '1', '2', '4.3', '7.5', '13', '37', '139', 'u1', 'u2', 'u3', '808'), '十二の扉のひとつを開けた。'),
        { kind: 'special', zone: 'gate', seconds: 1.5, targets: t('null'), discovery: '光る円盤の上に立ち続けると、時間が止まった。' },
        { kind: 'wall', push: 2.5, targets: t('chaos'), discovery: '東の壁の継ぎ目を押すと、世界が崩れた。' },
      ],
    }),
  '808': () =>
    W.makeIsland({
      id: '808',
      title: 'Level 808',
      name: '永遠の孤島',
      subtitle: 'The Eternal Island',
      threat: 1,
      kindLabel: '閉じ込められた島(手作り)',
      exits: [
        door(t('7.5', '13', 'u3', '37'), '流れ着いた扉を開けると、波の音が遠のいた。'),
        { kind: 'special', zone: 'gate', seconds: 0.3, targets: t('9999', 'u1', 'chaos'), discovery: '漂ってきたワームホールに飛び込んだ。' },
        { kind: 'floor', targets: t('37'), discovery: '湿った砂が崩れて、タイルの部屋に落ちた。' },
      ],
    }),
  '120': () =>
    W.makeCave({
      id: '120',
      title: 'Level 120',
      name: '洞窟',
      subtitle: 'The Deep Caves',
      threat: 2,
      kindLabel: '縦にも横にも(手作り)',
      exits: [
        door(t('666', '27', '2'), '岩壁の扉は、どこか暖かい場所へ通じていた。'),
        { kind: 'depth', depth: 56, targets: t('313', '111'), discovery: '縦穴を何層も降りると、壁が柔らかくなっていた。' },
        { kind: 'walk', distance: 1400, targets: t('77'), discovery: '洞窟を抜けると、キノコの森だった。' },
      ],
    }),
  '512': () =>
    W.makeMansion(
      {
        id: '512',
        title: 'Level 512',
        name: '無限マンション',
        subtitle: 'The Endless Mansion',
        threat: 1,
        kindLabel: '縦に無限の摩天楼(手作り)',
        exits: [
          door(t('0', '1', '4.3', '13', '186', '212', 'u2', '808', '1000', '222'), '部屋の扉を開けると、部屋ではなかった。'),
          { kind: 'depth', depth: 60, targets: t('212'), discovery: '階段をどこまでも上ると、屋上に出た。' },
          { kind: 'walk', distance: 1200, targets: t('222'), discovery: '廊下を歩き続けると、地下鉄のトンネルに出た。' },
        ],
      },
      new Rng(5120),
    ),
  '77': () =>
    W.makeSwamp(
      {
        id: '77',
        title: 'Level 77',
        name: 'キノコの湿地',
        subtitle: 'The Fungal Mire',
        threat: 2,
        kindLabel: '起伏の森(手作り)',
        exits: [
          door(t('120', '13', 'u2'), '切り株の扉の中は、別の場所につながっていた。'),
          { kind: 'floor', targets: t('27', '120'), discovery: '色の違う地面に沈んでいった。' },
          { kind: 'walk', distance: 1400, targets: t('303'), discovery: '森を抜けると、雪が降り始めた。' },
        ],
      },
      new Rng(7777),
    ),
  '451': () =>
    W.makeBooks({
      id: '451',
      title: 'Level 451',
      name: '本の回廊',
      subtitle: 'The Floating Library',
      threat: 2,
      kindLabel: '跳び移る浮島(手作り)',
      exits: [
        door(t('4.3', '1000', '13'), '本の上の扉は、静かな場所へ続いていた。'),
        { kind: 'floor', targets: t('0', '2'), discovery: '本から足を踏み外して、どこまでも落ちていった。' },
        { kind: 'walk', distance: 900, targets: t('1000'), discovery: '本を渡り続けると、神殿が見えた。' },
      ],
    }),
  '313': () =>
    W.makeGullet({
      id: '313',
      title: 'Level 313',
      name: '食道',
      subtitle: 'The Gullet',
      threat: 3,
      kindLabel: '下へ無限(手作り)',
      exits: [
        door(t('2', '27', '120'), '弁の扉を押し開けて、外に転がり出た。', 'hatch'),
        { kind: 'depth', depth: 140, targets: t('chaos', '37'), discovery: 'ずっと下まで降りきると、知らない場所に吐き出された。' },
        { kind: 'floor', targets: t('27'), discovery: '柔らかい場所が裂けて、落ちていった。' },
      ],
    }),
  '900': () =>
    W.makeColossus(
      {
        id: '900',
        title: 'Level 900',
        name: '巨像',
        subtitle: 'The Colossus',
        threat: 0,
        kindLabel: '巨像と扉ひとつ(手作り)',
        exits: [
          door(t('1000', '0'), 'ただひとつの扉を開けた。'),
          { kind: 'special', zone: 'gate', seconds: 1, targets: t('9999'), discovery: '巨像の足もとの光に立つと、空へ吸い上げられた。' },
          { kind: 'floor', targets: t('void'), discovery: '広場の縁から落ちた。' },
        ],
      },
      'dusk',
    ),
  null: () =>
    W.makeGlassVoid({
      id: 'null',
      title: 'Level NULL',
      name: '透明な虚無',
      subtitle: 'Nothing',
      threat: 0,
      kindLabel: '透明な床だけ(手作り)',
      exits: [
        { kind: 'walk', distance: 1000, targets: t('0', 'void'), discovery: '何もない床を歩き続けると、何かがあった。' },
        { kind: 'floor', targets: t('void'), discovery: '黒いタイルを踏むと、床が消えた。' },
        { kind: 'special', zone: 'gate', seconds: 0.5, targets: t('1000', 'chaos'), discovery: '光の柱に触れた。' },
      ],
    }),
  '212': () =>
    W.makeRooftops({
      id: '212',
      title: 'Level 212',
      name: '夜の屋上',
      subtitle: 'Rooftops at Night',
      threat: 2,
      kindLabel: '屋上を跳び移る(手作り)',
      exits: [
        door(t('512', '186', '222'), '塔屋の扉を開けると、階段ではなかった。'),
        { kind: 'floor', targets: t('222', '27'), discovery: '屋上から落ちた。地面に着く前に、景色が変わった。' },
        { kind: 'walk', distance: 1200, targets: t('u1'), discovery: '屋上を渡り続けると、夜明けの高速道路に出た。' },
      ],
    }),
  '9999': () =>
    W.makeEnd({
      id: '9999',
      title: 'Level 9999',
      name: '終端の浮島',
      subtitle: 'The Last Islands',
      threat: 3,
      kindLabel: '虚空の浮島(手作り)',
      exits: [
        door(t('1000', '808'), '浮島の扉を開けた。'),
        { kind: 'special', zone: 'gate', seconds: 0.4, targets: t('0', 'null'), discovery: '虚空の門に飛び込むと、黄色い壁紙に囲まれていた。' },
        { kind: 'floor', targets: t('void', 'chaos'), discovery: '浮島から落ちた。' },
        { kind: 'walk', distance: 1000, targets: t('900'), discovery: '浮島を渡り続けると、巨大な像が見えた。' },
      ],
    }),
  '37.2': () =>
    W.makePoolTower({
      id: '37.2',
      title: 'Level 37.2',
      name: '重なるプールルーム',
      subtitle: 'The Stacked Poolrooms',
      threat: 0,
      kindLabel: '縦に重なる(手作り)',
      exits: [
        door(t('37', '13', 'u3'), 'タイルの扉は、別の水辺に通じていた。'),
        { kind: 'depth', depth: 64, targets: t('37', 'u2'), discovery: 'プールを何層も降りると、景色が変わった。' },
        { kind: 'walk', distance: 1200, targets: t('37'), discovery: '水辺を歩き続けた。' },
      ],
    }),
  '186': () =>
    W.makeHospital({
      id: '186',
      title: 'Level 186',
      name: '夜の病院',
      subtitle: 'The Night Ward',
      threat: 2,
      kindLabel: '夜の病院(手作り)',
      exits: [
        door(t('4.3', '14', '512', '222'), '病室の扉を開けると、廊下ではなかった。'),
        { kind: 'wall', push: 2.5, targets: t('139'), discovery: '病棟の壁をすり抜けた。' },
        { kind: 'floor', targets: t('27'), discovery: 'リノリウムの床が抜けた。' },
        { kind: 'walk', distance: 1100, targets: t('14'), discovery: '緑の非常灯をたどり続けた。' },
      ],
    }),
};

export const SHAPE_LEVEL_IDS = Object.keys(SHAPE_LEVELS);
