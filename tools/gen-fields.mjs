// Bootstraps the medium and hard hunting fields and links them east of field1:
//   village <-> field1 (東郊草原) <-> field2 (迷霧森林, Lv 8-15) <-> field3 (焦土荒原, Lv 15-25)
// One-time: after it runs, edit maps/field2.json and maps/field3.json in Tiled instead.
// Run: node tools/gen-fields.mjs  (overwrites field2/field3, patches field1's east edge)
import { readFileSync, writeFileSync } from 'node:fs';
import { noise } from './png.mjs';
import { TILE, TILE_SIZE as T, tilesetJson } from './tileset-def.mjs';

const EMPTY = -1;
const W = 60;
const H = 45;
const ROAD = [21, 22]; // the road rows every field shares, so exits line up

const grid = (fill) => ({ a: new Array(W * H).fill(fill) });
const set = (g, x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) g.a[y * W + x] = v; };
const get = (g, x, y) => g.a[y * W + x];
const prop = (name, value) => ({ name, type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string', value });
const layer = (id, name, g, visible = true) => ({
  data: g.a.map((t) => (t === EMPTY ? 0 : t + 1)), height: H, width: W, id, name, opacity: 1, type: 'tilelayer', visible, x: 0, y: 0,
});
const exit = (id, name, x, y, targetMap, targetX, targetY) => ({
  id, name, type: 'exit', x: x * T, y: y * T, width: T, height: 2 * T, rotation: 0, visible: true,
  properties: [prop('targetMap', targetMap), prop('targetX', targetX), prop('targetY', targetY)],
});
const spawn = (id, name, x, y, w, h, monster, count, respawnSec) => ({
  id, name, type: 'spawn', x: x * T, y: y * T, width: w * T, height: h * T, rotation: 0, visible: true,
  properties: [prop('monster', monster), prop('count', count), prop('respawnSec', respawnSec)],
});

/** Border of `wall` tiles with gaps on the road rows at the west and (optionally) east edges. */
function border(deco, wall, eastGap) {
  for (let x = 0; x < W; x++) { set(deco, x, 0, wall); set(deco, x, H - 1, wall); }
  for (let y = 0; y < H; y++) { set(deco, 0, y, wall); set(deco, W - 1, y, wall); }
  for (const y of ROAD) {
    set(deco, 0, y, EMPTY);
    if (eastGap) set(deco, W - 1, y, EMPTY);
  }
}

/** Scatter obstacles by noise, never on or next to the road. */
function scatter(ground, deco, seed, table, skip = () => false) {
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (y >= ROAD[0] - 2 && y <= ROAD[1] + 2) continue;
      if (skip(x, y)) continue;
      const n = noise(x, y, seed);
      let acc = 0;
      for (const [p, tile] of table) {
        acc += p;
        if (n < acc) {
          set(deco, x, y, tile);
          break;
        }
      }
    }
  }
}

function buildMap(nameKey, ground, deco, objects) {
  return {
    compressionlevel: -1, width: W, height: H, infinite: false, orientation: 'orthogonal', renderorder: 'right-down',
    tiledversion: '1.10.2', tilewidth: T, tileheight: T, type: 'map', version: '1.10', nextlayerid: 6,
    nextobjectid: objects.length + 1,
    properties: [prop('nameKey', nameKey), prop('respawnMap', 'village')],
    layers: [
      layer(1, 'ground', ground), layer(2, 'deco', deco), layer(3, 'collision', grid(EMPTY), false),
      layer(4, 'safe', grid(EMPTY), false),
      { draworder: 'topdown', id: 5, name: 'objects', objects, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    ],
    tilesets: [tilesetJson()],
  };
}

// ---------------------------------------------------------------- field2: 迷霧森林 (dense forest)
function field2() {
  const ground = grid(TILE.DARK_GRASS);
  const deco = grid(EMPTY);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (noise(x, y, 301) < 0.06) set(ground, x, y, TILE.GRASS);
  for (let x = 0; x < W; x++) for (const y of ROAD) set(ground, x, y, TILE.DIRT);
  // A forest pond in the north-east.
  for (let y = 5; y < 11; y++) for (let x = 38; x < 46; x++) if ((x - 42) ** 2 / 16 + (y - 8) ** 2 / 9 < 1) set(ground, x, y, TILE.WATER);
  border(deco, TILE.TREE, true);
  scatter(ground, deco, 302, [[0.1, TILE.TREE], [0.02, TILE.BUSH], [0.01, TILE.ROCK]], (x, y) => get(ground, x, y) === TILE.WATER);
  const objects = [
    exit(1, 'toField1', 0, ROAD[0], 'field1', W - 3, ROAD[0]),
    exit(2, 'toField3', W - 1, ROAD[0], 'field3', 2, ROAD[0]),
    spawn(3, 'spiders', 4, 3, 22, 15, 'spider', 7, 50),
    spawn(4, 'spidersSouth', 4, 27, 22, 15, 'spider', 5, 50),
    spawn(5, 'direWolves', 24, 26, 18, 16, 'dire_wolf', 6, 50),
    spawn(6, 'orcs', 40, 3, 17, 38, 'orc', 7, 70),
  ];
  return buildMap('map.field2', ground, deco, objects);
}

// ---------------------------------------------------------------- field3: 焦土荒原 (scorched wasteland)
function field3() {
  const ground = grid(TILE.SCORCHED);
  const deco = grid(EMPTY);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (noise(x, y, 401) < 0.25) set(ground, x, y, TILE.ASH);
  for (let x = 0; x < W; x++) for (const y of ROAD) set(ground, x, y, TILE.DIRT);
  // Lava pools (blocked, but arrows fly over them).
  const pools = [[14, 9, 4, 3], [30, 34, 5, 3], [47, 10, 4, 4], [50, 33, 3, 2]];
  for (const [cx, cy, rx, ry] of pools) {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if ((x - cx) ** 2 / (rx * rx) + (y - cy) ** 2 / (ry * ry) < 1) set(deco, x, y, TILE.LAVA);
    }
  }
  border(deco, TILE.ROCK, false);
  scatter(ground, deco, 402, [[0.04, TILE.DEAD_TREE], [0.04, TILE.ROCK]], (x, y) => get(deco, x, y) === TILE.LAVA);
  const objects = [
    exit(1, 'toField2', 0, ROAD[0], 'field2', W - 3, ROAD[0]),
    spawn(2, 'fireWolves', 4, 3, 24, 15, 'fire_wolf', 7, 60),
    spawn(3, 'golems', 4, 27, 30, 15, 'golem', 5, 90),
    spawn(4, 'deathKnights', 34, 3, 23, 38, 'death_knight', 6, 90),
  ];
  return buildMap('map.field3', ground, deco, objects);
}

writeFileSync('maps/field2.json', JSON.stringify(field2()));
writeFileSync('maps/field3.json', JSON.stringify(field3()));
console.log('wrote maps/field2.json, maps/field3.json');

// ---------------------------------------------------------------- field1: road to the east edge
const f1 = JSON.parse(readFileSync('maps/field1.json', 'utf8'));
const fw = f1.width;
const fdeco = f1.layers.find((l) => l.name === 'deco');
const fground = f1.layers.find((l) => l.name === 'ground');
for (let x = 44; x < fw; x++) {
  for (let y = ROAD[0] - 1; y <= ROAD[1] + 1; y++) {
    const i = y * fw + x;
    if (fground.data[i] === TILE.WATER + 1 || fground.data[i] === TILE.BRIDGE + 1) continue;
    if (x < fw - 1 || ROAD.includes(y)) fdeco.data[i] = 0;
    if (ROAD.includes(y)) fground.data[i] = TILE.DIRT + 1;
  }
}
const fobjs = f1.layers.find((l) => l.type === 'objectgroup').objects;
if (!fobjs.some((o) => o.name === 'toField2')) {
  const id = Math.max(...fobjs.map((o) => o.id)) + 1;
  fobjs.push(exit(id, 'toField2', fw - 1, ROAD[0], 'field2', 2, ROAD[0]));
  f1.nextobjectid = id + 1;
}
writeFileSync('maps/field1.json', JSON.stringify(f1));
console.log('patched maps/field1.json (road and exit to field2 on the east edge)');
