// Map presets with a seed (docs/PLAN.md §11.1): the same settings and seed always give the same map.
// Pure functions (no DOM, no Node), so tests can run them.
import { BLOCKING_TILES, TILE } from '../../tileset-def.mjs';
import { blankMap, EMPTY, type EdMap } from './model';

export type Preset = 'meadow' | 'forest' | 'wasteland' | 'dungeon' | 'village';
export const PRESETS: Preset[] = ['meadow', 'forest', 'wasteland', 'dungeon', 'village'];

export interface GenOptions {
  preset: Preset;
  id: string;
  width: number;
  height: number;
  seed: number;
  // fields
  trees: number; // % of free tiles with a tree (dead tree in the wasteland)
  rocks: number; // % with a rock
  water: 'none' | 'pond' | 'river'; // lava in the wasteland
  road: 'none' | 'ew' | 'ns' | 'cross'; // roads end in gaps in the border, where exits go
  // dungeon
  rooms: number;
  maze: number; // 0..100: extra winding branches and dead ends
  bossRoom: boolean;
  boss: string; // monster id for the boss room's spawn area
  // village
  houses: number;
}

export const DEFAULTS: GenOptions = {
  preset: 'meadow', id: 'newmap', width: 60, height: 45, seed: 1,
  trees: 6, rocks: 2, water: 'pond', road: 'ew',
  rooms: 8, maze: 30, bossRoom: true, boss: 'troll',
  houses: 4,
};

/** Small deterministic RNG (mulberry32). */
export function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOCKS = new Set<number>(BLOCKING_TILES);
export function walkable(m: EdMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
  const i = y * m.width + x;
  return !BLOCKS.has(m.ground[i]!) && !BLOCKS.has(m.deco[i]!) && m.collision[i] === EMPTY;
}

/** Tiles reachable on foot from (sx, sy), 4-directional (stricter than the game's 8-way moves). */
export function reachable(m: EdMap, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(m.width * m.height);
  if (!walkable(m, sx, sy)) return seen;
  const stack = [sy * m.width + sx];
  seen[stack[0]!] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % m.width;
    const y = (i / m.width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const j = ny * m.width + nx;
      if (walkable(m, nx, ny) && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return seen;
}

/** Removes decoration around walkable pockets that can't be reached, until everything is connected. */
export function connectAll(m: EdMap, sx: number, sy: number, keep: (x: number, y: number) => boolean): void {
  for (let pass = 0; pass < 40; pass++) {
    const seen = reachable(m, sx, sy);
    let fixed = false;
    for (let y = 1; y < m.height - 1; y++) {
      for (let x = 1; x < m.width - 1; x++) {
        const i = y * m.width + x;
        if (seen[i] || !walkable(m, x, y)) continue;
        // An unreachable open tile: clear the obstacles around it (never the border or water).
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx <= 0 || ny <= 0 || nx >= m.width - 1 || ny >= m.height - 1 || keep(nx, ny)) continue;
          const j = ny * m.width + nx;
          if (m.deco[j] !== EMPTY) {
            m.deco[j] = EMPTY;
            fixed = true;
          }
        }
      }
    }
    if (!fixed) return;
  }
}

/** Smooth 0..1 noise for patches of ground. */
function patches(rnd: () => number, w: number, h: number, scale: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / scale) + 2;
  const grid = Array.from({ length: gw * (Math.ceil(h / scale) + 2) }, rnd);
  return (x, y) => {
    const gx = Math.floor(x / scale);
    const gy = Math.floor(y / scale);
    const fx = (x % scale) / scale;
    const fy = (y % scale) / scale;
    const v = (i: number, j: number) => grid[j * gw + i]!;
    const sm = (t: number) => t * t * (3 - 2 * t);
    const a = v(gx, gy) + (v(gx + 1, gy) - v(gx, gy)) * sm(fx);
    const b = v(gx, gy + 1) + (v(gx + 1, gy + 1) - v(gx, gy + 1)) * sm(fx);
    return a + (b - a) * sm(fy);
  };
}

export function generate(o: GenOptions): EdMap {
  switch (o.preset) {
    case 'dungeon': return dungeon(o);
    case 'village': return village(o);
    default: return field(o);
  }
}

// ---------------------------------------------------------------- fields

function field(o: GenOptions): EdMap {
  const rnd = rngOf(o.seed);
  const { width: W, height: H } = o;
  const look = {
    meadow: { base: TILE.GRASS, alt: TILE.DARK_GRASS, extra: TILE.GRASS_FLOWERS, wall: TILE.TREE, tree: TILE.TREE, bush: TILE.BUSH },
    forest: { base: TILE.DARK_GRASS, alt: TILE.GRASS, extra: TILE.GRASS_FLOWERS, wall: TILE.TREE, tree: TILE.TREE, bush: TILE.BUSH },
    wasteland: { base: TILE.SCORCHED, alt: TILE.ASH, extra: TILE.ASH, wall: TILE.ROCK, tree: TILE.DEAD_TREE, bush: -1 },
  }[o.preset as 'meadow' | 'forest' | 'wasteland'];
  const m = blankMap(o.id, W, H, look.base);
  const noise = patches(rnd, W, H, 6);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (noise(x, y) > 0.62) m.ground[i] = look.alt;
    else if (rnd() < 0.02) m.ground[i] = look.extra;
  }

  // Roads (2 tiles wide) through the middle, ending in gaps of the border.
  const midY = Math.floor(H / 2) - 1;
  const midX = Math.floor(W / 2) - 1;
  const onRoad = (x: number, y: number) =>
    ((o.road === 'ew' || o.road === 'cross') && y >= midY && y <= midY + 1) || ((o.road === 'ns' || o.road === 'cross') && x >= midX && x <= midX + 1);
  const nearRoad = (x: number, y: number) =>
    ((o.road === 'ew' || o.road === 'cross') && y >= midY - 2 && y <= midY + 3) || ((o.road === 'ns' || o.road === 'cross') && x >= midX - 2 && x <= midX + 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (onRoad(x, y)) m.ground[y * W + x] = TILE.DIRT;

  // Water: a pond, or a river across the map (lava in the wasteland: blocked, but arrows fly over).
  const wet = (x: number, y: number, deco = false) => {
    const i = y * W + x;
    if (o.preset === 'wasteland') m.deco[i] = TILE.LAVA;
    else if (!deco) m.ground[i] = TILE.WATER;
  };
  const isWater = (x: number, y: number) => m.ground[y * W + x] === TILE.WATER || m.deco[y * W + x] === TILE.LAVA;
  if (o.water === 'pond') {
    for (let k = 0; k < 2; k++) {
      const rx = 3 + Math.floor(rnd() * 3);
      const ry = 2 + Math.floor(rnd() * 2);
      const cx = 4 + rx + Math.floor(rnd() * (W - 8 - 2 * rx));
      const cy = 4 + ry + Math.floor(rnd() * (H - 8 - 2 * ry));
      for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
        if ((x - cx) ** 2 / (rx * rx) + (y - cy) ** 2 / (ry * ry) < 1 && !nearRoad(x, y)) wet(x, y);
      }
    }
  } else if (o.water === 'river') {
    const phase = rnd() * 6;
    const base = Math.floor(W * (0.3 + rnd() * 0.4));
    for (let y = 1; y < H - 1; y++) {
      const rx = base + Math.round(Math.sin(y * 0.25 + phase) * 2);
      for (let x = rx; x < rx + 3; x++) {
        if (onRoad(x, y)) m.ground[y * W + x] = o.preset === 'wasteland' ? TILE.DIRT : TILE.BRIDGE; // bridge where the road crosses
        else if (!(o.road !== 'none' && nearRoad(x, y) && o.preset === 'wasteland')) wet(x, y);
      }
    }
  }

  // Border with gaps where roads leave the map.
  for (let x = 0; x < W; x++) { m.deco[x] = look.wall; m.deco[(H - 1) * W + x] = look.wall; }
  for (let y = 0; y < H; y++) { m.deco[y * W] = look.wall; m.deco[y * W + W - 1] = look.wall; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (onRoad(x, y)) m.deco[y * W + x] = EMPTY;

  // Trees, rocks and bushes, kept off the roads and water.
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (nearRoad(x, y) || isWater(x, y)) continue;
    const r = rnd() * 100;
    const i = y * W + x;
    if (r < o.trees) m.deco[i] = look.tree;
    else if (r < o.trees + o.rocks) m.deco[i] = TILE.ROCK;
    else if (look.bush >= 0 && r < o.trees + o.rocks + o.trees / 4) m.deco[i] = look.bush;
  }
  const isBorder = (x: number, y: number) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
  const start = o.road === 'ns' ? { x: midX, y: Math.floor(H / 2) } : { x: Math.floor(W / 2), y: midY };
  if (o.road === 'none') { start.x = Math.floor(W / 2); start.y = Math.floor(H / 2); m.deco[start.y * W + start.x] = EMPTY; m.ground[start.y * W + start.x] = look.base; }
  connectAll(m, start.x, start.y, (x, y) => isBorder(x, y) || isWater(x, y));
  return m;
}

// ---------------------------------------------------------------- dungeon

interface Room { x: number; y: number; w: number; h: number }
const centre = (r: Room) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

function dungeon(o: GenOptions): EdMap {
  const rnd = rngOf(o.seed);
  const { width: W, height: H } = o;
  const m = blankMap(o.id, W, H, TILE.CAVE_FLOOR);
  m.deco.fill(TILE.CAVE_WALL);
  const open = (x: number, y: number, floor: number = TILE.CAVE_FLOOR) => {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    m.deco[y * W + x] = EMPTY;
    m.ground[y * W + x] = floor;
  };
  const rooms: Room[] = [];
  const fits = (r: Room) => r.x >= 2 && r.y >= 2 && r.x + r.w <= W - 2 && r.y + r.h <= H - 2
    && rooms.every((q) => r.x + r.w + 2 < q.x || q.x + q.w + 2 < r.x || r.y + r.h + 2 < q.y || q.y + q.h + 2 < r.y);
  // Entrance room on the west side; boss room (big) on the east side.
  const entry: Room = { x: 2, y: Math.floor(H / 2) - 3, w: 7, h: 6 };
  rooms.push(entry);
  let boss: Room | null = null;
  if (o.bossRoom) {
    const bw = Math.min(16, Math.floor(W / 3));
    const bh = Math.min(14, H - 6);
    boss = { x: W - bw - 3, y: Math.floor((H - bh) / 2), w: bw, h: bh };
    rooms.push(boss);
  }
  for (let tries = 0; rooms.length < o.rooms + (o.bossRoom ? 2 : 1) && tries < 500; tries++) {
    const r = { w: 5 + Math.floor(rnd() * 7), h: 4 + Math.floor(rnd() * 5), x: 0, y: 0 };
    r.x = 2 + Math.floor(rnd() * (W - r.w - 4));
    r.y = 2 + Math.floor(rnd() * (H - r.h - 4));
    if (fits(r)) rooms.push(r);
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) open(x, y, r === boss ? TILE.CAVE_FLOOR_DARK : TILE.CAVE_FLOOR);

  // Corridors: join rooms in order of distance (a chain from the entrance), the boss room last
  // with a single corridor. More "maze" = more turns and extra dead-end branches.
  const corridor = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    let { x, y } = a;
    const wiggle = o.maze / 100;
    while (x !== b.x || y !== b.y) {
      const horizontal = x !== b.x && (y === b.y || rnd() < 0.5 + (rnd() < wiggle ? 0.3 : 0));
      if (horizontal) x += Math.sign(b.x - x);
      else y += Math.sign(b.y - y);
      open(x, y, TILE.CAVE_FLOOR_DARK);
    }
  };
  const normal = rooms.filter((r) => r !== boss);
  const joined = [entry];
  const left = normal.filter((r) => r !== entry);
  while (left.length) {
    let best = 0;
    let bestFrom = joined[0]!;
    let bestD = Infinity;
    left.forEach((r, i) => {
      for (const j of joined) {
        const d = Math.abs(centre(r).x - centre(j).x) + Math.abs(centre(r).y - centre(j).y);
        if (d < bestD) { bestD = d; best = i; bestFrom = j; }
      }
    });
    const r = left.splice(best, 1)[0]!;
    corridor(centre(bestFrom), centre(r));
    joined.push(r);
  }
  if (boss) {
    const nearest = normal.reduce((a, r) => (Math.abs(centre(r).x - centre(boss).x) < Math.abs(centre(a).x - centre(boss).x) ? r : a), entry);
    corridor(centre(nearest), { x: boss.x, y: centre(boss).y });
  }
  // Dead-end branches.
  const branches = Math.round((o.maze / 100) * rooms.length * 2);
  for (let k = 0; k < branches; k++) {
    const r = normal[Math.floor(rnd() * normal.length)]!;
    let p = centre(r);
    const len = 4 + Math.floor(rnd() * 10);
    for (let s = 0; s < len; s++) {
      const [dx, dy] = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)[Math.floor(rnd() * 4)]!;
      p = { x: Math.min(W - 3, Math.max(2, p.x + dx * 2)), y: Math.min(H - 3, Math.max(2, p.y + dy * 2)) };
      open(p.x, p.y, TILE.CAVE_FLOOR_DARK);
      open(p.x - dx, p.y - dy, TILE.CAVE_FLOOR_DARK);
    }
  }
  // Decoration inside rooms: bones (walkable), crystals and rubble (block), away from room edges.
  for (const r of normal) {
    for (let k = 0; k < Math.floor((r.w * r.h) / 12); k++) {
      const x = r.x + 1 + Math.floor(rnd() * (r.w - 2));
      const y = r.y + 1 + Math.floor(rnd() * (r.h - 2));
      const t = rnd();
      m.deco[y * W + x] = t < 0.5 ? TILE.BONES : t < 0.75 ? TILE.CRYSTAL : TILE.CAVE_RUBBLE;
    }
  }
  const ec = centre(entry);
  m.ground[ec.y * W + 3] = TILE.STAIRS_UP; // the way back up (place the exit here)
  m.deco[ec.y * W + 3] = EMPTY;
  connectAll(m, ec.x, ec.y, (x, y) => m.deco[y * W + x] === TILE.CAVE_WALL);
  if (boss) {
    m.objects.push({ kind: 'spawn', name: 'boss', x: boss.x + 1, y: boss.y + 1, w: boss.w - 2, h: boss.h - 2, props: { monster: o.boss, count: 1, respawnSec: 3600, respawnMaxSec: 7200 } });
  }
  m.objects.push({ kind: 'arrival', name: `${o.id}_entry`, x: ec.x, y: ec.y, w: 1, h: 1, props: {} });
  return m;
}

// ---------------------------------------------------------------- village

function village(o: GenOptions): EdMap {
  const rnd = rngOf(o.seed);
  const { width: W, height: H } = o;
  const m = blankMap(o.id, W, H, TILE.GRASS);
  m.props.respawnMap = o.id;
  for (let i = 0; i < W * H; i++) if (rnd() < 0.03) m.ground[i] = TILE.GRASS_FLOWERS;
  m.safe.fill(TILE.SAFE_MARK); // the whole village is a safe zone
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  // Plaza and roads to every edge.
  for (let y = 0; y < H; y++) for (let x = cx - 1; x <= cx; x++) m.ground[y * W + x] = TILE.DIRT;
  for (let x = 0; x < W; x++) for (let y = cy - 1; y <= cy; y++) m.ground[y * W + x] = TILE.DIRT;
  for (let y = cy - 4; y <= cy + 3; y++) for (let x = cx - 6; x <= cx + 5; x++) m.ground[y * W + x] = TILE.STONE;
  // Fence around, open where the roads leave.
  for (let x = 0; x < W; x++) { m.deco[x] = TILE.FENCE; m.deco[(H - 1) * W + x] = TILE.FENCE; }
  for (let y = 0; y < H; y++) { m.deco[y * W] = TILE.FENCE; m.deco[y * W + W - 1] = TILE.FENCE; }
  for (const x of [cx - 1, cx]) { m.deco[x] = EMPTY; m.deco[(H - 1) * W + x] = EMPTY; }
  for (const y of [cy - 1, cy]) { m.deco[y * W] = EMPTY; m.deco[y * W + W - 1] = EMPTY; }
  // Houses in the four quarters: two roof rows over a wall row with a door.
  const spots = [[3, 3], [cx + 8, 3], [3, cy + 5], [cx + 8, cy + 5], [cx - 14, 3], [cx + 18, cy + 5]];
  for (let k = 0; k < Math.min(o.houses, spots.length); k++) {
    const [hx, hy] = spots[k]!;
    const hw = 6 + Math.floor(rnd() * 2);
    if (hx! + hw >= W - 2 || hy! + 4 >= H - 2) continue;
    for (let x = hx!; x < hx! + hw; x++) {
      m.deco[hy! * W + x] = TILE.ROOF;
      m.deco[(hy! + 1) * W + x] = TILE.ROOF;
      m.deco[(hy! + 2) * W + x] = TILE.HOUSE_WALL;
      m.ground[(hy! + 3) * W + x] = TILE.DIRT;
    }
    m.deco[(hy! + 2) * W + hx! + Math.floor(hw / 2)] = TILE.DOOR;
  }
  for (let k = 0; k < 8; k++) {
    const x = 2 + Math.floor(rnd() * (W - 4));
    const y = 2 + Math.floor(rnd() * (H - 4));
    if (m.deco[y * W + x] === EMPTY && m.ground[y * W + x] === TILE.GRASS) m.deco[y * W + x] = TILE.TREE;
  }
  m.objects.push({ kind: 'start', name: 'start', x: cx, y: cy + 1, w: 1, h: 1, props: {} });
  m.objects.push({ kind: 'respawn', name: 'respawn', x: cx - 1, y: cy + 1, w: 1, h: 1, props: {} });
  connectAll(m, cx, cy + 1, (x, y) => m.deco[y * W + x] === TILE.FENCE || m.deco[y * W + x] === TILE.ROOF || m.deco[y * W + x] === TILE.HOUSE_WALL || m.deco[y * W + x] === TILE.DOOR);
  return m;
}
