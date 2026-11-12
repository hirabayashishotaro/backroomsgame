/**
 * Procedural Canvas textures (no external image files, SPEC §0.3).
 * Each texture records how many metres one repeat covers (`metres`).
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { drawAlmondLabel } from './icons';
import { texMetres } from '../world/materialTable';

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
    case 'snow': {
      noiseFill(ctx, rng, S, 10);
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(${rng.chance(0.5) ? '255,255,255' : '190,210,235'},${rng.range(0.2, 0.5)})`;
        ctx.fillRect(rng.float() * S, rng.float() * S, rng.range(1, 3), rng.range(1, 3));
      }
      return finish(c, 2);
    }
    case 'rock': {
      noiseFill(ctx, rng, S, 40);
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `rgba(0,0,0,${rng.range(0.15, 0.4)})`;
        ctx.lineWidth = rng.range(1, 3);
        ctx.beginPath();
        let x = rng.float() * S;
        let y = rng.float() * S;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) ctx.lineTo((x += rng.range(-20, 20)), (y += rng.range(-20, 20)));
        ctx.stroke();
      }
      stains(ctx, rng, S, 6, '0,0,0');
      return finish(c, 2);
    }
    case 'lava': {
      for (let i = 0; i < 70; i++) {
        const x = rng.float() * S;
        const y = rng.float() * S;
        const r = rng.range(10, 50);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,230,120,0.9)');
        g.addColorStop(0.5, 'rgba(255,110,20,0.6)');
        g.addColorStop(1, 'rgba(120,10,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.strokeStyle = 'rgba(40,5,0,0.6)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 25; i++) {
        ctx.beginPath();
        let x = rng.float() * S;
        let y = rng.float() * S;
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) ctx.lineTo((x += rng.range(-25, 25)), (y += rng.range(-25, 25)));
        ctx.stroke();
      }
      return finish(c, 4);
    }
    case 'sand': {
      noiseFill(ctx, rng, S, 24);
      speckle(ctx, rng, S, 900, '#7a6a48', 1);
      return finish(c, 2);
    }
    case 'flesh': {
      for (let i = 0; i < 160; i++) {
        const x = rng.float() * S;
        const y = rng.float() * S;
        const r = rng.range(8, 30);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rng.chance(0.5) ? '230,140,150' : '150,40,60'},0.45)`);
        g.addColorStop(1, 'rgba(120,30,50,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.strokeStyle = 'rgba(90,20,40,0.35)';
      for (let i = 0; i < 30; i++) {
        ctx.lineWidth = rng.range(1, 3);
        ctx.beginPath();
        ctx.moveTo(rng.float() * S, rng.float() * S);
        ctx.bezierCurveTo(rng.float() * S, rng.float() * S, rng.float() * S, rng.float() * S, rng.float() * S, rng.float() * S);
        ctx.stroke();
      }
      // wet highlights
      speckle(ctx, rng, S, 200, '#ffd0d8', 2);
      return finish(c, 2);
    }
    case 'bronze': {
      noiseFill(ctx, rng, S, 18);
      stains(ctx, rng, S, 12, '40,110,90'); // verdigris
      return finish(c, 4);
    }
    case 'marble': {
      noiseFill(ctx, rng, S, 8);
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(150,150,160,${rng.range(0.15, 0.35)})`;
        ctx.lineWidth = rng.range(0.5, 2);
        ctx.beginPath();
        ctx.moveTo(rng.float() * S, 0);
        ctx.bezierCurveTo(rng.float() * S, S * 0.3, rng.float() * S, S * 0.6, rng.float() * S, S);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,120,120,0.25)';
      ctx.strokeRect(1, 1, S - 2, S - 2);
      return finish(c, 2);
    }
    case 'windows': {
      // A night facade: grid of windows, some lit warm, some cold, most dark.
      ctx.fillStyle = rgb(hex, 0.6);
      ctx.fillRect(0, 0, S, S);
      const cols = 8;
      const rows = 8;
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const lit = rng.float();
          ctx.fillStyle = lit < 0.25 ? '#ffd890' : lit < 0.33 ? '#cfe6ff' : '#1a1c22';
          ctx.fillRect(i * (S / cols) + 6, j * (S / rows) + 7, S / cols - 12, S / rows - 14);
        }
      return finish(c, 8);
    }
    case 'pages': {
      ctx.fillStyle = '#efe6cc';
      ctx.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 3) {
        ctx.fillStyle = `rgba(120,100,70,${rng.range(0.05, 0.2)})`;
        ctx.fillRect(0, y, S, 1);
      }
      return finish(c, 1);
    }
    case 'book': {
      noiseFill(ctx, rng, S, 12);
      ctx.strokeStyle = 'rgba(230,200,120,0.7)';
      ctx.lineWidth = 6;
      ctx.strokeRect(20, 20, S - 40, S - 40);
      ctx.lineWidth = 2;
      ctx.strokeRect(34, 34, S - 68, S - 68);
      ctx.fillStyle = 'rgba(230,200,120,0.6)';
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, 26, 0, Math.PI * 2);
      ctx.fill();
      return finish(c, 4);
    }
    case 'endstone': {
      noiseFill(ctx, rng, S, 22);
      speckle(ctx, rng, S, 700, '#8a8660', 2);
      stains(ctx, rng, S, 8, '120,110,70');
      return finish(c, 2);
    }
    case 'obsidian': {
      noiseFill(ctx, rng, S, 14);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(120,60,180,${rng.range(0.1, 0.3)})`;
        ctx.fillRect(rng.float() * S, rng.float() * S, rng.range(4, 20), rng.range(2, 6));
      }
      return finish(c, 2);
    }
    case 'moss': {
      noiseFill(ctx, rng, S, 36);
      for (let i = 0; i < 800; i++) {
        ctx.fillStyle = rgb(hex, rng.range(0.6, 1.5));
        ctx.fillRect(rng.float() * S, rng.float() * S, 2, 2);
      }
      return finish(c, 2);
    }
    case 'pooltile': {
      // Small square tiles (10 cm) with thin grout, faint glaze variation.
      const n = 16;
      const t = S / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = rgb(hex, rng.range(0.96, 1.03));
          ctx.fillRect(i * t, j * t, t, t);
        }
      ctx.fillStyle = 'rgba(70,80,78,0.55)';
      for (let i = 0; i <= n; i++) {
        ctx.fillRect(i * t - 0.8, 0, 1.6, S);
        ctx.fillRect(0, i * t - 0.8, S, 1.6);
      }
      // glaze highlight
      const g = ctx.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      return finish(c, 1.6);
    }
    case 'cap': {
      // Giant mushroom cap: soft gradient with pale glowing spots (not a red/white toadstool).
      for (let i = 0; i < 40; i++) {
        const x = rng.float() * S;
        const y = rng.float() * S;
        const r = rng.range(6, 18);
        ctx.fillStyle = `rgba(255,255,255,${rng.range(0.12, 0.3)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return finish(c, 4);
    }
    default:
      noiseFill(ctx, rng, S, 18);
      return finish(c, 2);
  }
}

// ---------------------------------------------------------------------------
// Outdoor / special-world textures (gardens, roads, tatami, aero).
// ---------------------------------------------------------------------------

function grass(hex: string, seed: number): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(seed);
  ctx.fillStyle = rgb(hex);
  ctx.fillRect(0, 0, S, S);
  noiseFill(ctx, rng, S, 30);
  for (let i = 0; i < 2200; i++) {
    const x = rng.float() * S;
    const y = rng.float() * S;
    ctx.strokeStyle = rgb(hex, rng.range(0.7, 1.35));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-2, 2), y - rng.range(3, 8));
    ctx.stroke();
  }
  return finish(c, 2);
}

function leaves(hex: string, seed: number): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = new Rng(seed);
  ctx.fillStyle = rgb(hex, 0.7);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = rgb(hex, rng.range(0.6, 1.4));
    ctx.beginPath();
    ctx.ellipse(rng.float() * S, rng.float() * S, rng.range(2, 6), rng.range(1.5, 4), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, 1.5);
}

function bark(): ProcTexture {
  const S = 64;
  const [c, ctx] = canvas(S);
  const rng = new Rng(611);
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${rng.chance(0.5) ? '30,20,12' : '120,95,70'},0.4)`;
    ctx.fillRect(rng.float() * S, 0, rng.range(1, 3), S);
  }
  return finish(c, 1);
}

function paving(hex: string, seed: number): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(seed);
  ctx.fillStyle = rgb(hex, 0.55);
  ctx.fillRect(0, 0, S, S);
  const rows = 6;
  const h = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rng.float() * 40;
    while (x < S) {
      const w = rng.range(28, 60);
      ctx.fillStyle = rgb(hex, rng.range(0.85, 1.12));
      ctx.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      x += w;
    }
  }
  stains(ctx, rng, S, 5, '40,40,30');
  return finish(c, 2);
}

function flowers(hex: string, seed: number): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = new Rng(seed);
  ctx.fillStyle = '#2f5a24';
  ctx.fillRect(0, 0, S, S);
  noiseFill(ctx, rng, S, 25);
  for (let i = 0; i < 160; i++) {
    const x = rng.float() * S;
    const y = rng.float() * S;
    ctx.fillStyle = rgb(hex, rng.range(0.85, 1.2));
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(x + Math.cos((k * Math.PI * 2) / 5) * 2.2, y + Math.sin((k * Math.PI * 2) / 5) * 2.2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f4e27a';
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, 1);
}

/** Asphalt for the floating roads; lane markings run along x ('x') or z ('z'). Covers one 32m chunk. */
function road(dir: string): ProcTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = new Rng(dir === 'x' ? 701 : 702);
  ctx.fillStyle = '#3a3a3c';
  ctx.fillRect(0, 0, S, S);
  noiseFill(ctx, rng, S, 22);
  // cracks and patches
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(${rng.chance(0.5) ? '20,20,22' : '70,70,72'},0.5)`;
    ctx.fillRect(rng.float() * S, rng.float() * S, rng.range(10, 60), rng.range(6, 30));
  }
  const m = S / 32; // pixels per metre
  const line = (pos: number, color: string, dashed: boolean, width = 0.15) => {
    ctx.fillStyle = color;
    for (let t = 0; t < S; t += dashed ? 9 * m : S) {
      const len = dashed ? 4 * m : S;
      if (dir === 'x') ctx.fillRect(t, pos * m - (width * m) / 2, len, width * m);
      else ctx.fillRect(pos * m - (width * m) / 2, t, width * m, len);
    }
  };
  // Road deck spans 11..21m across the chunk centre: edge lines, centre line, lane dashes.
  line(11.4, '#e8e4d8', false);
  line(20.6, '#e8e4d8', false);
  line(16, '#e2b23a', false, 0.12);
  line(16.25, '#e2b23a', false, 0.12);
  line(13.7, '#e8e4d8', true);
  line(18.3, '#e8e4d8', true);
  return finish(c, 32);
}

function tatami(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(731);
  ctx.fillStyle = '#b9b276';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) {
    ctx.fillStyle = `rgba(${rng.chance(0.5) ? '120,115,60' : '215,210,150'},0.25)`;
    ctx.fillRect(0, y, S, 1);
  }
  // Mats: 0.9 x 1.8 in a 3.6m tile, staggered so corners never meet in a cross.
  const u = S / 4; // 0.9m
  ctx.strokeStyle = '#3a3426';
  ctx.lineWidth = 4;
  const mats = [
    [0, 0, 2, 1],
    [2, 0, 1, 2],
    [3, 0, 1, 2],
    [0, 1, 1, 2],
    [1, 1, 1, 2],
    [2, 2, 2, 1],
    [0, 3, 2, 1],
    [2, 3, 2, 1],
  ];
  for (const [x, y, w, h] of mats) ctx.strokeRect(x * u + 2, y * u + 2, w * u - 4, h * u - 4);
  return finish(c, 3.6);
}

function shoji(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#efe7d2';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#6a4a2c';
  for (let i = 0; i <= 4; i++) {
    ctx.fillRect((i * S) / 4 - 2, 0, 4, S);
    ctx.fillRect(0, (i * S) / 4 - 2, S, 4);
  }
  return finish(c, 1.2);
}

function aeroTile(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#eef9fd');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(120,190,215,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo((i * S) / 2, 0);
    ctx.lineTo((i * S) / 2, S);
    ctx.moveTo(0, (i * S) / 2);
    ctx.lineTo(S, (i * S) / 2);
    ctx.stroke();
  }
  // Soft specular streak (fake gloss)
  const hl = ctx.createLinearGradient(0, S * 0.2, S, S * 0.6);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, S, S);
  return finish(c, 2);
}

function grate(): ProcTexture {
  const S = 64;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#6a6e74';
  for (let i = 0; i < S; i += 8) {
    ctx.fillRect(i, 0, 3, S);
    ctx.fillRect(0, i, S, 2);
  }
  return finish(c, 0.5);
}

/** Exposed wall framing: wooden studs, insulation and stray wiring (Level 139). */
function studs(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(741);
  // Insulation between the studs
  ctx.fillStyle = '#c99a7a';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${rng.chance(0.5) ? '230,190,160' : '150,100,80'},0.25)`;
    ctx.beginPath();
    ctx.ellipse(rng.float() * S, rng.float() * S, rng.range(2, 7), rng.range(1, 3), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Studs every 0.4m (2m texture -> 5 studs)
  for (let x = 0; x < S; x += S / 5) {
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(x, 0, 18, S);
    ctx.fillStyle = 'rgba(40,25,10,0.35)';
    ctx.fillRect(x + 15, 0, 3, S);
  }
  // Horizontal blocking and a wire
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(0, S * 0.45, S, 14);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, S * 0.3);
  ctx.bezierCurveTo(S * 0.3, S * 0.36, S * 0.6, S * 0.24, S, S * 0.3);
  ctx.stroke();
  return finish(c, 2);
}

/** A bright cloudy sky seen through an opening (self-lit). */
function cloudsWindow(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = new Rng(901);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#dfe8e4');
  g.addColorStop(1, '#f6f1e2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = rng.float() * S;
    const y = rng.float() * S;
    const r = rng.range(10, 40);
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rng.chance(0.5) ? '255,252,240' : '170,170,160';
    cg.addColorStop(0, `rgba(${shade},${rng.range(0.25, 0.6)})`);
    cg.addColorStop(1, `rgba(${shade},0)`);
    ctx.fillStyle = cg;
    for (const ox of [-S, 0, S]) ctx.fillRect(x - r + ox, y - r, r * 2, r * 2);
  }
  return finish(c, 4);
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

// --- Vaporwave ------------------------------------------------------------------

/** Wireframe ground: deep violet with glowing cyan grid lines (one cell per tile). */
function neonGrid(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#1a0838');
  g.addColorStop(1, '#2a0a4a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.shadowColor = '#3ff0ff';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#46f4ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, S - 4, S - 4);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,90,230,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.lineTo(S - 2, S - 2);
  ctx.stroke();
  return finish(c, 2);
}

/** Pink and navy checkerboard (one square per metre). */
function vaporCheck(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#1c1c78' : '#f6a8ec';
      ctx.fillRect(i * 64, j * 64, 64, 64);
    }
  return finish(c, 2);
}

/** Smooth plaster, faintly lilac (busts and columns). */
function plaster(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#efe4fa';
  ctx.fillRect(0, 0, S, S);
  const rng = new Rng(4401);
  noiseFill(ctx, rng, S, 10);
  return finish(c, 2);
}

// --- Memphis -----------------------------------------------------------------------

function memphisStripes(): ProcTexture {
  const S = 64;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#111111';
  for (let x = 0; x < S; x += 16) ctx.fillRect(x, 0, 8, S);
  return finish(c, 0.5);
}

/** Offset black-and-white blocks (a jumpy, op-art check). */
function memphisCheck(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#111111';
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 8; i++) if ((i + j) % 2 === 0) ctx.fillRect(i * 16 + (j % 2) * 6, j * 16, 12, 10);
  return finish(c, 0.8);
}

/** Interlocking red and blue squiggles on white. */
function memphisSquiggle(): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    ctx.strokeStyle = k % 2 ? '#2a5ae8' : '#f0322a';
    ctx.beginPath();
    const y0 = k * 64 + 32;
    for (let x = -16; x <= S + 16; x += 4) {
      const y = y0 + Math.sin((x / S) * Math.PI * 4 + k) * 20;
      if (x === -16) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c, 3);
}

/** Terrazzo: speckles of colour and black in white (or white in black). */
function terrazzo(dark: boolean): ProcTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = dark ? '#151515' : '#f6f4ef';
  ctx.fillRect(0, 0, S, S);
  const rng = new Rng(dark ? 991 : 992);
  const cols = dark ? ['#ffffff', '#e6e6e6', '#ff7aa0'] : ['#111111', '#ff5a8a', '#2a8ad8', '#f6c81e', '#32c860'];
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = cols[rng.int(0, cols.length - 1)];
    const x = rng.float() * S;
    const y = rng.float() * S;
    const r = 1.5 + rng.float() * 5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.4 + rng.float() * 0.6), rng.float() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, 1.5);
}

/** White tiles with black grout and little zig-zags. */
function memphisTile(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x = 20 + i * 26;
    ctx.moveTo(x, 40 + (i % 2) * 40);
    ctx.lineTo(x + 10, 30 + (i % 2) * 40);
    ctx.lineTo(x + 20, 40 + (i % 2) * 40);
  }
  ctx.stroke();
  return finish(c, 1);
}

// --- Showa bathhouse (sento) --------------------------------------------------------

/** Small white wall tiles with grey grout. */
function sentoTile(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#b8bcbc';
  ctx.fillRect(0, 0, S, S);
  const rng = new Rng(5101);
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 8; i++) {
      const v = 238 + Math.floor(rng.float() * 12);
      ctx.fillStyle = `rgb(${v},${v},${v - 4})`;
      ctx.fillRect(i * 16 + 1, j * 16 + 1, 14, 14);
    }
  return finish(c, 1.2);
}

/** Bathhouse floor: little beige and grey mosaic tiles. */
function sentoFloor(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#9a948a';
  ctx.fillRect(0, 0, S, S);
  const rng = new Rng(5102);
  const cols = ['#e8e0cc', '#ddd4bf', '#f0eadb', '#cfc8b6', '#e4dccb'];
  for (let j = 0; j < 16; j++)
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = cols[rng.int(0, cols.length - 1)];
      ctx.fillRect(i * 8 + 1, j * 8 + 1, 6, 6);
    }
  return finish(c, 0.8);
}

/** Pale aqua gloss paint (upper walls), with faint brush streaks. */
function sentoPaint(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#9fdde4';
  ctx.fillRect(0, 0, S, S);
  const rng = new Rng(5103);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rng.float() * 0.05})`;
    ctx.fillRect(0, rng.float() * S, S, 1 + rng.float() * 3);
  }
  return finish(c, 2);
}

/** Painted wooden ceiling boards, pale aqua. */
function sentoCeiling(): ProcTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#c4ecee';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(60,120,130,0.35)';
  for (let x = 0; x < S; x += 16) ctx.fillRect(x, 0, 1.5, S);
  return finish(c, 2);
}

/**
 * The bathhouse mural: a cheerful, slightly naive painting of a snow-capped
 * mountain over a blue bay, pine-covered hills, a beach, a little boat.
 * `evening` paints it at sunset. Drawn once per face (fit material).
 */
function fujiMural(evening: boolean): ProcTexture {
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(evening ? 5105 : 5104);
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, evening ? '#f08a6a' : '#6ec4ee');
  sky.addColorStop(1, evening ? '#fde2b0' : '#e8f6fb');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Clouds: soft white puffs
  for (let i = 0; i < 9; i++) {
    const x = rng.float() * W;
    const y = 20 + rng.float() * 60;
    ctx.fillStyle = evening ? 'rgba(255,235,220,0.8)' : 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(x + k * 18, y + Math.sin(k) * 4, 26, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The mountain
  const mx = W * 0.56;
  const peak = 46;
  const base = 175;
  ctx.fillStyle = evening ? '#6a5a9a' : '#3e6fb8';
  ctx.beginPath();
  ctx.moveTo(mx - 330, base);
  ctx.quadraticCurveTo(mx - 120, peak + 40, mx - 30, peak);
  ctx.lineTo(mx + 30, peak);
  ctx.quadraticCurveTo(mx + 120, peak + 40, mx + 330, base);
  ctx.closePath();
  ctx.fill();
  // Snow cap with a jagged lower edge
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(mx - 30, peak);
  ctx.lineTo(mx + 30, peak);
  ctx.quadraticCurveTo(mx + 70, peak + 18, mx + 95, peak + 34);
  for (let i = 0; i <= 10; i++) {
    const x = mx + 95 - i * 19;
    ctx.lineTo(x, peak + 34 + (i % 2 ? 16 : 0) + rng.float() * 6);
  }
  ctx.quadraticCurveTo(mx - 70, peak + 18, mx - 30, peak);
  ctx.fill();
  // Sea
  ctx.fillStyle = evening ? '#e9a87a' : '#4bb4c8';
  ctx.fillRect(0, 168, W, 60);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const y = 176 + rng.float() * 44;
    const x = rng.float() * W;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 30 + rng.float() * 40, y);
    ctx.stroke();
  }
  // Green hills on the left with pines, a headland on the right
  ctx.fillStyle = '#3f8a4a';
  ctx.beginPath();
  ctx.moveTo(0, 200);
  ctx.quadraticCurveTo(110, 70, 250, 150);
  ctx.quadraticCurveTo(300, 185, 330, 200);
  ctx.lineTo(0, 210);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5aa04f';
  ctx.beginPath();
  ctx.moveTo(W, 205);
  ctx.quadraticCurveTo(W - 120, 130, W - 260, 196);
  ctx.closePath();
  ctx.fill();
  const pine = (x: number, y: number, s: number) => {
    ctx.fillStyle = '#6a4a2a';
    ctx.fillRect(x - 2 * s, y - 20 * s, 4 * s, 22 * s);
    ctx.fillStyle = '#1f5a2e';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (k - 1) * 9 * s, y - 24 * s - k * 6 * s, 14 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  pine(120, 118, 1.6);
  pine(190, 135, 1.2);
  pine(60, 150, 1.4);
  pine(W - 140, 170, 1.3);
  // Beach and a little boat
  ctx.fillStyle = '#f0e2b8';
  ctx.beginPath();
  ctx.moveTo(250, 228);
  ctx.quadraticCurveTo(520, 205, 820, 232);
  ctx.lineTo(820, H);
  ctx.lineTo(250, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a3a1e';
  ctx.beginPath();
  ctx.moveTo(380, 195);
  ctx.lineTo(430, 195);
  ctx.lineTo(420, 203);
  ctx.lineTo(388, 203);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4f0e0';
  ctx.beginPath();
  ctx.moveTo(404, 170);
  ctx.lineTo(404, 195);
  ctx.lineTo(422, 192);
  ctx.closePath();
  ctx.fill();
  // Painted on a wall: a thin light frame line along the bottom
  ctx.fillStyle = 'rgba(80,140,160,0.6)';
  ctx.fillRect(0, H - 4, W, 4);
  const t = finish(c, 1);
  t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** The tile picture under the mural: a pagoda and gardens, drawn on a tile grid. */
function sentoTileMural(): ProcTexture {
  const W = 512;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(5106);
  ctx.fillStyle = '#f2f4ee';
  ctx.fillRect(0, 0, W, H);
  // Greenery
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rng.pick(['#3f7a4a', '#5a9a5a', '#2f6a3a', '#7ab06a']);
    ctx.beginPath();
    ctx.ellipse(rng.float() * W, 70 + rng.float() * 50, 10 + rng.float() * 18, 6 + rng.float() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // A pagoda roof in the middle
  const px = W * 0.5;
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = '#8a2a20';
    ctx.beginPath();
    ctx.moveTo(px - 46 + k * 8, 56 - k * 16);
    ctx.lineTo(px + 46 - k * 8, 56 - k * 16);
    ctx.lineTo(px + 30 - k * 8, 46 - k * 16);
    ctx.lineTo(px - 30 + k * 8, 46 - k * 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8d8b0';
    ctx.fillRect(px - 20 + k * 6, 56 - k * 16, 40 - k * 12, 8);
  }
  // A fence along the water
  ctx.strokeStyle = '#6a5a4a';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 96);
    ctx.lineTo(x, 112);
    ctx.stroke();
  }
  // Tile grout over everything
  ctx.strokeStyle = 'rgba(150,150,150,0.55)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  const t = finish(c, 1);
  t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping;
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
  bark,
  tatami,
  shoji,
  'aero-tile': aeroTile,
  grate,
  studs,
  'clouds-window': cloudsWindow,

  white: () => flat('#ffffff'),
  'neon-grid': neonGrid,
  'vapor-check': vaporCheck,
  plaster,
  'memphis-stripes': memphisStripes,
  'memphis-check': memphisCheck,
  'memphis-squiggle': memphisSquiggle,
  terrazzo: () => terrazzo(false),
  'terrazzo-dark': () => terrazzo(true),
  'memphis-tile': memphisTile,
  'sento-tile': sentoTile,
  'sento-floor': sentoFloor,
  'sento-paint': sentoPaint,
  'sento-ceiling': sentoCeiling,
  'fuji-mural': () => fujiMural(false),
  'fuji-mural-evening': () => fujiMural(true),
  'sento-tile-mural': sentoTileMural,
};

export function getTexture(key: string): ProcTexture {
  let t = cache.get(key);
  if (!t) {
    if (key.startsWith('gen:')) {
      const [, type, hex, seed] = key.split(':');
      const n = Number(seed) || 1;
      if (type === 'grass') t = grass(hex, n);
      else if (type === 'leaves') t = leaves(hex, n);
      else if (type === 'paving') t = paving(hex, n);
      else if (type === 'flowers') t = flowers(hex, n);
      else t = genTexture(type, hex, n);
    } else if (key.startsWith('flat:')) {
      t = flat('#' + key.split(':')[1]);
    } else if (key.startsWith('road:')) {
      t = road(key.split(':')[1]);
    } else if (key.startsWith('door:')) {
      const [, hex, win] = key.split(':');
      t = doorTexture(hex, win === '1');
    } else t = (FACTORIES[key] ?? FACTORIES.white)();
    // One source of truth for UV scale (the geometry builder uses the same table).
    t.metres = texMetres(key);
    cache.set(key, t);
  }
  return t;
}
