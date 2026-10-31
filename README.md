# rpg-game

A pixel-art RPG for desktop and mobile browsers (installable PWA), inspired by classic 2D online RPGs.
UI language: Traditional Chinese. Built with TypeScript + Phaser 3 + Vite.

- Design and plan: [`docs/PLAN.md`](docs/PLAN.md)
- Setup and commands: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- Map editing rules: [`docs/MAPS.md`](docs/MAPS.md); map editor: [`tools/map-editor/README.md`](tools/map-editor/README.md)
- Making your own art: [`assets/ASSETS.md`](assets/ASSETS.md)
- **Tuning numbers** (items, equipment, spells, monsters, drops, spawns, Exp): [`tuning/README.md`](tuning/README.md),
  overview with art in [`tuning/CATALOG.md`](tuning/CATALOG.md)
- Asset credits: [`CREDITS.md`](CREDITS.md)

## Status

Playable: lobby with 3 character slots, a dungeon (暗影洞窟) under 東郊草原 with a boss (respawns 1–2 h of play time), character creation (name, Knight / Elf / Mage, 6 bonus points; the name shows over the character, white → blue for good / red for evil), village + one
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
| 0 Setup | Done (pixel font Fusion Pixel bundled, cut down to 175 KB) |
| 1 Walk around | Done. Real-phone tap test: in progress |
| 2 First fight | Done (3 monster types, spawning rules, leash, death + respawn) |
| 3 Progression | Done (leveling with HP/MP history, gold/item drops, ground items, message log) |
| 4 Inventory & gear | Done (inventory, weight tiers + weight bar, equip limits, Def/MR, potion cooldowns, hotbar). Later: pants + accessories (necklace, 2 rings, belt, 2 earrings) on a paper-doll layout, weapon accuracy / extra attack, Alignment bar, list-style shop, speed-up buffs (加速藥水, 風之祭司) |
| 5 Town & saving | Done: shop (buy / sell at 50%), warehouse (100 slots), blacksmith repair, save NPC + save scroll, IndexedDB, export/import, title screen, return/teleport scrolls, faster village regen |
| 6 Classes & spells | Done: 3 classes, arrows + bow melee, 24 spells (normal magic levels 1–10, elf magic 1–3) with per-class learning rules, spellbooks, 2 magic vendors, area damage and Def/MR buffs. Extra: AFK auto-hunt |
| 7 Systems & content | Done: enhancement scrolls (safe level, halving odds, destruction), equipment drop on death by Alignment + protection scroll, weapon durability, 12 monster types + 1 boss, 3 hunting fields (東郊草原 / 迷霧森林 / 焦土荒原) + dungeon, 11 new gear pieces, minimap |
| 8 Audio & polish | Done: chiptune music (village / field / combat / dungeon) and sound effects with volume settings, your own audio files can replace any of them (assets/ASSETS.md §7), shop basket, phone keyboard fix, iPhone safe area (Dynamic Island), carry weight retune |
| 9 Map editor (developer tool) | Done: `npm run editor` ([tools/map-editor/README.md](tools/map-editor/README.md)): presets with seed (field / dungeon with boss room / village), exits with way back, spawn areas with boss option, NPCs, arrival points, touch-up painting with undo, checks, saves maps + names + spawns.csv |

```
npm install
npm run dev
```
