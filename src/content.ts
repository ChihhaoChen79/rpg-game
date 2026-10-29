// The single place where bundled game content is gathered for the client.
import gameConfig from '../data/game-config.json';
import village from '../maps/village.json';
import field1 from '../maps/field1.json';
import type { TiledMap } from './logic/map';
import type { GameConfig } from './logic/types';

export const GAME_CONFIG: GameConfig = gameConfig;

export const TILED_MAPS: Record<string, TiledMap> = {
  village: village as TiledMap,
  field1: field1 as TiledMap,
};

export const START_MAP = 'village';
