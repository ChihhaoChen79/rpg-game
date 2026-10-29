// Placeholder tileset layout, shared by the art and map generators.
// Tile properties here are copied into each map's embedded Tiled tileset.
export const TILE_SIZE = 32;
export const TILESET_COLUMNS = 8;

export const TILE = {
  GRASS: 0,
  GRASS_FLOWERS: 1,
  DIRT: 2,
  STONE: 3,
  WATER: 4,
  TREE: 5,
  FENCE: 6,
  HOUSE_WALL: 7,
  ROOF: 8,
  DOOR: 9,
  DARK_GRASS: 10,
  ROCK: 11,
  BUSH: 12,
  BRIDGE: 13,
  SAFE_MARK: 14,
  BLOCK_MARK: 15,
};

export const TILE_COUNT = 16;

/** Tiles that block movement wherever they are painted. */
export const BLOCKING_TILES = [
  TILE.WATER, TILE.TREE, TILE.FENCE, TILE.HOUSE_WALL, TILE.ROOF, TILE.DOOR, TILE.ROCK, TILE.BUSH,
];
