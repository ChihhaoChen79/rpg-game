// 8-direction grid A*. A diagonal step takes the same time as a straight one, so the
// primary cost is the step count; a tiny extra cost on diagonals keeps paths straight
// when several shortest paths exist. Diagonals may not cut wall corners.
import { isWalkable } from './map';
import type { MapData, Vec } from './types';

const STEP = 1000;
const DIAG_EXTRA = 1;

export const DIRS8: readonly Vec[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

/** Extra walkability test, e.g. "not occupied" or "not a safe zone" for monsters. */
export type PassFn = (x: number, y: number) => boolean;

/** True if a single step from (x,y) by (dx,dy) is legal (no corner cutting). */
export function canStep(m: MapData, x: number, y: number, dx: number, dy: number, pass?: PassFn): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (!isWalkable(m, nx, ny) || (pass && !pass(nx, ny))) return false;
  if (dx !== 0 && dy !== 0) {
    if (!isWalkable(m, x + dx, y) || !isWalkable(m, x, y + dy)) return false;
  }
  return true;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return STEP * Math.max(dx, dy) + DIAG_EXTRA * Math.min(dx, dy);
}

// Binary min-heap of node indices keyed by f-score.
function heapPush(heap: number[], f: Float64Array, node: number): void {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (f[heap[p]!]! <= f[node]!) break;
    heap[i] = heap[p]!;
    i = p;
  }
  heap[i] = node;
}

function heapPop(heap: number[], f: Float64Array): number {
  const top = heap[0]!;
  const last = heap.pop()!;
  if (heap.length > 0) {
    let i = 0;
    const n = heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      let mf = f[last]!;
      if (l < n && f[heap[l]!]! < mf) { m = l; mf = f[heap[l]!]!; }
      if (r < n && f[heap[r]!]! < mf) m = r;
      if (m === i) break;
      heap[i] = heap[m]!;
      i = m;
    }
    heap[i] = last;
  }
  return top;
}

/**
 * Returns the tiles to walk from start (exclusive) to goal (inclusive),
 * [] if already there, or null if unreachable within maxNodes expansions.
 */
export function findPath(m: MapData, start: Vec, goal: Vec, maxNodes: number, pass?: PassFn): Vec[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!isWalkable(m, goal.x, goal.y) || (pass && !pass(goal.x, goal.y))) return null;

  const w = m.width;
  const size = w * m.height;
  const g = new Float64Array(size).fill(Infinity);
  const f = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap: number[] = [];

  const s = start.y * w + start.x;
  const goalIdx = goal.y * w + goal.x;
  g[s] = 0;
  f[s] = heuristic(start.x, start.y, goal.x, goal.y);
  heapPush(heap, f, s);

  let expanded = 0;
  while (heap.length > 0) {
    const cur = heapPop(heap, f);
    if (closed[cur]) continue;
    if (cur === goalIdx) break;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;

    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const d of DIRS8) {
      if (!canStep(m, cx, cy, d.x, d.y, pass)) continue;
      const n = (cy + d.y) * w + (cx + d.x);
      if (closed[n]) continue;
      const cost = g[cur]! + STEP + (d.x !== 0 && d.y !== 0 ? DIAG_EXTRA : 0);
      if (cost < g[n]!) {
        g[n] = cost;
        f[n] = cost + heuristic(cx + d.x, cy + d.y, goal.x, goal.y);
        parent[n] = cur;
        heapPush(heap, f, n);
      }
    }
  }

  if (parent[goalIdx] === -1) return null;
  const path: Vec[] = [];
  for (let i = goalIdx; i !== s; i = parent[i]!) {
    path.push({ x: i % w, y: Math.floor(i / w) });
  }
  path.reverse();
  return path;
}

/**
 * If the clicked tile is not walkable, pick the walkable tile within `radius` that is closest
 * to it (ties broken by distance to `from`). Returns null if none.
 */
export function snapToWalkable(m: MapData, target: Vec, from: Vec, radius: number, pass?: PassFn): Vec | null {
  const ok = (x: number, y: number) => isWalkable(m, x, y) && (!pass || pass(x, y));
  if (ok(target.x, target.y)) return target;
  let best: Vec | null = null;
  let bestD = Infinity;
  let bestFrom = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = target.x + dx;
      const y = target.y + dy;
      if (!ok(x, y)) continue;
      const d = dx * dx + dy * dy;
      const df = (x - from.x) ** 2 + (y - from.y) ** 2;
      if (d < bestD || (d === bestD && df < bestFrom)) {
        best = { x, y };
        bestD = d;
        bestFrom = df;
      }
    }
  }
  return best;
}
