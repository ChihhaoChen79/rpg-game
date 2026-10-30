# Map conventions (Tiled)

Maps live in `maps/*.json` (Tiled JSON, **embedded** tileset, orthogonal, 32×32 tiles).
Open them in Tiled; the tileset image is `assets/tilesets/placeholder.png`.

| Layer | Kind | Meaning |
|---|---|---|
| `ground` | tile layer | Visual ground. Tiles with property `blocked = true` block movement. |
| `deco` | tile layer | Visual objects (trees, fences, houses). Same `blocked` rule. |
| `collision` | tile layer (hidden) | Any tile here blocks movement (use the red marker tile). |
| `safe` | tile layer (hidden) | Any tile here is a safe zone (use the blue marker tile). |
| `objects` | object layer | See below. |

Objects (set the object's **Class**/Type):

| Class | Shape | Properties |
|---|---|---|
| `start` | point | New-character start position (village only). |
| `respawn` | point | Respawn point after death. |
| `exit` | rectangle | `targetMap` (string, map id), `targetX`, `targetY` (int, tiles). Stepping on it changes map. |
| `spawn` | rectangle | `monster` (id from `data/monsters.json`), `count` (int), `respawnSec` (number), optional `respawnMaxSec` (number: respawn time is random between the two). Monsters spawn and wander inside it. Boss monsters (`"boss": true`) keep their respawn timer when you leave the map and in saves. |
| `npc` | point | `npcId` (id from `data/npcs.json`). The NPC stands on that tile and blocks it. |

Map properties:
- `nameKey` (string): strings-file key for the map's display name.
- `respawnMap` (string): map whose `respawn` point is used after dying on (or using a return scroll on) this map.

Monsters never spawn within `noSpawnRadius` tiles (`data/balance.json`) of start/respawn points,
exits, or the arrival tiles of exits leading into the map, nor within `spawnMinPlayerDist` of the player.

Rules checked by `tests/maps.test.ts` (run `npm test` after editing):
- start/respawn points are walkable,
- every exit is reachable and leads to a walkable tile, not on another exit, in an existing map,
- spawn monsters, NPC ids and `respawnMap` exist (`tests/content.test.ts`).

When adding a map: save it as `maps/<id>.json`, add it to `src/content.ts` and to
`tests/maps.test.ts`, and add its `nameKey` to `data/strings.zh-TW.json`.

Tile properties (`blocked`, `blocksProjectile`) are defined once in `tools/tileset-def.mjs`; every
map embeds a copy of the tileset (Phaser needs that). After changing `tileset-def.mjs`, run
`npm run sync:tileset` to update all maps; their layers and objects are kept.

`tools/gen-dungeon.mjs` bootstrapped `dungeon1` and added its entrance to `field1`;
`tools/gen-fields.mjs` bootstrapped `field2` (迷霧森林) and `field3` (焦土荒原) and the road between them.
`tools/gen-maps.mjs` bootstrapped the first two maps. Once you edit a map in Tiled, don't re-run it: it overwrites edits.
