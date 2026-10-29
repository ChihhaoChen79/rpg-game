// The single place where bundled game content is gathered (used by the client and the tests).
import gameConfig from '../data/game-config.json';
import balance from '../data/balance.json';
import classes from '../data/classes.json';
import expTable from '../data/exp-table.json';
import items from '../data/items.json';
import monsters from '../data/monsters.json';
import npcs from '../data/npcs.json';
import shops from '../data/shops.json';
import spells from '../data/spells.json';
import village from '../maps/village.json';
import field1 from '../maps/field1.json';
import dungeon1 from '../maps/dungeon1.json';
import type { TiledMap } from './logic/map';
import type { Content, GameConfig } from './logic/types';

export const GAME_CONFIG: GameConfig = gameConfig;

const withoutComment = <T extends object>(o: T): T => {
  const { _comment: _c, ...rest } = o as T & { _comment?: string };
  return rest as T;
};

// JSON imports widen tuples to arrays; the shapes are checked by tests/content.test.ts.
export const CONTENT: Content = {
  classes: classes as unknown as Content['classes'],
  items: withoutComment(items) as unknown as Content['items'],
  spells: spells as unknown as Content['spells'],
  monsters: monsters as unknown as Content['monsters'],
  npcs: npcs as unknown as Content['npcs'],
  shops: shops as unknown as Content['shops'],
  totalExp: expTable.totalExp,
  balance: withoutComment(balance) as unknown as Content['balance'],
};

export const TILED_MAPS: Record<string, TiledMap> = {
  village: village as TiledMap,
  field1: field1 as TiledMap,
  dungeon1: dungeon1 as TiledMap,
};

export const START_MAP = 'village';
