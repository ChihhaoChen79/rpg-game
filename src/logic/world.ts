// World queries shared by the player, monster and combat modules: occupancy and ground items.
import { isSafe } from './map';
import type { PassFn } from './pathfinding';
import type { GameState, GroundItem, ItemStack, MapData, Monster } from './types';

export function currentMap(s: GameState): MapData {
  const m = s.maps[s.mapId];
  if (!m) throw new Error(`Unknown map "${s.mapId}"`);
  return m;
}

export function monsterById(s: GameState, id: number): Monster | undefined {
  return s.monsters.find((m) => m.id === id && !m.dead);
}

export function monsterAt(s: GameState, x: number, y: number): Monster | undefined {
  return s.monsters.find((m) => !m.dead && m.mover.x === x && m.mover.y === y);
}

export function playerOn(s: GameState, x: number, y: number): boolean {
  const mv = s.player.mover;
  return !s.player.dead && mv.x === x && mv.y === y;
}

/** The player walks around monsters. */
export function playerPass(s: GameState): PassFn {
  return (x, y) => !monsterAt(s, x, y);
}

/** Monsters avoid safe zones (plan §7.9), the player and each other. */
export function monsterPass(s: GameState, self: Monster): PassFn {
  const map = currentMap(s);
  return (x, y) => {
    if (isSafe(map, x, y) || playerOn(s, x, y)) return false;
    const other = monsterAt(s, x, y);
    return !other || other === self;
  };
}

export function playerInSafeZone(s: GameState): boolean {
  const mv = s.player.mover;
  return isSafe(currentMap(s), mv.x, mv.y);
}

// ---------------------------------------------------------------- ground items (plan §7.16)

export function dropToGround(s: GameState, x: number, y: number, item: ItemStack): void {
  s.groundItems.push({ id: s.nextId++, mapId: s.mapId, x, y, item, droppedTick: s.tick });
}

export function groundById(s: GameState, id: number): GroundItem | undefined {
  return s.groundItems.find((g) => g.id === id && g.mapId === s.mapId);
}

/** Runs every groundCleanupIntervalTicks; removes items older than groundItemLifetimeTicks. */
export function cleanupGround(s: GameState): void {
  const b = s.content.balance;
  if (s.tick % b.groundCleanupIntervalTicks !== 0) return;
  s.groundItems = s.groundItems.filter((g) => s.tick - g.droppedTick < b.groundItemLifetimeTicks);
}
