# Map editor (developer tool)

A page in the browser for making maps quickly (docs/PLAN.md §11.1, Milestone 9). It is **not**
part of the game players download.

```
npm run editor
```

It opens `http://localhost:5173/tools/map-editor/index.html` (the port may differ if the game's
`npm run dev` is already running). The page reopens the last map you worked on.

## Screen

- **Left panel**: map settings, auto-generation, tile palette, object list and properties, check and save.
- **Toolbar**: the tool in use, undo (Ctrl+Z), zoom.
- **Map**: click / drag with the current tool. The bottom bar shows the tile under the mouse and
  whether players can walk there.

## Making a new map

1. **新地圖**, then fill in **代號** (lower-case English id, e.g. `field4`; it becomes `maps/field4.json`)
   and **中文名稱** (shown in game).
2. **自動產生**: pick a type, size and settings, then **產生地圖**. Same settings + same **種子** (seed)
   always give the same map; **🎲 重抽** tries a new seed.

   | Type | Settings |
   |---|---|
   | 草原 / 森林 / 荒原 | Tree and rock density (%), water (pond / river; lava in the wasteland), roads (east–west, north–south, cross). Roads end in gaps in the border: put the exits there |
   | 地下城／洞窟 | Number of rooms, maze level (0–100: more turns and dead ends), **boss room** (big room in the east with a boss spawn area, respawn 1–2 h) and which boss. The entrance room is in the west, with stairs up and an arrival point |
   | 村莊 | Number of houses. The whole map is a safe zone; start and respawn points are on the plaza |

   Every generated map is fully connected: no open area is walled off.
3. **死亡後回到**: the map whose respawn point players return to after dying or reading a return scroll.
4. **等級範圍**: for developers only (shown in `tuning/CATALOG.md`, never to players). **建議** fills it
   in from the monsters in the spawn areas.

## Objects

| Tool | How | Notes |
|---|---|---|
| 出口 | Drag the exit area, then pick the destination map | **同時建立回程出口** (on by default): click where the way back should be on the destination; players arrive next to it, and the way back leads to a free tile next to this exit. Untick it to just click the arrival tile |
| 怪物區 | Drag the area | Pick the monster (list shows level; 👑 = boss), count, respawn seconds (optional maximum for a random time). Bosses default to 1 and 1–2 **hours** (play time) |
| NPC | Click | Pick which NPC (from `data/npcs.json`) |
| 傳送點 | Click | A named arrival point for teleport NPCs and teleport spells. A **closed map** (no exits) needs one |
| 起點 / 重生點 | Click | Start: where new characters appear (village only). Respawn: where players come back after dying |
| 選取／移動 | Click an object to edit it, drag to move | Delete key removes it |

## Touching up tiles

畫筆, 橡皮擦, 填滿 (flood fill), 矩形 on the chosen **圖層** with the tile picked in the palette:

| Layer | Use |
|---|---|
| 地面 | Ground (grass, dirt, water...) |
| 裝飾 | Trees, walls, rocks... (blocking tiles block movement; see `assets/ASSETS.md` §1) |
| 隱形牆 | Blocks movement without anything drawn |
| 安全區 | Safe zone: no fighting, monsters can't enter |

Detailed painting is easier in **Tiled** (docs/MAPS.md): the editor saves the same format, so you can
switch between the two.

## Check and save

**檢查** runs the same rules as `tests/maps.test.ts` (src/logic/mapcheck.ts): a way in, exits reachable
and landing on walkable tiles, respawn map, known monsters / NPCs, unique spawn names...

**儲存** (only when the check passes) writes:

- `maps/<id>.json`, and the destination map too if a way back was created,
- the map name `map.<id>` in `data/strings.zh-TW.json`,
- this map's rows in `tuning/spawns.csv` (still the source of truth for spawn numbers),

then runs `npm run tuning` (catalog, spawn numbers). The page reloads and reopens the map. New maps are
loaded by the game automatically. Afterwards run `npm test`, try it with `npm run dev`, and commit.

## Files

| File | What |
|---|---|
| `index.html`, `src/main.ts` | The page |
| `src/generators.ts` | The presets (pure functions; tested by `tests/map-generators.test.ts`) |
| `src/model.ts` | Editor map ↔ Tiled JSON |
| `server.ts`, `vite.config.ts` | Dev server and the save endpoint (only under `npm run editor`) |
