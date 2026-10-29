// Placeholder tileset layout, shared by the art and map generators.
// Tile properties here are copied into each map's embedded Tiled tileset by
// `npm run sync:tileset` (Phaser needs the tileset embedded in every map).
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
  CAVE_FLOOR: 16,
  CAVE_WALL: 17,
  CAVE_ENTRANCE: 18,
  STAIRS_UP: 19,
  BONES: 20,
  CRYSTAL: 21,
  CAVE_FLOOR_DARK: 22,
  CAVE_RUBBLE: 23,
};

export const TILE_COUNT = 24;

/** Tiles that block movement wherever they are painted. */
export const BLOCKING_TILES = [
  TILE.WATER, TILE.TREE, TILE.FENCE, TILE.HOUSE_WALL, TILE.ROOF, TILE.DOOR, TILE.ROCK, TILE.BUSH,
  TILE.CAVE_WALL, TILE.CRYSTAL, TILE.CAVE_RUBBLE,
];

/** Tiles that stop arrows and spells (line of sight). Fences, bushes, water and rubble don't. */
export const PROJECTILE_BLOCKING_TILES = [TILE.TREE, TILE.HOUSE_WALL, TILE.ROOF, TILE.DOOR, TILE.ROCK, TILE.CAVE_WALL, TILE.CRYSTAL];

/** The atlas is extruded (each tile's edge pixels repeated 1px outward) to stop seams when scaled. */
export const TILESET_MARGIN = 1;
export const TILESET_SPACING = 2;

/** The embedded Tiled tileset entry every map uses. */
export function tilesetJson() {
  const rows = Math.ceil(TILE_COUNT / TILESET_COLUMNS);
  const cell = TILE_SIZE + TILESET_SPACING;
  const prop = (name, value) => ({ name, type: 'bool', value });
  return {
    firstgid: 1, name: 'placeholder', image: '../assets/tilesets/placeholder.png',
    imagewidth: TILESET_MARGIN * 2 + TILESET_COLUMNS * cell - TILESET_SPACING,
    imageheight: TILESET_MARGIN * 2 + rows * cell - TILESET_SPACING,
    columns: TILESET_COLUMNS, tilecount: TILE_COUNT, tilewidth: TILE_SIZE, tileheight: TILE_SIZE,
    margin: TILESET_MARGIN, spacing: TILESET_SPACING,
    tiles: BLOCKING_TILES.map((id) => ({
      id,
      properties: [prop('blocked', true), ...(PROJECTILE_BLOCKING_TILES.includes(id) ? [prop('blocksProjectile', true)] : [])],
    })),
  };
}
