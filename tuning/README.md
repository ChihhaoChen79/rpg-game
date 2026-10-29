# Tuning sheets

The game's numbers for **items, equipment, monsters, drops, spawns and the Exp table** live in the
CSV files in this folder. They are the source of truth: `data/items.json`, `data/monsters.json`,
`data/exp-table.json`, the item/monster names in `data/strings.zh-TW.json` and the spawn numbers
in `maps/*.json` are **generated** from them.

**[CATALOG.md](CATALOG.md)** shows everything in one readable page: icons and sprites, computed
values (sell prices, encounter rates, drops per 100 kills, kills per level) and links to every
art file. It's regenerated each time you run `npm run tuning`.

## Workflow

1. Open a sheet in **Excel** (double-click) or **VS Code** (the "Rainbow CSV" or "Edit CSV"
   extensions make it easier).
2. Change numbers. Keep the header row and the `id` column as they are.
3. **Excel: save as "CSV UTF-8 (逗號分隔) (*.csv)".** Plain "CSV" saves in Big5 and breaks the Chinese text.
4. Run `npm run tuning`. It checks every cell and stops with a message such as
   `tuning/monsters.csv line 4, column "hp": "abc" is not a whole number` if something is wrong;
   nothing is changed until all sheets are valid.
5. Run `npm test`, then `npm run dev` to try it. `npm run sim:balance` simulates fights for each
   class and writes `tools/sim/balance-report.md`.
6. Commit the CSV files **and** the generated files together.

`npm run tuning:export` rebuilds the sheets from the current data (for recovery). It overwrites your sheets.

## Sheets

Units: times are in **seconds** (decimals allowed), weights in display units (an arrow is 0.2),
chances in **percent**. `yes` / `no` for switches. `classes`: `knight`, `elf`, `mage` separated by
spaces; empty means every class.

### items.csv: consumables, ammo, gold

| Column | Meaning |
|---|---|
| id | Internal id (lower-case, `_`). Don't rename: saves and other sheets refer to it |
| name, description | Text shown in game (Traditional Chinese) |
| kind | `consumable`, `ammo` or `gold` |
| effect | `heal`, `maxDamage`, `return` (back to the village), `teleport` (random spot on the map), `save` |
| hp, mp | Amount restored by `heal` |
| buff_sec | Duration of `maxDamage` (every hit uses the weapon's max damage) |
| cooldown_group, cooldown_sec | Items in the same group share one cooldown; stronger potions should have longer cooldowns |
| arrow_damage | Ammo only: added to each bow shot (bow roll + DEX bonus + arrow) |
| weight, price | Weight; buy price (shops sell back at 50%, see `sellRatio` in `data/balance.json`) |
| icon | File name in `assets/sprites/icons/` without `.png` |

### equipment.csv: weapons and armor

| Column | Meaning |
|---|---|
| slot | `weapon`, `shield`, `helmet`, `armor`, `cloak`, `gloves`, `boots` |
| level | Level required to equip |
| dmg_min, dmg_max | Weapon damage roll (before STR / DEX bonus, arrows, enhancement and the target's Def) |
| hit | Weapon hit rate in % (hit chance = hit + player hit bonus − target evasion, kept in 5–95%) |
| attack_sec | Seconds between attacks |
| range | Tiles; 1 = melee |
| two_handed | `yes` blocks the shield slot |
| anim | Attack animation: `slash` (swords), `thrust` (staffs), `shoot` (bows; uses arrows) |
| bow_melee_min / max | Bows only: damage when out of arrows |
| durability | Max durability; empty for armor |
| wear_pct | Chance per attack (%) to lose 1 durability; empty = default (`weaponWearChance` in `data/balance.json`) |
| def, mr | Defense; magic resistance in % |
| safe_enchant | Enhancement level that always succeeds (hidden from players). Default: weapons 6, armor 4 |
| icon | File in `assets/sprites/icons/` |
| sprite | Character layer drawn while equipped: file in `assets/sprites/characters/` |

### monsters.csv

| Column | Meaning |
|---|---|
| level | Shown for reference |
| hp, dmg_min, dmg_max | Health; damage roll per hit (before the player's Def) |
| hit, evasion | Hit rate and evasion in % |
| def, mr | Defense; magic resistance in % |
| attack_sec, sec_per_tile | Seconds between attacks; seconds to walk one tile (lower = faster) |
| aggressive, aggro_range | `yes` attacks players who come within `aggro_range` tiles; `no` only fights back |
| leash_range | Gives up and returns home past this many tiles from its spawn area |
| exp, alignment | Exp per kill; Alignment value (killing evil monsters, negative values, raises yours) |
| gold_min, gold_max | Gold dropped on every kill |
| boss | `yes`: respawn timer survives leaving the map and saving; boss HP bar |
| sprite, frame | File in `assets/sprites/monsters/`; frame size in px (64, bosses 96) |

### drops.csv: one row per monster + item

| Column | Meaning |
|---|---|
| monster, item | Monster id and item id (from items.csv or equipment.csv) |
| chance_pct | Chance per kill, in % (0.5 = one in 200) |
| min, max | How many drop when it does |

### spawns.csv: where monsters live and how often

| Column | Meaning |
|---|---|
| map, spawn | Map id and the **name** of a spawn rectangle drawn in Tiled (object class `spawn`) |
| monster | Monster id |
| count | How many are alive at once |
| respawn_sec, respawn_max_sec | Respawn delay after a kill; with a max, it's random between the two (the boss uses 3600–7200) |
| area | Read-only: the rectangle in tiles (x, y, width, height). Move or resize it in Tiled |

To add a new spawn: draw a rectangle in Tiled on the `objects` layer, set its class to `spawn` and
give it a name, then add a row here.

### exp.csv: Exp per level

| Column | Meaning |
|---|---|
| level | 1 to 29 (the cap is 30, `levelCap` in `data/balance.json`) |
| exp_to_next | Exp needed to go from this level to the next |
| total_exp | Read-only: running total |

The default is a **hardcore exponential curve**: Exp to next level = 50 × 1.5^(level − 1).
That's 3,745 Exp for level 10, about 220,000 for level 20 and 12.8 million for level 30.
Death costs 10% of the current level's span (never below level 10). To try another curve:

```
npm run tuning:exp -- 50 1.5      (base, growth)
npm run tuning
```

## Not in the sheets (edit the JSON directly)

- Classes and starting gear: `data/classes.json`
- Spells: `data/spells.json`
- Shop stock: `data/shops.json`; NPCs: `data/npcs.json`
- Formulas and global numbers (hit clamp, stat bonuses, regen, death penalty, sell ratio, wear...): `data/balance.json`
