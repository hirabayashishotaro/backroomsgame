/**
 * The crowd in the ending street: office workers in suits, parents walking
 * with a child, students, shoppers, older people. Simple low-poly figures with
 * a walk cycle, walking up and down the street and stepping around the player.
 * Deterministic layout (seeded), purely visual.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { CURB, STREET_L } from '../levels/hand/ending';

interface Walker {
  root: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  x: number;
  z: number;
  lane: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  scale: number;
  /** Child walking beside this adult (holding hands). */
  child?: Walker;
}

const mats = new Map<number, THREE.MeshLambertMaterial>();
function mat(c: number): THREE.MeshLambertMaterial {
  let m = mats.get(c);
  if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
  return m;
}
const geos = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `${w},${h},${d}`;
  let g = geos.get(k);
  if (!g) geos.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}
const headGeo = new THREE.SphereGeometry(0.12, 10, 8);

interface Outfit {
  top: number;
  bottom: number;
  skin: number;
  hair: number;
  shirt?: number;
  bag?: number;
  long?: boolean;
}

const SKIN = [0xe8c4a0, 0xd8b090, 0xf0d0b0, 0xc89a78, 0xe0b898];
const HAIR = [0x1a1410, 0x2a1e16, 0x3a2a1e, 0x141414, 0x6a4a2a, 0xb8b0a8];
const SUITS = [0x1e2430, 0x2a2e36, 0x1a1a1e, 0x34383e, 0x22283a];
const CASUAL_TOP = [0xd84a4a, 0xf0e8d8, 0x4a7ad8, 0xe8c84a, 0x6ab86a, 0xa85ac8, 0xf0a0b0, 0x8a8a8a, 0xffffff, 0x3a6a5a];
const CASUAL_BOTTOM = [0x2a3a5a, 0x3a3a3a, 0xc8b898, 0x1a1a1a, 0x5a6a8a];

function figure(o: Outfit, height: number): { root: THREE.Group; legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D } {
  const g = new THREE.Group();
  const s = height / 1.7;
  const limb = (geo: THREE.BufferGeometry, color: number, x: number, y: number, len: number) => {
    // Pivot at the top so the limb swings from the hip/shoulder.
    const pivot = new THREE.Group();
    pivot.position.set(x * s, y * s, 0);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.y = (-len / 2) * s;
    m.scale.setScalar(s);
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  const legL = limb(boxGeo(0.14, 0.8, 0.16), o.bottom, -0.09, 0.8, 0.8);
  const legR = limb(boxGeo(0.14, 0.8, 0.16), o.bottom, 0.09, 0.8, 0.8);
  const torso = new THREE.Mesh(boxGeo(0.4, o.long ? 0.78 : 0.58, 0.22), mat(o.top));
  torso.scale.setScalar(s);
  torso.position.y = (o.long ? 1.0 : 1.1) * s;
  g.add(torso);
  if (o.shirt !== undefined) {
    const shirt = new THREE.Mesh(boxGeo(0.1, 0.3, 0.01), mat(o.shirt));
    shirt.scale.setScalar(s);
    shirt.position.set(0, 1.24 * s, -0.115 * s);
    g.add(shirt);
    const tie = new THREE.Mesh(boxGeo(0.035, 0.24, 0.012), mat(0x7a1e24));
    tie.scale.setScalar(s);
    tie.position.set(0, 1.22 * s, -0.122 * s);
    g.add(tie);
  }
  const armL = limb(boxGeo(0.1, 0.62, 0.12), o.top, -0.26, 1.38, 0.62);
  const armR = limb(boxGeo(0.1, 0.62, 0.12), o.top, 0.26, 1.38, 0.62);
  const head = new THREE.Mesh(headGeo, mat(o.skin));
  head.scale.setScalar(s);
  head.position.y = 1.55 * s;
  g.add(head);
  const hair = new THREE.Mesh(headGeo, mat(o.hair));
  hair.scale.set(s * 1.05, s * 0.7, s * 1.05);
  hair.position.set(0, 1.6 * s, 0.015 * s);
  g.add(hair);
  if (o.bag !== undefined) {
    // A briefcase or shopping bag in the right hand.
    const bag = new THREE.Mesh(boxGeo(0.08, 0.28, 0.36), mat(o.bag));
    bag.position.set(0, -0.68, 0);
    armR.add(bag);
  }
  return { root: g, legL, legR, armL, armR };
}

function outfit(rng: Rng, kind: 'suit' | 'casual' | 'student' | 'elder' | 'child'): Outfit {
  const skin = rng.pick(SKIN);
  switch (kind) {
    case 'suit': {
      const c = rng.pick(SUITS);
      return { top: c, bottom: c, skin, hair: rng.pick(HAIR.slice(0, 4)), shirt: 0xf4f4f4, bag: rng.chance(0.6) ? 0x1a1410 : undefined };
    }
    case 'student':
      return { top: 0x1e2440, bottom: rng.chance(0.5) ? 0x1e2440 : 0x3a3a4a, skin, hair: rng.pick(HAIR.slice(0, 4)), bag: rng.chance(0.5) ? 0x2a2a2a : undefined };
    case 'elder':
      return { top: rng.pick([0x8a7a6a, 0x5a4a3a, 0x6a6a7a]), bottom: 0x4a4a4a, skin, hair: rng.pick([0xc8c4c0, 0xa8a4a0, 0xe8e4e0]), long: rng.chance(0.5) };
    case 'child':
      return { top: rng.pick(CASUAL_TOP), bottom: rng.pick(CASUAL_BOTTOM), skin, hair: rng.pick(HAIR.slice(0, 4)) };
    default:
      return { top: rng.pick(CASUAL_TOP), bottom: rng.pick(CASUAL_BOTTOM), skin, hair: rng.pick(HAIR), long: rng.chance(0.25), bag: rng.chance(0.3) ? rng.pick([0xf0e8d8, 0xc84a4a, 0x4a4a4a]) : undefined };
  }
}

export class Crowd {
  readonly root = new THREE.Group();
  private walkers: Walker[] = [];

  constructor(count = 70, seed = 0x7071e) {
    const rng = new Rng(seed);
    // The rest of the world is baked; only the crowd uses real lights (dusk sky + shop light).
    this.root.add(new THREE.HemisphereLight(0xffe8d0, 0x4a4450, 3.2));
    const sun = new THREE.DirectionalLight(0xffc890, 1.6);
    sun.position.set(-3, 4, 2);
    this.root.add(sun);
    const make = (o: Outfit, h: number, x: number, z: number, dir: 1 | -1, speed: number): Walker => {
      const f = figure(o, h);
      this.root.add(f.root);
      return { ...f, x, z, lane: x, dir, speed, phase: rng.float() * 6.28, scale: h / 1.7 };
    };
    for (let i = 0; i < count; i++) {
      const r = rng.float();
      const kind = r < 0.32 ? 'suit' : r < 0.58 ? 'casual' : r < 0.72 ? 'student' : r < 0.84 ? 'elder' : 'parent';
      const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
      // Keep to one side of the street by direction, with plenty of overlap.
      const x = (dir === 1 ? 1 : -1) * (0.4 + rng.float() * (CURB + 1.2)) * (rng.chance(0.8) ? 1 : -1);
      const z = (rng.float() * 2 - 1) * STREET_L;
      const speed = kind === 'elder' ? 0.8 + rng.float() * 0.3 : kind === 'parent' ? 0.9 + rng.float() * 0.2 : 1.1 + rng.float() * 0.5;
      if (kind === 'parent') {
        const adult = make(outfit(rng, 'casual'), 1.62 + rng.float() * 0.18, x, z, dir, speed);
        adult.child = make(outfit(rng, 'child'), 1.0 + rng.float() * 0.25, x + 0.55, z, dir, speed);
        this.walkers.push(adult);
      } else this.walkers.push(make(outfit(rng, kind), (kind === 'elder' ? 1.55 : 1.6) + rng.float() * 0.25, x, z, dir, speed));
    }
  }

  /** Advance the crowd. `toRender` maps world x/z to render space (floating origin). */
  update(dt: number, player: { x: number; z: number }, toRender: (x: number, z: number) => [number, number]): void {
    for (const w of this.walkers) {
      // Step around the player: drift sideways when they are right in front.
      const ahead = (player.z - w.z) * w.dir;
      const side = player.x - w.x;
      let target = w.lane;
      if (ahead > 0 && ahead < 3 && Math.abs(side) < 1) target = w.x - Math.sign(side || 1) * 1.3;
      w.x += (target - w.x) * Math.min(1, dt * 1.5);
      const slow = ahead > 0 && ahead < 1.0 && Math.abs(side) < 0.6 ? 0.2 : 1;
      w.z += w.dir * w.speed * slow * dt;
      if (w.z > STREET_L) w.z -= 2 * STREET_L;
      if (w.z < -STREET_L) w.z += 2 * STREET_L;
      w.phase += dt * w.speed * slow * 4.2;
      this.pose(w, dt);
      if (w.child) {
        const c = w.child;
        c.x = w.x + 0.55;
        c.z = w.z;
        c.dir = w.dir;
        c.phase = w.phase * 1.25;
        this.pose(c, dt);
        // Holding hands: the adult's near arm and the child's arm reach toward each other.
        w.armR.rotation.z = 0.35;
        c.armL.rotation.z = -0.55;
        const [cx, cz] = toRender(c.x, c.z);
        c.root.position.set(cx, this.groundY(c.x) + Math.abs(Math.cos(c.phase)) * 0.03 * c.scale, cz);
        c.root.rotation.y = w.dir === 1 ? Math.PI : 0;
      }
      const [rx, rz] = toRender(w.x, w.z);
      w.root.position.set(rx, this.groundY(w.x) + Math.abs(Math.cos(w.phase)) * 0.03 * w.scale, rz);
      w.root.rotation.y = w.dir === 1 ? Math.PI : 0;
    }
  }

  private groundY(x: number): number {
    return Math.abs(x) > CURB ? 0.12 : 0;
  }

  private pose(w: Walker, _dt: number): void {
    const a = Math.sin(w.phase) * 0.5;
    w.legL.rotation.x = a;
    w.legR.rotation.x = -a;
    w.armL.rotation.x = -a * 0.8;
    w.armR.rotation.x = a * 0.8;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.walkers.length = 0;
  }
}
