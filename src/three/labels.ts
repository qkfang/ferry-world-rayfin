import * as THREE from 'three';

/**
 * Build a camera-facing text label as a sprite (canvas texture). Cheap and
 * WebGL-only — no extra DOM renderer needed.
 */
export function makeTextSprite(text: string, opts?: { color?: string; bg?: string }): THREE.Sprite {
  const color = opts?.color ?? '#0a1826';
  const bg = opts?.bg ?? 'rgba(255,255,255,0.86)';
  const pad = 16;
  const font = 'bold 40px Segoe UI, system-ui, sans-serif';

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const textW = Math.ceil(measure.measureText(text).width);

  const canvas = document.createElement('canvas');
  canvas.width = textW + pad * 2;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 14);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.4;
  sprite.scale.set((canvas.width / canvas.height) * 24 * scale, 24 * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
