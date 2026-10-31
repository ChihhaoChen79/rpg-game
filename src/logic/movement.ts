// Tile-step movement for any mover (player now, monsters in Milestone 2).
import { canStep, findPath, snapToWalkable, type PassFn } from './pathfinding';
import { Facing, type MapData, type Mover, type Vec } from './types';

export function moverCreate(x: number, y: number): Mover {
  return { x, y, fromX: x, fromY: y, moving: false, stepElapsed: 0, path: [], facing: Facing.Down };
}

/** Place a mover instantly (spawn, map change, respawn). */
export function moverPlace(mv: Mover, x: number, y: number): void {
  mv.x = x;
  mv.y = y;
  mv.fromX = x;
  mv.fromY = y;
  mv.moving = false;
  mv.stepElapsed = 0;
  mv.path = [];
}

export function facingFor(dx: number, dy: number): Facing {
  // Diagonals use the horizontal facing so side-on walking reads clearly.
  if (dx < 0) return Facing.Left;
  if (dx > 0) return Facing.Right;
  return dy < 0 ? Facing.Up : Facing.Down;
}

/**
 * Plan a path to `target`. Paths start from the mover's current tile, which mid-step is the
 * step's destination, so a new order never interrupts a step already in progress.
 * Returns false if no path exists.
 */
export function moverSetDestination(
  m: MapData, mv: Mover, target: Vec, maxNodes: number, snapRadius: number, pass?: PassFn,
): boolean {
  const goal = snapToWalkable(m, target, mv, snapRadius, pass);
  if (!goal) return false;
  const path = findPath(m, mv, goal, maxNodes, pass);
  if (!path) return false;
  mv.path = path;
  return true;
}

export function moverStop(mv: Mover): void {
  mv.path = [];
}

/**
 * Advance the current step by one tick. Returns true when the mover arrived on its tile
 * this tick. Call moverBeginStep afterwards (same tick) so walking has no pauses; the caller
 * checks arrival effects (exits, traps...) in between.
 */
export function moverAdvance(mv: Mover, stepTicks: number): boolean {
  if (!mv.moving) return false;
  mv.stepElapsed++;
  if (mv.stepElapsed < stepTicks) return false;
  mv.moving = false;
  // Keep the fraction of a tick when steps don't take whole ticks (sped-up walking), so the
  // average speed is exact; whole-tick steps reset to 0 as before.
  mv.stepElapsed = Math.max(0, Math.min(mv.stepElapsed - stepTicks, 0.999));
  mv.fromX = mv.x;
  mv.fromY = mv.y;
  return true;
}

/** If idle and a path is queued, start the next step. */
export function moverBeginStep(m: MapData, mv: Mover, pass?: PassFn): void {
  if (mv.moving || mv.path.length === 0) return;
  const next = mv.path[0]!;
  const dx = next.x - mv.x;
  const dy = next.y - mv.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1 || !canStep(m, mv.x, mv.y, dx, dy, pass)) {
    // Path became invalid (e.g. something now stands there); drop it.
    mv.path = [];
    return;
  }
  mv.path.shift();
  mv.fromX = mv.x;
  mv.fromY = mv.y;
  mv.x = next.x;
  mv.y = next.y;
  mv.moving = true;
  mv.stepElapsed = 0;
  mv.facing = facingFor(dx, dy);
}
