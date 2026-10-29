// Bootstraps the first dungeon (maps/dungeon1.json, 暗影洞窟) and adds its entrance to
// 東郊草原 (maps/field1.json is patched in place: only the entrance area changes).
// After this, edit both maps in Tiled; re-running overwrites dungeon1.json.
// Run: npm run gen:dungeon
import { readFileSync, writeFileSync } from 'node:fs';
import { noise } from './png.mjs';
import { TILE, TILE_SIZE, tilesetJson } from './tileset-def.mjs';

const EMPTY = -1;
const W = 56;
const H = 40;

const grid = (fill) => ({ w: W, h: H, a: new Array(W * H).fill(fill) });
const get = (g, x, y) => g.a[y * g.w + x];
const set = (g, x, y, v) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.a[y * g.w + x] = v; };

const ground = grid(TILE.CAVE_FLOOR);
const deco = grid(TILE.CAVE_WALL);
const open = (x, y) => { set(deco, x, y, EMPTY); };

/** Carve a room with a slightly ragged edge. */
function room(x0, y0, x1, y1, seed) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (edge && noise(x, y, seed) < 0.35) continue;
      open(x, y);
    }
  }
}

function corridor(x0, y0, x1, y1) {
  // L-shaped, 2 tiles wide
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { open(x, y0); open(x, y0 + 1); }
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { open(x1, y); open(x1 + 1, y); }
}

room(2, 16, 11, 24, 1); // entry hall
corridor(11, 19, 17, 19);
room(17, 5, 31, 17, 2); // bat cavern
room(17, 22, 32, 34, 3); // skeleton cavern
corridor(17, 19, 22, 14); // hall -> bat cavern
corridor(17, 20, 22, 23); // hall -> skeleton cavern
corridor(31, 11, 35, 18); // bat cavern -> boss gate
corridor(32, 28, 35, 20); // skeleton cavern -> boss gate
room(36, 4, 53, 35, 4); // boss hall (18 x 32)

// Pillars in the boss hall (cover from arrows), crystals and rubble for flavour.
for (const [x, y] of [[41, 10], [48, 10], [41, 29], [48, 29]]) set(deco, x, y, TILE.CRYSTAL);
for (const [x, y] of [[44, 18], [45, 18], [44, 19], [45, 19]]) set(ground, x, y, TILE.CAVE_FLOOR_DARK);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (get(deco, x, y) !== EMPTY) continue;
    const n = noise(x, y, 77);
    if (n < 0.04 && x > 13) set(deco, x, y, TILE.BONES);
    else if (n < 0.055 && x > 13 && !(x >= 36)) set(deco, x, y, TILE.CAVE_RUBBLE);
    else if (noise(x, y, 78) < 0.15) set(ground, x, y, TILE.CAVE_FLOOR_DARK);
  }
}
// Stairs back up, at the west end of the entry hall.
open(3, 20);
set(ground, 3, 20, TILE.STAIRS_UP);

const prop = (name, value) => ({ name, type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string', value });
const T = TILE_SIZE;
const layer = (id, name, g, visible = true) => ({
  data: g.a.map((t) => (t === EMPTY ? 0 : t + 1)), height: H, width: W, id, name, opacity: 1, type: 'tilelayer', visible, x: 0, y: 0,
});
const spawn = (id, name, x, y, w, h, monster, count, respawnSec, respawnMaxSec) => ({
  id, name, type: 'spawn', x: x * T, y: y * T, width: w * T, height: h * T, rotation: 0, visible: true,
  properties: [prop('monster', monster), prop('count', count), prop('respawnSec', respawnSec),
    ...(respawnMaxSec ? [prop('respawnMaxSec', respawnMaxSec)] : [])],
});

// Entrance in the field: south-east corner, among the imps.
const FIELD_ENTRANCE = { x: 53, y: 41 };

const objects = [
  { id: 1, name: 'toField1', type: 'exit', x: 3 * T, y: 20 * T, width: T, height: T, rotation: 0, visible: true,
    properties: [prop('targetMap', 'field1'), prop('targetX', FIELD_ENTRANCE.x), prop('targetY', FIELD_ENTRANCE.y - 1)] },
  spawn(2, 'bats', 18, 6, 13, 11, 'bat', 7, 30),
  spawn(3, 'skeletons', 18, 23, 14, 11, 'skeleton', 6, 45),
  spawn(4, 'boss', 37, 5, 16, 30, 'troll', 1, 3600, 7200),
];

const dungeon = {
  compressionlevel: -1, width: W, height: H, infinite: false, orientation: 'orthogonal', renderorder: 'right-down',
  tiledversion: '1.10.2', tilewidth: T, tileheight: T, type: 'map', version: '1.10', nextlayerid: 6,
  nextobjectid: objects.length + 1,
  properties: [prop('nameKey', 'map.dungeon1'), prop('respawnMap', 'village')],
  layers: [
    layer(1, 'ground', ground), layer(2, 'deco', deco), layer(3, 'collision', grid(EMPTY), false),
    layer(4, 'safe', grid(EMPTY), false),
    { draworder: 'topdown', id: 5, name: 'objects', objects, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
  ],
  tilesets: [tilesetJson()],
};
writeFileSync('maps/dungeon1.json', JSON.stringify(dungeon));
console.log('wrote maps/dungeon1.json');

// ---- patch the field: clear a small clearing, place the cave mouth and its exit object.
const field = JSON.parse(readFileSync('maps/field1.json', 'utf8'));
const fw = field.width;
const fdeco = field.layers.find((l) => l.name === 'deco');
const fground = field.layers.find((l) => l.name === 'ground');
for (let y = FIELD_ENTRANCE.y - 2; y <= FIELD_ENTRANCE.y + 1; y++) {
  for (let x = FIELD_ENTRANCE.x - 2; x <= FIELD_ENTRANCE.x + 2; x++) {
    if (y >= field.height - 1 || x >= fw - 1) continue; // keep the border trees
    fdeco.data[y * fw + x] = 0;
    fground.data[y * fw + x] = TILE.DIRT + 1;
  }
}
fdeco.data[FIELD_ENTRANCE.y * fw + FIELD_ENTRANCE.x] = TILE.CAVE_ENTRANCE + 1;
const fobjs = field.layers.find((l) => l.type === 'objectgroup').objects;
if (!fobjs.some((o) => o.name === 'toDungeon1')) {
  const id = Math.max(...fobjs.map((o) => o.id)) + 1;
  fobjs.push({ id, name: 'toDungeon1', type: 'exit', x: FIELD_ENTRANCE.x * T, y: FIELD_ENTRANCE.y * T, width: T, height: T,
    rotation: 0, visible: true, properties: [prop('targetMap', 'dungeon1'), prop('targetX', 5), prop('targetY', 20)] });
  field.nextobjectid = id + 1;
}
writeFileSync('maps/field1.json', JSON.stringify(field));
console.log('patched maps/field1.json (entrance at', FIELD_ENTRANCE, ')');
