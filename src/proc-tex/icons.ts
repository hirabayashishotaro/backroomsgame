/** Canvas-drawn item icons and labels (no image files). */
import type { ItemId } from '../items/itemDefs';

const iconCache = new Map<string, string>();

/** Draws the almond water bottle label (used by the icon and the 3D model). */
export function drawAlmondLabel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Cream label with a darker band
  ctx.fillStyle = '#f4ecd2';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#c99a4f';
  ctx.fillRect(x, y + h * 0.62, w, h * 0.16);
  // Almond (a brown teardrop) with a small leaf
  const cx = x + w * 0.5;
  const cy = y + h * 0.36;
  const r = Math.min(w, h) * 0.2;
  ctx.fillStyle = '#9a5f2c';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.25);
  ctx.bezierCurveTo(cx + r * 1.05, cy - r * 0.4, cx + r * 0.85, cy + r * 0.95, cx, cy + r);
  ctx.bezierCurveTo(cx - r * 0.85, cy + r * 0.95, cx - r * 1.05, cy - r * 0.4, cx, cy - r * 1.25);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,190,0.6)';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.9);
  ctx.quadraticCurveTo(cx - r * 0.2, cy, cx, cy + r * 0.7);
  ctx.stroke();
  ctx.fillStyle = '#5f8f3a';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.75, cy - r * 1.05, r * 0.45, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // Unreadable "text" lines
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x + w * 0.2, y + h * 0.66, w * 0.6, Math.max(1, h * 0.04));
  ctx.fillStyle = 'rgba(90,60,30,0.6)';
  ctx.fillRect(x + w * 0.25, y + h * 0.85, w * 0.5, Math.max(1, h * 0.035));
}

function almondWaterIcon(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const s = size / 64;
  ctx.scale(s, s);
  // PET bottle silhouette (centre x=32): cap, neck ring, shoulders, body, petaloid base.
  const body = new Path2D();
  body.moveTo(26, 13);
  body.lineTo(38, 13);
  body.bezierCurveTo(38, 18, 45, 20, 45, 27); // shoulder
  body.lineTo(45, 54);
  body.quadraticCurveTo(45, 59, 40, 59);
  body.lineTo(24, 59);
  body.quadraticCurveTo(19, 59, 19, 54);
  body.lineTo(19, 27);
  body.bezierCurveTo(19, 20, 26, 18, 26, 13);
  body.closePath();
  // Soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = 'rgba(190,220,235,0.35)';
  ctx.fill(body);
  ctx.restore();
  // Water inside (slightly yellowish, filled to the shoulder)
  ctx.save();
  ctx.clip(body);
  const water = ctx.createLinearGradient(19, 0, 45, 0);
  water.addColorStop(0, 'rgba(225,235,215,0.55)');
  water.addColorStop(0.5, 'rgba(250,250,235,0.35)');
  water.addColorStop(1, 'rgba(200,215,200,0.6)');
  ctx.fillStyle = water;
  ctx.fillRect(0, 24, 64, 40);
  // Ribs on the body
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.8;
  for (const y of [28, 51, 54]) {
    ctx.beginPath();
    ctx.moveTo(19, y);
    ctx.lineTo(45, y);
    ctx.stroke();
  }
  ctx.restore();
  // Label
  drawAlmondLabel(ctx, 19, 32, 26, 17);
  // Outline and highlight
  ctx.strokeStyle = 'rgba(230,245,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke(body);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(22, 25, 2, 6);
  ctx.fillRect(22, 50, 2, 6);
  // Neck ring and cap
  ctx.fillStyle = '#2f6fb5';
  ctx.fillRect(25.5, 11, 13, 2.5);
  const cap = ctx.createLinearGradient(26, 0, 38, 0);
  cap.addColorStop(0, '#1e5aa0');
  cap.addColorStop(0.45, '#4f95e0');
  cap.addColorStop(1, '#1b4e8c');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.roundRect(26.5, 4, 11, 7.5, 1.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.6;
  for (let x = 28; x < 37; x += 1.6) {
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x, 10.5);
    ctx.stroke();
  }
  return c;
}

/** Simple side-view silhouettes for weapons and ammo boxes. */
function shapeIcon(id: ItemId, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.scale(size / 64, size / 64);
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = 3;
  const fill = (col: string, path: () => void) => {
    g.fillStyle = col;
    g.beginPath();
    path();
    g.fill();
  };
  switch (id) {
    case 'pistol':
      fill('#2a2c30', () => g.rect(10, 20, 42, 10)); // slide
      fill('#1e1f22', () => {
        g.moveTo(34, 30);
        g.lineTo(46, 30);
        g.lineTo(50, 50);
        g.lineTo(38, 50);
        g.closePath();
      }); // grip
      fill('#555', () => g.rect(12, 18, 3, 3));
      g.strokeStyle = '#1e1f22';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(32, 33, 4, 0, Math.PI);
      g.stroke();
      break;
    case 'magnum':
      fill('#8a8f94', () => g.rect(4, 22, 36, 6)); // barrel
      fill('#6e7378', () => g.rect(36, 19, 12, 13)); // cylinder
      fill('#5a3a24', () => {
        g.moveTo(44, 31);
        g.lineTo(52, 31);
        g.lineTo(58, 52);
        g.lineTo(47, 52);
        g.closePath();
      });
      fill('#e8a030', () => g.rect(5, 19, 3, 3));
      break;
    case 'kunai':
      for (const [dx, dy] of [
        [0, 0],
        [4, 6],
        [8, 12],
      ]) {
        fill('#b8bcc0', () => {
          g.moveTo(10 + dx, 30 + dy);
          g.lineTo(32 + dx, 24 + dy);
          g.lineTo(32 + dx, 34 + dy);
          g.closePath();
        });
        fill('#2a1c14', () => g.rect(32 + dx, 27 + dy, 16, 4));
        g.strokeStyle = '#6a6e72';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(51 + dx, 29 + dy, 3, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 'axe':
      fill('#6a4628', () => {
        g.moveTo(18, 54);
        g.lineTo(22, 56);
        g.lineTo(44, 14);
        g.lineTo(40, 12);
        g.closePath();
      });
      fill('#9aa0a6', () => {
        g.moveTo(36, 8);
        g.lineTo(54, 14);
        g.lineTo(52, 30);
        g.lineTo(40, 22);
        g.closePath();
      });
      fill('#d8dce0', () => g.rect(51, 14, 3, 16));
      break;
    case 'rocket':
      fill('#4f5a3a', () => g.rect(4, 22, 52, 12)); // tube
      fill('#9a3a26', () => {
        g.moveTo(4, 22);
        g.lineTo(-4, 28);
        g.lineTo(4, 34);
        g.closePath();
      }); // warhead
      fill('#3a4230', () => g.rect(52, 20, 6, 16));
      fill('#1e1f22', () => g.rect(26, 34, 6, 12)); // grip
      fill('#22262a', () => g.rect(18, 15, 10, 7)); // sight
      break;
    case 'ammo_rocket':
      for (const dx of [0, 14, 28]) {
        fill('#5a6448', () => g.rect(12 + dx, 22, 10, 30));
        fill('#9a3a26', () => {
          g.moveTo(12 + dx, 22);
          g.lineTo(17 + dx, 10);
          g.lineTo(22 + dx, 22);
          g.closePath();
        });
      }
      break;
    default: {
      // ammo box
      fill(id === 'ammo_magnum' ? '#6a3a24' : '#3a5a3a', () => g.rect(12, 24, 40, 24));
      fill('#d8b040', () => g.rect(16, 28, 32, 6));
      for (let k = 0; k < 4; k++) fill('#c8a050', () => g.rect(18 + k * 8, 14, 5, 12));
    }
  }
  return c;
}

/** Data URL for an item icon (cached). */
export function itemIcon(id: ItemId, size = 64): string {
  const key = id + ':' + size;
  let url = iconCache.get(key);
  if (!url) {
    const c = id === 'almond_water' ? almondWaterIcon(size) : shapeIcon(id, size);
    url = c.toDataURL();
    iconCache.set(key, url);
  }
  return url;
}
