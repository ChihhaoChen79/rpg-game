# Balance simulation

Real game logic, 300 one-on-one fights each, starting 3 tiles apart with a clear shot. Mage casts fire bolt whenever possible, staff otherwise.

## Level 1

| Build | Max HP | Monster | Time to kill (s) | Damage taken | Deaths | MP spent |
|---|---|---|---|---|---|---|
| Knight (STR18 CON18) | 38 | slime | 1.5 | 1.6 | 0% | 0.0 |
| Knight (STR18 CON18) | 38 | wolf | 3.4 | 8.8 | 0% | 0.0 |
| Knight (STR18 CON18) | 38 | imp | 6.0 | 22.6 | 0% | 0.0 |
| Elf, plain arrows (DEX18 CON14) | 28 | slime | 1.1 | 0.2 | 0% | 0.0 |
| Elf, plain arrows (DEX18 CON14) | 28 | wolf | 3.1 | 6.1 | 0% | 0.0 |
| Elf, plain arrows (DEX18 CON14) | 28 | imp | 5.9 | 18.3 | 4% | 0.0 |
| Elf, silver arrows (DEX18 CON14) | 28 | slime | 1.0 | 0.1 | 0% | 0.0 |
| Elf, silver arrows (DEX18 CON14) | 28 | wolf | 2.4 | 4.9 | 0% | 0.0 |
| Elf, silver arrows (DEX18 CON14) | 28 | imp | 5.0 | 15.4 | 1% | 0.0 |
| Mage (INT18 WIS16) | 20 | slime | 0.9 | 0.9 | 0% | 3.8 |
| Mage (INT18 WIS16) | 20 | wolf | 3.1 | 7.7 | 0% | 7.6 |
| Mage (INT18 WIS16) | 20 | imp | 5.2 | 20.3 | 44% | 10.7 |

## Level 10

| Build | Max HP | Monster | Time to kill (s) | Damage taken | Deaths | MP spent |
|---|---|---|---|---|---|---|
| Knight (STR18 CON18) | 131 | slime | 1.4 | 1.5 | 0% | 0.0 |
| Knight (STR18 CON18) | 131 | wolf | 3.2 | 8.1 | 0% | 0.0 |
| Knight (STR18 CON18) | 131 | imp | 5.7 | 20.7 | 0% | 0.0 |
| Elf, plain arrows (DEX18 CON14) | 101 | slime | 1.1 | 0.1 | 0% | 0.0 |
| Elf, plain arrows (DEX18 CON14) | 101 | wolf | 3.1 | 6.2 | 0% | 0.0 |
| Elf, plain arrows (DEX18 CON14) | 101 | imp | 5.6 | 16.9 | 0% | 0.0 |
| Elf, silver arrows (DEX18 CON14) | 101 | slime | 1.0 | 0.0 | 0% | 0.0 |
| Elf, silver arrows (DEX18 CON14) | 101 | wolf | 2.3 | 5.0 | 0% | 0.0 |
| Elf, silver arrows (DEX18 CON14) | 101 | imp | 4.7 | 14.1 | 0% | 0.0 |
| Mage (INT18 WIS16) | 68 | slime | 1.0 | 0.9 | 0% | 3.8 |
| Mage (INT18 WIS16) | 68 | wolf | 3.1 | 7.7 | 0% | 7.5 |
| Mage (INT18 WIS16) | 68 | imp | 5.8 | 22.0 | 0% | 12.3 |

## Boss

750 HP. Played by the AFK logic (HP potion / heal below 70%), 100 fights per row. Kit: starting gear,
10 large + 20 small HP potions on top of the starting ones (Knight +2 rage potions, Elf 400 silver arrows;
Mage only 6 small but 10 MP potions to stay under 80% weight) and every village spell the class can learn at that level.
Target for the beginner area: hard but winnable at level 12.

| Build | Lv | Max HP | Wins | Time (s) | Large / small potions used | Boss HP left when losing |
|---|---|---|---|---|---|---|
| Knight (STR18 CON18) | 10 | 131 | 36% | 94 | 9 / 29 | 120 |
| Elf, silver arrows (DEX18 CON14) | 10 | 101 | 62% | 66 | 5 / 26 | 449 |
| Mage (INT18 WIS16) | 10 | 68 | 30% | 28 | 2 / 12 | 348 |
| Knight (STR18 CON18) | 12 | 150 | 60% | 97 | 9 / 30 | 111 |
| Elf, silver arrows (DEX18 CON14) | 12 | 115 | 73% | 72 | 6 / 28 | 410 |
| Mage (INT18 WIS16) | 12 | 78 | 46% | 32 | 3 / 13 | 352 |
| Knight (STR18 CON18) | 15 | 178 | 86% | 101 | 10 / 30 | 33 |
| Elf, silver arrows (DEX18 CON14) | 15 | 136 | 88% | 80 | 7 / 30 | 296 |
| Mage (INT18 WIS16) | 15 | 93 | 61% | 34 | 3 / 13 | 315 |
