/**
 * Procedural Canvas textures (no external image files, SPEC §0.3).
 * Each texture records how many metres one repeat covers (`metres`).
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { drawAlmondLabel } from './icons';

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

// ---------------------------------------------------------------------------
// Parameterised textures for Level 1/2 and generated levels.
// Key format: gen:<type>:<rrggbb>:<seed>
// ---------------------------------------------------------------------------

function rgb(hex: string, k = 1): string {
  const n = parseInt(hex, 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

function noiseFill(ctx: CanvasRenderingContext2D, rng: Rng, S: number, amp: number): void {
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng.float() - 0.5) * amp;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function genTexture(type: string, hex: string, seed: number): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(seed);
  ctx.fillStyle = rgb(hex);
  ctx.fillRect(0, 0, S, S);
  switch (type) {
    case 'concrete': {
      noiseFill(ctx, rng, S, 26);
      stains(ctx, rng, S, 8, '30,30,30');
      speckle(ctx, rng, S, 500, '#222', 1.3);
      // Form-work seams.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, S / 2, S, 2);
      ctx.fillRect(0, 0, S, 2);
      return finish(c, 3);
    }
    case 'floor-concrete': {
      noiseFill(ctx, rng, S, 22);
      stains(ctx, rng, S, 10, '20,18,15');
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, S, S);
      // Painted lane marking fragment.
      if (rng.chance(0.5)) {
        ctx.fillStyle = 'rgba(220,190,40,0.35)';
        ctx.fillRect(S * 0.45, 0, 10, S);
      }
      return finish(c, 4);
    }
    case 'brick': {
      const bh = 16;
      const bw = 48;
      for (let y = 0; y < S; y += bh) {
        const off = (y / bh) % 2 ? bw / 2 : 0;
        for (let x = -bw; x < S + bw; x += bw) {
          ctx.fillStyle = rgb(hex, rng.range(0.82, 1.12));
          ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
        }
      }
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = rgb(hex, 0.45);
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-over';
      stains(ctx, rng, S, 5, '20,15,10');
      return finish(c, 2);
    }
    case 'tile': {
      const n = 8;
      const t = S / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = rgb(hex, rng.range(0.93, 1.05));
          ctx.fillRect(i * t + 1, j * t + 1, t - 2, t - 2);
        }
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = rgb(hex, 0.6);
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-over';
      stains(ctx, rng, S, 4, '40,40,30');
      return finish(c, 2);
    }
    case 'stripes': {
      for (let x = 0; x < S; x += 32) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(x, 0, 14, S);
      }
      speckle(ctx, rng, S, 600, '#000', 1.1);
      stains(ctx, rng, S, 6, '40,30,20');
      return finish(c, 2);
    }
    case 'panel': {
      // Smooth painted panels with seams.
      noiseFill(ctx, rng, S, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, 3, S);
      ctx.fillRect(0, S - 40, S, 2);
      stains(ctx, rng, S, 3, '30,30,30');
      return finish(c, 2);
    }
    case 'carpet': {
      noiseFill(ctx, rng, S, 34);
      stains(ctx, rng, S, 8, '20,15,10');
      return finish(c, 2);
    }
    case 'wood': {
      for (let y = 0; y < S; y += 32) {
        ctx.fillStyle = rgb(hex, rng.range(0.85, 1.1));
        ctx.fillRect(0, y + 1, S, 30);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          const yy = y + rng.range(4, 28);
          ctx.moveTo(0, yy);
          ctx.bezierCurveTo(S * 0.3, yy + rng.range(-3, 3), S * 0.7, yy + rng.range(-3, 3), S, yy);
          ctx.stroke();
        }
      }
      return finish(c, 2);
    }
    case 'metal': {
      noiseFill(ctx, rng, S, 14);
      stains(ctx, rng, S, 6, '90,45,15');
      return finish(c, 1);
    }
    default:
      noiseFill(ctx, rng, S, 18);
      return finish(c, 2);
  }
}

function doorTexture(hex: string, window: boolean): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = new Rng(4242);
  ctx.fillStyle = rgb(hex);
  ctx.fillRect(0, 0, S, S);
  noiseFill(ctx, rng, S, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 10, S - 24, S - 20);
  if (window) {
    ctx.fillStyle = 'rgba(20,24,28,0.75)';
    ctx.fillRect(40, 18, 48, 30);
  }
  return finish(c, 1);
}

function almondLabelTexture(): ProcTexture {
  const W = 256;
  const [c, ctx] = canvas(W);
  ctx.clearRect(0, 0, W, W);
  // The label wraps around the bottle: draw it twice across the width.
  drawAlmondLabel(ctx, 0, 0, W / 2, W);
  drawAlmondLabel(ctx, W / 2, 0, W / 2, W);
  const t = finish(c, 1);
  t.texture.wrapS = THREE.RepeatWrapping;
  return t;
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
  'label-almond': almondLabelTexture,

  white: () => flat('#ffffff'),
};

export function getTexture(key: string): ProcTexture {
  let t = cache.get(key);
  if (!t) {
    if (key.startsWith('gen:')) {
      const [, type, hex, seed] = key.split(':');
      t = genTexture(type, hex, Number(seed) || 1);
    } else if (key.startsWith('door:')) {
      const [, hex, win] = key.split(':');
      t = doorTexture(hex, win === '1');
    } else t = (FACTORIES[key] ?? FACTORIES.white)();
    cache.set(key, t);
  }
  return t;
}
