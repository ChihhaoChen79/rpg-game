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

Map property `nameKey` (string) is the strings-file key for the map's display name.

Rules checked by `tests/maps.test.ts` (run `npm test` after editing):
- start/respawn points are walkable,
- every exit is reachable and leads to a walkable tile, not on another exit, in an existing map.

When adding a map: save it as `maps/<id>.json`, add it to `src/content.ts` and to
`tests/maps.test.ts`, and add its `nameKey` to `data/strings.zh-TW.json`.

`tools/gen-maps.mjs` only bootstrapped the first two maps. Don't re-run it; it overwrites edits.
