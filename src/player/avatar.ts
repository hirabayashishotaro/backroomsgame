/**
 * The player's own body, seen in third person (user request): a procedural
 * humanoid in one of several outfits. Everything is boxes, spheres and
 * Canvas patterns (no external assets). The model faces -Z like the entities.
 */
import * as THREE from 'three';

import { chromeEnv } from '../proc-tex/chrome';
import { GOLD, isBaseSkin, outfitGenome, SILVER, type BaseSkin, type OutfitGenome, type Pattern, type Skin } from './skins';
export type { Skin } from './skins';

function mat(color: number | THREE.Texture): THREE.MeshBasicMaterial {
  return typeof color === 'number' ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshBasicMaterial({ map: color });
}

function canvasTex(draw: (g: CanvasRenderingContext2D) => void, size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Bright flowers on blue (aloha shirt). */
function hawaiianTex(): THREE.CanvasTexture {
  return canvasTex((g) => {
    g.fillStyle = '#1f6fb8';
    g.fillRect(0, 0, 64, 64);
    const flower = (x: number, y: number, c: string) => {
      g.fillStyle = c;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffd23a';
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    };
    g.fillStyle = '#2a9a4a';
    for (const [x, y] of [
      [22, 8],
      [50, 40],
      [8, 50],
    ]) {
      g.beginPath();
      g.ellipse(x, y, 7, 3, 0.6, 0, Math.PI * 2);
      g.fill();
    }
    flower(12, 14, '#ffffff');
    flower(42, 18, '#ff6a8a');
    flower(28, 40, '#ffffff');
    flower(54, 56, '#ff6a8a');
  });
}

/** Woodland camouflage. */
function camoTex(): THREE.CanvasTexture {
  return canvasTex((g) => {
    g.fillStyle = '#5d6b3c';
    g.fillRect(0, 0, 64, 64);
    const blobs: Array<[string, number[][]]> = [
      ['#3e4a26', [[10, 12, 9], [44, 30, 11], [20, 50, 8], [58, 8, 6]]],
      ['#7a6a44', [[34, 8, 7], [8, 34, 7], [50, 54, 8]]],
      ['#232816', [[26, 26, 5], [56, 40, 4], [12, 58, 4]]],
    ];
    for (const [c, list] of blobs) {
      g.fillStyle = c;
      for (const [x, y, r] of list) {
        g.beginPath();
        g.ellipse(x, y, r, r * 0.7, x * 0.1, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** Denim. */
function denimTex(): THREE.CanvasTexture {
  return canvasTex((g) => {
    g.fillStyle = '#34507a';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let i = -64; i < 64; i += 3) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
    }
  });
}

interface Outfit {
  top: THREE.MeshBasicMaterial;
  arms: THREE.MeshBasicMaterial;
  hands: THREE.MeshBasicMaterial;
  legs: THREE.MeshBasicMaterial;
  shoes: THREE.MeshBasicMaterial;
  /** Bare forearms / shins (short sleeves, shorts). */
  shortSleeves?: boolean;
  shorts?: boolean;
}

const SKIN = 0xe0b08c;
const HAIR = 0x2a2018;

function outfit(skin: BaseSkin): Outfit {
  const s = mat(SKIN);
  switch (skin) {
    case 'suit':
      return { top: mat(0x1e2433), arms: mat(0x1e2433), hands: s, legs: mat(0x1a1e2a), shoes: mat(0x0c0c0c) };
    case 'hoodie':
      return { top: mat(0x5a6168), arms: mat(0x5a6168), hands: s, legs: mat(denimTex()), shoes: mat(0xe8e8e8) };
    case 'hawaiian': {
      const shirt = mat(hawaiianTex());
      return { top: shirt, arms: shirt, hands: s, legs: mat(0xc8b48a), shoes: mat(0x6a4a2a), shortSleeves: true, shorts: true };
    }
    case 'researcher':
      return { top: mat(0xd8862a), arms: mat(0xd8862a), hands: mat(0x2a2a2a), legs: mat(0xd8862a), shoes: mat(0x3a2a1a) };
    case 'casual':
      return { top: mat(0xc84a4a), arms: mat(0xc84a4a), hands: s, legs: mat(denimTex()), shoes: mat(0x2a2a3a), shortSleeves: true };
    case 'military': {
      const camo = mat(camoTex());
      return { top: camo, arms: camo, hands: mat(0x3a3426), legs: camo, shoes: mat(0x1e1a14) };
    }
  }
}

/** A box hanging from its top (limbs swing from the hip / shoulder). */
function limb(w: number, h: number, d: number, m: THREE.Material, name: string, x: number, y: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, 0);
  mesh.name = name;
  return mesh;
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, name = ''): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/**
 * A body in an outfit (`o`), decorated for `skin` when it is one of the
 * everyday outfits (any other name: a plain body to decorate further).
 */
function buildBody(skin: string, o: Outfit): THREE.Group {
  const g = new THREE.Group();
  g.name = 'avatar';
  const skinMat = mat(SKIN);
  const hair = mat(HAIR);
  // Legs (hip at 0.9)
  for (const sx of [-1, 1]) {
    const leg = limb(0.17, 0.82, 0.2, o.legs, sx < 0 ? 'legL' : 'legR', sx * 0.11, 0.9);
    if (o.shorts) {
      // Shorts end above the knee; bare shins below.
      leg.material = o.legs;
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.16), skinMat);
      shin.position.set(0, -0.56, 0);
      leg.add(shin);
      (leg.geometry as THREE.BoxGeometry).dispose();
      leg.geometry = new THREE.BoxGeometry(0.18, 0.38, 0.21).translate(0, -0.19, 0);
    }
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.28), o.shoes);
    shoe.position.set(0, -0.8, -0.04);
    leg.add(shoe);
    g.add(leg);
  }
  // Torso (0.9 .. 1.5)
  add(g, new THREE.BoxGeometry(0.46, 0.62, 0.26), o.top, 0, 1.2, 0, 'torso');
  // Arms (shoulder at 1.48)
  for (const sx of [-1, 1]) {
    const arm = limb(0.12, o.shortSleeves ? 0.26 : 0.6, 0.14, o.arms, sx < 0 ? 'armL' : 'armR', sx * 0.3, 1.48);
    if (o.shortSleeves) {
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.12), skinMat);
      fore.position.set(0, -0.44, 0);
      arm.add(fore);
    }
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.11), o.hands);
    hand.position.set(0, -0.66, 0);
    arm.add(hand);
    g.add(arm);
  }
  // Head (1.52 .. 1.82)
  const head = add(g, new THREE.BoxGeometry(0.24, 0.27, 0.25), skinMat, 0, 1.66, 0, 'head');
  const eye = mat(0x1a1a1a);
  add(head, new THREE.BoxGeometry(0.035, 0.03, 0.01), eye, -0.055, 0.02, -0.126);
  add(head, new THREE.BoxGeometry(0.035, 0.03, 0.01), eye, 0.055, 0.02, -0.126);
  const hairCap = () => {
    add(head, new THREE.BoxGeometry(0.26, 0.08, 0.27), hair, 0, 0.14, 0.005, 'hair');
    add(head, new THREE.BoxGeometry(0.26, 0.2, 0.03), hair, 0, 0.04, 0.125); // back of the head
    add(head, new THREE.BoxGeometry(0.02, 0.12, 0.2), hair, -0.125, 0.07, 0.03);
    add(head, new THREE.BoxGeometry(0.02, 0.12, 0.2), hair, 0.125, 0.07, 0.03);
  };

  switch (skin) {
    case 'suit': {
      hairCap();
      add(g, new THREE.BoxGeometry(0.12, 0.42, 0.01), mat(0xf2f2f2), 0, 1.27, -0.131); // shirt front
      add(g, new THREE.BoxGeometry(0.05, 0.34, 0.012), mat(0xa01c24), 0, 1.25, -0.138); // tie
      add(g, new THREE.BoxGeometry(0.5, 0.06, 0.28), mat(0x1e2433), 0, 1.47, 0); // shoulders
      break;
    }
    case 'hoodie': {
      // Hood up over the head, its opening dark; a front pocket and strings.
      const hood = mat(0x50575e);
      add(head, new THREE.BoxGeometry(0.31, 0.33, 0.3), hood, 0, 0.03, 0.03, 'hood');
      add(head, new THREE.BoxGeometry(0.22, 0.22, 0.01), mat(0x14161a), 0, -0.01, -0.124);
      add(head, new THREE.BoxGeometry(0.035, 0.03, 0.01), mat(0xd8d0c0), -0.055, 0.02, -0.13);
      add(head, new THREE.BoxGeometry(0.035, 0.03, 0.01), mat(0xd8d0c0), 0.055, 0.02, -0.13);
      add(g, new THREE.BoxGeometry(0.3, 0.14, 0.02), mat(0x4c5258), 0, 1.04, -0.135);
      add(g, new THREE.BoxGeometry(0.015, 0.16, 0.015), mat(0xe8e8e8), -0.05, 1.4, -0.14);
      add(g, new THREE.BoxGeometry(0.015, 0.16, 0.015), mat(0xe8e8e8), 0.05, 1.4, -0.14);
      break;
    }
    case 'hawaiian': {
      hairCap();
      add(head, new THREE.BoxGeometry(0.22, 0.05, 0.02), mat(0x111111), 0, 0.02, -0.13, 'sunglasses');
      add(g, new THREE.BoxGeometry(0.18, 0.1, 0.01), skinMat, 0, 1.44, -0.131); // open collar
      break;
    }
    case 'researcher': {
      // Hard hat with a headlamp, a backpack, reflective stripes.
      add(head, new THREE.BoxGeometry(0.26, 0.16, 0.03), hair, 0, 0.02, 0.125);
      add(head, new THREE.BoxGeometry(0.3, 0.1, 0.31), mat(0xf2c21a), 0, 0.17, 0, 'helmet');
      add(head, new THREE.BoxGeometry(0.34, 0.025, 0.35), mat(0xf2c21a), 0, 0.12, 0);
      add(head, new THREE.BoxGeometry(0.08, 0.06, 0.04), mat(0xfff6c0), 0, 0.15, -0.165, 'lamp');
      add(g, new THREE.BoxGeometry(0.38, 0.46, 0.18), mat(0x4a4a3a), 0, 1.22, 0.22, 'pack');
      const refl = mat(0xe8f0e8);
      add(g, new THREE.BoxGeometry(0.47, 0.04, 0.27), refl, 0, 1.05, 0);
      add(g, new THREE.BoxGeometry(0.47, 0.04, 0.27), refl, 0, 1.32, 0);
      break;
    }
    case 'casual': {
      hairCap();
      add(head, new THREE.BoxGeometry(0.27, 0.06, 0.2), mat(0x2a3a6a), 0, 0.17, -0.06, 'cap');
      add(head, new THREE.BoxGeometry(0.22, 0.02, 0.12), mat(0x2a3a6a), 0, 0.14, -0.18);
      add(g, new THREE.BoxGeometry(0.16, 0.12, 0.01), mat(0xf2e8d0), 0, 1.3, -0.131); // print on the shirt
      break;
    }
    case 'military': {
      // Helmet, plate carrier with pouches.
      add(head, new THREE.BoxGeometry(0.26, 0.16, 0.03), hair, 0, 0.02, 0.125);
      add(head, new THREE.BoxGeometry(0.31, 0.13, 0.32), mat(0x4a5230), 0, 0.15, 0.01, 'helmet');
      const vest = mat(0x55603a);
      add(g, new THREE.BoxGeometry(0.5, 0.44, 0.32), vest, 0, 1.24, 0, 'vest');
      for (const x of [-0.14, 0, 0.14]) add(g, new THREE.BoxGeometry(0.11, 0.12, 0.05), mat(0x48522f), x, 1.1, -0.18);
      add(g, new THREE.BoxGeometry(0.5, 0.06, 0.3), mat(0x2e3220), 0, 0.92, 0); // belt
      break;
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Every kind of outfit
// ---------------------------------------------------------------------------

/** The player's body in the chosen outfit, about 1.8 m tall, feet at y = 0. */
export function buildAvatar(skin: Skin): THREE.Group {
  if (isBaseSkin(skin)) return buildBody(skin, outfit(skin));
  if (skin === SILVER || skin === GOLD) return buildTrophy(skin === GOLD);
  if (skin.startsWith('cos:')) return buildCosplay(skin.slice(4));
  if (skin.startsWith('rand:')) return buildRandom(outfitGenome(Number(skin.slice(5))));
  return buildBody('suit', outfit('suit'));
}

const plain = (top: number, legs: number, shoes = 0x1a1a1a, hands = SKIN): Outfit => ({ top: mat(top), arms: mat(top), hands: mat(hands), legs: mat(legs), shoes: mat(shoes) });

/** Entity cosplays: a plain body in the entity's colours, its head (or hat) on top. */
function buildCosplay(kind: string): THREE.Group {
  switch (kind) {
    case 'smiler': {
      // All black; a black ball for a head with two white eyes and a wide grin.
      const g = buildBody('none', plain(0x0c0c0c, 0x0c0c0c, 0x050505, 0x0c0c0c));
      const head = g.getObjectByName('head')!;
      add(head, new THREE.SphereGeometry(0.2, 14, 10), mat(0x050505), 0, 0.02, 0, 'mask');
      const glow = mat(0xfffff0);
      add(head, new THREE.SphereGeometry(0.03, 8, 6), glow, -0.07, 0.06, -0.18);
      add(head, new THREE.SphereGeometry(0.03, 8, 6), glow, 0.07, 0.06, -0.18);
      const grin = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 18, Math.PI), glow);
      grin.position.set(0, -0.02, -0.175);
      grin.rotation.z = Math.PI;
      head.add(grin);
      return g;
    }
    case 'hound': {
      // A dark furry suit with a dog-eared hood, a snout and yellow eyes.
      const fur = 0x1e1814;
      const g = buildBody('none', plain(fur, fur, 0x100c0a, fur));
      const head = g.getObjectByName('head')!;
      add(head, new THREE.BoxGeometry(0.28, 0.3, 0.29), mat(fur), 0, 0.02, 0.01, 'hood');
      add(head, new THREE.BoxGeometry(0.16, 0.12, 0.16), mat(fur), 0, -0.04, -0.2, 'snout');
      add(head, new THREE.BoxGeometry(0.05, 0.04, 0.02), mat(0x0a0a0a), 0, -0.01, -0.285);
      for (const sx of [-1, 1]) {
        const ear = add(head, new THREE.ConeGeometry(0.05, 0.14, 4), mat(fur), sx * 0.09, 0.22, 0.02, 'ear');
        ear.rotation.z = -sx * 0.25;
        add(head, new THREE.SphereGeometry(0.025, 6, 5), mat(0xffd040), sx * 0.06, 0.05, -0.15);
      }
      return g;
    }
    case 'namahage': {
      // A straw cape, a red horned mask with bared teeth and wild hair.
      const g = buildBody('none', plain(0x3a2a1c, 0x3a2a1c, 0x2a1a10));
      const straw = mat(0xb09a5a);
      add(g, new THREE.ConeGeometry(0.42, 0.95, 12), straw, 0, 1.02, 0, 'cape');
      add(g, new THREE.CylinderGeometry(0.3, 0.36, 0.22, 12), straw, 0, 1.44, 0);
      const head = g.getObjectByName('head')!;
      add(head, new THREE.BoxGeometry(0.28, 0.32, 0.22), mat(0xc0281c), 0, 0, -0.03, 'mask');
      add(head, new THREE.BoxGeometry(0.34, 0.14, 0.2), mat(0x2a2420), 0, 0.17, 0.06, 'hair');
      for (const sx of [-1, 1]) {
        const horn = add(head, new THREE.ConeGeometry(0.035, 0.16, 8), mat(0xe8dcc0), sx * 0.09, 0.24, -0.04);
        horn.rotation.z = -sx * 0.35;
        add(head, new THREE.SphereGeometry(0.03, 8, 6), mat(0xf2c040), sx * 0.06, 0.04, -0.15);
      }
      add(head, new THREE.BoxGeometry(0.16, 0.035, 0.02), mat(0xf0f0e8), 0, -0.08, -0.145);
      return g;
    }
    case 'fanman': {
      // An office worker whose head is an electric fan.
      const g = buildBody('none', plain(0x5a6a7a, 0x3a4450, 0x1a1a1a));
      const head = g.getObjectByName('head')!;
      head.scale.setScalar(0.6);
      const metal = mat(0xd8dcd8);
      add(g, new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), metal, 0, 1.62, 0);
      add(g, new THREE.BoxGeometry(0.14, 0.14, 0.16), mat(0xe8e8e2), 0, 1.78, 0.1);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 6, 24), metal);
      cage.position.set(0, 1.8, -0.04);
      g.add(cage);
      const blades = new THREE.Group();
      blades.position.set(0, 1.8, -0.03);
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.01), mat(0x8ac8e8));
        b.position.set(Math.sin((k * 2 * Math.PI) / 3) * 0.11, Math.cos((k * 2 * Math.PI) / 3) * 0.11, 0);
        b.rotation.z = (-k * 2 * Math.PI) / 3;
        blades.add(b);
      }
      g.add(blades);
      return g;
    }
    case 'peeker': {
      // A grey suit and a sniper rifle where the head should be.
      const g = buildBody('none', plain(0x3a3c40, 0x2e3034, 0x111111));
      const head = g.getObjectByName('head')!;
      head.visible = false;
      const gun = mat(0x1e1f22);
      add(g, new THREE.BoxGeometry(0.15, 0.18, 0.4), gun, 0, 1.64, 0.02);
      const barrel = add(g, new THREE.CylinderGeometry(0.035, 0.04, 0.8, 8), gun, 0, 1.66, -0.58);
      barrel.rotation.x = Math.PI / 2;
      const scope = add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 10), gun, 0, 1.78, -0.05);
      scope.rotation.x = Math.PI / 2;
      add(g, new THREE.SphereGeometry(0.03, 8, 6), mat(0xff2020), 0, 1.78, -0.21);
      return g;
    }
    case 'witch': {
      // A dark robe to the floor and a tall pointed hat.
      const robe = 0x1e1428;
      const g = buildBody('none', plain(robe, robe, 0x0a0810, 0xb8b0c0));
      add(g, new THREE.ConeGeometry(0.36, 1.0, 14), mat(robe), 0, 0.5, 0, 'robe');
      const head = g.getObjectByName('head')!;
      (head as THREE.Mesh).material = mat(0xb8b0c0);
      add(head, new THREE.CylinderGeometry(0.26, 0.26, 0.025, 18), mat(0x120c18), 0, 0.13, 0);
      const tip = add(head, new THREE.ConeGeometry(0.13, 0.45, 14), mat(0x120c18), 0, 0.36, 0.03);
      tip.rotation.x = 0.25;
      add(head, new THREE.SphereGeometry(0.022, 6, 5), mat(0x9ad8ff), -0.05, 0.02, -0.13);
      add(head, new THREE.SphereGeometry(0.022, 6, 5), mat(0x9ad8ff), 0.05, 0.02, -0.13);
      return g;
    }
    case 'gunman':
    default: {
      // A long brown coat and a wide-brimmed hat.
      const g = buildBody('none', plain(0x4a3524, 0x2e2418, 0x1a120c));
      add(g, new THREE.BoxGeometry(0.48, 0.5, 0.28), mat(0x3e2c1e), 0, 0.72, 0.02, 'coat');
      const head = g.getObjectByName('head')!;
      add(head, new THREE.CylinderGeometry(0.3, 0.3, 0.025, 20), mat(0x1c140e), 0, 0.14, 0);
      add(head, new THREE.CylinderGeometry(0.13, 0.15, 0.15, 14), mat(0x1c140e), 0, 0.22, 0);
      return g;
    }
  }
}

/** The trophies: a whole body of polished silver or gold. */
function buildTrophy(gold: boolean): THREE.Group {
  const g = buildBody('suit', outfit('suit'));
  const env = chromeEnv();
  void env;
  const base = gold ? 0xffc84a : 0xdfe4ea;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const old = m.material as THREE.MeshBasicMaterial;
    // Keep a hint of the details (eyes, tie) a little darker.
    const dark = old.color && old.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.12;
    m.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(base).multiplyScalar(dark ? 0.55 : 1), envMap: env, reflectivity: 1, combine: THREE.MultiplyOperation });
    old.map?.dispose();
    old.dispose();
  });
  return g;
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Cloth for random outfits. */
function clothTex(pattern: Pattern, color: number, accent: number): THREE.MeshBasicMaterial {
  if (pattern === 'flat') return mat(color);
  if (pattern === 'denim') return mat(denimTex());
  if (pattern === 'camo') return mat(camoTex());
  if (pattern === 'floral') return mat(hawaiianTex());
  return mat(
    canvasTex((g) => {
      g.fillStyle = hex(color);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = hex(accent);
      if (pattern === 'stripes') for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 7);
      else if (pattern === 'check') {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) g.fillRect(i * 8, j * 8, 8, 8);
      } else
        for (const [x, y] of [
          [10, 10],
          [40, 18],
          [22, 40],
          [52, 50],
          [6, 56],
          [54, 4],
        ]) {
          g.beginPath();
          g.arc(x, y, 5, 0, Math.PI * 2);
          g.fill();
        }
    }),
  );
}

/** A random outfit, assembled from its genome. */
function buildRandom(o: OutfitGenome): THREE.Group {
  const top = clothTex(o.top.pattern, o.top.color, o.top.accent);
  const g = buildBody('none', { top, arms: top, hands: mat(SKIN), legs: clothTex(o.legs.pattern, o.legs.color, o.legs.accent), shoes: mat(o.shoes), shortSleeves: o.shortSleeves, shorts: o.shorts });
  const head = g.getObjectByName('head')!;
  const hair = mat(o.hair);
  const hc = mat(o.headColor);
  // Hair under everything except a hood.
  if (o.head !== 'hood') {
    add(head, new THREE.BoxGeometry(0.26, 0.08, 0.27), hair, 0, 0.14, 0.005);
    add(head, new THREE.BoxGeometry(0.26, 0.2, 0.03), hair, 0, 0.04, 0.125);
  }
  switch (o.head) {
    case 'cap':
      add(head, new THREE.BoxGeometry(0.27, 0.06, 0.24), hc, 0, 0.17, -0.02);
      add(head, new THREE.BoxGeometry(0.22, 0.02, 0.12), hc, 0, 0.14, -0.18);
      break;
    case 'beanie':
      add(head, new THREE.BoxGeometry(0.28, 0.12, 0.28), hc, 0, 0.17, 0);
      add(head, new THREE.SphereGeometry(0.045, 8, 6), mat(o.top.accent), 0, 0.26, 0);
      break;
    case 'helmet':
      add(head, new THREE.BoxGeometry(0.31, 0.13, 0.32), hc, 0, 0.15, 0.01);
      break;
    case 'hood':
      add(head, new THREE.BoxGeometry(0.31, 0.33, 0.3), hc, 0, 0.03, 0.03);
      add(head, new THREE.BoxGeometry(0.22, 0.22, 0.01), mat(0x14161a), 0, -0.01, -0.124);
      break;
    case 'tophat':
      add(head, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), hc, 0, 0.14, 0);
      add(head, new THREE.CylinderGeometry(0.12, 0.12, 0.24, 16), hc, 0, 0.27, 0);
      break;
    case 'bandana':
      add(head, new THREE.BoxGeometry(0.265, 0.07, 0.265), hc, 0, 0.1, 0);
      break;
    case 'crown':
      add(head, new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8, 1, true), mat(0xf2c040), 0, 0.2, 0);
      break;
  }
  const ac = mat(o.accessoryColor);
  switch (o.accessory) {
    case 'pack':
      add(g, new THREE.BoxGeometry(0.36, 0.44, 0.16), ac, 0, 1.22, 0.21);
      break;
    case 'scarf':
      add(g, new THREE.BoxGeometry(0.3, 0.08, 0.3), ac, 0, 1.5, 0);
      add(g, new THREE.BoxGeometry(0.08, 0.3, 0.03), ac, 0.08, 1.33, -0.145);
      break;
    case 'tie':
      add(g, new THREE.BoxGeometry(0.05, 0.34, 0.012), ac, 0, 1.25, -0.136);
      break;
    case 'glasses':
      add(head, new THREE.BoxGeometry(0.22, 0.05, 0.02), mat(0x111111), 0, 0.02, -0.13);
      break;
    case 'cape': {
      const cape = add(g, new THREE.BoxGeometry(0.5, 1.0, 0.03), ac, 0, 1.0, 0.16);
      cape.rotation.x = -0.08;
      break;
    }
  }
  return g;
}

/**
 * Pose the body: walking swings the limbs with the step phase, crouching
 * lowers it, holding something raises the right arm forward by `holdAngle`.
 */
export function poseAvatar(g: THREE.Group, phase: number, speed: number, crouch: number, holdAngle: number | null, airborne: boolean): void {
  const sw = Math.sin(phase) * Math.min(1, speed / 3) * 0.7;
  for (const c of g.children) {
    if (c.name === 'legL') c.rotation.x = airborne ? -0.4 : sw;
    if (c.name === 'legR') c.rotation.x = airborne ? 0.2 : -sw;
    if (c.name === 'armL') c.rotation.x = -sw * 0.8;
    if (c.name === 'armR') c.rotation.x = holdAngle ?? sw * 0.8; // + = forward (holding something)
  }
  // Crouch: the whole body shorter (scaled from the feet).
  g.scale.y = 1 - 0.3 * crouch;
}

/** How far forward the right arm is raised for what it holds: guns aimed out, the rest held low. */
export function holdAngleFor(kind: 'gun' | 'other'): number {
  return kind === 'gun' ? 1.35 : 0.45;
}

/**
 * Put an item model in the right hand (replacing what was there). The arm
 * is raised by `angle`; the item is counter-rotated so it points straight
 * ahead (models point -Z with their origin at the grip).
 */
export function holdInHand(g: THREE.Group, item: THREE.Object3D | null, angle: number): void {
  const arm = g.getObjectByName('armR');
  if (!arm) return;
  const old = arm.getObjectByName('held');
  if (old) {
    old.removeFromParent();
    // Same rule as the first-person hands: shared geometries and materials stay.
    old.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.sharedGeo) m.geometry.dispose();
    });
  }
  if (!item) return;
  item.name = 'held';
  item.position.set(0, -0.66, -0.02);
  item.rotation.set(-angle, 0, 0);
  arm.add(item);
}
