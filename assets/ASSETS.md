# Asset specification

Everything the game draws comes from the files below. To use your own art, make files with the
same **name, size and layout** and replace the placeholders. No code changes are needed unless a
section says so. After replacing anything, run `npm test`: `tests/content.test.ts` fails if a file
that the data refers to is missing.

The current files are placeholders drawn by scripts (`npm run gen:art`, `npm run gen:characters`).
Re-running those scripts **overwrites** the files, so stop using them for any file you replace.

## General rules

| Rule | Value |
|---|---|
| Format | PNG, RGBA, transparent background |
| Style | Pixel art, 3/4 top-down view (like LPC) |
| Scaling | Draw at 1×. The game scales up with nearest-neighbour, so pixels stay sharp. Avoid semi-transparent edge pixels (anti-aliasing), because they show as halos |
| Licence | Only CC0, CC-BY, CC-BY-SA, GPL or SIL OFL (plan §10). Add every file to `CREDITS.md` **and** `data/credits.json` (shown in-game) |
| No third-party IP | No names, art or sounds copied from existing commercial games |

## 1. Map tiles: `assets/tilesets/placeholder.png`

| Item | Value |
|---|---|
| Tile size | 32 × 32 px |
| Columns | 8 (rows: as many as needed) |
| Extrusion | **1 px margin around the sheet and 2 px spacing between tiles**, filled by repeating each tile's edge pixels. This stops thin seams between tiles when the map is scaled |

The `tile-extruder` npm tool (`npx tile-extruder --tileWidth 32 --tileHeight 32 --input in.png --output out.png`)
adds the extrusion to a plain 32 px grid. In Tiled, set the tileset's Margin = 1 and Spacing = 2.

Tile behaviour comes from **tile properties** set in Tiled (Tileset editor → select tile → Custom Properties):

| Property | Type | Meaning |
|---|---|---|
| `blocked` | bool | Nobody can walk here (water, trees, walls, fences, rocks, bushes) |
| `blocksProjectile` | bool | Arrows and spells can't pass (trees, rocks, house walls). Fences, bushes and water don't block |

Current tiles (index = left-to-right, top-to-bottom):

| # | Tile | blocked | blocksProjectile |
|---|---|---|---|
| 0 | Grass | | |
| 1 | Grass with flowers | | |
| 2 | Dirt path | | |
| 3 | Stone plaza | | |
| 4 | Water | ✔ | |
| 5 | Tree (transparent background, drawn on the `deco` layer) | ✔ | ✔ |
| 6 | Fence (transparent background) | ✔ | |
| 7 | House wall with window | ✔ | ✔ |
| 8 | Roof | ✔ | ✔ |
| 9 | Door | ✔ | ✔ |
| 10 | Dark grass | | |
| 11 | Rock (transparent background) | ✔ | ✔ |
| 12 | Bush (transparent background) | ✔ | |
| 13 | Wooden bridge | | |
| 14 | Safe-zone marker (only painted on the hidden `safe` layer) | | |
| 15 | Collision marker (only painted on the hidden `collision` layer) | | |

To keep the existing maps working, keep these 16 tiles at the same positions; add new tiles after
them. A **different tileset file name** needs a code change (`TILESET_NAME` in
`src/render/BootScene.ts` and the import at the top of that file). Map layer rules are in
`docs/MAPS.md`.

## 2. Characters (player classes and NPCs): `assets/sprites/characters/<layer>.png`

Characters are **layered** ("paper doll"): a body sheet plus one sheet per piece of clothing,
hair, armor and weapon, all drawn on top of each other with the same frame. Changing equipment
swaps a layer, so outfits change in game.

All layers use the **LPC "Universal" spritesheet layout**, the format exported by the
[Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/).
That makes the generator the easiest source: its art is CC-BY-SA / GPL (credits are listed per
item in the generator; copy them to `CREDITS.md`).

| Item | Value |
|---|---|
| Sheet size | **832 × 1344 px** = 13 columns × 21 rows of **64 × 64** frames |
| Anchor | Character centered horizontally (x = 32), feet at about y = 60 |
| Unused frames | Transparent |

Rows (each animation has 4 rows in the order **up, left, down, right**, except hurt):

| Rows | Animation | Frames | Used for |
|---|---|---|---|
| 0–3 | spellcast | 7 | Casting any spell |
| 4–7 | thrust | 8 | Staff (and spear) attacks |
| 8–11 | walk | 9 | Frame 0 = standing; frames 1–8 = walk cycle (two steps) |
| 12–15 | slash | 6 | Sword attacks, fists, bow used as a club |
| 16–19 | shoot | 13 | Bow attacks. The arrow is released at about frame 10 |
| 20 | hurt | 6 | Death (falls down); only one row, facing down |

If the generator exports a bigger "expanded" sheet (more rows or wider), crop it to the top-left
832 × 1344. Oversized weapon animations (192 × 192 frames) are not supported yet.

### Layer types and draw order

The part of the file name before the first `_` is the layer **type**; it decides the draw order:

- Facing down, left or right (back to front):
  `cloak, body, pants, shoes, boots, shirt, armor, robe, gloves, hair, helmet, hat, shield, sword, staff, bow`
- Facing up (the back is visible): `shield, sword, staff` move behind the body and `cloak` moves to the front.

### Layers the game uses now

| File | Used by |
|---|---|
| `body_light.png` | Knight, Mage, NPC base body (skin, head, face) |
| `body_elf.png` | Elf base body (pointed ears) |
| `pants_gray.png`, `pants_brown.png`, `pants_green.png` | Class/NPC trousers |
| `shirt_white.png`, `shirt_green.png`, `shirt_blue.png` | Class undershirts |
| `shoes_brown.png` | Default shoes |
| `hair_short_brown.png`, `hair_short_black.png`, `hair_long_blonde.png`, `hair_long_brown.png` | Hair |
| `armor_chain.png` | Item 鎖子甲 (Knight starting armor) |
| `armor_leather.png` | Item 皮甲 |
| `robe_purple.png` | Item 布袍 (Mage starting robe) |
| `robe_blue.png` | NPC 書記官 莉雅 |
| `helmet_iron.png` | Item 鐵頭盔 |
| `helmet_leather.png` | Item 皮帽 |
| `hat_wizard.png` | Item 法師帽 |
| `boots_leather.png` | Item 皮靴 |
| `gloves_leather.png` | Item 皮手套 |
| `shield_wood.png` | Item 木盾 |
| `sword_short.png` | Item 練習用長劍 |
| `sword_long.png` | Item 鐵製長劍 |
| `staff_wood.png` | Item 學徒法杖 |
| `bow_short.png` | Item 獵人短弓 |

Where these names are set:
- Class base look: `appearance` in `data/classes.json`.
- NPC look: `appearance` in `data/npcs.json`.
- Equipment look: `sprite` on each item in `data/items.json`; weapons also have `"anim"`
  (`slash`, `thrust` or `shoot`) to pick the attack animation.

To add a new look, drop in `assets/sprites/characters/<type>_<name>.png` and reference it from the
data; every PNG in that folder is loaded automatically.

## 3. Monsters: `assets/sprites/monsters/<id>.png`

| Item | Value |
|---|---|
| Frame size | 64 × 64 px |
| Sheet | **4 columns × 3 rows = 256 × 192 px** |
| Row 0 | Move / idle (4 frames, loops; plays slower while standing) |
| Row 1 | Attack (4 frames; the hit lands around frame 2) |
| Row 2 | Die (4 frames; the sprite then fades out) |
| Facing | **Right.** Facing left is mirrored by the game |
| Anchor | Centered horizontally, feet at about y = 60. Include a soft shadow if you like |

Current files: `slime.png` (草原黏菌), `wolf.png` (灰牙狼), `imp.png` (綠皮小鬼). The file name is the
`sprite` field in `data/monsters.json`. Bigger monsters (bosses, later) will need a larger frame
size; that's a small code change when the time comes.

## 4. Item and spell icons: `assets/sprites/icons.png`

| Item | Value |
|---|---|
| Icon size | 32 × 32 px |
| Columns | 8 |
| Index | Left-to-right, top-to-bottom, starting at 0. Items and spells refer to it with `"icon"` in `data/items.json` / `data/spells.json` |

Icons are shown in the inventory, on the hotbar and on the ground (scaled to 24 px).

| # | Icon | # | Icon | # | Icon |
|---|---|---|---|---|---|
| 0 | Gold coins | 8 | Sword | 16 | Cloak (also robe) |
| 1 | Red potion | 9 | Bow | 17 | Spellbook |
| 2 | Orange potion | 10 | Staff | 18 | Spell: heal |
| 3 | Blue potion | 11 | Body armor | 19 | Spell: fire bolt |
| 4 | Arrows | 12 | Helmet / hat | 20 | Spell: spirit power |
| 5 | Scroll (return) | 13 | Shield | 21 | Purple potion |
| 6 | Scroll (teleport) | 14 | Boots | 22 | Weapon enhance scroll |
| 7 | Scroll (save) | 15 | Gloves | 23 | Armor enhance scroll |

| 24 | Silver arrows | | | | |

Add new icons after index 24 and point the item's `"icon"` at them.

## 5. App icon: `public/icons/icon-192.png`, `public/icons/icon-512.png`

192 × 192 and 512 × 512 PNG, opaque background. The 512 icon is also used as a "maskable" icon,
so keep the important part inside the central 80 % circle.

## 6. Font (planned, Milestone 0 leftover)

A pixel font with full Traditional Chinese coverage under the SIL OFL, in `assets/fonts/`, with
its `OFL.txt`. Chosen: Fusion Pixel Font 12 px proportional, `zh_hant`. Bundling it needs a small
code change (loading + subsetting); see `docs/DEVELOPMENT.md`.

## 7. Audio (Milestone 8)

Not used yet. When added, put files in `assets/audio/`:

| Kind | Files | Spec |
|---|---|---|
| BGM | `bgm_town`, `bgm_field`, `bgm_combat` | Loopable, 1–3 min. Written as MIDI, delivered as **OGG** (plus **M4A** for older iPhones, which can't play OGG) |
| SFX | `sfx_hit`, `sfx_miss`, `sfx_bow`, `sfx_cast`, `sfx_levelup`, `sfx_pickup`, `sfx_enhance_ok`, `sfx_enhance_fail`, `sfx_enhance_destroy`, `sfx_death`, `sfx_click` | Short (under 2 s), mono, normalized to similar loudness. OGG + M4A |

Licences: CC0 / CC-BY, or your own compositions (plan §8, §10).
