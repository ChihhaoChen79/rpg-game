// Game state creation and the fixed-rate tick (plan §4 rule 3: 10 ticks/sec).
import type { Command } from './commands';
import { exitAt, isSafe, parseTiledMap, type TiledMap } from './map';
import {
  moverAdvance, moverBeginStep, moverCreate, moverPlace, moverSetDestination, moverStop,
} from './movement';
import { rngCreate } from './rng';
import type { GameConfig, GameState, MapData } from './types';

export const TICKS_PER_SECOND = 10;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

export interface GameInit {
  config: GameConfig;
  maps: Record<string, TiledMap>;
  startMap: string;
  seed: number;
}

export function createGame(init: GameInit): GameState {
  const maps: Record<string, MapData> = {};
  for (const [id, tiled] of Object.entries(init.maps)) maps[id] = parseTiledMap(id, tiled);
  const start = maps[init.startMap];
  if (!start?.start) throw new Error(`Map "${init.startMap}" has no start point`);
  return {
    tick: 0,
    rng: rngCreate(init.seed),
    config: init.config,
    maps,
    mapId: init.startMap,
    player: { mover: moverCreate(start.start.x, start.start.y) },
    events: [],
  };
}

export function currentMap(s: GameState): MapData {
  const m = s.maps[s.mapId];
  if (!m) throw new Error(`Unknown map "${s.mapId}"`);
  return m;
}

export function playerInSafeZone(s: GameState): boolean {
  const mv = s.player.mover;
  return isSafe(currentMap(s), mv.x, mv.y);
}

function applyCommand(s: GameState, c: Command): void {
  const mv = s.player.mover;
  switch (c.type) {
    case 'moveTo':
      if (!moverSetDestination(currentMap(s), mv, c, s.config.pathMaxNodes, s.config.clickSnapRadius)) {
        s.events.push({ type: 'moveFailed' });
      }
      break;
    case 'stop':
      moverStop(mv);
      break;
  }
}

function changeMap(s: GameState, mapId: string, x: number, y: number): void {
  if (!s.maps[mapId]) throw new Error(`Exit leads to unknown map "${mapId}"`);
  s.mapId = mapId;
  moverPlace(s.player.mover, x, y);
  s.events.push({ type: 'mapChanged', mapId });
}

/** Advance the simulation by one tick. Events produced are left in s.events. */
export function tick(s: GameState, commands: readonly Command[]): void {
  s.events = [];
  for (const c of commands) applyCommand(s, c);

  const mv = s.player.mover;
  if (moverAdvance(mv, s.config.stepTicks)) {
    const exit = exitAt(currentMap(s), mv.x, mv.y);
    if (exit) changeMap(s, exit.targetMap, exit.targetX, exit.targetY);
  }
  moverBeginStep(currentMap(s), mv);
  s.tick++;
}
