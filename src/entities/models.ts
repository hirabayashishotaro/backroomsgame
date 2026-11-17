/** Procedural stand-in models for entities (replaceable by models/<kind>.glb). */
import * as THREE from 'three';
import type { EntityKind } from './entityDefs';
import type { ChimeraFx, ChimeraGenome, Pattern } from './chimera';
import { Rng } from '../core/rng';
import { swapInGLB } from '../world/glbModels';

function m(color: number, opts: Partial<THREE.MeshBasicMaterialParameters> = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, ...opts });
}

function part(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name?: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  g.add(mesh);
  return mesh;
}

/** Humanoid silhouette: legs, torso, arms, head. */
function humanoid(g: THREE.Group, body: THREE.Material, h = 1.8, thin = 1): void {
  const s = h / 1.8;
  part(g, new THREE.BoxGeometry(0.16 * thin, 0.85 * s, 0.18), body, -0.12, 0.43 * s, 0, 'legL');
  part(g, new THREE.BoxGeometry(0.16 * thin, 0.85 * s, 0.18), body, 0.12, 0.43 * s, 0, 'legR');
  part(g, new THREE.BoxGeometry(0.46 * thin, 0.62 * s, 0.24), body, 0, 1.17 * s, 0, 'torso');
  part(g, new THREE.BoxGeometry(0.12 * thin, 0.7 * s, 0.14), body, -0.32 * thin, 1.1 * s, 0, 'armL');
  part(g, new THREE.BoxGeometry(0.12 * thin, 0.7 * s, 0.14), body, 0.32 * thin, 1.1 * s, 0, 'armR');
  part(g, new THREE.SphereGeometry(0.15 * s, 12, 10), body, 0, 1.62 * s, 0, 'head');
}

export function buildEntityMesh(kind: EntityKind): THREE.Group {
  const g = new THREE.Group();
  g.name = 'entity:' + kind;
  switch (kind) {
    case 'smiler': {
      // Only a grin and two eyes floating in a dark shape.
      const dark = m(0x020202, { opacity: 0.85 });
      part(g, new THREE.SphereGeometry(0.55, 12, 10), dark, 0, 1.7, 0, 'head');
      const glow = m(0xfffff0);
      part(g, new THREE.SphereGeometry(0.07, 8, 6), glow, -0.17, 1.8, -0.5, 'eyeL');
      part(g, new THREE.SphereGeometry(0.07, 8, 6), glow, 0.17, 1.8, -0.5, 'eyeR');
      const grin = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 20, Math.PI), glow);
      grin.position.set(0, 1.62, -0.48);
      grin.rotation.z = Math.PI;
      grin.name = 'grin';
      g.add(grin);
      break;
    }
    case 'hound': {
      const body = m(0x161210);
      part(g, new THREE.BoxGeometry(0.42, 0.45, 1.25), body, 0, 0.75, 0, 'torso');
      part(g, new THREE.BoxGeometry(0.3, 0.32, 0.45), body, 0, 1.0, -0.75, 'head');
      for (const [x, z] of [
        [-0.16, -0.45],
        [0.16, -0.45],
        [-0.16, 0.45],
        [0.16, 0.45],
      ])
        part(g, new THREE.BoxGeometry(0.1, 0.6, 0.1), body, x, 0.3, z, z < 0 ? 'legF' : 'legB');
      const eye = m(0xffd040);
      part(g, new THREE.SphereGeometry(0.035, 6, 5), eye, -0.08, 1.05, -0.98);
      part(g, new THREE.SphereGeometry(0.035, 6, 5), eye, 0.08, 1.05, -0.98);
      break;
    }
    case 'duller':
      humanoid(g, m(0x6a6a6a), 1.85);
      break;
    case 'faceling': {
      humanoid(g, m(0x1a1a1e), 1.8);
      // Smooth, featureless pale face.
      part(g, new THREE.SphereGeometry(0.152, 12, 10), m(0xd8cfc4), 0, 1.62, -0.01, 'face');
      break;
    }
    case 'skinstealer': {
      // Looks almost human: clothes, a pale face... a little too tall and too thin.
      humanoid(g, m(0x3a4a5a), 2.0, 0.8);
      part(g, new THREE.SphereGeometry(0.165, 12, 10), m(0xd8b8a0), 0, 1.8, -0.01, 'face');
      break;
    }
    case 'bloater': {
      // A swollen, sack-like body on stubby legs, glowing seams.
      const skin = m(0xb3ab8a);
      const sack = part(g, new THREE.SphereGeometry(0.58, 16, 12), skin, 0, 0.92, 0, 'torso');
      sack.scale.set(1, 1.15, 0.92);
      part(g, new THREE.BoxGeometry(0.16, 0.42, 0.18), skin, -0.2, 0.21, 0, 'legL');
      part(g, new THREE.BoxGeometry(0.16, 0.42, 0.18), skin, 0.2, 0.21, 0, 'legR');
      part(g, new THREE.BoxGeometry(0.1, 0.55, 0.12), skin, -0.62, 0.95, 0, 'armL');
      part(g, new THREE.BoxGeometry(0.1, 0.55, 0.12), skin, 0.62, 0.95, 0, 'armR');
      part(g, new THREE.SphereGeometry(0.17, 10, 8), skin, 0, 1.65, -0.05, 'head');
      const seam = m(0xff8a2a);
      for (const [y, ry, w] of [
        [1.15, 0.3, 0.7],
        [0.8, -0.5, 0.8],
        [0.55, 0.9, 0.5],
      ]) {
        const c = part(g, new THREE.BoxGeometry(w, 0.035, 0.02), seam, 0, y, -0.52, 'seam');
        c.rotation.z = ry;
      }
      break;
    }
    case 'gunman': {
      // Long coat, wide-brimmed hat, a revolver in the right hand.
      humanoid(g, m(0x4a3524), 1.85);
      part(g, new THREE.SphereGeometry(0.152, 12, 10), m(0xc8a888), 0, 1.67, -0.01, 'face');
      const hat = m(0x1c140e);
      part(g, new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20), hat, 0, 1.79, 0, 'brim');
      part(g, new THREE.CylinderGeometry(0.15, 0.17, 0.17, 14), hat, 0, 1.88, 0, 'crown');
      // Coat tails
      part(g, new THREE.BoxGeometry(0.5, 0.5, 0.28), m(0x3e2c1e), 0, 0.7, 0.02, 'coat');
      const gun = m(0x2a2a2c);
      const arm = g.getObjectByName('armR')!;
      // Arm held straight out toward the target (its lower end is the hand).
      arm.position.set(0.3, 1.36, -0.3);
      arm.rotation.x = 1.45;
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.09), gun);
      barrel.position.set(0, -0.45, 0.03);
      arm.add(barrel);
      arm.userData.aim = true;
      break;
    }
    case 'witch': {
      // Dark robe, tall pointed hat, a staff with a glowing tip.
      const robe = m(0x1e1428);
      part(g, new THREE.ConeGeometry(0.42, 1.35, 16), robe, 0, 0.68, 0, 'robe');
      part(g, new THREE.BoxGeometry(0.4, 0.4, 0.24), robe, 0, 1.3, 0, 'torso');
      part(g, new THREE.BoxGeometry(0.1, 0.62, 0.12), robe, -0.27, 1.15, 0, 'armL');
      part(g, new THREE.SphereGeometry(0.14, 12, 10), m(0xb8b0c0), 0, 1.62, -0.01, 'head');
      const hat = m(0x120c18);
      part(g, new THREE.CylinderGeometry(0.3, 0.3, 0.03, 18), hat, 0, 1.73, 0, 'brim');
      const tip = part(g, new THREE.ConeGeometry(0.16, 0.55, 14), hat, 0, 2.02, 0.04, 'hat');
      tip.rotation.x = 0.25;
      part(g, new THREE.CylinderGeometry(0.025, 0.03, 1.7, 6), m(0x5a4632), 0.34, 0.95, -0.12, 'staff');
      part(g, new THREE.SphereGeometry(0.08, 10, 8), m(0x9ad8ff), 0.34, 1.83, -0.12, 'orb');
      const eye = m(0x9ad8ff);
      part(g, new THREE.SphereGeometry(0.025, 6, 5), eye, -0.05, 1.64, -0.13);
      part(g, new THREE.SphereGeometry(0.025, 6, 5), eye, 0.05, 1.64, -0.13);
      break;
    }
    case 'bomber': {
      // Stocky, padded vest, goggles, a sack of bombs on its back and one in hand.
      humanoid(g, m(0x56553a), 1.75);
      for (const c of g.children) if (c.name === 'torso') c.scale.set(1.25, 1, 1.4);
      part(g, new THREE.BoxGeometry(0.62, 0.42, 0.36), m(0x7a4a1c), 0, 1.15, 0, 'vest');
      part(g, new THREE.BoxGeometry(0.26, 0.06, 0.06), m(0x202020), 0, 1.6, -0.14, 'goggles');
      const sack = part(g, new THREE.SphereGeometry(0.3, 12, 10), m(0x6a5a3e), 0, 1.15, 0.33, 'sack');
      sack.scale.set(1, 1.2, 0.8);
      const arm = g.getObjectByName('armR')!;
      const held = buildBombMesh();
      held.position.set(0, -0.38, 0);
      held.scale.setScalar(0.9);
      arm.add(held);
      break;
    }
    case 'peeker': {
      // A thin figure in a grey suit whose head is a sniper rifle: the long
      // barrel points where it looks, a scope on top with a red lens.
      humanoid(g, m(0x3a3c40), 1.8, 0.9);
      const head = g.getObjectByName('head')!;
      g.remove(head);
      const gun = m(0x1e1f22);
      part(g, new THREE.BoxGeometry(0.16, 0.2, 0.42), gun, 0, 1.6, 0.02, 'stock'); // receiver where the head was
      part(g, new THREE.BoxGeometry(0.12, 0.14, 0.2), m(0x4a3a2a), 0, 1.58, 0.28, 'butt');
      const barrel = part(g, new THREE.CylinderGeometry(0.04, 0.045, 0.95, 8), gun, 0, 1.62, -0.65, 'barrel');
      barrel.rotation.x = Math.PI / 2;
      part(g, new THREE.BoxGeometry(0.11, 0.11, 0.14), gun, 0, 1.62, -1.12, 'muzzle');
      const scope = part(g, new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), gun, 0, 1.75, -0.05, 'scope');
      scope.rotation.x = Math.PI / 2;
      part(g, new THREE.SphereGeometry(0.035, 8, 6), m(0xff2020), 0, 1.75, -0.23, 'lens');
      part(g, new THREE.BoxGeometry(0.03, 0.22, 0.03), gun, 0, 1.43, -0.15, 'bipod');
      break;
    }
    case 'spider': {
      // A spider bigger than a person: low round body, eight long jointed legs, red eyes.
      const body = m(0x1a1512);
      const abd = part(g, new THREE.SphereGeometry(0.62, 14, 10), body, 0, 0.75, 0.45, 'torso');
      abd.scale.set(1, 0.75, 1.15);
      part(g, new THREE.SphereGeometry(0.36, 12, 9), body, 0, 0.6, -0.5, 'head');
      for (let side = -1; side <= 1; side += 2)
        for (let k = 0; k < 4; k++) {
          // Each leg: an upper segment rising outward and a lower one reaching down to the floor.
          const leg = new THREE.Group();
          leg.name = k % 2 === 0 ? 'legF' : 'legB';
          leg.position.set(side * 0.3, 0.65, -0.55 + k * 0.32);
          leg.rotation.y = side * (0.35 - k * 0.25);
          const up = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.07), body);
          up.position.set(side * 0.38, 0.3, 0);
          up.rotation.z = side * 0.65;
          const low = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), body);
          low.position.set(side * 0.8, 0.1, 0);
          low.rotation.z = -side * 0.35;
          leg.add(up, low);
          g.add(leg);
        }
      const eye = m(0xff3020);
      for (const [x, y] of [
        [-0.12, 0.72],
        [0.12, 0.72],
        [-0.22, 0.66],
        [0.22, 0.66],
        [-0.07, 0.8],
        [0.07, 0.8],
      ])
        part(g, new THREE.SphereGeometry(0.035, 6, 5), eye, x, y, -0.83);
      part(g, new THREE.BoxGeometry(0.06, 0.18, 0.06), body, -0.09, 0.42, -0.82, 'fang');
      part(g, new THREE.BoxGeometry(0.06, 0.18, 0.06), body, 0.09, 0.42, -0.82, 'fang');
      break;
    }
    case 'namahage': {
      // A tall figure in a shaggy straw cape, a red horned mask with bared
      // teeth and wild hair, a big blade in its right hand.
      humanoid(g, m(0x3a2a1c), 1.95, 1.15);
      const straw = m(0xb09a5a);
      part(g, new THREE.ConeGeometry(0.62, 1.25, 12), straw, 0, 0.95, 0, 'cape');
      part(g, new THREE.CylinderGeometry(0.42, 0.5, 0.35, 12), straw, 0, 1.52, 0, 'collar');
      const head = g.getObjectByName('head')!;
      g.remove(head);
      const red = m(0xc0281c);
      part(g, new THREE.BoxGeometry(0.34, 0.4, 0.26), red, 0, 1.82, -0.02, 'mask');
      part(g, new THREE.BoxGeometry(0.42, 0.22, 0.2), m(0x2a2420), 0, 2.02, 0.06, 'hair');
      const horn = m(0xe8dcc0);
      for (const sx of [-1, 1]) {
        const h = part(g, new THREE.ConeGeometry(0.05, 0.22, 8), horn, sx * 0.12, 2.1, -0.04, 'horn');
        h.rotation.z = -sx * 0.35;
      }
      const gold = m(0xf2c040);
      part(g, new THREE.SphereGeometry(0.04, 8, 6), gold, -0.08, 1.88, -0.15);
      part(g, new THREE.SphereGeometry(0.04, 8, 6), gold, 0.08, 1.88, -0.15);
      part(g, new THREE.BoxGeometry(0.22, 0.05, 0.02), m(0xf0f0e8), 0, 1.7, -0.16, 'teeth');
      // The blade: held in the right hand (lower end of the arm), pointing forward/up when raised.
      const arm = g.getObjectByName('armR') as THREE.Mesh;
      arm.userData.aim = true;
      // Pivot at the shoulder so the swing looks right.
      const half = 0.35 * (1.95 / 1.8);
      arm.geometry.translate(0, -half, 0);
      arm.position.y += half;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.05), m(0x3a2a18));
      handle.position.set(0, -2 * half - 0.05, 0);
      arm.add(handle);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.85, 0.18), m(0xc8ccd4));
      blade.position.set(0, -2 * half - 0.6, -0.04);
      arm.add(blade);
      break;
    }
    case 'fanman': {
      // An office worker whose head is an electric fan: a round cage, spinning blades.
      humanoid(g, m(0x5a6a7a), 1.8);
      const head = g.getObjectByName('head')!;
      g.remove(head);
      const metal = m(0xd8dcd8);
      part(g, new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), metal, 0, 1.55, 0, 'neck');
      part(g, new THREE.BoxGeometry(0.16, 0.16, 0.18), m(0xe8e8e2), 0, 1.72, 0.12, 'motor');
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24), metal);
      cage.position.set(0, 1.75, -0.04);
      cage.name = 'cage';
      g.add(cage);
      for (let k = 0; k < 4; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012, 0.012), metal);
        bar.position.copy(cage.position);
        bar.rotation.z = (k * Math.PI) / 4;
        g.add(bar);
      }
      const blades = new THREE.Group();
      blades.name = 'blades';
      blades.position.set(0, 1.75, -0.02);
      const bl = m(0x8ac8e8, { opacity: 0.85 });
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.01), bl);
        b.position.set(Math.sin((k * 2 * Math.PI) / 3) * 0.14, Math.cos((k * 2 * Math.PI) / 3) * 0.14, 0);
        b.rotation.z = (-k * 2 * Math.PI) / 3;
        blades.add(b);
      }
      blades.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10).rotateX(Math.PI / 2), m(0x4a6a8a)));
      g.add(blades);
      break;
    }
    case 'bug': {
      // The "missing texture" look: a black and magenta checkerboard figure.
      humanoid(g, missingMat(), 1.8);
      break;
    }
    case 'giant': {
      // A towering, stooped figure about 6.5 m tall.
      humanoid(g, m(0x3a3631), 1.8, 1);
      const k = 6.5 / 1.8;
      for (const c of g.children) {
        c.position.multiplyScalar(k);
        c.scale.setScalar(k);
        if (c.name === 'armL' || c.name === 'armR') {
          c.scale.y = k * 1.35;
          c.position.y -= 0.5;
        }
      }
      const eye = m(0xd8e0ff);
      part(g, new THREE.SphereGeometry(0.07, 8, 6), eye, -0.17, 5.92, -0.5);
      part(g, new THREE.SphereGeometry(0.07, 8, 6), eye, 0.17, 5.92, -0.5);
      break;
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.userData.keep = false) : undefined));
  swapInGLB(g, 'entity_' + kind);
  return g;
}

let missingTex: THREE.CanvasTexture | null = null;
/** Black/magenta checker material, the classic placeholder for a missing texture. */
export function missingMat(repeat = 2): THREE.MeshBasicMaterial {
  if (!missingTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 2, 2);
    g.fillStyle = '#ff00dc';
    g.fillRect(0, 0, 1, 1);
    g.fillRect(1, 1, 1, 1);
    missingTex = new THREE.CanvasTexture(c);
    missingTex.magFilter = THREE.NearestFilter;
    missingTex.minFilter = THREE.NearestFilter;
    missingTex.wrapS = missingTex.wrapT = THREE.RepeatWrapping;
    missingTex.colorSpace = THREE.SRGBColorSpace;
  }
  const t = missingTex.clone();
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true });
}

/** A round black bomb with a short fuse and a blinking red light (named 'light'). */
export function buildBombMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0x1a1a1c, transparent: true }));
  g.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 8), new THREE.MeshBasicMaterial({ color: 0x5a5a5a, transparent: true }));
  cap.position.y = 0.15;
  g.add(cap);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true }));
  light.position.y = 0.2;
  light.name = 'light';
  g.add(light);
  return g;
}

/** The giant's boulder: a lumpy grey rock about 1.5 m across. */
export function buildBoulderMesh(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x77706a, transparent: true });
  const a = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), mat);
  a.scale.set(1, 0.85, 1.1);
  g.add(a);
  const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0x5e5852, transparent: true }));
  b.position.set(0.4, 0.3, -0.2);
  g.add(b);
  return g;
}

/** Fanman's ball of wind: pale swirling rings (a random entity's own colours if given). */
export function buildWindMesh(ring = 0xe0f4ff, coreColor = 0xffffff): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.32 - k * 0.07, 0.035, 6, 18), new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.6 - k * 0.12, depthWrite: false }));
    r.rotation.set(k * 1.1, k * 0.7, 0);
    g.add(r);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: coreColor, transparent: true, opacity: 0.35, depthWrite: false }));
  g.add(core);
  return g;
}

/** A rocket in flight (long axis +Z, nose toward +Z so lookAt points it forward). */
export function buildRocketMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 10), new THREE.MeshBasicMaterial({ color: 0x5a6448 }));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 10), new THREE.MeshBasicMaterial({ color: 0x9a3a26 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.27;
  g.add(nose);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9 }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -0.33;
  g.add(flame);
  return g;
}

// ---------------------------------------------------------------------------
// Random entities: the model is assembled from the genome's parts
// ---------------------------------------------------------------------------

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** A small canvas texture in the genome's pattern and colours (deterministic from the seed). */
function patternMat(pattern: Pattern, color: number, accent: number, seed: number): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const rng = new Rng(seed ^ 0x9a77);
  x.fillStyle = hex(color);
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = hex(accent);
  switch (pattern) {
    case 'stripes':
      for (let y = 0; y < 64; y += 16) x.fillRect(0, y, 64, 6 + rng.int(0, 4));
      break;
    case 'spots':
      for (let k = 0; k < 9; k++) {
        x.beginPath();
        x.arc(rng.float() * 64, rng.float() * 64, 3 + rng.float() * 7, 0, Math.PI * 2);
        x.fill();
      }
      break;
    case 'checker':
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) x.fillRect(i * 8, j * 8, 8, 8);
      break;
    case 'gradient': {
      const gr = x.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, hex(color));
      gr.addColorStop(1, hex(accent));
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      break;
    }
    case 'scales':
      x.strokeStyle = hex(accent);
      x.lineWidth = 2;
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 5; i++) {
          x.beginPath();
          x.arc(i * 16 + (j % 2) * 8, j * 8 + 8, 8, Math.PI, 0);
          x.stroke();
        }
      break;
    case 'noise':
    case 'flat':
    default: {
      // Grain: a little (flat) or a lot (noise) of light and dark speckle.
      const n = pattern === 'noise' ? 700 : 160;
      for (let k = 0; k < n; k++) {
        x.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)';
        x.fillRect(rng.int(0, 63), rng.int(0, 63), pattern === 'noise' ? 3 : 2, pattern === 'noise' ? 3 : 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true });
}

/** A box whose geometry is moved so its top is at the origin (arms and legs swing from there). */
function hanging(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  return geo;
}

export function buildChimeraMesh(gn: ChimeraGenome): THREE.Group {
  const g = new THREE.Group();
  g.name = 'entity:chimera';
  const sc = gn.scale;
  const hip = gn.hipY / sc;
  const sh = gn.shoulderY / sc;
  const uw = gn.width / sc / (gn.lower === 'quad' || gn.lower === 'spider' ? 1.6 : 1);
  const skin = patternMat(gn.pattern, gn.color, gn.accent, gn.seed);
  const acc = m(gn.accent);
  const glow = m(gn.glow);
  const dark = m(0x111111);
  const rng = new Rng(gn.seed ^ 0x51ab);
  // The upper body and head go into 'body' (it bobs when the entity floats).
  const body = new THREE.Group();
  body.name = 'body';
  g.add(body);

  // ---- Lower body
  switch (gn.lower) {
    case 'biped':
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(hanging(0.17, hip, 0.19), skin);
        leg.position.set(sx * Math.max(0.1, uw * 0.45), hip, 0);
        leg.name = sx < 0 ? 'legL' : 'legR';
        g.add(leg);
      }
      break;
    case 'quad': {
      part(g, new THREE.BoxGeometry(uw * 1.6, 0.3, 1.05), skin, 0, hip - 0.08, 0.15, 'barrel');
      for (const [sx, sz] of [
        [-1, -0.25],
        [1, -0.25],
        [-1, 0.55],
        [1, 0.55],
      ]) {
        const leg = new THREE.Mesh(hanging(0.12, hip - 0.1, 0.12), skin);
        leg.position.set(sx * uw * 0.6, hip - 0.1, sz);
        leg.name = sz < 0 ? 'legF' : 'legB';
        g.add(leg);
      }
      break;
    }
    case 'spider': {
      const abd = part(g, new THREE.SphereGeometry(0.4, 12, 9), skin, 0, hip, 0.55, 'abdomen');
      abd.scale.set(1, 0.75, 1.2);
      for (let side = -1; side <= 1; side += 2)
        for (let k = 0; k < 4; k++) {
          const leg = new THREE.Group();
          leg.name = k % 2 === 0 ? 'legF' : 'legB';
          leg.position.set(side * 0.2, hip, -0.3 + k * 0.22);
          leg.rotation.y = side * (0.35 - k * 0.25);
          const up = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), skin);
          up.position.set(side * 0.27, 0.2, 0);
          up.rotation.z = side * 0.6;
          const low = new THREE.Mesh(new THREE.BoxGeometry(0.05, hip + 0.3, 0.05), skin);
          low.position.set(side * 0.56, (0.2 - hip) / 2 + 0.05, 0);
          low.rotation.z = -side * 0.3;
          leg.add(up, low);
          g.add(leg);
        }
      break;
    }
    case 'float': {
      // A ghostly tail tapering to a point under it.
      const tail = new THREE.Mesh(new THREE.ConeGeometry(uw * 0.9, hip, 12), skin);
      tail.rotation.x = Math.PI;
      tail.position.set(0, hip / 2 + 0.05, 0);
      body.add(tail);
      break;
    }
    case 'serpent': {
      part(g, new THREE.CylinderGeometry(uw * 0.55, uw * 0.7, hip, 10), skin, 0, hip / 2, 0, 'neck');
      let parent: THREE.Object3D = g;
      let r = uw * 0.7;
      for (let k = 0; k < 6; k++) {
        const seg = new THREE.Group();
        seg.name = 'tail';
        seg.position.set(0, k === 0 ? 0.12 : 0, k === 0 ? 0.25 : r * 1.5);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), k % 2 ? acc : skin);
        ball.scale.set(1, 0.6, 1);
        seg.add(ball);
        parent.add(seg);
        parent = seg;
        r *= 0.82;
      }
      break;
    }
    case 'wheel': {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 18), dark);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.32, 0);
      wheel.name = 'wheel';
      g.add(wheel);
      for (let k = 0; k < 4; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.56, 0.03), acc);
        spoke.rotation.x = (k * Math.PI) / 4;
        wheel.add(spoke);
        spoke.rotation.set(0, 0, (k * Math.PI) / 4);
      }
      part(g, new THREE.BoxGeometry(0.08, hip - 0.3, 0.08), acc, 0, 0.32 + (hip - 0.3) / 2, 0, 'strut');
      break;
    }
    case 'tripod':
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = part(g, new THREE.CylinderGeometry(0.03, 0.04, hip * 1.12, 6), skin, Math.sin(a) * 0.25, hip / 2, Math.cos(a) * 0.25, k === 0 ? 'legF' : 'legB');
        leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
      }
      part(g, new THREE.SphereGeometry(0.12, 8, 6), acc, 0, hip, 0, 'hub');
      break;
  }

  // ---- Upper body (from hip to shoulder)
  const uh = sh - hip;
  const mid = hip + uh / 2;
  switch (gn.upper) {
    case 'humanoid':
      part(body, new THREE.BoxGeometry(uw * 1.8, uh, 0.26), skin, 0, mid, 0, 'torso');
      break;
    case 'blob': {
      const b = part(body, new THREE.SphereGeometry(uw, 14, 10), skin, 0, mid, 0, 'torso');
      b.scale.set(1, uh / (uw * 2) + 0.2, 0.85);
      break;
    }
    case 'box':
      part(body, new THREE.BoxGeometry(uw * 2, uh, uw * 1.6), skin, 0, mid, 0, 'torso');
      break;
    case 'tower':
      for (let k = 0; k < 3; k++) part(body, new THREE.BoxGeometry(uw * (2 - k * 0.45), uh / 3, uw * (1.4 - k * 0.3)), k === 1 ? acc : skin, 0, hip + uh * (k + 0.5) / 3, 0, 'torso');
      break;
    case 'orb': {
      part(body, new THREE.SphereGeometry(uw, 16, 12), skin, 0, mid, 0, 'torso');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(uw * 1.35, 0.03, 6, 28), acc);
      ring.position.set(0, mid, 0);
      ring.rotation.x = Math.PI / 2 + 0.3;
      body.add(ring);
      break;
    }
    case 'ribs':
      part(body, new THREE.CylinderGeometry(0.05, 0.06, uh, 6), acc, 0, mid, 0.05, 'spine');
      for (let k = 0; k < 4; k++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(uw * (1 - k * 0.12), 0.03, 5, 14, Math.PI * 1.4), skin);
        rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
        rib.position.set(0, hip + uh * (0.2 + k * 0.22), 0);
        body.add(rib);
      }
      break;
  }

  // ---- Arms (pivot at the shoulder); the first pair animates, the right hand holds the tool of its technique.
  const armLen = 0.55 + rng.float() * 0.35;
  for (let pair = 0; pair < gn.arms / 2; pair++)
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(hanging(0.1, armLen * (pair ? 0.8 : 1), 0.12), pair ? acc : skin);
      arm.position.set(sx * (uw + 0.1), sh - 0.05 - pair * uh * 0.4, 0);
      arm.name = pair === 0 ? (sx < 0 ? 'armL' : 'armR') : 'armX';
      g.add(arm);
    }
  const hand = g.getObjectByName('armR');
  if (hand) {
    const at = -armLen - 0.05;
    switch (gn.attack) {
      case 'shoot': {
        hand.userData.aim = true;
        hand.rotation.x = 1.45;
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.1), dark);
        gun.position.set(0, at - 0.1, 0.03);
        hand.add(gun);
        break;
      }
      case 'slash': {
        hand.userData.aim = true;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 0.16), m(gn.fx.second));
        blade.position.set(0, at - 0.45, -0.04);
        hand.add(blade);
        break;
      }
      case 'lob': {
        const bomb = buildFxProjectile(gn.fx, gn.seed, 0.13);
        bomb.position.set(0, at, 0);
        hand.add(bomb);
        break;
      }
      case 'lightning': {
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 6), m(0x5a4632));
        staff.position.set(0, at, -0.1);
        hand.add(staff);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow);
        tip.position.set(0, at + 0.72, -0.1);
        hand.add(tip);
        break;
      }
    }
  }

  // ---- Head (from the shoulders up)
  const hy = sh;
  const eyes = (y: number, z: number, gap = 0.06, r = 0.03) => {
    part(body, new THREE.SphereGeometry(r, 6, 5), glow, -gap, y, z, 'eye');
    part(body, new THREE.SphereGeometry(r, 6, 5), glow, gap, y, z, 'eye');
  };
  switch (gn.head) {
    case 'sphere':
      part(body, new THREE.SphereGeometry(0.16, 12, 10), skin, 0, hy + 0.16, 0, 'head');
      eyes(hy + 0.19, -0.14);
      break;
    case 'eye': {
      part(body, new THREE.SphereGeometry(0.18, 14, 10), m(0xf0ece0), 0, hy + 0.18, 0, 'head');
      part(body, new THREE.SphereGeometry(0.09, 10, 8), glow, 0, hy + 0.18, -0.12, 'iris');
      part(body, new THREE.SphereGeometry(0.045, 8, 6), dark, 0, hy + 0.18, -0.19, 'pupil');
      break;
    }
    case 'tv':
      part(body, new THREE.BoxGeometry(0.4, 0.32, 0.3), acc, 0, hy + 0.17, 0, 'head');
      part(body, new THREE.BoxGeometry(0.32, 0.24, 0.01), glow, 0, hy + 0.17, -0.155, 'screen');
      break;
    case 'skull':
      part(body, new THREE.SphereGeometry(0.16, 12, 10), m(0xe8e2d0), 0, hy + 0.17, 0, 'head');
      part(body, new THREE.BoxGeometry(0.2, 0.07, 0.16), m(0xe8e2d0), 0, hy + 0.04, -0.04, 'jaw');
      part(body, new THREE.SphereGeometry(0.045, 6, 5), dark, -0.06, hy + 0.19, -0.13);
      part(body, new THREE.SphereGeometry(0.045, 6, 5), dark, 0.06, hy + 0.19, -0.13);
      break;
    case 'mask':
      part(body, new THREE.BoxGeometry(0.3, 0.38, 0.2), acc, 0, hy + 0.19, 0, 'head');
      part(body, new THREE.BoxGeometry(0.08, 0.025, 0.02), dark, -0.07, hy + 0.24, -0.105);
      part(body, new THREE.BoxGeometry(0.08, 0.025, 0.02), dark, 0.07, hy + 0.24, -0.105);
      part(body, new THREE.BoxGeometry(0.14, 0.03, 0.02), dark, 0, hy + 0.1, -0.105);
      break;
    case 'fan': {
      const metal = m(0xd8dcd8);
      part(body, new THREE.CylinderGeometry(0.04, 0.05, 0.2, 8), metal, 0, hy + 0.08, 0, 'neck');
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 24), metal);
      cage.position.set(0, hy + 0.32, -0.04);
      body.add(cage);
      const blades = new THREE.Group();
      blades.name = 'blades';
      blades.position.set(0, hy + 0.32, -0.02);
      for (let k = 0; k < 3; k++) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.01), acc);
        bl.position.set(Math.sin((k * 2 * Math.PI) / 3) * 0.13, Math.cos((k * 2 * Math.PI) / 3) * 0.13, 0);
        bl.rotation.z = (-k * 2 * Math.PI) / 3;
        blades.add(bl);
      }
      body.add(blades);
      break;
    }
    case 'none':
      part(body, new THREE.CylinderGeometry(0.07, 0.08, 0.06, 8), m(0x5a1010), 0, hy + 0.03, 0, 'stump');
      break;
    case 'lantern':
      part(body, new THREE.CylinderGeometry(0.15, 0.15, 0.34, 12), glow, 0, hy + 0.2, 0, 'head');
      part(body, new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12), dark, 0, hy + 0.38, 0);
      part(body, new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12), dark, 0, hy + 0.02, 0);
      break;
    case 'cone':
      part(body, new THREE.ConeGeometry(0.18, 0.5, 12), acc, 0, hy + 0.25, 0, 'head');
      eyes(hy + 0.16, -0.12, 0.05);
      break;
    case 'rifle': {
      part(body, new THREE.BoxGeometry(0.15, 0.18, 0.4), dark, 0, hy + 0.12, 0.02, 'head');
      const barrel = part(body, new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), dark, 0, hy + 0.14, -0.62, 'barrel');
      barrel.rotation.x = Math.PI / 2;
      part(body, new THREE.SphereGeometry(0.035, 8, 6), m(0xff2020), 0, hy + 0.27, -0.2, 'lens');
      break;
    }
  }

  // ---- Effects
  if (gn.effect === 'aura') {
    const aura = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.6, (gn.height / sc) * 0.55), 16, 12), m(gn.glow, { opacity: 0.14, depthWrite: false }));
    aura.position.set(0, gn.height / sc / 2, 0);
    aura.name = 'aura';
    g.add(aura);
  }
  if (gn.effect === 'orbit') {
    const orbit = new THREE.Group();
    orbit.name = 'orbit';
    orbit.position.set(0, sh, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glow);
      o.position.set(Math.cos(a) * (uw + 0.45), Math.sin(a * 2) * 0.15, Math.sin(a) * (uw + 0.45));
      orbit.add(o);
    }
    g.add(orbit);
  }
  g.scale.setScalar(sc);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.userData.keep = false) : undefined));
  return g;
}

/**
 * A random entity's projectile (bullet, bomb, boulder, ...) in its own shape,
 * colours and pattern. `size` is its radius (m); the long axis is +Z.
 */
export function buildFxProjectile(fx: ChimeraFx, seed: number, size: number): THREE.Group {
  const g = new THREE.Group();
  const mat = size > 0.12 ? patternMat(fx.pattern, fx.main, fx.second, seed) : new THREE.MeshBasicMaterial({ color: fx.main, transparent: true });
  mat.opacity = fx.opacity;
  const sec = new THREE.MeshBasicMaterial({ color: fx.second, transparent: true, opacity: fx.opacity });
  switch (fx.shape) {
    case 'orb':
      g.add(new THREE.Mesh(new THREE.SphereGeometry(size, 12, 9), mat));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 1.35, 10, 8), new THREE.MeshBasicMaterial({ color: fx.second, transparent: true, opacity: 0.25, depthWrite: false })));
      break;
    case 'shard': {
      const m1 = new THREE.Mesh(new THREE.OctahedronGeometry(size * 1.2, 0), mat);
      m1.scale.set(0.7, 0.7, 1.6);
      g.add(m1);
      break;
    }
    case 'needle': {
      const n = new THREE.Mesh(new THREE.ConeGeometry(size * 0.6, size * 5, 8), mat);
      n.rotation.x = Math.PI / 2;
      g.add(n);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(size * 0.7, 8, 6), sec);
      tail.position.z = -size * 2.2;
      g.add(tail);
      break;
    }
    case 'cube': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(size * 1.5, size * 1.5, size * 1.5), mat));
      const c = new THREE.Mesh(new THREE.BoxGeometry(size * 0.8, size * 0.8, size * 0.8), sec);
      c.rotation.set(0.6, 0.6, 0);
      g.add(c);
      break;
    }
    case 'ring': {
      g.add(new THREE.Mesh(new THREE.TorusGeometry(size, size * 0.3, 8, 16), mat));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.4, 8, 6), sec));
      break;
    }
    case 'star':
    default:
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(size * 0.45, size * 0.45, size * 2.4), k ? sec : mat);
        b.rotation.set(k === 1 ? Math.PI / 2 : 0, k === 2 ? Math.PI / 2 : 0, 0);
        g.add(b);
      }
      g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.6, 8, 6), mat));
  }
  return g;
}

/** Set overall opacity (fade in/out). */
export function setEntityAlpha(g: THREE.Group, a: number): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (!mat.userData.base) mat.userData.base = mat.opacity;
      mat.opacity = a * (mat.userData.base as number);
    }
  });
}

/** Simple walk cycle for procedural models (GLB models play their own clip). */
export function animateEntity(g: THREE.Group, kind: EntityKind, phase: number, speed: number, hitFlash: number, dt: number): void {
  const mixer = g.userData.mixer as THREE.AnimationMixer | undefined;
  if (mixer) {
    mixer.update(dt * Math.max(0.2, speed / 2));
    return;
  }
  const sw = Math.sin(phase) * Math.min(1, speed / 3) * 0.6;
  for (const c of g.children) {
    if (c.name === 'legL' || c.name === 'legF') c.rotation.x = sw;
    if (c.name === 'legR' || c.name === 'legB') c.rotation.x = -sw;
    if (c.name === 'armL') c.rotation.x = -sw * 0.7;
    if (c.name === 'armR' && !c.userData.aim) c.rotation.x = sw * 0.7;
    if (c.name === 'orb') c.scale.setScalar(1 + Math.sin(phase * 2 + performance.now() * 0.006) * 0.25);
    if (kind === 'smiler' && c.name === 'grin') c.scale.setScalar(1 + Math.sin(phase * 0.3) * 0.05);
  }
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (!mat.userData.col) mat.userData.col = mat.color.clone();
    mat.color.copy(mat.userData.col as THREE.Color).lerp(new THREE.Color(0xff2020), Math.min(1, hitFlash));
  });
}

export function disposeEntityMesh(g: THREE.Group): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  });
  g.removeFromParent();
}
