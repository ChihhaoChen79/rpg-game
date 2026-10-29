// Generates placeholder art (CC0, original) until LPC assets replace it.
//   assets/tilesets/placeholder.png  32x32 tiles, 8 columns, extruded (margin 1, spacing 2)
//   assets/sprites/classes.png       64x64 frames; row = class*4 + facing, 3 walk frames per row
//   assets/sprites/monsters.png      64x64 frames; row = monster sprite row, 2 frames per row
//   assets/sprites/npcs.png          64x64 frames; row = npc sprite row, 2 frames per row
//   assets/sprites/icons.png         32x32 item/spell icons, 8 columns
//   public/icons/icon-192.png, icon-512.png
// Run: npm run gen:art
import { mkdirSync, writeFileSync } from 'node:fs';
import { createImage, setPx, fillRect, fillEllipse, encodePng, noise } from './png.mjs';
import {
  TILE, TILE_SIZE, TILESET_COLUMNS, TILE_COUNT, TILESET_MARGIN, TILESET_SPACING,
} from './tileset-def.mjs';

const T = TILE_SIZE;

// ---------- helpers ----------
function shade([r, g, b, a = 255], f) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [c(r), c(g), c(b), a];
}

function getPx(img, x, y) {
  const i = (y * img.w + x) * 4;
  return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]];
}

function blit(dst, src, dx, dy, flipX = false) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const p = getPx(src, flipX ? src.w - 1 - x : x, y);
      if (p[3] === 0) continue;
      const i = ((dy + y) * dst.w + dx + x) * 4;
      dst.px[i] = p[0]; dst.px[i + 1] = p[1]; dst.px[i + 2] = p[2]; dst.px[i + 3] = p[3];
    }
  }
}

/** Dark 1px outline around opaque pixels (ignores the soft shadow, alpha < 200). */
function outline(img, color = [28, 22, 30]) {
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

const line = (img, x0, y0, x1, y1, c) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) setPx(img, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
};

// ---------- tiles ----------
function speckle(img, base, seed, amount = 0.1) {
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = noise(x, y, seed);
      setPx(img, x, y, shade(base, 1 - amount + n * amount * 2));
    }
  }
}

function grassBlades(img, seed, dark, light, count = 12) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(noise(i, 3, seed) * 30) + 1;
    const y = Math.floor(noise(i, 7, seed) * 28) + 3;
    setPx(img, x, y, dark);
    setPx(img, x, y - 1, light);
  }
}

const GRASS = [88, 150, 72];
const GRASS_DARK = [78, 138, 64];

const tilePainters = {
  [TILE.GRASS](img) {
    speckle(img, GRASS, 1, 0.08);
    grassBlades(img, 11, shade(GRASS, 0.75), shade(GRASS, 1.12));
  },
  [TILE.GRASS_FLOWERS](img) {
    tilePainters[TILE.GRASS](img);
    const colors = [[245, 225, 110], [240, 150, 180], [250, 250, 250]];
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(noise(i, 1, 21) * 26) + 3;
      const y = Math.floor(noise(i, 2, 21) * 26) + 3;
      const c = colors[i % 3];
      setPx(img, x, y, c); setPx(img, x + 1, y, c); setPx(img, x, y + 1, c); setPx(img, x + 1, y + 1, shade(c, 0.8));
    }
  },
  [TILE.DIRT](img) {
    speckle(img, [170, 136, 92], 2, 0.08);
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(noise(i, 5, 31) * 30) + 1;
      const y = Math.floor(noise(i, 6, 31) * 30) + 1;
      setPx(img, x, y, [136, 106, 70]);
      setPx(img, x + 1, y, [190, 158, 112]);
    }
  },
  [TILE.STONE](img) {
    speckle(img, [156, 154, 160], 3, 0.05);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const off = Math.floor(y / 8) % 2 ? 8 : 0;
        if (y % 8 === 7 || (x + off) % 16 === 15) setPx(img, x, y, [116, 114, 122]);
        else if (y % 8 === 0 || (x + off) % 16 === 0) setPx(img, x, y, [178, 176, 182]);
      }
    }
  },
  [TILE.WATER](img) {
    speckle(img, [56, 104, 184], 4, 0.04);
    for (let y = 2; y < T; y += 8) {
      for (let x = 0; x < T; x++) {
        if (Math.sin((x + y * 1.7) * 0.45) > 0.65) setPx(img, x, y + ((x >> 3) & 1), [130, 178, 236]);
      }
    }
  },
  [TILE.TREE](img) {
    fillEllipse(img, 16, 29, 11, 3, [0, 0, 0, 70]);
    fillRect(img, 13, 20, 6, 10, [104, 70, 42]);
    fillRect(img, 13, 20, 2, 10, [130, 92, 58]);
    fillEllipse(img, 16, 13, 13, 12, [40, 98, 48]);
    fillEllipse(img, 13, 10, 8, 7, [60, 128, 60]);
    fillEllipse(img, 11, 8, 3, 2, [96, 164, 86]);
    outline(img, [24, 46, 28]);
  },
  [TILE.FENCE](img) {
    fillRect(img, 0, 12, T, 3, [150, 108, 64]);
    fillRect(img, 0, 21, T, 3, [150, 108, 64]);
    for (const x of [3, 15, 27]) { fillRect(img, x, 7, 3, 22, [116, 80, 46]); setPx(img, x + 1, 7, [150, 108, 64]); }
    outline(img, [60, 40, 24]);
  },
  [TILE.HOUSE_WALL](img) {
    speckle(img, [214, 200, 164], 5, 0.04);
    for (let x = 0; x < T; x += 8) fillRect(img, x, 0, 1, T, [156, 124, 92]);
    fillRect(img, 9, 9, 14, 11, [52, 40, 30]);
    fillRect(img, 10, 10, 12, 9, [86, 132, 176]);
    fillRect(img, 15, 10, 2, 9, [120, 86, 52]);
    fillRect(img, 10, 14, 12, 1, [120, 86, 52]);
  },
  [TILE.ROOF](img) {
    speckle(img, [176, 68, 54], 6, 0.05);
    for (let y = 0; y < T; y += 6) fillRect(img, 0, y, T, 1, [124, 42, 34]);
    for (let y = 0; y < T; y += 6) for (let x = (y / 6) % 2 ? 4 : 0; x < T; x += 8) fillRect(img, x, y + 1, 1, 5, [140, 52, 42]);
  },
  [TILE.DOOR](img) {
    tilePainters[TILE.HOUSE_WALL](img);
    fillRect(img, 8, 5, 16, 27, [52, 40, 30]);
    fillRect(img, 9, 6, 14, 26, [116, 76, 42]);
    for (let x = 12; x < 23; x += 4) fillRect(img, x, 6, 1, 26, [96, 62, 34]);
    setPx(img, 20, 19, [236, 204, 84]);
  },
  [TILE.DARK_GRASS](img) {
    speckle(img, GRASS_DARK, 7, 0.08);
    grassBlades(img, 41, shade(GRASS_DARK, 0.75), shade(GRASS_DARK, 1.12), 14);
  },
  [TILE.ROCK](img) {
    fillEllipse(img, 16, 27, 12, 3, [0, 0, 0, 70]);
    fillEllipse(img, 16, 19, 12, 9, [124, 122, 118]);
    fillEllipse(img, 13, 16, 7, 4, [158, 156, 150]);
    fillEllipse(img, 20, 23, 5, 2, [100, 98, 96]);
    outline(img, [52, 50, 52]);
  },
  [TILE.BUSH](img) {
    fillEllipse(img, 16, 28, 12, 3, [0, 0, 0, 70]);
    fillEllipse(img, 16, 20, 13, 9, [46, 112, 50]);
    fillEllipse(img, 11, 17, 6, 5, [70, 142, 66]);
    fillEllipse(img, 21, 18, 5, 4, [62, 132, 60]);
    setPx(img, 9, 21, [220, 70, 70]); setPx(img, 19, 23, [220, 70, 70]); setPx(img, 23, 16, [220, 70, 70]);
    outline(img, [24, 54, 28]);
  },
  [TILE.BRIDGE](img) {
    speckle(img, [156, 116, 74], 8, 0.05);
    for (let x = 0; x < T; x += 6) fillRect(img, x, 0, 1, T, [104, 72, 44]);
    fillRect(img, 0, 0, T, 2, [92, 62, 38]);
    fillRect(img, 0, 30, T, 2, [92, 62, 38]);
  },
  [TILE.SAFE_MARK](img) { fillRect(img, 0, 0, T, T, [60, 140, 255, 90]); },
  [TILE.BLOCK_MARK](img) { fillRect(img, 0, 0, T, T, [255, 50, 50, 110]); },
};

function makeTileset() {
  const rows = Math.ceil(TILE_COUNT / TILESET_COLUMNS);
  const cell = T + TILESET_SPACING;
  const W = TILESET_MARGIN * 2 + TILESET_COLUMNS * cell - TILESET_SPACING;
  const H = TILESET_MARGIN * 2 + rows * cell - TILESET_SPACING;
  const atlas = createImage(W, H);
  for (let id = 0; id < TILE_COUNT; id++) {
    const tile = createImage(T, T);
    const paint = tilePainters[id];
    if (!paint) throw new Error(`No painter for tile ${id}`);
    paint(tile);
    const ox = TILESET_MARGIN + (id % TILESET_COLUMNS) * cell;
    const oy = TILESET_MARGIN + Math.floor(id / TILESET_COLUMNS) * cell;
    // Extrude: copy edge pixels 1px outward so scaled rendering never samples a neighbour tile.
    for (let y = -1; y <= T; y++) {
      for (let x = -1; x <= T; x++) {
        const sx = Math.min(T - 1, Math.max(0, x));
        const sy = Math.min(T - 1, Math.max(0, y));
        const p = getPx(tile, sx, sy);
        const i = ((oy + y) * W + ox + x) * 4;
        atlas.px[i] = p[0]; atlas.px[i + 1] = p[1]; atlas.px[i + 2] = p[2]; atlas.px[i + 3] = p[3];
      }
    }
  }
  return atlas;
}

// ---------- characters (64x64, feet at y=60) ----------
const SKIN = [240, 200, 164];
const SKIN_SH = [212, 166, 132];
const EYE = [34, 30, 44];

/**
 * Draws one frame of a chibi humanoid facing down (front), up (back) or right (side).
 * Left-facing frames are mirrored from right-facing ones by the caller.
 * step: 0 standing, 1/2 alternate stride.
 */
function drawHumanoid(img, look, view, step) {
  const cx = 32;
  const bob = step === 0 ? 0 : -1;
  const sA = step === 1 ? 2 : step === 2 ? -2 : 0; // stride offset
  fillEllipse(img, cx, 60, 11, 3, [0, 0, 0, 80]);

  // Cape behind the body (front view: edges show; side: trailing).
  if (look.cape) {
    if (view === 'front') fillRect(img, cx - 11, 36 + bob, 22, 18, shade(look.cape, 0.7));
    if (view === 'side') fillRect(img, cx - 10, 36 + bob, 6, 18, look.cape);
  }

  // Legs / robe skirt
  if (look.robe) {
    const r = look.robe;
    for (let y = 44; y <= 58; y++) {
      const half = 8 + Math.floor((y - 44) / 3);
      fillRect(img, cx - half, y + bob, half * 2, 1, y > 55 ? shade(r, 0.85) : r);
    }
    // shoes peeking out while walking
    if (view !== 'side') {
      fillRect(img, cx - 6, 58 + (sA > 0 ? -1 : 0), 4, 2, look.boots);
      fillRect(img, cx + 2, 58 + (sA < 0 ? -1 : 0), 4, 2, look.boots);
    } else fillRect(img, cx - 2 + sA, 58, 7, 2, look.boots);
  } else if (view === 'side') {
    fillRect(img, cx - 3 - sA, 50, 5, 8, shade(look.legs, 0.8));
    fillRect(img, cx - 3 - sA, 57, 7, 3, shade(look.boots, 0.8));
    fillRect(img, cx - 2 + sA, 50, 5, 8, look.legs);
    fillRect(img, cx - 2 + sA, 57, 7, 3, look.boots);
  } else {
    const lu = sA > 0 ? -2 : 0;
    const ru = sA < 0 ? -2 : 0;
    fillRect(img, cx - 7, 50 + lu, 5, 8, look.legs);
    fillRect(img, cx - 7, 56 + lu, 5, 4, look.boots);
    fillRect(img, cx + 2, 50 + ru, 5, 8, look.legs);
    fillRect(img, cx + 2, 56 + ru, 5, 4, look.boots);
  }

  // Torso
  const tw = view === 'side' ? 12 : 18;
  const tx = cx - tw / 2;
  if (!look.robe) {
    fillRect(img, tx, 36 + bob, tw, 15, look.body);
    fillRect(img, tx, 36 + bob, tw, 2, shade(look.body, 1.15));
    if (look.plate) {
      fillRect(img, tx + 2, 39 + bob, tw - 4, 1, shade(look.body, 1.25));
      fillRect(img, tx + 3, 43 + bob, tw - 6, 1, shade(look.body, 0.8));
    }
    fillRect(img, tx, 47 + bob, tw, 2, look.belt);
    if (view !== 'up') setPx(img, cx, 47 + bob, [230, 196, 80]);
  } else {
    fillRect(img, tx, 36 + bob, tw, 10, look.robe);
    fillRect(img, tx, 36 + bob, tw, 2, shade(look.robe, 1.15));
    if (view === 'front') fillRect(img, cx - 1, 37 + bob, 2, 20, look.trim);
    fillRect(img, tx, 44 + bob, tw, 2, look.trim);
  }
  if (look.cape && view === 'up') fillRect(img, cx - 10, 35 + bob, 20, 19, look.cape);

  // Arms
  const arm = look.sleeve ?? look.body;
  if (view === 'side') {
    fillRect(img, cx - 2 - sA, 38 + bob, 5, 10, shade(arm, 0.85));
    fillRect(img, cx - 2 - sA, 47 + bob, 4, 3, look.gloves ?? SKIN);
  } else {
    fillRect(img, tx - 4, 37 + bob - (sA > 0 ? 1 : 0), 4, 11, arm);
    fillRect(img, tx + tw, 37 + bob - (sA < 0 ? 1 : 0), 4, 11, arm);
    fillRect(img, tx - 4, 47 + bob - (sA > 0 ? 1 : 0), 4, 3, look.gloves ?? SKIN);
    fillRect(img, tx + tw, 47 + bob - (sA < 0 ? 1 : 0), 4, 3, look.gloves ?? SKIN);
  }

  // Head
  const hy = 25 + bob;
  if (look.ears && view !== 'up') {
    if (view === 'front') {
      fillRect(img, cx - 13, hy - 1, 3, 2, SKIN); setPx(img, cx - 14, hy - 2, SKIN);
      fillRect(img, cx + 10, hy - 1, 3, 2, SKIN); setPx(img, cx + 13, hy - 2, SKIN);
    } else { fillRect(img, cx - 4, hy - 2, 2, 3, SKIN); setPx(img, cx - 6, hy - 4, SKIN); setPx(img, cx - 5, hy - 3, SKIN); }
  }
  fillEllipse(img, cx, hy, 10, 10, SKIN);
  fillEllipse(img, cx, hy + 5, 8, 4, SKIN_SH);
  fillEllipse(img, cx, hy + 3, 9, 5, SKIN);

  // Hair / helmet / hat
  if (look.helmet) {
    const h = look.helmet;
    fillEllipse(img, cx, hy - 2, 11, 9, h);
    fillEllipse(img, cx - 3, hy - 6, 4, 2, shade(h, 1.3));
    if (view === 'front') {
      fillRect(img, cx - 9, hy + 1, 18, 3, h);
      fillRect(img, cx - 7, hy + 2, 14, 1, [40, 40, 52]); // visor slit
      fillRect(img, cx - 1, hy - 10, 2, 12, shade(h, 0.8)); // crest line
    } else if (view === 'side') {
      fillRect(img, cx - 9, hy - 1, 14, 6, h);
      fillRect(img, cx + 2, hy + 1, 8, 1, [40, 40, 52]);
    } else {
      fillEllipse(img, cx, hy + 1, 11, 9, h);
    }
    if (look.plume) { fillRect(img, cx - 1, hy - 14, 3, 5, look.plume); fillRect(img, cx - 3, hy - 16, 3, 3, look.plume); }
  } else {
    const hair = look.hair;
    if (view === 'up') {
      fillEllipse(img, cx, hy, 10, 10, hair);
      if (look.longHair) fillRect(img, cx - 8, hy + 4, 16, 12, hair);
    } else if (view === 'front') {
      fillEllipse(img, cx, hy - 5, 10, 6, hair);
      fillRect(img, cx - 10, hy - 5, 3, 8, hair);
      fillRect(img, cx + 7, hy - 5, 3, 8, hair);
      if (look.longHair) { fillRect(img, cx - 11, hy, 3, 13, hair); fillRect(img, cx + 8, hy, 3, 13, hair); }
    } else {
      fillEllipse(img, cx - 2, hy - 4, 10, 7, hair);
      fillRect(img, cx - 10, hy - 4, 6, 10, hair);
      if (look.longHair) fillRect(img, cx - 10, hy, 6, 14, hair);
    }
    if (look.hood) {
      const hd = look.hood;
      if (view === 'up') fillEllipse(img, cx, hy, 11, 11, hd);
      else if (view === 'front') {
        fillEllipse(img, cx, hy - 6, 11, 6, hd);
        fillRect(img, cx - 11, hy - 6, 3, 10, hd); fillRect(img, cx + 8, hy - 6, 3, 10, hd);
      } else { fillEllipse(img, cx - 2, hy - 5, 11, 7, hd); fillRect(img, cx - 11, hy - 5, 6, 12, hd); }
    }
    if (look.hat) {
      const ht = look.hat;
      fillRect(img, cx - 14, hy - 6, 28, 3, ht);
      fillRect(img, cx - 13, hy - 7, 26, 1, shade(ht, 1.15));
      for (let i = 0; i < 14; i++) {
        const half = Math.max(1, 9 - Math.floor(i * 0.65));
        const lean = view === 'side' ? -Math.floor(i / 4) : Math.floor(i / 6);
        fillRect(img, cx - half + lean, hy - 7 - i, half * 2, 1, ht);
      }
      fillRect(img, cx - 9, hy - 9, 18, 2, look.trim);
    }
  }

  // Face
  if (view === 'front') {
    if (!look.helmet) {
      fillRect(img, cx - 5, hy + 1, 2, 3, EYE); fillRect(img, cx + 3, hy + 1, 2, 3, EYE);
      setPx(img, cx - 5, hy + 1, [255, 255, 255]); setPx(img, cx + 3, hy + 1, [255, 255, 255]);
      setPx(img, cx - 7, hy + 5, [236, 150, 140]); setPx(img, cx + 6, hy + 5, [236, 150, 140]);
    }
    if (look.beard) fillEllipse(img, cx, hy + 8, 6, 4, look.beard);
  } else if (view === 'side') {
    if (!look.helmet) {
      fillRect(img, cx + 5, hy + 1, 2, 3, EYE); setPx(img, cx + 5, hy + 1, [255, 255, 255]);
      setPx(img, cx + 9, hy + 3, SKIN_SH);
    }
    if (look.beard) fillEllipse(img, cx + 4, hy + 8, 5, 3, look.beard);
  }
}

export const CLASS_LOOKS = {
  knight: {
    body: [150, 156, 172], plate: true, belt: [96, 64, 40], legs: [90, 92, 106], boots: [70, 54, 44],
    gloves: [120, 124, 140], helmet: [176, 182, 196], plume: [200, 50, 50], cape: [176, 40, 44],
  },
  elf: {
    body: [64, 132, 70], sleeve: [52, 112, 60], belt: [120, 84, 46], legs: [104, 82, 56], boots: [96, 66, 40],
    hair: [236, 210, 120], longHair: true, ears: true, hood: null,
  },
  mage: {
    robe: [92, 64, 160], sleeve: [80, 54, 142], trim: [226, 190, 80], boots: [60, 44, 40],
    hair: [120, 80, 50], hat: [80, 54, 146],
  },
};
export const CLASS_ORDER = ['knight', 'elf', 'mage'];

function makeClassSheet() {
  const F = 64;
  const sheet = createImage(F * 3, F * 4 * CLASS_ORDER.length);
  CLASS_ORDER.forEach((cls, ci) => {
    const look = CLASS_LOOKS[cls];
    for (let facing = 0; facing < 4; facing++) {
      for (let step = 0; step < 3; step++) {
        const frame = createImage(F, F);
        const view = facing === 0 ? 'front' : facing === 3 ? 'up' : 'side';
        drawHumanoid(frame, look, view, step);
        outline(frame);
        blit(sheet, frame, step * F, (ci * 4 + facing) * F, facing === 1); // 1 = left: mirror
      }
    }
  });
  return sheet;
}

// ---------- monsters (64x64, facing right, 2 frames) ----------
function drawSlime(img, f) {
  const squash = f === 1 ? 2 : 0;
  fillEllipse(img, 32, 59, 14, 3, [0, 0, 0, 80]);
  fillEllipse(img, 32, 50 + squash / 2, 14 + squash, 10 - squash, [96, 196, 92]);
  fillEllipse(img, 32, 47 + squash, 10, 5, [130, 224, 120]);
  fillEllipse(img, 27, 44 + squash, 3, 2, [220, 255, 210]);
  fillRect(img, 33, 47 + squash, 2, 4, EYE); fillRect(img, 39, 47 + squash, 2, 4, EYE);
  fillRect(img, 35, 53 + squash, 4, 1, [50, 110, 50]);
}

function drawWolf(img, f) {
  const leg = f === 1 ? 2 : 0;
  const fur = [134, 134, 144];
  fillEllipse(img, 32, 59, 18, 3, [0, 0, 0, 80]);
  fillRect(img, 18 + leg, 50, 4, 9, shade(fur, 0.8)); fillRect(img, 40 - leg, 50, 4, 9, shade(fur, 0.8));
  fillEllipse(img, 30, 46, 15, 7, fur);
  fillEllipse(img, 30, 49, 12, 3, [196, 196, 204]);
  fillRect(img, 22 - leg, 50, 4, 9, fur); fillRect(img, 36 + leg, 50, 4, 9, fur);
  for (let i = 0; i < 9; i++) fillRect(img, 9 + i, 40 - Math.floor(i / 2) + (f ? 1 : 0), 4, 3, fur); // tail
  fillEllipse(img, 46, 39, 8, 6, fur); // head
  fillRect(img, 50, 40, 7, 4, [174, 174, 182]); // snout
  setPx(img, 57, 40, EYE);
  fillRect(img, 41, 30, 3, 5, fur); fillRect(img, 45, 30, 3, 5, fur); // ears
  fillRect(img, 47, 37, 2, 2, [230, 200, 60]); // eye
}

function drawImp(img, f) {
  const sA = f === 1 ? 2 : -1;
  const sk = [110, 168, 84];
  fillEllipse(img, 32, 60, 10, 3, [0, 0, 0, 80]);
  fillRect(img, 27 - sA, 50, 4, 9, shade(sk, 0.8)); fillRect(img, 33 + sA, 50, 4, 9, sk);
  fillRect(img, 25, 40, 14, 11, sk);
  fillRect(img, 25, 46, 14, 5, [120, 84, 52]); // loincloth
  fillRect(img, 22, 41, 3, 8, sk); fillRect(img, 39, 41, 3, 8, shade(sk, 0.85));
  fillRect(img, 41, 32, 3, 16, [110, 76, 46]); fillEllipse(img, 42, 31, 3, 4, [90, 60, 36]); // club
  fillEllipse(img, 32, 33, 9, 8, sk);
  fillRect(img, 21, 30, 4, 3, sk); setPx(img, 20, 29, sk); fillRect(img, 39, 30, 4, 3, sk); setPx(img, 43, 29, sk);
  fillRect(img, 34, 31, 2, 3, [240, 60, 50]); fillRect(img, 38, 31, 2, 3, [240, 60, 50]);
  fillRect(img, 33, 37, 6, 1, [50, 70, 40]); setPx(img, 34, 38, [240, 240, 230]);
}

export const MONSTER_SPRITES = ['slime', 'wolf', 'imp'];
const monsterPainters = { slime: drawSlime, wolf: drawWolf, imp: drawImp };

function makeRowSheet(names, painters) {
  const F = 64;
  const sheet = createImage(F * 2, F * names.length);
  names.forEach((name, row) => {
    for (let f = 0; f < 2; f++) {
      const frame = createImage(F, F);
      painters[name](frame, f);
      outline(frame);
      blit(sheet, frame, f * F, row * F);
    }
  });
  return sheet;
}

// ---------- NPCs ----------
export const NPC_SPRITES = ['scribe'];
const npcPainters = {
  scribe(img, f) {
    drawHumanoid(img, {
      robe: [60, 96, 160], sleeve: [52, 84, 146], trim: [236, 236, 236], boots: [60, 44, 40],
      hair: [90, 60, 40], longHair: true,
    }, 'front', 0);
    // book held in front
    fillRect(img, 25, 41 + f, 14, 9, [150, 50, 40]);
    fillRect(img, 26, 42 + f, 12, 7, [236, 228, 200]);
    fillRect(img, 31, 42 + f, 1, 7, [150, 50, 40]);
  },
};

// ---------- icons (32x32) ----------
function potion(img, color) {
  fillRect(img, 13, 5, 6, 3, [150, 110, 70]);
  fillRect(img, 14, 8, 4, 4, [200, 220, 230]);
  fillEllipse(img, 16, 19, 9, 9, [200, 220, 230]);
  fillEllipse(img, 16, 20, 8, 7, color);
  fillEllipse(img, 13, 17, 2, 2, [255, 255, 255]);
}
function scroll(img, ribbon) {
  fillRect(img, 7, 8, 18, 16, [236, 222, 180]);
  fillEllipse(img, 7, 16, 3, 8, [214, 196, 150]); fillEllipse(img, 25, 16, 3, 8, [214, 196, 150]);
  for (let y = 11; y < 22; y += 3) fillRect(img, 10, y, 12, 1, [170, 150, 120]);
  fillRect(img, 14, 8, 4, 16, ribbon);
}
export const ICON_NAMES = [
  'gold', 'potion_red', 'potion_orange', 'potion_blue', 'arrows', 'scroll_return', 'scroll_teleport', 'scroll_save',
  'sword', 'bow', 'staff', 'armor_leather', 'helmet', 'shield', 'boots', 'gloves',
  'cloak', 'spellbook', 'spell_heal', 'spell_fire', 'spell_spirit', 'potion_purple', 'scroll_enhance_w', 'scroll_enhance_a',
];
const iconPainters = {
  gold(img) {
    for (const [x, y] of [[11, 20], [20, 21], [15, 14], [16, 22]]) {
      fillEllipse(img, x, y, 6, 4, [214, 170, 40]); fillEllipse(img, x, y - 1, 5, 3, [250, 214, 80]);
    }
  },
  potion_red(img) { potion(img, [210, 40, 50]); },
  potion_orange(img) { potion(img, [236, 130, 30]); },
  potion_blue(img) { potion(img, [50, 90, 220]); },
  potion_purple(img) { potion(img, [150, 60, 200]); },
  arrows(img) {
    for (let i = 0; i < 3; i++) {
      line(img, 6 + i * 3, 26, 22 + i * 3, 6, [160, 120, 70]);
      fillRect(img, 21 + i * 3, 5, 3, 3, [200, 200, 210]);
      fillRect(img, 5 + i * 3, 25, 3, 3, [240, 240, 240]);
    }
  },
  scroll_return(img) { scroll(img, [200, 50, 50]); },
  scroll_teleport(img) { scroll(img, [60, 110, 220]); },
  scroll_save(img) { scroll(img, [60, 170, 80]); },
  scroll_enhance_w(img) { scroll(img, [230, 190, 60]); },
  scroll_enhance_a(img) { scroll(img, [150, 150, 170]); },
  sword(img) {
    for (let i = 0; i < 16; i++) { fillRect(img, 9 + i, 22 - i, 2, 2, [214, 220, 232]); setPx(img, 10 + i, 22 - i, [160, 168, 186]); }
    line(img, 6, 20, 12, 26, [200, 160, 60]); line(img, 7, 20, 13, 26, [200, 160, 60]);
    fillRect(img, 5, 25, 3, 3, [110, 76, 44]);
  },
  bow(img) {
    for (let i = 0; i < 22; i++) { const x = 10 + Math.round(Math.sin((i / 21) * Math.PI) * 9); fillRect(img, x, 5 + i, 2, 1, [150, 100, 52]); }
    line(img, 10, 5, 10, 26, [230, 230, 230]);
  },
  staff(img) {
    line(img, 8, 27, 22, 9, [130, 90, 50]); line(img, 9, 27, 23, 9, [110, 76, 44]);
    fillEllipse(img, 23, 8, 4, 4, [120, 200, 255]); setPx(img, 22, 7, [255, 255, 255]);
  },
  armor_leather(img) {
    fillRect(img, 9, 7, 14, 19, [150, 100, 60]); fillRect(img, 5, 8, 4, 8, [150, 100, 60]); fillRect(img, 23, 8, 4, 8, [150, 100, 60]);
    fillRect(img, 13, 6, 6, 3, [0, 0, 0, 0]); fillRect(img, 9, 19, 14, 2, [100, 66, 40]);
  },
  helmet(img) { fillEllipse(img, 16, 17, 10, 9, [176, 182, 196]); fillRect(img, 6, 17, 20, 7, [176, 182, 196]); fillRect(img, 9, 19, 14, 2, [50, 50, 60]); },
  shield(img) { fillEllipse(img, 16, 15, 10, 11, [120, 80, 50]); fillEllipse(img, 16, 15, 7, 8, [176, 40, 44]); fillRect(img, 15, 7, 2, 16, [230, 200, 80]); },
  boots(img) { fillRect(img, 8, 8, 6, 14, [110, 74, 44]); fillRect(img, 8, 20, 10, 5, [110, 74, 44]); fillRect(img, 18, 8, 6, 14, [96, 64, 38]); fillRect(img, 18, 20, 10, 5, [96, 64, 38]); },
  gloves(img) { fillEllipse(img, 12, 16, 6, 8, [150, 100, 60]); fillEllipse(img, 21, 16, 6, 8, [130, 86, 52]); },
  cloak(img) { for (let y = 6; y < 27; y++) { const h = 5 + Math.floor((y - 6) / 2); fillRect(img, 16 - h, y, h * 2, 1, [60, 70, 140]); } },
  spellbook(img) { fillRect(img, 7, 6, 18, 21, [110, 50, 130]); fillRect(img, 9, 8, 14, 17, [140, 70, 160]); fillEllipse(img, 16, 16, 4, 4, [240, 210, 90]); },
  spell_heal(img) {
    fillEllipse(img, 16, 16, 12, 12, [60, 150, 80]);
    fillRect(img, 14, 8, 4, 16, [240, 255, 240]); fillRect(img, 8, 14, 16, 4, [240, 255, 240]);
  },
  spell_fire(img) {
    fillEllipse(img, 16, 19, 9, 9, [230, 80, 30]); fillEllipse(img, 16, 13, 6, 9, [240, 140, 40]); fillEllipse(img, 16, 18, 4, 5, [255, 230, 120]);
  },
  spell_spirit(img) {
    fillEllipse(img, 16, 16, 11, 11, [60, 140, 90]);
    line(img, 9, 23, 23, 9, [255, 240, 140]); line(img, 9, 22, 22, 9, [255, 240, 140]);
    fillRect(img, 20, 8, 4, 4, [255, 255, 255]);
  },
};

function makeIcons() {
  const cols = 8;
  const rows = Math.ceil(ICON_NAMES.length / cols);
  const sheet = createImage(cols * 32, rows * 32);
  ICON_NAMES.forEach((name, i) => {
    const icon = createImage(32, 32);
    iconPainters[name](icon);
    outline(icon);
    blit(sheet, icon, (i % cols) * 32, Math.floor(i / cols) * 32);
  });
  return sheet;
}

// ---------- app icon ----------
function makeAppIcon(size) {
  const img = createImage(size, size);
  fillRect(img, 0, 0, size, size, [27, 27, 47]);
  const frame = createImage(64, 64);
  drawHumanoid(frame, CLASS_LOOKS.knight, 'front', 0);
  outline(frame);
  const s = size / 64;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = getPx(frame, Math.floor(x / s), Math.floor(y / s));
      if (p[3] > 0) setPx(img, x, y, p);
    }
  }
  return img;
}

function write(path, img) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, encodePng(img));
  console.log('wrote', path);
}

write('assets/tilesets/placeholder.png', makeTileset());
write('assets/sprites/classes.png', makeClassSheet());
write('assets/sprites/monsters.png', makeRowSheet(MONSTER_SPRITES, monsterPainters));
write('assets/sprites/npcs.png', makeRowSheet(NPC_SPRITES, npcPainters));
write('assets/sprites/icons.png', makeIcons());
write('public/icons/icon-192.png', makeAppIcon(192));
write('public/icons/icon-512.png', makeAppIcon(512));
