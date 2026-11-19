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

/**
 * A slide: no writing on it (user request) - pictures and simple graphics.
 *  - map: the route through the levels (dots and lines, 0..1 coordinates);
 *  - chart: bars (0..1), e.g. how many of each kind were defeated;
 *  - image: an entity's picture (data URL);
 *  - end: a closing emblem.
 */
export interface Slide {
  kind: 'map' | 'chart' | 'image' | 'end';
  points?: Array<[number, number]>;
  edges?: Array<[number, number]>;
  bars?: Array<{ v: number; color: string }>;
  image?: string | null;
}

/** Timeline (s). */
export const LECTURE_T = { walk: 4.6, cut: 5.2, slidesEnd: 22.5, bow: 22.7, applause: 23.3, fadeOut: 27.5, end: 29.5 };

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
    // A plain header band and footer line (no words).
    g.fillStyle = '#1e3a5a';
    g.fillRect(0, 0, 1024, 60);
    g.fillStyle = '#c8b35c';
    g.fillRect(0, 60, 1024, 6);
    g.fillStyle = '#d8d4c8';
    g.fillRect(40, 540, 944, 3);
    const box = { x: 70, y: 100, w: 884, h: 410 };
    if (s.kind === 'map' && s.points) {
      // The route: lines between the levels, a dot for each, the first and last bigger.
      g.strokeStyle = '#8a7c44';
      g.lineWidth = 4;
      for (const [a, b] of s.edges ?? []) {
        const p = s.points[a];
        const q = s.points[b];
        if (!p || !q) continue;
        g.beginPath();
        g.moveTo(box.x + p[0] * box.w, box.y + p[1] * box.h);
        g.lineTo(box.x + q[0] * box.w, box.y + q[1] * box.h);
        g.stroke();
      }
      s.points.forEach(([x, y], i) => {
        g.fillStyle = i === 0 ? '#c8a018' : i === s.points!.length - 1 ? '#a8302a' : '#2e5a3a';
        g.beginPath();
        g.arc(box.x + x * box.w, box.y + y * box.h, i === 0 || i === s.points!.length - 1 ? 16 : 10, 0, Math.PI * 2);
        g.fill();
      });
    } else if (s.kind === 'chart' && s.bars) {
      const n = Math.max(1, s.bars.length);
      const bw = Math.min(90, (box.w - 40) / n - 14);
      g.fillStyle = '#4a4a44';
      g.fillRect(box.x, box.y + box.h, box.w, 4);
      s.bars.forEach((b, i) => {
        const h = Math.max(8, b.v * (box.h - 20));
        g.fillStyle = b.color;
        g.fillRect(box.x + 30 + i * (bw + 14), box.y + box.h - h, bw, h);
      });
    } else if (s.kind === 'image') {
      const img = s.image ? this.images.get(s.image) : undefined;
      g.fillStyle = '#1a1a14';
      g.fillRect(332, 90, 360, 430);
      if (img && img.complete && img.naturalWidth) g.drawImage(img, 342, 130, 340, 340);
    } else {
      // A closing emblem: a yellow-papered door, ajar, light behind it.
      g.fillStyle = '#e8d890';
      g.fillRect(392, 110, 240, 380);
      g.fillStyle = '#fff8d8';
      g.fillRect(412, 130, 200, 360);
      g.fillStyle = '#c8b35c';
      g.beginPath();
      g.moveTo(412, 130);
      g.lineTo(540, 160);
      g.lineTo(540, 470);
      g.lineTo(412, 490);
      g.closePath();
      g.fill();
    }
    this.screenTex.needsUpdate = true;
  }

  /**
   * The line shown at time `t` (a ja.json key) or null: what is happening, then
   * what you say over each slide, the closing thanks, and a last thought.
   */
  captionKey(t: number): string | null {
    const T = LECTURE_T;
    if (t > 0.4 && t < T.walk - 0.1) return 'lecture.intro';
    if (t > T.cut + 0.4 && t < T.slidesEnd) {
      const n = this.slides.length;
      const span = (T.slidesEnd - T.cut) / n;
      const k = Math.min(n - 1, Math.floor((t - T.cut) / span));
      if (t - T.cut - k * span > span - 0.25) return null; // a breath between slides
      const s = this.slides[k];
      if (s.kind === 'image') return this.slides.findIndex((x) => x.kind === 'image') === k ? 'lecture.image' : 'lecture.image2';
      return 'lecture.' + s.kind;
    }
    if (t > T.bow && t < T.bow + 2.4) return 'lecture.bow';
    if (t > T.applause + 1.8 && t < T.end - 0.2) return 'lecture.outro';
    return null;
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
    this.presenter.rotation.x = 0.55 * bow; // forward, toward the audience (+Z)
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
