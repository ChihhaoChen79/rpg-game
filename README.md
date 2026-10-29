# rpg-game

A pixel-art RPG for desktop and mobile browsers (installable PWA), inspired by classic 2D online RPGs.
UI language: Traditional Chinese. Built with TypeScript + Phaser 3 + Vite.

- Design and plan: [`docs/PLAN.md`](docs/PLAN.md)
- Setup and commands: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- Map editing rules: [`docs/MAPS.md`](docs/MAPS.md)
- Making your own art: [`assets/ASSETS.md`](assets/ASSETS.md)
- **Tuning numbers** (items, equipment, spells, monsters, drops, spawns, Exp): [`tuning/README.md`](tuning/README.md),
  overview with art in [`tuning/CATALOG.md`](tuning/CATALOG.md)
- Asset credits: [`CREDITS.md`](CREDITS.md)

## Status

Playable: title screen, a dungeon (暗影洞窟) under 東郊草原 with a boss (respawns 1–2 h of play time), character creation (name, Knight / Elf / Mage, 6 bonus points; the name shows over the character, white → blue for good / red for evil), village + one
hunting field, monsters with AI, auto-attack, spells, potions, drops, leveling, death penalty,
inventory/equipment shown on the character (LPC layered sprites) with slash / thrust / shoot /
cast / death animations, arrows and spells blocked by trees, 6-slot hotbar (mouse wheel +
middle-click on PC, middle-click a monster to cast at it; swipe the hotbar on phones to choose a spell,
then tap monsters to cast it), arrow types that add bow damage,
saving (save NPC, save scroll, export/import, delete), 24 spells in 2 schools learned from spellbooks
(魔法導師 and 精靈長老 in 晨風村), AFK auto-hunt (「自動」 button; options in 設定). Level cap 99.
Class balance is checked with `npm run sim:balance`.

| Milestone | State |
|---|---|
| 0 Setup | Done, except the pixel font (chosen, not yet bundled) |
| 1 Walk around | Done. Real-phone tap test: in progress |
| 2 First fight | Done (3 monster types, spawning rules, leash, death + respawn) |
| 3 Progression | Done (leveling with HP/MP history, gold/item drops, ground items, message log) |
| 4 Inventory & gear | Mostly done (inventory, weight tiers, equip limits, Def/MR, potion cooldowns, hotbar) |
| 5 Town & saving | Done: shop (buy / sell at 50%), warehouse (100 slots), blacksmith repair, save NPC + save scroll, IndexedDB, export/import, title screen, return/teleport scrolls, faster village regen |
| 6 Classes & spells | Done: 3 classes, arrows + bow melee, 24 spells (normal magic levels 1–10, elf magic 1–3) with per-class learning rules, spellbooks, 2 magic vendors, area damage and Def/MR buffs. Extra: AFK auto-hunt |
| 7 Systems & content | Partly: weapon durability wear, Alignment from kills, 6 monster types + 1 boss, dungeon. To do: enhancement, Alignment item drop, protection item, medium/hard fields, minimap |
| 8 Audio & polish | Not started |

```
npm install
npm run dev
```
