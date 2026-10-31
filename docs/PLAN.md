# Pixel Online-Style RPG — Feasibility & Planning Document

> Status: **Planning complete. No code yet.**
> Version: v4 (2026-10-29). All open questions resolved except items explicitly marked TBD.
> Every number marked *(tunable)* is a starting value stored in data files and adjusted during balancing. These are not open questions.

---

## 0. Abbreviations & Terms

| Term | Meaning |
|---|---|
| A* | "A-star", a standard grid pathfinding algorithm |
| AFK | Away From Keyboard; auto-play while the player is not controlling |
| AI | Artificial Intelligence; here, monster behavior logic |
| BGM | Background Music |
| CC0 / CC-BY / CC-BY-SA | Creative Commons licenses: public domain / attribution required / attribution + share-alike |
| CJK | Chinese, Japanese, Korean character sets |
| CON | Constitution: affects max HP, HP regen, carry weight |
| CSS px | Browser logical pixel; one CSS px may equal several physical screen pixels |
| Def | Defense: reduces physical damage taken; higher is better |
| DEX | Dexterity: affects ranged hit chance, ranged damage, evasion |
| Exp | Experience points |
| FPS | Frames Per Second |
| GPL | GNU General Public License |
| HP | Hit Points (health) |
| HUD | Heads-Up Display: on-screen bars, hotbar, minimap, buttons |
| INT | Intelligence: affects spell damage and max MP |
| IP | Intellectual Property |
| JSON | JavaScript Object Notation, the text format used for game data |
| LPC | Liberated Pixel Cup, a large open-licensed pixel-art asset collection |
| LTS | Long-Term Support (software release line) |
| MIDI | Musical Instrument Digital Interface: note-based music format |
| MP | Mana Points (spell resource) |
| MR | Magic Resistance: reduces magic damage taken; higher is better |
| MVP | Minimum Viable Product: the first complete, playable version |
| NPC | Non-Player Character (shopkeeper, warehouse keeper, etc.) |
| OGG | Compressed audio file format |
| OOP | Object-Oriented Programming |
| PK | Player Kill: one player killing another |
| PvP | Player versus Player combat |
| PWA | Progressive Web App: a website installable like an app, with offline support |
| RNG | Random Number Generator |
| SFX | Sound Effects |
| SIL OFL | SIL Open Font License, a common free font license |
| STR | Strength: affects melee damage and carry weight |
| TS | TypeScript |
| UI | User Interface |
| WIS | Wisdom: affects MP regen and MR |
| Alignment | Good/evil value carried by players, monsters, and NPCs |
| Command | A data object describing a player intent (move, attack, use item...) |
| Ground item | An item lying on a map tile, from a monster drop or a player death |
| Safe zone | Village/town area: monsters cannot enter, combat is disabled |
| TBD | To Be Determined: deliberately left for a later version |
| Tick | One fixed step of game-logic simulation |

---

## 1. Project Summary

A pixel-art RPG inspired by classic 2D online RPGs. It runs in the browser on desktop and mobile.

- **Phase 1 (MVP):** single-player, runs fully in the browser, installable as a PWA.
- **Phase 2 (future):** small online mode for inviting friends only, reusing the same game logic on a server.
- **Initial scope:** one starter village plus surrounding hunting grounds.

### Developer profile

- Firmware engineer, strong in C, little OOP or game-dev experience.
- Windows + VS Code.
- About **1 hour per day**, building with Claude Code.
- Starts from existing open-licensed art, customized later.

---

## 2. Key Decisions

| Topic | Decision |
|---|---|
| Platform | Web browser, desktop + mobile; installable PWA with offline play |
| Phone orientation | Landscape only |
| Camera | 3/4 top-down view, 4-direction sprites |
| Visible area | 32×18 tiles, no zoom (§6) |
| Movement | Tile-based, 8-direction stepping |
| Controls | Fully playable with left mouse button only; keyboard is optional shortcuts |
| Mobile controls | Tap monster to auto-attack, tap ground to move |
| UI language | Traditional Chinese only |
| Audio | MIDI-style BGM (town, field, combat) + SFX |
| Character slots | 3 slots (owner's request 2026-10-30): the lobby shows each saved character in its gear; tap for status and 進入遊戲 |
| Saving | At save NPC in town, or anywhere with a cheap save item; export/import backup file |
| Death | 10% current-level Exp loss (can de-level, floor level 10); chance to drop 1 equipped item based on Alignment; protection item prevents the drop |
| Safe zones | Monsters never enter villages/towns |
| Auto-hunt / AFK | Included (owner's request): a toggle that fights, casts, drinks potions and picks up loot on the current map (§7.22) |
| Hosting | May be published on GitHub Pages; code and assets treated as public |
| Monetization | None |
| Online (future) | Friends-only; any player may start PvP outside safe zones |

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Typed like C; same language for future server |
| Engine | Phaser 3 | Mature 2D web engine, good mobile support, small download |
| Map editor | Tiled | Free; engine loads its JSON maps directly |
| Build | Vite + `vite-plugin-pwa` | Fast dev server; PWA/offline support |
| Tests | Vitest | Tests pure game logic without a browser |
| Lint | ESLint | Enforces "no engine/browser imports in `logic/`" |
| Save | IndexedDB + persistent-storage request | Robust local save |
| Hosting | GitHub Pages (HTTPS, required for PWA) | Free static hosting |
| Future server | Node.js + `ws` (WebSocket) | Reuses the same TS logic; friends-only scale |

### Dev environment (Windows)

- Node.js LTS, VS Code, Tiled.
- A MIDI editor (optional; for composing music).
- Desktop browser device emulation for layout; real-phone testing over local Wi-Fi.

### Coding style

- Plain data types + functions, close to C style.
- Classes only where the engine requires them (scenes, sprites).

---

## 4. Architecture

```
┌──────────────────────────────┐
│  Client (browser)            │
│  ┌────────────────────────┐  │
│  │ Input (mouse/touch/key)│──┼──> Commands
│  └────────────────────────┘  │       │
│  ┌────────────────────────┐  │       v
│  │ Render + Audio + UI    │<─┼── Game State <── Game Logic (pure TS)
│  └────────────────────────┘  │                     ^
└──────────────────────────────┘                     │
                                      JSON data: items, monsters, spells, drops,
                                      Exp table, enhancement tables, spawns, text
```

### Rules

1. `logic/` has **no engine or browser imports** (lint-enforced), so it can run on a Node.js server later.
2. All player actions are **Commands**.
3. **Fixed tick: 10 ticks/sec.** One tile step takes a fixed number of ticks *(tunable)*; rendering interpolates movement smoothly.
4. All randomness goes through one **seedable RNG** inside logic.
5. All content and numbers are **data-driven** (JSON).
6. **Versioned save format** with migration functions.
7. All UI text lives in a **strings file** (Traditional Chinese), not inside code.

### Folder layout

```
/src
  /logic    state, commands, movement, pathfinding, combat, ai, spawn, inventory,
            weight, equipment, enhancement, leveling, alignment, death, ground-items, rng
  /render   scenes, sprites, animation, camera
  /audio    BGM switching, SFX
  /input    mouse, touch, keyboard -> commands
  /ui       HUD, inventory, shop, warehouse, dialogs, message log, minimap, settings
  /save     IndexedDB save/load, export/import, migrations
  /debug    developer console (dev builds only)
/data       JSON content + strings
/assets     sprites, tilesets, audio, fonts
/maps       Tiled maps
/tests      unit tests for /logic
CREDITS.md  asset attribution
```

---

## 5. Controls

### Input mapping

| Action | Mouse | Touch | Keyboard (optional) |
|---|---|---|---|
| Move | Left-click tile; hold to keep walking toward cursor | Tap tile; hold to keep walking | — |
| Attack | Left-click monster | Tap monster | — |
| Pick up | Click ground item (walks there first) | Tap ground item | `Space`: pick up nearest item within 1 tile |
| Talk | Click NPC | Tap NPC | — |
| Use hotbar slot | Click slot | Tap slot | `1`–`6` |
| Choose hotbar slot | Mouse wheel; middle-click uses it (on a monster: casts the chosen spell at it) | Swipe along the hotbar; a chosen attack spell is cast at every monster you tap until you tap a slot | — |
| Menus | HUD buttons | HUD buttons | `I` inventory, `C` character, `S` spells, `M` minimap, `Esc` close |
| Chat / message input | Click chat box | Tap chat button | `Enter` |
| Attack a player (online) | PvP mode toggle on HUD, then click player; or hold `Ctrl` + click player | PvP mode toggle on HUD, then tap player | Hold `Ctrl` |

**Right mouse button:** unused.

### Rules

- **Target priority** when objects overlap: monster > ground item > NPC > ground tile.
- **Touch target snapping:** a tap near a monster selects the closest valid target within a small radius *(tunable)*. Hit areas are larger than sprites.
- **Tooltips:** hover on desktop; long-press on touch.
- **Auto-attack** continues until one of these happens:
  - the target dies,
  - the player gives a new command,
  - the target becomes unreachable.
- **Melee range:** the 8 adjacent tiles.
- **Bow and spell range:** defined per item or spell in data.

### Spell targeting

- **Targeted spells:** cast on the current target if valid. Otherwise the next click/tap picks the target.
- **Self spells:** cast on the player immediately.

---

## 6. Screen & Visible Area

| Item | Value |
|---|---|
| Tile size | 32×32 px (LPC standard) |
| View | 32×18 tiles = 1024×576 logical px (16:9) |
| Character frame | 64×64 px, about 1×2 tiles |
| Scaling | Rendered at physical-pixel resolution with nearest-neighbor filtering (pixels stay sharp) |

### Laptop (16:9)

- The view fills the screen.
- The HUD overlays the map edges.

### Phone (~20:9 landscape)

- The map view stays exactly 32×18 tiles on every device, which keeps PvP fair.
- The extra width on each side becomes UI side panels:
  - left: HP/MP and menu buttons,
  - right: hotbar.
- These panels sit beside the map instead of covering it.

### Portrait

A "please rotate your device" overlay is shown.

### Touch risk and its handling

- On a landscape phone, a tile is about 20–24 CSS px (~5 mm), which is smaller than a comfortable finger target.
- Mitigations: target snapping, enlarged hit areas, and characters that are 2 tiles tall.
- The view size is a single config constant.
- Milestone 1 includes a **real-phone test**. If tapping still feels too hard, the phone view switches to 26×15 tiles. This is a test-gated fallback, not an open question.

### HUD layout (desktop)

| Area | Content |
|---|---|
| Top-left | HP/MP bars, level, Exp bar, weight bar, Alignment bar (angel = good on the left, devil = evil on the right, a player marker in between; the number is only shown in the character window) |
| Top-right | Minimap (toggleable) |
| Bottom-center | 6-slot hotbar + menu buttons |
| Bottom-left | Message log / chat box (collapsible) |

---

## 7. Game Systems (MVP)

### 7.1 Classes

| Class | Role | Weapons | Magic |
|---|---|---|---|
| Knight | Melee tank/damage | One-handed sword + shield | Normal magic level 1 only, from player level 50 |
| Elf | Ranged | Bow (two-handed) + arrows | Normal magic up to level 6 + exclusive **Elf magic** (levels 1–3) |
| Mage | Caster | Staff (two-handed); weak melee when out of MP | Normal magic up to level 10 (main damage source) |

### 7.2 Stats & character creation

- Stats: STR, DEX, CON, INT, WIS.
- Each class has fixed base stats. The player distributes **6 bonus points**. Each stat can be at most 18 at creation *(tunable)*.

  | Class | STR | DEX | CON | INT | WIS | Total |
  |---|---|---|---|---|---|---|
  | Knight | 16 | 10 | 14 | 8 | 8 | 56 |
  | Elf | 11 | 15 | 11 | 10 | 9 | 56 |
  | Mage | 8 | 10 | 10 | 16 | 12 | 56 |

- Derived stats: max HP, max MP, HP/MP regen, hit bonus, evasion, damage bonus, Def, MR, carry weight.
- **STR** raises the melee hit bonus; **DEX** raises the ranged (bow) hit bonus and the player's **evasion**.
- Extra stat points from leveling: not in MVP.

### 7.3 Leveling

- **Level cap:** 30.
- **Exp curve:** a JSON table *(tunable)*.
- **Per level-up:** random HP/MP gain within a class range *(tunable)*.
- Each level's actual HP/MP gain is **recorded** in the save, so a level-down removes exactly what that level gave.

### 7.4 Combat

#### Hit & evasion

- Every weapon has a **hit rate** (hidden from players).
- Every monster has an **evasion rate**. Players also have evasion, derived mainly from DEX.
- **Hit chance** = weapon hit rate + attacker hit bonus − target evasion, clamped to 5%–95% *(tunable)*.
- **Player hit bonus** = class bonus (melee / ranged, `hit` in `data/classes.json`) + level × 0.5
  + (STR − 10) for melee or (DEX − 10) for bow shots + the weapon's **accuracy** (命中 +x, some
  weapons only) + 1 per weapon enhancement level. A bow used as a club gets no weapon bonuses.
  *(Changed 2026-10-30 at the owner's request: STR, class and enhancement now count.)*
- Spells use their own hit rules defined per spell (most targeted damage spells always hit; MR reduces their damage).

#### Damage

- **Weapon damage is a range** (min–max). Each hit rolls a value inside the range.
- **Physical damage:**
  - Base = weapon damage roll + STR bonus + **extra attack** (額外攻擊: the weapon's own, on some
    weapons, + 1 per enhancement level), added after the roll.
  - Def reduction: `damage × 100 / (100 + Def)`, minimum 1.
- **Magic damage:**
  - Base = spell base + INT bonus.
  - MR reduction: damage × (1 − MR%), with MR% capped at 75%.

#### Max-damage buffs

For a limited time, these make every weapon roll use the **maximum** of the damage range:

- **Knight:** a consumable item (sold in shop or dropped).
- **Elf:** the elf magic spell 精靈之力.
- Duration and cooldown are defined in data *(tunable)*.

#### Speed (added 2026-10-31 at the owner's request)

- **Walk speed** (ticks per tile, `stepTicks` in `data/game-config.json`) and **attack speed**
  (each weapon's `attack_sec`) are hidden values; speed-up buffs divide both by a multiplier
  (attack animations play faster too).
- **Speed-up stages** (`speedStages` in `data/balance.json`):
  - **Stage 1 (×1.5):** 加速藥水 (general shop, 5 min) and the village NPC 風之祭司 (free, 10 min).
  - **Stage 2 (planned, ×1.3 placeholder):** class-specific speed potions or spells.
  - **Stage 3 (planned, ×1.2 placeholder):** rare and valuable items.
- Each stage holds **one** buff at a time: a new speed-up of the same stage replaces the current
  one, even if the current one has more time left. Buffs of different stages multiply.
- Like the Def / MR buffs, speed-ups are not saved: they end when the game is reloaded.

#### Not in MVP

- Critical hits.

### 7.5 Def & MR

- **Def:** reduces physical damage. Higher is better. Comes from armor, shield, and armor enhancement.
- **MR:** reduces magic damage. Higher is better. Comes from WIS and certain armor.

### 7.6 Cooldowns

- **All potions and all spells have cooldowns.**
- Stronger effects have longer cooldowns (for example, a small HP potion has a short cooldown and a large HP potion has a long one).
- Potions of the same type share one cooldown (all HP potions share a cooldown; all MP potions share another).
- Cooldown values are stored per item and per spell in data *(tunable)*.
- The hotbar shows a cooldown overlay on each slot.

### 7.7 Death

| Rule | Behavior |
|---|---|
| Exp loss | A % of the Exp required for the current level, by the level at death: 10% up to level 45, then 9% at 46, 8% at 47, 7% at 48, 6% at 49 and 5% from level 50 (`deathExpLossPct` in `data/balance.json`; changed 2026-10-31 at the owner's request) |
| Level-down | Allowed if Exp in the current level is insufficient, but never below **level 10**. At level ≤10, Exp in the level just clamps to 0 |
| Equipped item drop | Chance to drop **1 random equipped item** on the death tile; chance depends on Alignment (§7.8). Enhanced items drop the same way and keep their enhancement level |
| Drop protection | A player with an active **protection effect** (§7.15) never drops equipment |
| Protections lost | Every protection effect on the player is removed on death, whether or not it was needed |
| Inventory / gold | Never dropped |
| Respawn | Nearest village respawn point, full HP/MP |
| Respawn invulnerability | 3 seconds after respawn *(tunable)* |
| Death screen | Shows the Exp lost and any item dropped, with a "Return to village" button |

### 7.8 Alignment

- **Range:** −1000 (most evil) to +1000 (most good). New characters start at 0.
- **Labels:** Good (≥ +300), Neutral (−299 to +299), Evil (≤ −300).
- Every monster has an Alignment value.
- **How Alignment changes:**
  - Killing an evil monster raises the player's Alignment.
  - Killing a good monster lowers it.
  - Change size scales with the monster's value *(tunable)*.
  - It changes **only through kills**; there is no drift over time.
- **NPCs** have Alignment values for future use. In MVP, NPCs cannot be attacked.

#### Equipped-item drop chance on death

The chance changes linearly with Alignment:

| Alignment | Drop chance |
|---|---|
| Neutral (−299 to +299) | 10% (flat) |
| Good: +300 → +1000 | 10% → 0%, linear |
| Evil: −300 → −1000 | 10% → 80%, linear |

Formula:

- Good (A ≥ 300): `chance = 10% × (1000 − A) / 700`
- Evil (A ≤ −300): `chance = 10% + 70% × (−A − 300) / 700`

Examples: +650 → 5%; +1000 → 0%; −650 → 45%; −1000 → 80%.

### 7.9 Safe zones & regeneration

- Marked as tiles in Tiled.
- Monster pathfinding treats safe-zone tiles as walls.
- A monster chasing the player gives up and returns home when the player enters a safe zone.
- No combat (or PvP) inside safe zones.
- **HP/MP regen inside a village is faster** than in the field (multiplier in data, starting at ×3 *(tunable)*).

### 7.10 Spawning

- Spawn areas and respawn timers come from map and data files.
- **No-spawn radius** *(tunable)* applies around:
  - the new-character start point,
  - village exits,
  - respawn points.
- A monster never respawns within a minimum distance of the player's current position.
- **Leash distance:** a monster pulled too far from its spawn area resets and returns home.

### 7.11 Equipment

- **Slots:** weapon, shield, helmet, armor, pants, cloak, gloves, boots, and the accessories
  necklace, 2 rings, belt, 2 earrings. *(Pants and accessories added 2026-10-30 at the owner's request.)*
- **Accessories** give small stat bonuses (HP, MP, MR %, Def, melee/ranged/spell damage, melee/ranged
  hit %), don't change the character's outfit and can't be enhanced. A second ring or earring
  goes in the free slot; with both full it replaces the first.
- The inventory shows the slots on a body silhouette (paper doll); the character window shows each
  value as base + equipment bonus (in green).
- Two-handed weapons block the shield slot.
- **Every weapon and armor piece has:**
  - a **class restriction** (which classes can equip it),
  - a **level requirement**.
- Items the player cannot equip are shown greyed out, with the reason in the tooltip.
- Rings and amulets: future.
- Equipment is drawn on the character as layered sprites (LPC paper doll), so outfits change when gear changes. The weapon type picks the attack animation (slash / thrust / shoot). *(Changed 2026-10-29 at the owner's request; was: not drawn.)*

### 7.12 Weapon durability & repair

- **Weapons have durability.** Using a weapon to attack lowers its durability over time *(rate tunable per weapon)*.
- **Effect of wear:** damage drops as durability drops. A weapon at 0 durability is **broken** and deals only minimum damage (1) until repaired.
- **Repair:** a Blacksmith NPC in the village restores durability for gold.
- **Bow used as a melee weapon (no arrows):**
  - With no arrows in the inventory, an Elf can still attack adjacent targets by hitting with the bow.
  - The bow then acts as a weak blunt weapon (very low damage, data-defined).
  - Bow melee wears durability **much faster** than normal use.
- Armor durability: not in MVP.

### 7.13 Enhancement

- **Scrolls:** Enhance Weapon Scroll and Enhance Armor Scroll.
- **Bonus per level:**
  - weapon: +damage,
  - armor: +Def.
- **Safe level:** weapons up to **+6**, armor up to **+4**. Enhancing up to the safe level always succeeds.
- **Above the safe level:** the success rate **halves with each step**.

  | Weapon step | Armor step | Success |
  |---|---|---|
  | +6→+7 | +4→+5 | 50% |
  | +7→+8 | +5→+6 | 25% |
  | +8→+9 | +6→+7 | 12.5% |
  | +9→+10 | +7→+8 | 6.25% |
  | each further step | each further step | half of the previous step |

- **On failure** above the safe level, the item is either unchanged or destroyed. The destruction chance rises with each level *(tunable)*.

  | Failure at step (weapon / armor) | Destroyed | Unchanged |
  |---|---|---|
  | +6→+7 / +4→+5 | 30% | 70% |
  | +7→+8 / +5→+6 | 50% | 50% |
  | +8→+9 / +6→+7 | 70% | 30% |
  | further steps | 90% | 10% |

- **Blessed / cursed scrolls:** TBD (not in this version). The data format reserves fields for them.

### 7.14 Inventory, weight & warehouse

| Rule | Value |
|---|---|
| Inventory slots | 60 *(tunable)* |
| Stacking | Stackable items use 1 slot per stack (max 9999) |
| Carry weight | 300 + 180 per STR + 120 per CON (display units; `weightBase`, `weightPerStr`, `weightPerCon` in `data/balance.json`) |
| Gold | No weight, no slot (shown as a counter) |
| Arrows | Small weight per arrow |
| Over 50% weight | No natural HP/MP regen |
| Over 80% weight | Cannot attack |
| 100% or more | Cannot move; pickups that would exceed 100% are refused |
| Warehouse NPC | 100 slots, free to use |

### 7.15 Items

- **Consumables:**
  - HP/MP potions (several strengths, each with a cooldown),
  - teleport scroll (random location on the current map),
  - return scroll (nearest village),
  - arrows (consumed per shot from inventory; no arrow slot). Arrow types add damage: bow shot = bow roll + DEX bonus + arrow bonus (+ enhancement). The player picks the arrow type to shoot; when it runs out, the weakest arrows carried are used. *(Added 2026-10-29 at the owner's request.)*
  - enhancement scrolls,
  - **save item** (save anywhere; cheap, sold in the town shop),
  - **Knight max-damage item** (§7.4),
  - **equipment protection item:** gives a protection effect that prevents equipment drop on the next death. The effect lasts until the player dies, then disappears.
- **Infinite ammo** exists only as rare top-tier rewards, such as a magic-arrow bow or an infinite quiver. These come from bosses after the MVP.
- **Shops:** buy at list price, sell back at 50%.

### 7.16 Ground items

- Monster drops and death drops lie on the tile where they fell.
- Anyone may pick them up (in the online phase too).
- A **cleanup cycle runs every 1 minute** and removes ground items older than **5 minutes** *(tunable)*.

### 7.17 Spells

- Learned from spellbooks (bought or dropped). Spells and their books are tuned in `tuning/spells.csv`.
- **Schools and magic levels:**
  - **Normal magic:** levels 1–10.
  - **Elf magic:** levels 1–3, Elf only, including the max-damage buff (§7.4).
- **Who can learn which level** (rules in `data/classes.json` → `magic`):
  - Knight: normal magic level 1 at player level 50; nothing else.
  - Elf: one normal magic level every 8 player levels (8, 16, 24…), at most level 6; one elf magic
    level every 15 player levels (15 → 1, 30 → 2, 45 → 3).
  - Mage: one normal magic level every 4 player levels (level 2 at 8, … level 10 at 40).
- **Starting spells:** only the Mage, with 初級治癒術 and 火球術 (both normal level 1). Other classes start with none.
- **Vendors in 晨風村:** 魔法導師 sells normal magic levels 1–4; 精靈長老 sells elf magic level 1.
  Higher books are for later towns and drops.
- Effects: heal, single-target damage, area damage (radius around the target), max-damage buff,
  Def buff, MR buff. Each spell has an MP cost, a cooldown (stronger spells have longer cooldowns), a cast time, and a range.
- Level cap raised to **99** for these rules; the default Exp curve is 50 × 1.25^(level − 1).

### 7.18 Monsters

- **AI states:** idle, wander, aggro (aggressive or passive type), chase, attack, give up, return home, respawn.
- Each monster has stats (including **evasion**), an Alignment value, and a drop table (gold range plus items with individual chances).
- **Bosses:** one so far, 岩窟巨魔 in 暗影洞窟 under 東郊草原. Respawns 1–2 hours of **play time** after
  it dies (the timer pauses while the game is closed). Tuned for the beginner area: hard but winnable
  at level 12 with a stack of potions (`npm run sim:balance` → "Boss" table: about 45–75% wins at
  level 12 depending on class, 30–60% at level 10, 60–90% at level 15).

### 7.19 NPCs (MVP)

- General shop (buy/sell)
- Save NPC
- Spell vendors (normal magic, elf magic)
- Warehouse keeper
- Blacksmith (weapon repair)
- 風之祭司: free stage 1 speed-up for 10 minutes (role `haste` in `data/npcs.json`)
- Quests: after the MVP.

### 7.20 Saving

- **Where you can save:** at the save NPC, or with the save item.
- Closing the game loses progress since the last save. This is intentional.
- **Storage:**
  - Save data lives in IndexedDB.
  - The game requests persistent storage on first launch.
- **Export/import:** in the Settings menu and on the title screen.
  - Export downloads a save file (readable JSON). `savedAt` is the save time in milliseconds since 1970-01-01 UTC.
  - The file ends with a `checksum`. Import refuses files whose checksum is missing or wrong
    (「存檔已損壞或被修改」), so hand-edited files don't load. Not encryption: the salt ships with
    the game, so it only stops casual editing. Real protection comes with the server in the online phase.
  - Import checks the save version, migrates the data if needed, and asks before overwriting.
- **Title screen:**
  - Continue (if a save exists), with the character's name, class, level and map.
  - New Character (overwrites the single slot after confirmation).
  - Import, export, credits, delete save.

### 7.21 Message log & settings

- **Message log:** system messages (damage, loot, Exp, level, enhancement results, weapon wear warnings) plus a text input. The input runs debug commands in dev builds and becomes friend chat in the online phase.
- **Settings:** BGM volume, SFX volume, mute, minimap toggle, export/import save, credits.

---

### 7.22 AFK auto-hunt

- Toggled with the HUD 「自動」 button; options in 設定 (saved with the character):
  HP % for healing (heal spell first, then potions), MP % for MP potions, auto pickup on/off,
  "out of HP potions → read a return scroll and stop" on/off.
- While on: targets the nearest monster (monsters already attacking first), casts the strongest
  attack spell it can afford while keeping MP for one heal, otherwise auto-attacks; picks up loot
  within 6 tiles; wanders the map's spawn areas when nothing is near.
- Monsters it can't reach are ignored for 10 seconds. Ranges and times are in `data/balance.json` (`afk*`).
- Stops on any manual move, death, leaving the map, or being too heavy to fight. Can't start on a map without monsters.
- Runs inside the game tick (pure logic), so it only works while the game is open.
- **Screensaver** (added 2026-10-31 at the owner's request; 設定 「螢幕保護」 on/off, remembered on
  the device, default on): while auto-hunting, 20 seconds without a touch, click or key brings
  up a dark page with the character walking in the middle, name, class and level, map and
  position, HP / MP, whether auto-hunting is still running, and the gold, Exp, levels and kills
  gained since it came up, with the time. It is an HTML layer above the game, so it also shows in
  portrait. A tap closes it (the tap doesn't reach the game). `src/ui/screensaver.ts`.

## 8. Audio

- **BGM:** town, field, and combat.
  - Combat music fades in when combat starts.
  - It fades back to field music after 5 seconds without combat *(tunable)*.
- **SFX:** hit, miss, bow shot, spell cast, level-up, pickup, enhancement success/fail/destroy, death, UI click.
- **Format (changed 2026-10-29, owner's choice):** chiptune music and sound effects synthesized in
  the browser with Web Audio from note lists in `data/audio.json` (original compositions, no audio
  files, works on every iPhone). The earlier MIDI → OGG plan is dropped.
- Tracks: town, field, combat, dungeon. Music and effect volume are in 設定 (remembered per device).
- **Mobile:** audio starts on the first user tap (the title screen "Start" button).

---

## 9. MVP Content

| Content | Amount |
|---|---|
| Maps | 1 village (safe zone) + 3 hunting zones (easy / medium / hard) |
| Monsters | 6–10 types |
| Items | 20–40 |
| Spells | 10–15 |
| NPCs | 5 (shop, save, spell vendor, warehouse, blacksmith) |
| Audio | 3 BGM tracks, 15–20 SFX |

---

## 10. Art, Fonts & Licensing

- **Art source:** LPC assets as the main family, for consistent style. Other assets must also be open-licensed.
- **Public repo rule:** only CC0, CC-BY, CC-BY-SA, GPL, or SIL OFL assets. Never use packs whose license forbids redistributing the raw files.
- **Attribution:**
  - `CREDITS.md` lists every asset with its author, license, and source.
  - The same credits appear in the in-game credits screen.
- **Share-alike:** modified LPC art keeps its original license.
- **No third-party IP:** no names, art, sounds, maps, or terms copied from any existing game. All in-game names are original Traditional Chinese names.
- **Font:**
  - A pixel font with full Traditional Chinese coverage under the SIL OFL, selected in Milestone 0.
  - It is subset at build time to the characters in the strings file.
  - The full font is lazy-loaded only for chat input.
- **Music:** CC0/CC-BY MIDI files or original compositions.

---

## 11. Developer Tools & Testing

- **Debug console (dev builds only):** spawn items/monsters, set level, set Alignment, give gold, teleport, invincibility, show tile grid / safe zones / spawn areas.
- **Unit tests:** combat formulas, Exp loss and level-down floor, enhancement outcomes (fixed RNG seed), weight tiers, death item drop curve by Alignment, protection removal on death, hit/evasion, cooldowns, durability and repair, ground-item cleanup, save migration.
- **Target browsers:** desktop Chrome/Edge, Android Chrome, iOS Safari (browser tab and installed PWA).
- **Performance:** 60 FPS on a mid-range phone.
- **PWA updates:** when a new version is deployed, the game shows "New version available — reload".

### 11.1 Map editor (Milestone 9; owner's decisions 2026-10-30)

A developer tool to make maps faster. It is **not** part of the game players download.

- **Form:** a page in the browser, started with `npm run editor` (no `.exe`). It draws maps with the
  game's own rendering, reads the real assets / monsters / items, and writes `maps/*.json` in the same
  Tiled format, so a map can still be opened in Tiled afterwards.
- **Location:** its own folder `tools/map-editor/` with its own `README.md` (how to start it, each
  screen, the presets, what it writes). It has no player-facing features.
- **Auto-generation (main purpose):** presets with settings and a **seed** (same seed = same map,
  "reroll" for another):
  - outdoor field (meadow / forest / wasteland): size, tree and rock density, water (pond / river),
    road shape;
  - dungeon / cave: size, number of rooms, maze difficulty (corridor turns, dead ends), **boss room**
    yes/no;
  - village (safe zone): size, number of houses, plaza.
  The existing one-time scripts (`tools/gen-maps.mjs`, `gen-fields.mjs`, `gen-dungeon.mjs`) become
  these presets.
- **Game data on the map:**
  - **exits:** click the exit tiles, pick the destination map, click the arrival tile on its
    preview; option to create the way back automatically;
  - **spawn areas:** draw a rectangle, pick a monster from a list showing its level and sprite, set
    count and respawn time. **Boss option:** boss monsters (`boss` in `monsters.csv`) get a respawn
    range in hours (play time, like 岩窟巨魔) and the boss-room preset pre-places their area.
    The numbers are written to `tuning/spawns.csv` (still the source of truth), then the editor runs
    `npm run tuning`. Monster stats stay in the tuning sheets;
  - NPCs, start / respawn points, and named **arrival points** that teleport NPCs and teleport spells
    can target, so **closed maps** (no exits, reached only by teleport) are supported. Every map still
    needs a `respawnMap`;
  - **level range** (map property, suggested from the monsters placed): for developers only (editor,
    `tuning/CATALOG.md`); never shown to players.
- **Hand painting:** only light touch-ups (paint, erase, fill, rectangle, undo). Detailed painting
  stays in **Tiled**; the editor does not try to replace it.
- **Checks before saving:** the same rules as `tests/maps.test.ts` (exits reachable and leading to
  walkable tiles, spawn monsters / NPCs exist, `respawnMap` set).
- **Groundwork:** new maps register themselves (no edits to `src/content.ts` / `tests/maps.test.ts`),
  and the editor adds the map's name to `data/strings.zh-TW.json`.

### 11.2 NPC editor and NPC abilities (Milestone 10; planned 2026-10-31, not started)

The owner asked for NPCs to be made in the editor, the way maps are. Planned only; the owner
will test the map editor first.

- **Where:** a second page of the same developer tool (`npm run editor`, tab 「NPC」), documented in
  `tools/map-editor/README.md`. It writes `data/npcs.json` and the NPC texts in
  `data/strings.zh-TW.json`; the map page keeps placing NPCs on maps (it already picks from
  `data/npcs.json`).
- **Name:** typed in (Traditional Chinese), with a title like 「風之祭司 菲恩」. Stored as a string key.
- **Look:** pick body, hair, clothes, armor, hat / helmet, weapon and shield from the existing
  character layers (`assets/sprites/characters/`), with a live preview of the walking character
  in all four directions. No new art is needed to make an NPC.
- **Dialog:** a greeting line, plus a line per ability button.
- **Abilities** (one NPC can have several; each is a button in its dialog):
  - **none:** only talks (flavour, hints);
  - **shop / warehouse / blacksmith / save / speed-up:** the abilities that exist today, with
    their settings (which shop list, which speed stage and how long);
  - **teleport:** a list of destinations, each a map + arrival point (§11.1) and a gold cost,
    optionally a minimum level; closed maps are reached this way;
  - **experience recovery** (owner's decision 2026-10-31): gives back **50 %** of the Exp lost in the
    **last** death (the % is a setting). It works once per death: the save remembers the last loss
    and whether it was recovered. With no death since, or already recovered, the NPC says
    「看來你不需要找我呢」. Recovering can raise the level back if the loss had lowered it.
    Open points for later: a gold price, and whether a new death before recovering replaces the
    remembered loss (planned: yes, only the last death counts);
  - **class task (quest):** for one or more classes, from a player level (optionally up to a level):
    - goal: **hunt** N of a monster, and / or **bring** N of an item (taken when handed in);
    - reward: gold, items, Exp, Alignment; once only or repeatable (with a waiting time);
    - start text, "in progress" text with the current count, and finish text.
- **Game side:**
  - new `NpcDef` fields for the dialog, ability list and task definitions; the logic checks
    distance, class, level and cost (as the shop does), so a server can trust it later;
  - **tasks need saving:** accepted tasks, kill counts and finished tasks go in the save
    (`SAVE_VERSION` bump with a migration that starts everyone with no tasks);
  - a 「任務」 window listing current tasks and their progress; kills of the hunted monster count
    up in the message log; the NPC shows a ! when a task is available or ready to hand in.
- **Checks before saving:** name set, every layer file exists, teleport destinations exist, task
  monsters / items exist, rewards are sane; `npm test` checks the same.
- **Order:** 10a NPC data format + dialog with several ability buttons in the game; 10b NPC page
  (name, look with preview, dialog, existing abilities); 10c teleport; 10d experience recovery (save
  format: last loss + recovered flag); 10e class tasks (save format, task window, NPC !).

---

## 12. Milestones & Rough Timeline

Assumes ~1 hour/day with Claude Code. Estimates are rough.

| # | Milestone | Done when | Time |
|---|---|---|---|
| 0 | Setup | Project builds; tests and lint run; deployed; installable PWA; landscape lock; font chosen | 1 wk |
| 1 | Walk around | Village + 1 field map; tile movement with A*; click/tap move; collision; camera; safe zone; map transition; real-phone view test | 1–2 wk |
| 2 | First fight | One monster with AI, spawning rules, and leash; auto-attack; damage numbers; monster respawn; player death, Exp loss, respawn | 2 wk |
| 3 | Progression | Leveling with HP/MP history; gold and item drops; ground items and cleanup; message log | 1–2 wk |
| 4 | Inventory & gear | Inventory UI; weight tiers; slots; equip/unequip with class/level limits; Def/MR; potions with cooldowns; 6-slot hotbar | 2–3 wk |
| 5 | Town & saving | Shop, save NPC, save item, warehouse, blacksmith repair; village regen; IndexedDB save; export/import; return/teleport scrolls; title screen | 2 wk |
| 6 | Classes & spells | Character creation with bonus points; 3 classes; arrows and bow melee; common/Mage/Spirit spells; MP, cooldowns, targeting; max-damage buffs | 3–4 wk |
| 7 | Systems & content | Enhancement; weapon durability; Alignment; equipped-item drop on death; protection item; all monsters, items, and zones; minimap | 3–4 wk |
| 8 | Audio & polish | BGM switching, SFX, settings, offline PWA, update prompt, mobile UI tuning, balancing, credits | 2–3 wk |
| 9 | Map editor (§11.1) | 9a groundwork: maps register themselves, level-range / arrival-point properties, generators as presets. 9b editor page: choose a preset, settings, seed, preview, save. 9c game data: exits and links, spawn areas with monster / boss picker (writes `spawns.csv`), NPCs, arrival points, checks. 9d light touch-up painting with undo | 2–3 wk |
| 10 | NPC editor & abilities (§11.2, planned) | 10a NPC data format and multi-button dialog. 10b editor NPC page: name, look with preview, dialog, existing abilities. 10c teleport NPCs. 10d experience recovery NPC (50 % of the last death's loss). 10e class tasks: hunt / bring, rewards, saved progress, task window | 2–3 wk |

**Total MVP: about 4–6 months.** Milestones 0–2 are the feasibility test. Milestone 9 was added after
0–8 were done (2026-10-30); it is a developer tool, so players see no change from it. Milestone 9 is done: `npm run editor`,
see `tools/map-editor/README.md`. Milestone 10 (NPC editor and NPC abilities, §11.2) is planned and
waits until the owner has tried the map editor.

---

## 13. Phase 2: Online (Future, Outline Only)

- **Server:** Node.js + WebSocket. One small server process runs the same `logic/` code and is authoritative.
- **Access:** friends only, via an invite password.
- **Accounts:** cloud save replaces local save as the main storage.
- **PvP:**
  - Any player may attack any other player outside safe zones, using the PvP toggle or `Ctrl` + click.
  - Attacking a player marks the attacker as an **aggressor** for 60 seconds.
  - Killing an aggressor or an Evil player costs no Alignment.
  - Killing a Good or Neutral non-aggressor player causes a large Alignment loss *(tunable)*.
  - Normal death rules (§7.7) apply to PvP deaths.
- **Multiple character slots:** added in this phase.
- A detailed Phase 2 design document will be written when Phase 2 starts.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Tap targets small at 32×18 on phones | Snapping, larger hit areas, real-phone test, 26×15 fallback |
| Asset license issues on a public repo | Open-license-only rule; `CREDITS.md` |
| Mixed art styles | One main asset family |
| Large CJK font | Build-time subsetting |
| Save data wiped by browser | Persistent storage + export/import |
| Logic tied to engine | Lint rule on `logic/` |
| Scope creep | §9 content list frozen until MVP is done |
| Limited daily time | Small milestones, debug console, this document kept current |
| Online is much harder | Separate phase; friends-only scale |

---

## 15. Next Step

Write the detailed implementation plan for **Milestones 0–2**:

- project setup on Windows,
- file-by-file structure,
- JSON schemas (maps, monsters, spawns, Exp table),
- tick/game-loop design,
- input-to-command mapping.
