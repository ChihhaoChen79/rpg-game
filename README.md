# rpg-game

A pixel-art RPG for desktop and mobile browsers (installable PWA), inspired by classic 2D online RPGs.
UI language: Traditional Chinese. Built with TypeScript + Phaser 3 + Vite.

- Design and plan: [`docs/PLAN.md`](docs/PLAN.md)
- Setup and commands: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
- Map editing rules: [`docs/MAPS.md`](docs/MAPS.md)
- Asset credits: [`CREDITS.md`](CREDITS.md)

## Status

Playable: title screen, character creation (Knight / Elf / Mage, 6 bonus points), village + one
hunting field, monsters with AI, auto-attack, spells, potions, drops, leveling, death penalty,
inventory/equipment, 6-slot hotbar, saving (save NPC, save scroll, export/import).

| Milestone | State |
|---|---|
| 0 Setup | Done, except the pixel font (chosen, not yet bundled) |
| 1 Walk around | Done. Real-phone tap test: in progress |
| 2 First fight | Done (3 monster types, spawning rules, leash, death + respawn) |
| 3 Progression | Done (leveling with HP/MP history, gold/item drops, ground items, message log) |
| 4 Inventory & gear | Mostly done (inventory, weight tiers, equip limits, Def/MR, potion cooldowns, hotbar) |
| 5 Town & saving | Partly: save NPC, save item, IndexedDB, export/import, title screen, return/teleport scrolls. To do: shop, warehouse, blacksmith |
| 6 Classes & spells | Partly: 3 classes, arrows + bow melee, heal / fire bolt / spirit power, max-damage buffs. To do: spellbooks, more spells |
| 7 Systems & content | Not started (enhancement, durability wear, Alignment item drop, protection item, more zones, minimap) |
| 8 Audio & polish | Not started |

```
npm install
npm run dev
```
