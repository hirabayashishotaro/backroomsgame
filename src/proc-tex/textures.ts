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
