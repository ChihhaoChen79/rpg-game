// Generates placeholder art (CC0, original) until LPC assets replace it.
//   assets/tilesets/placeholder.png   32x32 tiles, 8 columns
//   assets/sprites/player.png         64x64 frames, 3 walk frames x 4 directions
//   public/icons/icon-192.png, icon-512.png
// Run: npm run gen:art
import { mkdirSync, writeFileSync } from 'node:fs';
import { createImage, setPx, fillRect, fillEllipse, encodePng, noise } from './png.mjs';
import { TILE, TILE_SIZE, TILESET_COLUMNS, TILE_COUNT } from './tileset-def.mjs';

const T = TILE_SIZE;

function shade([r, g, b], f) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return [c(r), c(g), c(b)];
}

function speckle(img, ox, oy, base, seed, amount = 0.12) {
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = noise(x, y, seed);
      setPx(img, ox + x, oy + y, shade(base, 1 - amount + n * amount * 2));
    }
  }
}

const painters = {
  [TILE.GRASS](img, ox, oy) {
    speckle(img, ox, oy, [86, 152, 70], 1);
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(noise(i, 3, 11) * 30) + 1;
      const y = Math.floor(noise(i, 7, 11) * 28) + 2;
      setPx(img, ox + x, oy + y, [60, 120, 52]);
      setPx(img, ox + x, oy + y - 1, [70, 135, 58]);
    }
  },
  [TILE.GRASS_FLOWERS](img, ox, oy) {
    painters[TILE.GRASS](img, ox, oy);
    const colors = [[240, 230, 120], [240, 140, 170], [250, 250, 250]];
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(noise(i, 1, 21) * 28) + 2;
      const y = Math.floor(noise(i, 2, 21) * 28) + 2;
      const c = colors[i % 3];
      setPx(img, ox + x, oy + y, c);
      setPx(img, ox + x + 1, oy + y, c);
      setPx(img, ox + x, oy + y + 1, c);
    }
  },
  [TILE.DIRT](img, ox, oy) {
    speckle(img, ox, oy, [168, 132, 88], 2, 0.1);
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(noise(i, 5, 31) * 30) + 1;
      const y = Math.floor(noise(i, 6, 31) * 30) + 1;
      setPx(img, ox + x, oy + y, [130, 100, 66]);
    }
  },
  [TILE.STONE](img, ox, oy) {
    speckle(img, ox, oy, [150, 150, 158], 3, 0.06);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const row = Math.floor(y / 8);
        const off = row % 2 ? 8 : 0;
        if (y % 8 === 0 || (x + off) % 16 === 0) setPx(img, ox + x, oy + y, [110, 110, 118]);
      }
    }
  },
  [TILE.WATER](img, ox, oy) {
    speckle(img, ox, oy, [52, 100, 180], 4, 0.05);
    for (let y = 3; y < T; y += 8) {
      for (let x = 0; x < T; x++) {
        if (Math.sin((x + y) * 0.5) > 0.6) setPx(img, ox + x, oy + y, [120, 170, 230]);
      }
    }
  },
  [TILE.TREE](img, ox, oy) {
    fillRect(img, ox + 13, oy + 20, 6, 11, [100, 66, 40]);
    fillEllipse(img, ox + 16, oy + 13, 13, 12, [36, 96, 44]);
    fillEllipse(img, ox + 13, oy + 10, 7, 6, [56, 126, 58]);
    fillEllipse(img, ox + 16, oy + 30, 9, 2, [0, 0, 0, 60]);
  },
  [TILE.FENCE](img, ox, oy) {
    fillRect(img, ox, oy + 12, T, 3, [140, 100, 60]);
    fillRect(img, ox, oy + 21, T, 3, [140, 100, 60]);
    for (const x of [3, 15, 27]) fillRect(img, ox + x, oy + 7, 3, 22, [110, 76, 44]);
  },
  [TILE.HOUSE_WALL](img, ox, oy) {
    speckle(img, ox, oy, [210, 196, 160], 5, 0.05);
    for (let x = 0; x < T; x += 8) fillRect(img, ox + x, oy, 1, T, [150, 120, 90]);
    fillRect(img, ox + 9, oy + 9, 14, 10, [70, 110, 150]);
    fillRect(img, ox + 15, oy + 9, 2, 10, [110, 80, 50]);
  },
  [TILE.ROOF](img, ox, oy) {
    speckle(img, ox, oy, [170, 64, 52], 6, 0.06);
    for (let y = 0; y < T; y += 6) fillRect(img, ox, oy + y, T, 1, [120, 40, 34]);
  },
  [TILE.DOOR](img, ox, oy) {
    painters[TILE.HOUSE_WALL](img, ox, oy);
    fillRect(img, ox + 9, oy + 6, 14, 26, [110, 72, 40]);
    setPx(img, ox + 20, oy + 19, [230, 200, 80]);
  },
  [TILE.DARK_GRASS](img, ox, oy) {
    speckle(img, ox, oy, [62, 120, 56], 7);
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(noise(i, 3, 41) * 30) + 1;
      const y = Math.floor(noise(i, 4, 41) * 28) + 2;
      setPx(img, ox + x, oy + y, [44, 92, 40]);
    }
  },
  [TILE.ROCK](img, ox, oy) {
    fillEllipse(img, ox + 16, oy + 27, 12, 3, [0, 0, 0, 60]);
    fillEllipse(img, ox + 16, oy + 19, 12, 10, [120, 118, 112]);
    fillEllipse(img, ox + 13, oy + 15, 6, 4, [160, 158, 150]);
  },
  [TILE.BUSH](img, ox, oy) {
    fillEllipse(img, ox + 16, oy + 28, 12, 3, [0, 0, 0, 60]);
    fillEllipse(img, ox + 16, oy + 20, 13, 10, [44, 110, 48]);
    fillEllipse(img, ox + 12, oy + 17, 5, 4, [70, 140, 64]);
  },
  [TILE.BRIDGE](img, ox, oy) {
    speckle(img, ox, oy, [150, 110, 70], 8, 0.06);
    for (let x = 0; x < T; x += 6) fillRect(img, ox + x, oy, 1, T, [100, 70, 44]);
    fillRect(img, ox, oy, T, 2, [90, 62, 38]);
    fillRect(img, ox, oy + 30, T, 2, [90, 62, 38]);
  },
  [TILE.SAFE_MARK](img, ox, oy) {
    fillRect(img, ox, oy, T, T, [60, 140, 255, 90]);
  },
  [TILE.BLOCK_MARK](img, ox, oy) {
    fillRect(img, ox, oy, T, T, [255, 50, 50, 110]);
  },
};

function makeTileset() {
  const rows = Math.ceil(TILE_COUNT / TILESET_COLUMNS);
  const img = createImage(TILESET_COLUMNS * T, rows * T);
  for (let id = 0; id < TILE_COUNT; id++) {
    const paint = painters[id];
    if (!paint) throw new Error(`No painter for tile ${id}`);
    paint(img, (id % TILESET_COLUMNS) * T, Math.floor(id / TILESET_COLUMNS) * T);
  }
  return img;
}

// Player: 64x64 frames. Columns: stand, step A, step B. Rows: down, left, right, up.
function makePlayer() {
  const F = 64;
  const img = createImage(F * 3, F * 4);
  const skin = [236, 196, 160];
  const hair = [80, 50, 30];
  const tunic = [60, 90, 170];
  const tunicDark = [40, 64, 130];
  const legs = [70, 60, 50];
  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 3; f++) {
      const ox = f * F;
      const oy = dir * F;
      const bob = f === 0 ? 0 : -1;
      const cx = ox + 32;
      // shadow
      fillEllipse(img, cx, oy + 60, 10, 3, [0, 0, 0, 70]);
      // legs
      const l = f === 1 ? -2 : f === 2 ? 2 : 0;
      if (dir === 1 || dir === 2) {
        fillRect(img, cx - 3 + l, oy + 50, 4, 10, legs);
        fillRect(img, cx - 1 - l, oy + 50, 4, 10, shade(legs, 0.8));
      } else {
        fillRect(img, cx - 6, oy + 50 + (l < 0 ? -1 : 0), 4, 10, legs);
        fillRect(img, cx + 2, oy + 50 + (l > 0 ? -1 : 0), 4, 10, legs);
      }
      // body
      fillRect(img, cx - 8, oy + 34 + bob, 16, 17, tunic);
      fillRect(img, cx - 8, oy + 47 + bob, 16, 2, [120, 80, 40]); // belt
      // arms
      if (dir === 0 || dir === 3) {
        fillRect(img, cx - 11, oy + 35 + bob - l, 3, 12, tunicDark);
        fillRect(img, cx + 8, oy + 35 + bob + l, 3, 12, tunicDark);
      } else {
        fillRect(img, cx - 2 + l, oy + 35 + bob, 4, 12, tunicDark);
      }
      // head
      fillEllipse(img, cx, oy + 26 + bob, 9, 9, skin);
      if (dir === 3) {
        fillEllipse(img, cx, oy + 25 + bob, 9, 9, hair);
      } else {
        fillEllipse(img, cx, oy + 20 + bob, 9, 5, hair);
        const eyeY = oy + 27 + bob;
        if (dir === 0) {
          setPx(img, cx - 4, eyeY, [30, 30, 40]);
          setPx(img, cx + 3, eyeY, [30, 30, 40]);
        } else if (dir === 1) {
          setPx(img, cx - 5, eyeY, [30, 30, 40]);
          fillRect(img, cx + 2, oy + 20 + bob, 7, 7, hair);
        } else {
          setPx(img, cx + 4, eyeY, [30, 30, 40]);
          fillRect(img, cx - 8, oy + 20 + bob, 7, 7, hair);
        }
      }
    }
  }
  return img;
}

function makeIcon(size) {
  const img = createImage(size, size);
  const s = size / 32;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) setPx(img, x, y, [27, 27, 47]);
  // simple pixel sword
  const px = (x, y, c) => fillRect(img, Math.round(x * s), Math.round(y * s), Math.ceil(s), Math.ceil(s), c);
  for (let i = 0; i < 14; i++) px(8 + i, 23 - i, [220, 225, 235]);
  for (let i = 0; i < 13; i++) px(9 + i, 23 - i, [160, 170, 190]);
  for (let i = -3; i <= 3; i++) px(9 + i, 21 + i, [200, 160, 60]);
  px(6, 25, [120, 80, 40]); px(7, 24, [120, 80, 40]); px(5, 26, [200, 160, 60]);
  return img;
}

function write(path, img) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, encodePng(img));
  console.log('wrote', path);
}

write('assets/tilesets/placeholder.png', makeTileset());
write('assets/sprites/player.png', makePlayer());
write('public/icons/icon-192.png', makeIcon(192));
write('public/icons/icon-512.png', makeIcon(512));
