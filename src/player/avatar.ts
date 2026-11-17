/**
 * The player's own body, seen in third person (user request): a procedural
 * humanoid in one of several outfits. Everything is boxes, spheres and
 * Canvas patterns (no external assets). The model faces -Z like the entities.
 */
import * as THREE from 'three';

import type { Skin } from './skins';
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

function outfit(skin: Skin): Outfit {
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

/** The player's body in the chosen outfit, about 1.8 m tall, feet at y = 0. */
export function buildAvatar(skin: Skin): THREE.Group {
  const g = new THREE.Group();
  g.name = 'avatar';
  const o = outfit(skin);
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

/**
 * Pose the body: walking swings the limbs with the step phase, crouching
 * lowers it, a held weapon raises the right arm forward.
 */
export function poseAvatar(g: THREE.Group, phase: number, speed: number, crouch: number, holding: boolean, airborne: boolean): void {
  const sw = Math.sin(phase) * Math.min(1, speed / 3) * 0.7;
  for (const c of g.children) {
    if (c.name === 'legL') c.rotation.x = airborne ? -0.4 : sw;
    if (c.name === 'legR') c.rotation.x = airborne ? 0.2 : -sw;
    if (c.name === 'armL') c.rotation.x = -sw * 0.8;
    if (c.name === 'armR') c.rotation.x = holding ? 1.35 : sw * 0.8; // + = forward
  }
  // Crouch: the whole body shorter (scaled from the feet).
  g.scale.y = 1 - 0.3 * crouch;
}
