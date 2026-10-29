// Generates the first Tiled maps (orthogonal, embedded tileset, uncompressed CSV-style arrays).
// This is a one-time bootstrap: after it runs, edit maps/*.json in Tiled instead of re-running.
// Run: npm run gen:maps  (overwrites maps/village.json and maps/field1.json)
//
// Map conventions (read by src/logic/map.ts):
//   tile layers  "ground", "deco"   visual; a tile with property blocked=true blocks movement,
//                                   blocksProjectile=true also blocks arrows and spells
//   tile layer   "collision"        hidden; any tile blocks movement
//   tile layer   "safe"             hidden; any tile marks a safe zone
//   object layer "objects"          type "start" / "respawn" points, type "exit" rectangles
//                                   with properties targetMap, targetX, targetY (tiles),
//                                   type "spawn" rectangles (monster, count, respawnSec),
//                                   type "npc" points (npcId)
//   map property "nameKey"          strings key of the map's display name
//   map property "respawnMap"       map whose respawn point is used after dying here
import { mkdirSync, writeFileSync } from 'node:fs';
import { noise } from './png.mjs';
import { TILE, TILE_SIZE, tilesetJson } from './tileset-def.mjs';

const EMPTY = -1;

function makeGrid(w, h, fill = EMPTY) {
  return { w, h, a: new Array(w * h).fill(fill) };
}
const set = (g, x, y, v) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.a[y * g.w + x] = v; };
const get = (g, x, y) => g.a[y * g.w + x];
const rect = (g, x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, v); };

function tileLayer(id, name, grid, visible = true) {
  return {
    data: grid.a.map((t) => (t === EMPTY ? 0 : t + 1)), // firstgid = 1
    height: grid.h, width: grid.w, id, name, opacity: 1, type: 'tilelayer', visible, x: 0, y: 0,
  };
}

function prop(name, value) {
  const type = typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string';
  return { name, type, value };
}

function pointObj(id, type, x, y) {
  return { id, name: type, type, point: true, x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE,
    width: 0, height: 0, rotation: 0, visible: true };
}

function spawnObj(id, name, x, y, w, h, monster, count, respawnSec) {
  return { id, name, type: 'spawn', x: x * TILE_SIZE, y: y * TILE_SIZE, width: w * TILE_SIZE,
    height: h * TILE_SIZE, rotation: 0, visible: true,
    properties: [prop('monster', monster), prop('count', count), prop('respawnSec', respawnSec)] };
}

function npcObj(id, npcId, x, y) {
  return { ...pointObj(id, 'npc', x, y), name: npcId, properties: [prop('npcId', npcId)] };
}

/** Smooth 0..1 value noise (bilinear between lattice points `scale` tiles apart). */
function valueNoise(x, y, scale, seed) {
  const gx = Math.floor(x / scale);
  const gy = Math.floor(y / scale);
  const fx = (x % scale) / scale;
  const fy = (y % scale) / scale;
  const sm = (t) => t * t * (3 - 2 * t);
  const a = noise(gx, gy, seed);
  const b = noise(gx + 1, gy, seed);
  const c = noise(gx, gy + 1, seed);
  const d = noise(gx + 1, gy + 1, seed);
  const u = sm(fx);
  const v = sm(fy);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function exitObj(id, name, x, y, w, h, targetMap, targetX, targetY) {
  return { id, name, type: 'exit', x: x * TILE_SIZE, y: y * TILE_SIZE, width: w * TILE_SIZE,
    height: h * TILE_SIZE, rotation: 0, visible: true,
    properties: [prop('targetMap', targetMap), prop('targetX', targetX), prop('targetY', targetY)] };
}

function buildMap({ w, h, nameKey, respawnMap, ground, deco, collision, safe, objects }) {
  const layers = [
    tileLayer(1, 'ground', ground),
    tileLayer(2, 'deco', deco),
    tileLayer(3, 'collision', collision, false),
    tileLayer(4, 'safe', safe, false),
    { draworder: 'topdown', id: 5, name: 'objects', objects, opacity: 1, type: 'objectgroup',
      visible: true, x: 0, y: 0 },
  ];
  return {
    compressionlevel: -1, width: w, height: h, infinite: false, orientation: 'orthogonal',
    renderorder: 'right-down', tiledversion: '1.10.2', tilewidth: TILE_SIZE, tileheight: TILE_SIZE,
    type: 'map', version: '1.10', nextlayerid: 6, nextobjectid: objects.length + 1,
    properties: [prop('nameKey', nameKey), prop('respawnMap', respawnMap)],
    layers,
    tilesets: [tilesetJson()],
  };
}

function house(ground, deco, x, y, w) {
  // Two roof rows over one wall row; door in the middle of the wall.
  rect(deco, x, y, w, 2, TILE.ROOF);
  rect(deco, x, y + 2, w, 1, TILE.HOUSE_WALL);
  set(deco, x + Math.floor(w / 2), y + 2, TILE.DOOR);
  rect(ground, x - 1, y + 3, w + 2, 1, TILE.DIRT);
}

function village() {
  const w = 40, h = 30;
  const ground = makeGrid(w, h, TILE.GRASS);
  const deco = makeGrid(w, h);
  const collision = makeGrid(w, h);
  const safe = makeGrid(w, h, TILE.SAFE_MARK); // whole village is a safe zone

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (noise(x, y, 101) < 0.08) set(ground, x, y, TILE.GRASS_FLOWERS);
  }
  // Fence border with an east gate at rows 14-15.
  for (let x = 0; x < w; x++) { set(deco, x, 0, TILE.FENCE); set(deco, x, h - 1, TILE.FENCE); }
  for (let y = 0; y < h; y++) { set(deco, 0, y, TILE.FENCE); set(deco, w - 1, y, TILE.FENCE); }
  set(deco, w - 1, 14, EMPTY);
  set(deco, w - 1, 15, EMPTY);
  // Plaza and road to the gate.
  rect(ground, 14, 11, 10, 8, TILE.STONE);
  rect(ground, 24, 14, w - 24, 2, TILE.DIRT);
  rect(ground, 18, 3, 2, 8, TILE.DIRT);
  rect(ground, 18, 19, 2, 7, TILE.DIRT);
  // Houses (future NPC buildings).
  house(ground, deco, 4, 3, 6);
  house(ground, deco, 24, 3, 7);
  house(ground, deco, 4, 20, 6);
  house(ground, deco, 26, 20, 6);
  // Pond.
  rect(ground, 4, 10, 6, 5, TILE.WATER);
  // Trees in corners.
  for (const [x, y] of [[2, 1], [33, 2], [36, 6], [2, 26], [36, 26], [12, 26], [22, 26], [13, 2]]) {
    set(deco, x, y, TILE.TREE);
  }

  const objects = [
    pointObj(1, 'start', 19, 15),
    pointObj(2, 'respawn', 19, 14),
    exitObj(3, 'toField1', w - 1, 14, 1, 2, 'field1', 1, 22),
    npcObj(4, 'scribe', 21, 12),
  ];
  return buildMap({ w, h, nameKey: 'map.village', respawnMap: 'village', ground, deco, collision, safe, objects });
}

function field1() {
  const w = 60, h = 45;
  const ground = makeGrid(w, h, TILE.DARK_GRASS);
  const deco = makeGrid(w, h);
  const collision = makeGrid(w, h);
  const safe = makeGrid(w, h);

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (valueNoise(x, y, 6, 201) > 0.58) set(ground, x, y, TILE.GRASS);
    else if (noise(x, y, 203) < 0.02) set(ground, x, y, TILE.GRASS_FLOWERS);
  }
  // Path from the west entrance to the river bridge and beyond.
  rect(ground, 0, 21, 40, 2, TILE.DIRT);
  // River with a bridge.
  for (let y = 0; y < h; y++) {
    const rx = 40 + Math.round(Math.sin(y * 0.25) * 2);
    rect(ground, rx, y, 3, 1, TILE.WATER);
  }
  for (let y = 20; y <= 23; y++) {
    for (let x = 37; x <= 45; x++) if (get(ground, x, y) === TILE.WATER) set(ground, x, y, TILE.BRIDGE);
  }
  // Tree border with a west gap at rows 21-22.
  for (let x = 0; x < w; x++) { set(deco, x, 0, TILE.TREE); set(deco, x, h - 1, TILE.TREE); }
  for (let y = 0; y < h; y++) { set(deco, 0, y, TILE.TREE); set(deco, w - 1, y, TILE.TREE); }
  set(deco, 0, 21, EMPTY);
  set(deco, 0, 22, EMPTY);
  // Scattered obstacles, kept off the path corridor and the river.
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (y >= 19 && y <= 24) continue;
      if (get(ground, x, y) === TILE.WATER || get(ground, x, y) === TILE.BRIDGE) continue;
      const n = noise(x, y, 202);
      if (n < 0.04) set(deco, x, y, TILE.TREE);
      else if (n < 0.055) set(deco, x, y, TILE.ROCK);
      else if (n < 0.07) set(deco, x, y, TILE.BUSH);
    }
  }

  const objects = [
    exitObj(1, 'toVillage', 0, 21, 1, 2, 'village', 37, 14),
    spawnObj(2, 'slimesNorth', 4, 3, 16, 14, 'slime', 6, 20),
    spawnObj(3, 'slimesSouth', 4, 27, 16, 14, 'slime', 6, 20),
    spawnObj(4, 'wolves', 22, 3, 14, 38, 'wolf', 5, 40),
    spawnObj(5, 'imps', 45, 3, 12, 38, 'imp', 6, 60),
  ];
  return buildMap({ w, h, nameKey: 'map.field1', respawnMap: 'village', ground, deco, collision, safe, objects });
}

mkdirSync('maps', { recursive: true });
for (const [id, map] of [['village', village()], ['field1', field1()]]) {
  writeFileSync(`maps/${id}.json`, JSON.stringify(map));
  console.log('wrote', `maps/${id}.json`);
}
