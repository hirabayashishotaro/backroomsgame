/** Hand-made special worlds from SPEC §4.2.1 (U1-U3) and The Void. */
import { Rng } from '../../core/rng';
import { makeGardenLevel, makeRoadLevel, makeTatamiLevel, makeWalkwayLevel } from '../worlds';

export const levelU1 = makeRoadLevel(
  {
    id: 'u1',
    title: 'Level U1',
    name: '天空の高速道路',
    subtitle: 'Skyway Dawn',
    threat: 1,
    sky: 'dawn',
    kindLabel: '浮遊道路・夜明け',
    exits: [
      {
        kind: 'door',
        prop: 'plain-door',
        targets: [
          { levelId: '1', weight: 2 },
          { levelId: '4', weight: 2 },
          { levelId: '13', weight: 1 },
        ],
        discovery: '空中の休憩所の扉は、地上のどこかに通じていた。',
      },
      { kind: 'special', zone: 'gate', seconds: 0.4, targets: [{ levelId: 'u3', weight: 1 }], discovery: '標識門の下の光をくぐると、明るい未来都市にいた。' },
      { kind: 'floor', targets: [{ levelId: '33', weight: 2 }, { levelId: '2', weight: 1 }], discovery: '道路の縁から落ちて、雲海を抜けた。' },
      { kind: 'walk', distance: 1600, targets: [{ levelId: '2', weight: 1 }], discovery: '道を延々と進むと、らせん状に下っていった。' },
    ],
  },
  new Rng(101),
);

export const levelU2 = makeTatamiLevel(
  {
    id: 'u2',
    title: 'Level U2',
    name: '畳の橋',
    subtitle: 'Tatami Bridges',
    threat: 1,
    sky: 'night',
    kindLabel: '座敷と橋・夜',
    exits: [
      {
        kind: 'door',
        prop: 'plain-door',
        targets: [
          { levelId: '0', weight: 2 },
          { levelId: '37', weight: 1 },
          { levelId: '13', weight: 1 },
        ],
        discovery: '襖を開けると、見覚えのある黄色い壁があった。',
      },
      { kind: 'floor', targets: [{ levelId: '57', weight: 1 }], discovery: '畳の色の違う一枚を踏むと、水の底へ沈んでいった。' },
      { kind: 'wall', push: 2.5, targets: [{ levelId: '0', weight: 1 }], discovery: '障子を押し続けると、紙の向こうへ抜けた。' },
      { kind: 'walk', distance: 1400, targets: [{ levelId: 'u3', weight: 1 }], discovery: '長い橋を渡り続けると、明るい門が見えた。' },
    ],
  },
  new Rng(102),
);

export const levelU3 = makeGardenLevel(
  {
    id: 'u3',
    title: 'Level U3',
    name: 'エアロの未来',
    subtitle: 'Aero Future',
    threat: 0,
    sky: 'day',
    kindLabel: 'エアロ広場・昼',
    exits: [
      {
        kind: 'door',
        prop: 'plain-door',
        targets: [
          { levelId: '13', weight: 1 },
          { levelId: 'u1', weight: 1 },
          { levelId: '4', weight: 1 },
        ],
        discovery: '白い扉の向こうは、別の世界だった。',
      },
      { kind: 'special', zone: 'gate', seconds: 0.4, targets: [{ levelId: '88', weight: 1 }, { levelId: '213', weight: 1 }], discovery: '滝の壁をくぐり抜けると、知らない場所に出た。' },
      { kind: 'floor', targets: [{ levelId: 'u1', weight: 1 }], discovery: '白いタイルの色の違う場所で、床が抜けた。' },
      { kind: 'walk', distance: 1500, targets: [{ levelId: 'u1', weight: 1 }], discovery: '歩き続けると、雲の上の道路に出た。' },
    ],
  },
  'aero',
  new Rng(103),
);

export const levelVoid = makeWalkwayLevel(
  {
    id: 'void',
    title: 'The Void',
    name: '虚無',
    subtitle: 'The Void',
    threat: 3,
    sky: 'void',
    kindLabel: '虚無の足場',
    exits: [
      {
        kind: 'door',
        prop: 'plain-door',
        targets: [
          { levelId: '0', weight: 1 },
          { levelId: '404', weight: 3 },
        ],
        discovery: '何もない闇に、扉だけが浮かんでいた。',
      },
      { kind: 'floor', targets: [{ levelId: '0', weight: 1 }, { levelId: '999', weight: 3 }], discovery: '足場を踏み外し、闇の中を落ち続けた。' },
      { kind: 'walk', distance: 900, targets: [{ levelId: '404', weight: 1 }], discovery: '細い足場を渡り続けると、闇が薄れていった。' },
    ],
  },
  new Rng(104),
);
