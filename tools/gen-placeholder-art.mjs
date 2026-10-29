// Generates placeholder art (CC0, original) until real assets replace it. See assets/ASSETS.md.
//   assets/tilesets/placeholder.png  32x32 tiles, 8 columns, extruded (margin 1, spacing 2)
//   assets/sprites/monsters/<id>.png  64x64 frames (bosses 96x96), 4 columns x 3 rows (move, attack, die), facing right
//   assets/sprites/icons/<name>.png  32x32 item/spell icons, one file each
// Characters and NPCs are layered LPC sheets made by tools/gen-characters.mjs.
// Run: npm run gen:art
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng, noise } from './png.mjs';
import { createImage, setPx, fillRect, fillEllipse, shade, getPx, blit, outline, line, thickLine } from './draw.mjs';
import {
  TILE, TILE_SIZE, TILESET_COLUMNS, TILE_COUNT, TILESET_MARGIN, TILESET_SPACING,
} from './tileset-def.mjs';

const T = TILE_SIZE;

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
  [TILE.CAVE_FLOOR](img) {
    speckle(img, [74, 66, 62], 31, 0.1);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(noise(i, 1, 61) * 28) + 2;
      const y = Math.floor(noise(i, 2, 61) * 28) + 2;
      setPx(img, x, y, [52, 46, 44]);
      setPx(img, x + 1, y, [96, 88, 82]);
    }
  },
  [TILE.CAVE_FLOOR_DARK](img) {
    speckle(img, [56, 50, 50], 33, 0.1);
    for (let i = 0; i < 5; i++) setPx(img, Math.floor(noise(i, 3, 63) * 30) + 1, Math.floor(noise(i, 4, 63) * 30) + 1, [40, 36, 36]);
  },
  [TILE.CAVE_WALL](img) {
    speckle(img, [44, 38, 40], 35, 0.12);
    for (let y = 0; y < T; y += 8) {
      for (let x = (y / 8) % 2 ? 0 : 8; x < T; x += 16) {
        fillEllipse(img, x + 4, y + 4, 6, 4, [64, 58, 58]);
        fillEllipse(img, x + 3, y + 3, 3, 2, [84, 76, 74]);
      }
    }
    fillRect(img, 0, 28, T, 4, [30, 26, 28]);
  },
  [TILE.CAVE_ENTRANCE](img) {
    fillEllipse(img, 16, 18, 15, 12, [96, 86, 74]);
    fillEllipse(img, 16, 19, 12, 9, [20, 16, 18]);
    fillEllipse(img, 16, 22, 9, 5, [8, 6, 8]);
    for (let i = 0; i < 5; i++) fillRect(img, 6 + i * 5, 9 + (i % 2) * 2, 3, 3, [120, 110, 96]);
    outline(img, [50, 44, 40]);
  },
  [TILE.STAIRS_UP](img) {
    speckle(img, [74, 66, 62], 37, 0.08);
    for (let i = 0; i < 5; i++) {
      fillRect(img, 4 + i, 4 + i * 5, 24 - i * 2, 4, [128, 120, 112]);
      fillRect(img, 4 + i, 8 + i * 5, 24 - i * 2, 1, [70, 64, 60]);
    }
  },
  [TILE.BONES](img) {
    line(img, 8, 22, 22, 14, [224, 218, 200]);
    line(img, 9, 22, 23, 14, [224, 218, 200]);
    fillEllipse(img, 8, 22, 2, 2, [236, 230, 214]);
    fillEllipse(img, 23, 14, 2, 2, [236, 230, 214]);
    fillEllipse(img, 20, 24, 4, 3, [230, 224, 206]);
    setPx(img, 19, 24, [40, 36, 36]);
    setPx(img, 21, 24, [40, 36, 36]);
  },
  [TILE.CRYSTAL](img) {
    fillEllipse(img, 16, 28, 11, 3, [0, 0, 0, 80]);
    for (const [x, h, c] of [[11, 18, [110, 90, 220]], [17, 24, [150, 120, 255]], [22, 14, [100, 80, 200]]]) {
      for (let i = 0; i < h; i++) fillRect(img, x - Math.floor((h - i) / 8), 28 - i, 2 + Math.floor((h - i) / 4), 1, c);
    }
    setPx(img, 17, 8, [240, 230, 255]);
    outline(img, [40, 30, 70]);
  },
  [TILE.CAVE_RUBBLE](img) {
    for (const [x, y, r] of [[9, 20, 5], [19, 22, 6], [14, 14, 4], [24, 15, 3]]) {
      fillEllipse(img, x, y, r, r * 0.8, [96, 88, 84]);
      fillEllipse(img, x - 1, y - 1, r / 2, r / 3, [128, 118, 112]);
    }
    outline(img, [40, 36, 36]);
  },
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


// ---------- monsters (64x64, facing right; rows: move, attack, die; 4 frames each) ----------
const EYE = [34, 30, 44];

function drawSlime(img, anim, f) {
  const squash = anim === 'attack' ? [0, 3, -2, 0][f] : [0, 2, 0, -1][f];
  const dx = anim === 'attack' ? [0, -2, 5, 2][f] : 0;
  const cx = 32 + dx;
  fillEllipse(img, 32, 59, 14, 3, [0, 0, 0, 80]);
  fillEllipse(img, cx, 50 + squash / 2, 14 + squash, 10 - squash, [96, 196, 92]);
  fillEllipse(img, cx, 47 + squash, 10, 5, [130, 224, 120]);
  fillEllipse(img, cx - 5, 44 + squash, 3, 2, [220, 255, 210]);
  fillRect(img, cx + 1, 47 + squash, 2, 4, EYE);
  fillRect(img, cx + 7, 47 + squash, 2, 4, EYE);
  if (anim === 'attack' && f === 2) fillEllipse(img, cx + 5, 54, 3, 2, [50, 110, 50]);
  else fillRect(img, cx + 3, 53 + squash, 4, 1, [50, 110, 50]);
}

function drawWolf(img, anim, f) {
  const leg = anim === 'move' ? [0, 2, 0, -2][f] : 0;
  const dx = anim === 'attack' ? [0, -3, 6, 2][f] : 0;
  const head = anim === 'attack' && f === 2 ? 3 : 0;
  const fur = [134, 134, 144];
  fillEllipse(img, 32, 59, 18, 3, [0, 0, 0, 80]);
  fillRect(img, 18 + dx + leg, 50, 4, 9, shade(fur, 0.8));
  fillRect(img, 40 + dx - leg, 50, 4, 9, shade(fur, 0.8));
  fillEllipse(img, 30 + dx, 46, 15, 7, fur);
  fillEllipse(img, 30 + dx, 49, 12, 3, [196, 196, 204]);
  fillRect(img, 22 + dx - leg, 50, 4, 9, fur);
  fillRect(img, 36 + dx + leg, 50, 4, 9, fur);
  for (let i = 0; i < 9; i++) fillRect(img, 9 + dx + i, 40 - Math.floor(i / 2) + (f % 2), 4, 3, fur);
  fillEllipse(img, 46 + dx, 39 + head, 8, 6, fur);
  fillRect(img, 50 + dx, 40 + head, 7, 4, [174, 174, 182]);
  if (head) fillRect(img, 51 + dx, 44 + head, 6, 2, [200, 60, 60]);
  setPx(img, 57 + dx, 40 + head, EYE);
  fillRect(img, 41 + dx, 30 + head, 3, 5, fur);
  fillRect(img, 45 + dx, 30 + head, 3, 5, fur);
  fillRect(img, 47 + dx, 37 + head, 2, 2, [230, 200, 60]);
}

function drawImp(img, anim, f) {
  const sA = anim === 'move' ? [0, 2, 0, -2][f] : 0;
  const sk = [110, 168, 84];
  fillEllipse(img, 32, 60, 10, 3, [0, 0, 0, 80]);
  fillRect(img, 27 - sA, 50, 4, 9, shade(sk, 0.8));
  fillRect(img, 33 + sA, 50, 4, 9, sk);
  fillRect(img, 25, 40, 14, 11, sk);
  fillRect(img, 25, 46, 14, 5, [120, 84, 52]);
  fillRect(img, 22, 41, 3, 8, sk);
  // club: raised then smashed down while attacking
  const ang = anim === 'attack' ? [-100, -140, 10, -30][f] : -95;
  const r = (ang * Math.PI) / 180;
  const hx = 41;
  const hy = 44;
  for (let i = 0; i < 16; i++) fillRect(img, Math.round(hx + Math.cos(r) * i) - 1, Math.round(hy + Math.sin(r) * i) - 1, 3, 3, [110, 76, 46]);
  fillEllipse(img, Math.round(hx + Math.cos(r) * 16), Math.round(hy + Math.sin(r) * 16), 3, 4, [90, 60, 36]);
  fillRect(img, 39, 41, 3, 8, shade(sk, 0.85));
  fillEllipse(img, 32, 33, 9, 8, sk);
  fillRect(img, 21, 30, 4, 3, sk); setPx(img, 20, 29, sk);
  fillRect(img, 39, 30, 4, 3, sk); setPx(img, 43, 29, sk);
  fillRect(img, 34, 31, 2, 3, [240, 60, 50]);
  fillRect(img, 38, 31, 2, 3, [240, 60, 50]);
  fillRect(img, 33, 37, 6, 1, [50, 70, 40]);
  setPx(img, 34, 38, [240, 240, 230]);
}

function drawBat(img, anim, f) {
  const flap = anim === 'move' ? [0, -6, 0, 5][f] : [0, -6, 4, 0][f];
  const dx = anim === 'attack' ? [0, -2, 6, 2][f] : 0;
  const cy = 34 + (anim === 'move' ? [0, -2, 0, 2][f] : 0);
  const fur = [70, 56, 80];
  fillEllipse(img, 32, 60, 8, 2, [0, 0, 0, 60]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 14; i++) {
      const x = 32 + dx + side * (6 + i);
      const y = cy - 2 + Math.round((flap * i) / 14) + Math.abs(i - 7) / 3;
      fillRect(img, x, Math.round(y), 1, 7 - Math.floor(i / 3), [96, 70, 110]);
    }
  }
  fillEllipse(img, 32 + dx, cy, 7, 8, fur);
  fillRect(img, 27 + dx, cy - 9, 3, 4, fur);
  fillRect(img, 34 + dx, cy - 9, 3, 4, fur);
  fillRect(img, 30 + dx, cy - 2, 2, 2, [255, 80, 80]);
  fillRect(img, 34 + dx, cy - 2, 2, 2, [255, 80, 80]);
  setPx(img, 31 + dx, cy + 3, [240, 240, 240]);
  setPx(img, 34 + dx, cy + 3, [240, 240, 240]);
}

function drawSkeleton(img, anim, f) {
  const sA = anim === 'move' ? [0, 2, 0, -2][f] : 0;
  const bone = [226, 222, 204];
  const dark = [150, 146, 130];
  fillEllipse(img, 32, 60, 10, 3, [0, 0, 0, 80]);
  fillRect(img, 28 - sA, 48, 3, 11, dark);
  fillRect(img, 34 + sA, 48, 3, 11, bone);
  fillRect(img, 27, 46, 11, 3, bone); // pelvis
  fillRect(img, 31, 34, 3, 13, bone); // spine
  for (let y = 36; y < 45; y += 3) fillRect(img, 27, y, 11, 2, y % 2 ? bone : dark); // ribs
  fillRect(img, 24, 35, 3, 10, dark);
  // sword arm
  const ang = anim === 'attack' ? [-110, -150, 20, -20][f] : -100;
  const r = (ang * Math.PI) / 180;
  fillRect(img, 38, 35, 3, 9, bone);
  for (let i = 0; i < 18; i++) fillRect(img, Math.round(40 + Math.cos(r) * i), Math.round(43 + Math.sin(r) * i), 2, 2, [190, 196, 206]);
  fillRect(img, 37, 42, 6, 2, [120, 90, 50]);
  fillEllipse(img, 32, 27, 8, 8, bone);
  fillRect(img, 28, 26, 3, 3, [30, 26, 30]);
  fillRect(img, 34, 26, 3, 3, [30, 26, 30]);
  fillRect(img, 29, 32, 7, 2, dark);
}

/** Boss: 96x96 frames, feet at y = 92. */
function drawTroll(img, anim, f) {
  const sA = anim === 'move' ? [0, 3, 0, -3][f] : 0;
  const lunge = anim === 'attack' ? [0, -4, 8, 4][f] : 0; // even, so lunge / 2 stays a whole pixel
  const sk = [104, 124, 98];
  const dk = shade(sk, 0.78);
  fillEllipse(img, 48, 92, 26, 5, [0, 0, 0, 90]);
  fillRect(img, 36 - sA, 70, 10, 21, dk);
  fillRect(img, 52 + sA, 70, 10, 21, sk);
  fillRect(img, 33 - sA, 88, 14, 4, [70, 60, 50]);
  fillRect(img, 50 + sA, 88, 14, 4, [70, 60, 50]);
  fillEllipse(img, 49 + lunge / 2, 56, 24, 20, sk); // belly
  fillEllipse(img, 49 + lunge / 2, 62, 16, 10, shade(sk, 1.12));
  fillRect(img, 30, 66, 38, 8, [110, 76, 46]); // loincloth belt
  fillRect(img, 40, 72, 18, 10, [96, 64, 38]);
  fillRect(img, 22 + lunge / 2, 44, 10, 26, dk); // back arm
  // club arm
  const ang = anim === 'attack' ? [-110, -150, 25, -10][f] : -80;
  const r = (ang * Math.PI) / 180;
  const hx = 72 + lunge;
  const hy = 52;
  for (let i = 0; i < 34; i++) fillRect(img, Math.round(hx + Math.cos(r) * i) - 2, Math.round(hy + Math.sin(r) * i) - 2, 5, 5, [100, 70, 44]);
  fillEllipse(img, Math.round(hx + Math.cos(r) * 34), Math.round(hy + Math.sin(r) * 34), 7, 9, [80, 56, 36]);
  for (let k = 0; k < 4; k++) setPx(img, Math.round(hx + Math.cos(r) * (30 + k)) + 4, Math.round(hy + Math.sin(r) * (30 + k)), [200, 200, 210]);
  fillRect(img, 64 + lunge, 42, 12, 22, sk);
  fillEllipse(img, 50 + lunge / 2, 30, 15, 13, sk); // head
  fillRect(img, 40 + lunge / 2, 32, 20, 6, shade(sk, 0.9));
  fillRect(img, 43 + lunge / 2, 26, 4, 3, [255, 210, 60]);
  fillRect(img, 54 + lunge / 2, 26, 4, 3, [255, 210, 60]);
  fillRect(img, 44 + lunge / 2, 37, 2, 4, [240, 236, 220]); // tusks
  fillRect(img, 55 + lunge / 2, 37, 2, 4, [240, 236, 220]);
  fillRect(img, 36 + lunge / 2, 22, 5, 3, dk);
  fillRect(img, 60 + lunge / 2, 22, 5, 3, dk);
}

const MONSTER_PAINTERS = {
  slime: [drawSlime, 64], wolf: [drawWolf, 64], imp: [drawImp, 64],
  bat: [drawBat, 64], skeleton: [drawSkeleton, 64], troll: [drawTroll, 96],
};

/** Death frames: the move pose squashed toward the ground and fading out. */
function deathFrame(paint, f, size) {
  const src = createImage(size, size);
  paint(src, 'move', 0);
  outline(src);
  const scaleY = [1, 0.7, 0.45, 0.25][f];
  const alpha = [1, 0.85, 0.65, 0.45][f];
  const out = createImage(size, size);
  const feet = size - 4;
  for (let y = 0; y < size; y++) {
    const sy = Math.round(feet - (feet - y) / scaleY);
    if (sy < 0 || sy >= size) continue;
    for (let x = 0; x < size; x++) {
      const p = getPx(src, x, sy);
      if (p[3] === 0) continue;
      setPx(out, x, y, [p[0], p[1], p[2], Math.round(p[3] * alpha)]);
    }
  }
  return out;
}

function makeMonsterSheet(paint, size) {
  const sheet = createImage(size * 4, size * 3);
  ['move', 'attack'].forEach((anim, row) => {
    for (let f = 0; f < 4; f++) {
      const frame = createImage(size, size);
      paint(frame, anim, f);
      outline(frame);
      blit(sheet, frame, f * size, row * size);
    }
  });
  for (let f = 0; f < 4; f++) blit(sheet, deathFrame(paint, f, size), f * size, size * 2);
  return sheet;
}

// ---------- icons (32x32) ----------
function arrowBundle(img, head, fletch) {
  for (let i = 0; i < 3; i++) {
    line(img, 6 + i * 3, 26, 22 + i * 3, 6, [160, 120, 70]);
    fillRect(img, 21 + i * 3, 5, 3, 3, head);
    fillRect(img, 5 + i * 3, 25, 3, 3, fletch);
  }
}
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
  'arrows_silver', 'spellbook_elf', 'spell_ice', 'spell_shield', 'spell_heal_mid', 'spell_lightning', 'spell_burst',
  'spell_barrier', 'spell_nature', 'spell_earth', 'spell_wind', 'scroll_protect',
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
  arrows(img) { arrowBundle(img, [200, 200, 210], [240, 240, 240]); },
  arrows_silver(img) { arrowBundle(img, [235, 240, 255], [150, 200, 255]); },
  scroll_return(img) { scroll(img, [200, 50, 50]); },
  scroll_teleport(img) { scroll(img, [60, 110, 220]); },
  scroll_save(img) { scroll(img, [60, 170, 80]); },
  scroll_enhance_w(img) { scroll(img, [230, 190, 60]); },
  scroll_enhance_a(img) { scroll(img, [150, 150, 170]); },
  scroll_protect(img) { scroll(img, [150, 60, 200]); fillEllipse(img, 16, 16, 4, 5, [255, 230, 120]); },
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
  spellbook_elf(img) { fillRect(img, 7, 6, 18, 21, [40, 110, 60]); fillRect(img, 9, 8, 14, 17, [70, 150, 90]); fillEllipse(img, 16, 16, 3, 6, [220, 250, 160]); },
  spell_ice(img) {
    fillEllipse(img, 16, 16, 12, 12, [40, 90, 170]);
    line(img, 16, 6, 16, 26, [220, 245, 255]); line(img, 7, 11, 25, 21, [220, 245, 255]); line(img, 7, 21, 25, 11, [220, 245, 255]);
  },
  spell_shield(img) { fillEllipse(img, 16, 16, 12, 12, [90, 100, 120]); fillEllipse(img, 16, 15, 7, 9, [190, 200, 220]); fillRect(img, 15, 8, 2, 15, [120, 130, 150]); },
  spell_heal_mid(img) {
    fillEllipse(img, 16, 16, 12, 12, [40, 130, 160]);
    fillRect(img, 14, 7, 4, 18, [255, 250, 200]); fillRect(img, 7, 14, 18, 4, [255, 250, 200]);
    fillEllipse(img, 16, 16, 3, 3, [255, 220, 90]);
  },
  spell_lightning(img) {
    fillEllipse(img, 16, 16, 12, 12, [60, 50, 120]);
    thickLine(img, 19, 6, 12, 17, 2, [255, 240, 120]); thickLine(img, 12, 17, 20, 15, 2, [255, 240, 120]); thickLine(img, 20, 15, 13, 27, 2, [255, 240, 120]);
  },
  spell_burst(img) {
    fillEllipse(img, 16, 16, 13, 13, [170, 40, 20]); fillEllipse(img, 16, 16, 9, 9, [240, 120, 30]); fillEllipse(img, 16, 16, 4, 4, [255, 240, 150]);
  },
  spell_barrier(img) { fillEllipse(img, 16, 16, 12, 12, [110, 60, 170]); fillEllipse(img, 16, 16, 8, 8, [0, 0, 0, 0]); fillEllipse(img, 16, 16, 4, 4, [210, 170, 255]); },
  spell_nature(img) {
    fillEllipse(img, 16, 16, 12, 12, [50, 120, 60]);
    fillEllipse(img, 13, 14, 5, 8, [140, 220, 110]); fillEllipse(img, 20, 17, 5, 7, [110, 200, 90]); line(img, 10, 24, 22, 10, [60, 100, 40]);
  },
  spell_earth(img) { fillEllipse(img, 16, 16, 12, 12, [120, 90, 50]); fillRect(img, 9, 15, 6, 8, [170, 140, 90]); fillRect(img, 16, 11, 7, 12, [150, 120, 80]); },
  spell_wind(img) {
    fillEllipse(img, 16, 16, 12, 12, [60, 140, 150]);
    for (const y of [11, 16, 21]) line(img, 8, y, 22 - (y % 3), y - 2, [230, 255, 250]);
  },
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

function makeIcon(name) {
  const icon = createImage(32, 32);
  iconPainters[name](icon);
  outline(icon);
  return icon;
}


function write(path, img) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, encodePng(img));
  console.log('wrote', path);
}

write('assets/tilesets/placeholder.png', makeTileset());
for (const [id, [paint, size]] of Object.entries(MONSTER_PAINTERS)) write(`assets/sprites/monsters/${id}.png`, makeMonsterSheet(paint, size));
for (const name of ICON_NAMES) write(`assets/sprites/icons/${name}.png`, makeIcon(name));
