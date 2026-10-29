// Raster helpers shared by the placeholder-art generators (on top of png.mjs).
import { createImage, setPx, fillRect, fillEllipse } from './png.mjs';

export { createImage, setPx, fillRect, fillEllipse };

export function shade([r, g, b, a = 255], f) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [c(r), c(g), c(b), a];
}

export function getPx(img, x, y) {
  const i = (y * img.w + x) * 4;
  return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]];
}

/** Copy src into dst at (dx, dy), skipping transparent pixels; optionally mirrored. */
export function blit(dst, src, dx, dy, flipX = false) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const p = getPx(src, flipX ? src.w - 1 - x : x, y);
      if (p[3] === 0) continue;
      const i = ((dy + y) * dst.w + dx + x) * 4;
      dst.px[i] = p[0]; dst.px[i + 1] = p[1]; dst.px[i + 2] = p[2]; dst.px[i + 3] = p[3];
    }
  }
}

/** Dark 1px outline around opaque pixels (ignores soft shadows, alpha < 200). */
export function outline(img, color = [28, 22, 30]) {
  const solid = (x, y) => x >= 0 && y >= 0 && x < img.w && y < img.h && img.px[(y * img.w + x) * 4 + 3] >= 200;
  const marks = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push([x, y]);
    }
  }
  for (const [x, y] of marks) {
    const i = (y * img.w + x) * 4;
    img.px[i] = color[0]; img.px[i + 1] = color[1]; img.px[i + 2] = color[2]; img.px[i + 3] = 255;
  }
}

/** 1px line. */
export function line(img, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) setPx(img, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

/** Line with a square brush of width `w`. */
export function thickLine(img, x0, y0, x1, y1, w, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  const h = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    fillRect(img, x - h, y - h, w, w, c);
  }
}

/** Rotate an image by `deg` around (cx, cy), nearest neighbour, into a new image of the same size. */
export function rotate(img, deg, cx, cy, shiftX = 0, shiftY = 0) {
  const out = createImage(img.w, img.h);
  const a = (-deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const dx = x - cx - shiftX;
      const dy = y - cy - shiftY;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
      const p = getPx(img, sx, sy);
      if (p[3] === 0) continue;
      const i = (y * out.w + x) * 4;
      out.px[i] = p[0]; out.px[i + 1] = p[1]; out.px[i + 2] = p[2]; out.px[i + 3] = p[3];
    }
  }
  return out;
}
