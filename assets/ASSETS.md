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
| 16 | Cave floor | | |
| 17 | Cave wall | ✔ | ✔ |
| 18 | Cave entrance (hole, transparent background, on `deco`) | | |
| 19 | Stairs up | | |
| 20 | Bones (transparent background) | | |
| 21 | Crystal pillar (transparent background) | ✔ | ✔ |
| 22 | Dark cave floor | | |
| 23 | Rubble (transparent background) | ✔ | |
| 24 | Scorched ground | | |
| 25 | Ash | | |
| 26 | Dead tree (transparent background) | ✔ | ✔ |
| 27 | Lava | ✔ | |

To keep the existing maps working, keep these 28 tiles at the same positions; add new tiles after
them, list them in `tools/tileset-def.mjs` and run `npm run sync:tileset`. A **different tileset file name** needs a code change (`TILESET_NAME` in
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
| Frame size | 64 × 64 px; bosses can be bigger (set `"frame": 96` in `data/monsters.json`) |
| Sheet | **4 columns × 3 rows** = 256 × 192 px (384 × 288 for a 96 px boss) |
| Row 0 | Move / idle (4 frames, loops; plays slower while standing) |
| Row 1 | Attack (4 frames; the hit lands around frame 2) |
| Row 2 | Die (4 frames; the sprite then fades out) |
| Facing | **Right.** Facing left is mirrored by the game |
| Anchor | Centered horizontally, feet at about y = 60. Include a soft shadow if you like |

Current files: `slime.png` (草原黏菌), `wolf.png` (灰牙狼), `imp.png` (綠皮小鬼), `bat.png` (洞窟蝙蝠),
`skeleton.png` (骷髏戰士), `spider.png` (巨型蜘蛛), `dire_wolf.png` (夜狼), `orc.png` (獸人戰士),
`fire_wolf.png` (炎狼), `golem.png` (岩石巨像), `death_knight.png` (死亡騎士), and the boss `troll.png`
(岩窟巨魔, 96 × 96 frames). The file name is the
`sprite` field in `data/monsters.json`.

## 4. Item and spell icons: `assets/sprites/icons/<name>.png`

| Item | Value |
|---|---|
| Icon size | 32 × 32 px, one file per icon |
| Name | The `icon` column in `tuning/items.csv`, `tuning/equipment.csv` and `tuning/spells.csv` |

Icons are shown in the inventory, shop, hotbar and on the ground (scaled to 24 px).
`tuning/CATALOG.md` shows every item with its icon and a link to the file.

Current icon files: `gold`, `potion_red`, `potion_orange`, `potion_blue`, `potion_purple`, `arrows`,
`arrows_silver`, `scroll_return`, `scroll_teleport`, `scroll_save`, `scroll_enhance_w`,
`scroll_enhance_a`, `sword`, `bow`, `staff`, `armor_leather`, `helmet`, `shield`, `boots`, `gloves`,
`cloak`, `spellbook`, `spellbook_elf`, and the spell icons `spell_heal`, `spell_heal_mid`, `spell_fire`,
`spell_burst`, `spell_ice`, `spell_lightning`, `spell_shield`, `spell_barrier`, `spell_spirit`, `spell_nature`,
`spell_earth`, `spell_wind` (several spells share one; give a spell its own by adding a file and changing its
`icon` cell). Spellbooks show their spell's icon small in the corner. Every PNG in the folder is loaded
automatically, so a new icon is just a new file plus its name in the sheet.

## 5. App icon: `public/icons/icon-192.png`, `public/icons/icon-512.png`

192 × 192 and 512 × 512 PNG, opaque background. The 512 icon is also used as a "maskable" icon,
so keep the important part inside the central 80 % circle.

## 6. Font: `assets/fonts/`

| File | What |
|---|---|
| `source/fusion-pixel-12px-proportional-tc.woff2` | The full font (Fusion Pixel Font 12px proportional, Traditional Chinese, SIL OFL 1.1) |
| `fusion-pixel-tc-subset.woff2` | What the game loads: the full font cut down to the game's text plus ~5,400 common characters (175 KB) |
| `fusion-pixel-tc-subset.chars.txt` | The characters the cut-down font covers |
| `OFL.txt` | The font's licence (must stay with it) |

Characters missing from the cut-down font (rare characters in a typed player name) fall back to the
phone's own Chinese font. After adding text with new characters, `npm test` (`tests/font.test.ts`)
tells you to run `python3 tools/subset-font.py` (needs `pip install fonttools brotli`).

To use a different font: replace `source/…woff2` (keep it SIL OFL / free, add it to `CREDITS.md`),
change `SRC` in `tools/subset-font.py`, rerun it. The font name the game uses is `PIXEL_FONT` in
`src/ui/strings.ts`.

## 7. Audio: built-in chiptune, or your own files

Music and sound effects are **chiptune**, synthesized in the browser by `src/audio/audio.ts` from
note lists in `data/audio.json` (owner's choice, 2026-10-29). You can replace any track or effect
with your own recording (7.1) or edit the notes (7.2).

### 7.1 Your own audio files: `assets/audio/`

Drop a file named after the track or effect into `assets/audio/`. It replaces only that one; everything
without a file stays chiptune. No code changes; `npm test` (`tests/audio.test.ts`) fails on a name
the game doesn't know, so typos don't go unnoticed.

| File name | Plays | Spec |
|---|---|---|
| `bgm_town` | Village (and the title screen) | Loops forever: make the end flow into the start with no silence at either end. 1–3 min |
| `bgm_field` | Hunting fields | Same as above |
| `bgm_combat` | While fighting, until 5 s after the last hit (`combatHoldSec`) | Same; energetic. It cross-fades with the field track, so keep a similar loudness |
| `bgm_dungeon` | 暗影洞窟 | Same as above |
| `sfx_hit`, `sfx_hurt`, `sfx_miss` | Hitting a monster, being hit, a miss | Short: under 0.5 s |
| `sfx_bow`, `sfx_cast` | Bow shot, casting a spell | Under 0.5 s |
| `sfx_levelup`, `sfx_pickup`, `sfx_death`, `sfx_click` | Level up, picking up loot, dying, UI button | Level-up / death up to 2 s; click under 0.1 s |
| `sfx_enhance_ok`, `sfx_enhance_fail`, `sfx_enhance_destroy` | Enhancement result | Up to 1 s |

| Item | Value |
|---|---|
| Format | **`.m4a` (AAC) or `.mp3`**: they play on every iPhone and browser. `.ogg` doesn't play on older iPhones; `.wav` works but is large. If several formats have the same name, `.m4a` wins, then `.mp3`, `.ogg`, `.wav` |
| Quality | Music: stereo, 44.1 kHz, ~128 kbps. Effects: mono is fine, ~96 kbps |
| Loudness | Normalize everything to a similar level (for example −16 LUFS for music, a bit louder for effects); players set music / effect volume in 設定 |
| Size | Keep the whole folder under ~10 MB: every file is downloaded for offline play |
| Licence | Your own compositions, CC0 or CC-BY (plan §8, §10). Add each file to `CREDITS.md` and `data/credits.json` |

In the browser console of `npm run dev`, `__nowPlaying()` shows whether the current track comes from a
`file` or from `chiptune`.

### 7.2 Editing the chiptune

To change a built-in tune, edit its notes in `data/audio.json` and run `npm test` (`tests/audio.test.ts`
checks every note and that all parts of a track have the same length).

| Kind | Entries | Notes |
|---|---|---|
| BGM | `town`, `field`, `combat`, `dungeon` | `bpm` and up to a few `voices`; each voice has a `wave` (`square`, `triangle`, `sawtooth`, `sine`, `noise` for drums), a volume and `notes` |
| SFX | `hit`, `hurt`, `miss`, `bow`, `cast`, `levelup`, `pickup`, `enhance_ok`, `enhance_fail`, `enhance_destroy`, `death`, `click` | A list of short segments (`wave`, `f` = note name, Hz, or `[from, to]` for a slide, `dur`, `vol`) |

Note syntax: `C5-2` = C in octave 5 for 2 sixteenth-note steps, `R-4` = rest, `|` = bar line (ignored);
drums: `K` kick, `S` snare, `H` hi-hat. One bar = 16 steps. Combat music plays while fighting and for
`combatHoldSec` seconds after. Players set music / effect volume in 設定.
