// Generates placeholder art (CC0, original) until real assets replace it. See assets/ASSETS.md.
//   assets/tilesets/placeholder.png  32x32 tiles, 8 columns, extruded (margin 1, spacing 2)
//   assets/sprites/monsters/<id>.png  64x64 frames, 4 columns x 3 rows (move, attack, die), facing right
//   assets/sprites/icons.png         32x32 item/spell icons, 8 columns
// Characters and NPCs are layered LPC sheets made by tools/gen-characters.mjs.
// Run: npm run gen:art
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng, noise } from './png.mjs';
import { createImage, setPx, fillRect, fillEllipse, shade, getPx, blit, outline, line } from './draw.mjs';
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

const MONSTER_PAINTERS = { slime: drawSlime, wolf: drawWolf, imp: drawImp };

/** Death frames: the move pose squashed toward the ground and fading out. */
function deathFrame(paint, f) {
  const src = createImage(64, 64);
  paint(src, 'move', 0);
  outline(src);
  const scaleY = [1, 0.7, 0.45, 0.25][f];
  const alpha = [1, 0.85, 0.65, 0.45][f];
  const out = createImage(64, 64);
  for (let y = 0; y < 64; y++) {
    const sy = Math.round(60 - (60 - y) / scaleY);
    if (sy < 0 || sy >= 64) continue;
    for (let x = 0; x < 64; x++) {
      const p = getPx(src, x, sy);
      if (p[3] === 0) continue;
      setPx(out, x, y, [p[0], p[1], p[2], Math.round(p[3] * alpha)]);
    }
  }
  return out;
}

function makeMonsterSheet(paint) {
  const sheet = createImage(64 * 4, 64 * 3);
  ['move', 'attack'].forEach((anim, row) => {
    for (let f = 0; f < 4; f++) {
      const frame = createImage(64, 64);
      paint(frame, anim, f);
      outline(frame);
      blit(sheet, frame, f * 64, row * 64);
    }
  });
  for (let f = 0; f < 4; f++) blit(sheet, deathFrame(paint, f), f * 64, 128);
  return sheet;
}

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


function write(path, img) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, encodePng(img));
  console.log('wrote', path);
}

write('assets/tilesets/placeholder.png', makeTileset());
for (const [id, paint] of Object.entries(MONSTER_PAINTERS)) write(`assets/sprites/monsters/${id}.png`, makeMonsterSheet(paint));
write('assets/sprites/icons.png', makeIcons());
