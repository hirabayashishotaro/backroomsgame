/**
 * The lecture-hall ending, staged (user design). A fixed little film:
 *  1. First person: you step out of the speaker's door onto the stage and
 *     walk toward the lectern (no control of the view).
 *  2. Cut to a seat in the audience: you - in your outfit - stand at the
 *     lectern presenting what you saw in the Backrooms, slide after slide
 *     (the levels you went through, the entities you met, with pictures).
 *  3. A bow, applause, fade out.
 * The audience is a scattering of people in suits and everyday clothes.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { buildAvatar, poseAvatar } from '../player/avatar';
import { LECTURE_SPOTS, lectureSeats } from '../levels/hand/lecture';

export interface Slide {
  title: string;
  lines: string[];
  /** A picture (data URL) - an entity's model, for instance. */
  image?: string | null;
}

/** Timeline (s). */
export const LECTURE_T = { walk: 5.4, cut: 6.0, slidesEnd: 33, bow: 33.2, applause: 33.8, fadeOut: 38, end: 39.5 };

type ToRender = (x: number, z: number) => [number, number];

export class LectureEnding {
  readonly root = new THREE.Group();
  private presenter: THREE.Group;
  private audience: THREE.Group[] = [];
  private screenTex: THREE.CanvasTexture;
  private screenCanvas: HTMLCanvasElement;
  private slideIdx = -1;
  private images = new Map<string, HTMLImageElement>();
  applauded = false;
  /** The player's field of view (first-person part). */
  baseFov = 75;

  constructor(
    skin: string,
    private slides: Slide[],
    private toRender: ToRender,
  ) {
    // The audience: about a third of the seats, mostly suits and everyday clothes.
    const rng = new Rng(0x1ec7);
    const outfits = ['suit', 'suit', 'suit', 'casual', 'casual', 'hoodie', 'hawaiian', 'researcher', 'military'];
    for (const [x, z, y] of lectureSeats()) {
      if (!rng.chance(0.32)) continue;
      // Leave the view from the camera's seat (back of the centre aisle) open.
      if (Math.abs(x - 16) < 3.2 && z > 17) continue;
      const a = buildAvatar(rng.pick(outfits));
      // Seated: thighs forward, a little lower; facing the stage (-Z).
      for (const c of a.children) if (c.name === 'legL' || c.name === 'legR') c.rotation.x = 1.45;
      a.userData.base = y - 0.42;
      a.userData.phase = rng.float() * 6.28;
      const [rx, rz] = this.toRender(x, z);
      a.position.set(rx + (rng.float() - 0.5) * 0.1, y - 0.42, rz);
      this.root.add(a);
      this.audience.push(a);
    }
    // You, at the lectern, facing the audience (+Z).
    this.presenter = buildAvatar(skin);
    const [px, pz] = this.toRender(LECTURE_SPOTS.lectern.x + 0.75, LECTURE_SPOTS.lectern.z - 0.2);
    this.presenter.position.set(px, 0.3, pz);
    this.presenter.rotation.y = Math.PI - 0.35;
    this.presenter.visible = false;
    this.root.add(this.presenter);
    // The picture on the screen.
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 576;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const sc = LECTURE_SPOTS.screen;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sc.x1 - sc.x0, sc.y1 - sc.y0), new THREE.MeshBasicMaterial({ map: this.screenTex }));
    const [sx, sz] = this.toRender((sc.x0 + sc.x1) / 2, sc.z + 0.02);
    plane.position.set(sx, (sc.y0 + sc.y1) / 2, sz);
    this.root.add(plane);
    for (const s of slides)
      if (s.image) {
        const img = new Image();
        img.onload = () => {
          if (this.slideIdx >= 0 && this.slides[this.slideIdx] === s) this.drawSlide(s);
        };
        img.src = s.image;
        this.images.set(s.image, img);
      }
    this.drawBlank();
  }

  private drawBlank(): void {
    const g = this.screenCanvas.getContext('2d')!;
    g.fillStyle = '#f4f4f0';
    g.fillRect(0, 0, 1024, 576);
    this.screenTex.needsUpdate = true;
  }

  private drawSlide(s: Slide): void {
    const g = this.screenCanvas.getContext('2d')!;
    g.fillStyle = '#f6f4ee';
    g.fillRect(0, 0, 1024, 576);
    g.fillStyle = '#1e3a5a';
    g.fillRect(0, 0, 1024, 92);
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px sans-serif';
    g.textBaseline = 'middle';
    g.fillText(s.title, 40, 48, 944);
    const img = s.image ? this.images.get(s.image) : undefined;
    const textW = img ? 560 : 944;
    g.fillStyle = '#202020';
    g.font = '30px sans-serif';
    s.lines.forEach((l, i) => g.fillText(l, 50, 150 + i * 52, textW));
    if (img && img.complete && img.naturalWidth) {
      g.fillStyle = '#1a1a14';
      g.fillRect(640, 120, 340, 340);
      g.drawImage(img, 650, 130, 320, 320);
    }
    g.fillStyle = '#8a8a80';
    g.font = '20px sans-serif';
    g.fillText('THE BACKROOMS — 調査報告', 40, 548);
    this.screenTex.needsUpdate = true;
  }

  /** Advance the film to time `t` (s) and place the camera. */
  update(t: number, camera: THREE.PerspectiveCamera): void {
    const T = LECTURE_T;
    // The slides, evenly over the talk.
    if (t >= T.cut) {
      const n = this.slides.length;
      const k = Math.min(n - 1, Math.floor(((t - T.cut) / (T.slidesEnd - T.cut)) * n));
      if (k !== this.slideIdx) {
        this.slideIdx = k;
        this.drawSlide(this.slides[k]);
      }
    }
    this.presenter.visible = t >= T.cut;
    // The presenter: points at the screen when a slide changes, gestures, then bows.
    const slideT = t >= T.cut ? ((t - T.cut) / ((T.slidesEnd - T.cut) / Math.max(1, this.slides.length))) % 1 : 0;
    const point = t < T.slidesEnd && slideT < 0.25;
    poseAvatar(this.presenter, 0, 0, 0, point ? 1.9 : t < T.slidesEnd ? 0.35 + Math.sin(t * 2.3) * 0.15 : null, false);
    const arm = this.presenter.getObjectByName('armR');
    if (arm) arm.rotation.z = point ? -0.5 : 0;
    const bow = t > T.bow ? Math.min(1, (t - T.bow) / 0.6) * (t < T.bow + 2.0 ? 1 : Math.max(0, 1 - (t - T.bow - 2.0) / 0.6)) : 0;
    this.presenter.rotation.x = -0.55 * bow;
    this.presenter.rotation.y = t < T.slidesEnd ? Math.PI - 0.35 + (point ? -0.25 : 0) : Math.PI;
    // The audience: still, a head turning now and then; clapping at the end.
    const clap = t > T.applause && t < T.fadeOut + 1;
    for (const a of this.audience) {
      const ph = a.userData.phase as number;
      const head = a.getObjectByName('head');
      if (head) head.rotation.y = Math.sin(t * 0.4 + ph) * 0.12;
      for (const c of a.children) {
        if (c.name === 'armL') c.rotation.set(clap ? 1.1 : 0.7, 0, clap ? -0.5 + Math.sin(t * 14 + ph) * 0.25 : 0);
        if (c.name === 'armR') c.rotation.set(clap ? 1.1 : 0.7, 0, clap ? 0.5 - Math.sin(t * 14 + ph) * 0.25 : 0);
      }
    }
    // Camera
    const at = (x: number, y: number, z: number, lx: number, ly: number, lz: number) => {
      const [rx, rz] = this.toRender(x, z);
      const [tx, tz] = this.toRender(lx, lz);
      camera.position.set(rx, y, rz);
      camera.lookAt(tx, ly, tz);
    };
    if (t < T.cut) {
      // Out of the door, along the stage toward the lectern, the hall opening to the left.
      const k = Math.min(1, t / T.walk);
      const e = k * k * (3 - 2 * k);
      const x = LECTURE_SPOTS.door.x + 0.5 + e * 9;
      const z = LECTURE_SPOTS.door.z + e * 0.6;
      const bob = Math.sin(t * 7) * 0.025 * (k < 1 ? 1 : 0);
      const look = Math.min(1, t / T.walk) * 1.0;
      at(x, 1.95 + bob, z, x + Math.cos(look) * 6, 1.8 - look * 0.3, z + Math.sin(look) * 6);
    } else {
      // From the back of the centre aisle, looking down at the stage: you at the lectern, the slides behind.
      const drift = Math.sin(t * 0.25) * 0.12;
      at(16 + drift, 6.4, 25.5, 17.8, 3.7, 4.0);
    }
    // A longer lens for the audience's view.
    const fov = t < T.cut ? this.baseFov : 32;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mt = m.material as THREE.MeshBasicMaterial;
      if (mt.map && mt.map !== this.screenTex) mt.map.dispose();
      mt.dispose();
    });
    this.screenTex.dispose();
  }
}
