// Core plain-data types shared across logic modules.
import type { Rng } from './rng';

export interface Vec {
  x: number;
  y: number;
}

/** 4-direction facing used by sprites. */
export const Facing = {
  Down: 0,
  Left: 1,
  Right: 2,
  Up: 3,
} as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

export interface Exit {
  x: number; // tile rect
  y: number;
  w: number;
  h: number;
  targetMap: string;
  targetX: number;
  targetY: number;
}

export interface MapData {
  id: string;
  nameKey: string;
  width: number;
  height: number;
  blocked: Uint8Array; // 1 = impassable
  safe: Uint8Array; // 1 = safe zone
  exits: Exit[];
  start: Vec | null;
  respawn: Vec | null;
}

/**
 * Tile-stepping movement. (x, y) is the tile the mover occupies, which during a step is
 * already the destination; (fromX, fromY) is where the step started. Rendering interpolates.
 */
export interface Mover {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  moving: boolean;
  stepElapsed: number; // ticks since the current step started
  path: Vec[]; // remaining tiles, next first
  facing: Facing;
}

export interface GameConfig {
  stepTicks: number;
  pathMaxNodes: number;
  clickSnapRadius: number;
}

export interface Player {
  mover: Mover;
}

export type GameEvent =
  | { type: 'mapChanged'; mapId: string }
  | { type: 'moveFailed' };

export interface GameState {
  tick: number;
  rng: Rng;
  config: GameConfig;
  maps: Record<string, MapData>;
  mapId: string;
  player: Player;
  events: GameEvent[]; // cleared at the start of every tick
}
