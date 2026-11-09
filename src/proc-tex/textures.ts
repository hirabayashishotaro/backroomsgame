/**
 * Procedural Canvas textures (no external image files, SPEC §0.3).
 * Each texture records how many metres one repeat covers (`metres`).
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';

export interface ProcTexture {
  texture: THREE.Texture;
  metres: number;
}

const cache = new Map<string, ProcTexture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, metres: number): ProcTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture: t, metres };
}

function speckle(ctx: CanvasRenderingContext2D, rng: Rng, size: number, n: number, color: string, maxR: number) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.3, maxR);
    ctx.globalAlpha = rng.range(0.05, 0.25);
    ctx.beginPath();
    ctx.arc(rng.float() * size, rng.float() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function stains(ctx: CanvasRenderingContext2D, rng: Rng, size: number, n: number, rgb: string) {
  for (let i = 0; i < n; i++) {
    const x = rng.float() * size;
    const y = rng.float() * size;
    const r = rng.range(size * 0.05, size * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${rng.range(0.08, 0.22)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    // Draw wrapped so the texture tiles seamlessly.
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
  }
}

function wallpaperYellow(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(1001);
  ctx.fillStyle = '#c8b35c';
  ctx.fillRect(0, 0, S, S);
  // Vertical stripes.
  for (let x = 0; x < S; x += 32) {
    ctx.fillStyle = 'rgba(120,100,30,0.10)';
    ctx.fillRect(x, 0, 12, S);
    ctx.fillStyle = 'rgba(255,240,170,0.08)';
    ctx.fillRect(x + 14, 0, 3, S);
  }
  // Faint repeated diamond motif between stripes.
  ctx.strokeStyle = 'rgba(110,90,25,0.13)';
  ctx.lineWidth = 1.2;
  for (let x = 16; x < S + 32; x += 32)
    for (let y = 0; y < S + 32; y += 32) {
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 12, y + 8);
      ctx.lineTo(x + 6, y + 16);
      ctx.lineTo(x, y + 8);
      ctx.closePath();
      ctx.stroke();
    }
  speckle(ctx, rng, S, 900, '#6b5a1e', 1.2);
  stains(ctx, rng, S, 6, '110,85,20');
  return finish(c, 2);
}

function carpetDamp(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(2002);
  ctx.fillStyle = '#8c7a3e';
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng.float() - 0.5) * 34;
    img.data[i] += n;
    img.data[i + 1] += n * 0.9;
    img.data[i + 2] += n * 0.6;
  }
  ctx.putImageData(img, 0, 0);
  stains(ctx, rng, S, 9, '50,40,15');
  speckle(ctx, rng, S, 400, '#3e3415', 1.5);
  return finish(c, 2);
}

function ceilingTile(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(3003);
  ctx.fillStyle = '#d6cfae';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, rng, S, 1600, '#7d7556', 1.1);
  stains(ctx, rng, S, 3, '140,115,50');
  // 2x2 tiles of 0.6m: grid lines (T-bar).
  ctx.fillStyle = '#9c9478';
  const half = S / 2;
  for (const p of [0, half]) {
    ctx.fillRect(p, 0, 4, S);
    ctx.fillRect(0, p, S, 4);
  }
  return finish(c, 1.2);
}

function wallpaperManila(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(4004);
  ctx.fillStyle = '#c98c48';
  ctx.fillRect(0, 0, S, S);
  // Coarse paper fibres.
  for (let i = 0; i < 2600; i++) {
    ctx.strokeStyle = `rgba(${rng.chance(0.5) ? '90,55,20' : '235,190,120'},${rng.range(0.04, 0.12)})`;
    const x = rng.float() * S;
    const y = rng.float() * S;
    const a = rng.range(-0.4, 0.4) + Math.PI / 2;
    const l = rng.range(2, 9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // Panel seams.
  ctx.fillStyle = 'rgba(80,45,15,0.25)';
  ctx.fillRect(0, 0, 3, S);
  ctx.fillRect(S / 2, 0, 2, S);
  stains(ctx, rng, S, 7, '70,35,10');
  return finish(c, 2);
}

/** Transparent chalk scribbles: arrows, tallies, circles and unreadable glyphs. */
function chalkGraffiti(): ProcTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = new Rng(5005);
  ctx.clearRect(0, 0, S, S);
  ctx.lineCap = 'round';
  const chalk = () => {
    ctx.strokeStyle = `rgba(245,242,230,${rng.range(0.45, 0.85)})`;
    ctx.lineWidth = rng.range(1.5, 3.5);
  };
  for (let i = 0; i < 26; i++) {
    const x = rng.range(30, S - 30);
    const y = rng.range(60, S - 60);
    const k = rng.int(0, 4);
    chalk();
    ctx.beginPath();
    if (k === 0) {
      // Arrow
      const a = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      const l = rng.range(30, 70);
      const ex = x + Math.cos(a) * l;
      const ey = y + Math.sin(a) * l;
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a - 0.5) * 14, ey - Math.sin(a - 0.5) * 14);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a + 0.5) * 14, ey - Math.sin(a + 0.5) * 14);
    } else if (k === 1) {
      // Tally marks
      const n = rng.int(3, 9);
      for (let t = 0; t < n; t++) {
        ctx.moveTo(x + t * 7, y);
        ctx.lineTo(x + t * 7 + rng.range(-2, 2), y + 24);
      }
      if (n >= 5) {
        ctx.moveTo(x - 4, y + 4);
        ctx.lineTo(x + 32, y + 20);
      }
    } else if (k === 2) {
      ctx.arc(x, y, rng.range(10, 28), 0, Math.PI * 2);
    } else if (k === 3) {
      // X mark
      const r = rng.range(8, 18);
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
    } else {
      // Unreadable glyph line
      let px = x;
      ctx.moveTo(px, y);
      for (let g = 0; g < rng.int(4, 10); g++) {
        px += rng.range(6, 14);
        ctx.lineTo(px, y + rng.range(-10, 10));
      }
    }
    ctx.stroke();
  }
  const t = finish(c, 4);
  return t;
}

function exitSign(): ProcTexture {
  const W = 256;
  const [c, ctx] = canvas(W);
  ctx.fillStyle = '#0f8a3c';
  ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = '#e8fff0';
  // Running figure pictogram (generic) + door frame.
  ctx.fillRect(150, 60, 70, 140);
  ctx.fillStyle = '#0f8a3c';
  ctx.fillRect(160, 70, 50, 120);
  ctx.fillStyle = '#e8fff0';
  ctx.beginPath();
  ctx.arc(95, 70, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e8fff0';
  ctx.beginPath();
  ctx.moveTo(90, 95);
  ctx.lineTo(80, 145);
  ctx.lineTo(115, 180);
  ctx.moveTo(80, 145);
  ctx.lineTo(50, 190);
  ctx.moveTo(88, 105);
  ctx.lineTo(125, 125);
  ctx.moveTo(88, 105);
  ctx.lineTo(55, 120);
  ctx.stroke();
  return finish(c, 1);
}

function metalDoor(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = new Rng(6006);
  ctx.fillStyle = '#5d6b62';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, rng, S, 500, '#2c332e', 1.2);
  stains(ctx, rng, S, 3, '60,45,25');
  ctx.strokeStyle = 'rgba(20,25,20,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, S - 20, S - 20);
  return finish(c, 1);
}

function frostedGreen(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = new Rng(7007);
  const g = ctx.createLinearGradient(0, S, 0, 0);
  g.addColorStop(0, '#3f7a4a');
  g.addColorStop(0.5, '#7fbf8a');
  g.addColorStop(1, '#cfe8cf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Blurry leaf shapes behind the glass.
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(30,${rng.int(70, 120)},40,${rng.range(0.15, 0.35)})`;
    ctx.beginPath();
    ctx.ellipse(rng.float() * S, rng.range(S * 0.3, S), rng.range(4, 14), rng.range(8, 22), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, rng, S, 300, '#ffffff', 1);
  return finish(c, 1);
}

function label(bg: string, fg: string, stain = false): ProcTexture {
  const S = 64;
  const [c, ctx] = canvas(S);
  const rng = new Rng(8008);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = fg;
  ctx.fillRect(0, 22, S, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(8, 30, 40, 3);
  ctx.fillRect(8, 36, 26, 2);
  if (stain) stains(ctx, rng, S, 4, '90,60,20');
  return finish(c, 1);
}

function chalkMark(kind: number): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = new Rng(9100 + kind);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(248,246,236,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  const j = () => rng.range(-3, 3);
  if (kind === 0) {
    ctx.moveTo(20 + j(), 64 + j());
    ctx.lineTo(104 + j(), 64 + j());
    ctx.moveTo(104, 64);
    ctx.lineTo(78 + j(), 40 + j());
    ctx.moveTo(104, 64);
    ctx.lineTo(78 + j(), 88 + j());
  } else if (kind === 1) {
    ctx.moveTo(28 + j(), 28 + j());
    ctx.lineTo(100 + j(), 100 + j());
    ctx.moveTo(100 + j(), 28 + j());
    ctx.lineTo(28 + j(), 100 + j());
  } else {
    ctx.arc(64, 64, 38, 0.2, Math.PI * 2.05);
  }
  ctx.stroke();
  return finish(c, 1);
}

function flat(color: string): ProcTexture {
  const [c, ctx] = canvas(8);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 8);
  return finish(c, 1);
}

const FACTORIES: Record<string, () => ProcTexture> = {
  'wallpaper-yellow': wallpaperYellow,
  'carpet-damp': carpetDamp,
  'ceiling-tile': ceilingTile,
  outlet: () => flat('#e7e2cf'),
  'wallpaper-manila': wallpaperManila,
  'chalk-graffiti': chalkGraffiti,
  'exit-sign': exitSign,
  'metal-door': metalDoor,
  'frosted-green': frostedGreen,
  'chalk-mark-0': () => chalkMark(0),
  'chalk-mark-1': () => chalkMark(1),
  'chalk-mark-2': () => chalkMark(2),
  'label-almond': () => label('#f2eedc', '#c9a35a'),
  'label-blue': () => label('#d8ecfa', '#3c7fc0'),
  'label-expired': () => label('#b8a878', '#7a5a2a', true),
  'label-aero': () => label('#e8fbff', '#2fb8c8'),
  white: () => flat('#ffffff'),
};

export function getTexture(key: string): ProcTexture {
  let t = cache.get(key);
  if (!t) {
    t = (FACTORIES[key] ?? FACTORIES.white)();
    cache.set(key, t);
  }
  return t;
}
