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

/** Data URL for an item icon (cached). */
export function itemIcon(id: ItemId, size = 64): string {
  const key = id + ':' + size;
  let url = iconCache.get(key);
  if (!url) {
    const c = almondWaterIcon(size);
    url = c.toDataURL();
    iconCache.set(key, url);
  }
  return url;
}
