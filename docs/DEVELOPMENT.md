# Development guide

## Setup (Windows)

1. Install **Node.js 22 LTS** (https://nodejs.org), **VS Code**, and **Tiled** (https://www.mapeditor.org).
2. `git clone` this repo, open the folder in VS Code, then in the terminal:
   ```
   npm install
   npm run dev
   ```
3. Open the printed `http://localhost:5173/` URL. To test on a phone, connect it to the same
   Wi-Fi and open the "Network" URL that `npm run dev` prints (allow Node through the Windows firewall).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (also on your LAN) |
| `npm test` | Unit tests for `src/logic` and map validation |
| `npm run lint` | ESLint, including the "no engine/browser in `src/logic`" rule |
| `npm run build` | Typecheck + production build into `dist/` (with PWA service worker) |
| `npm run preview` | Serve the production build locally |
| `npm run gen:art` | Regenerate placeholder tiles, monsters and icons (overwrites PNGs) |
| `npm run gen:characters` | Regenerate placeholder character layers and app icons (overwrites PNGs) |

## Controls

- Mouse/touch: tap ground to walk (hold to keep walking), tap a monster to attack, tap an item to pick it up, tap an NPC to talk.
- Hotbar: click/tap a slot, or keys `1`–`6`. PC: the mouse wheel moves the yellow selection, middle-click uses it.
- Keys: `I` inventory, `C` character, `S` spells, `Space` pick up nearby item, `Esc` cancel/close.

## Dev-only keys

- `G`: toggle tile grid / blocked (red) / safe zone (blue) / exits (green) / spawn areas (yellow) overlay.
- Browser console: `__game` is the Phaser game; `__game.registry.get('state')` is the live game state,
  and `__game.registry.get('issue')({ type: 'moveTo', x: 10, y: 10 })` sends a Command.

## Layout of the code

- `src/logic/`: pure game rules. No Phaser, no `window`, no `Math.random` (lint-enforced); unit-tested.
  - `game.ts` creates the state and runs the tick; `commands.ts` lists every player Command.
  - `player.ts` (orders, items, spells, regen, respawn), `combat.ts` (hit/damage/death),
    `monsters.ts` (spawning, AI), `stats.ts` (derived stats, Exp, leveling), `inventory.ts`,
    `world.ts` (occupancy, ground items), `save.ts` (save format + migrations),
    `map.ts` / `pathfinding.ts` / `movement.ts`.
- `src/render/`: `WorldScene` runs the 10 Hz fixed tick, draws the world and turns taps into Commands;
  `character.ts` draws layered LPC characters and picks walk/attack/cast/death frames.
- `src/ui/`: `TitleScene`, `CreateScene`, `HudScene` (bars, hotbar, windows, log), widgets, strings.
- `src/save/`: IndexedDB storage and save-file export/import.
- `data/`: all tunable content: `classes`, `items`, `spells`, `monsters`, `npcs`, `exp-table`,
  `balance` (combat/progression formulas), `game-config`, `credits`, and UI text `strings.zh-TW.json`.
- `maps/`: Tiled maps, see `docs/MAPS.md`.
- `assets/`: art. **Specs for making your own art: `assets/ASSETS.md`.**

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` lints, tests and builds every push and PR, and deploys `main` to Pages.
One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Do **not** use "Deploy from a branch": that serves the raw source files, which browsers can't run
(`index.html` points at `src/main.ts`, which only works after `npm run build`). The page then stays
black, and after a few seconds shows "遊戲載入失敗".
GitHub Pages serves over HTTPS, which the PWA (install + offline) needs.

## Font (Milestone 0 decision)

Chosen: **Fusion Pixel Font** (縫合像素字體), 12px proportional, `zh_hant` variant, SIL OFL 1.1,
from https://github.com/TakWolf/fusion-pixel-font/releases. It covers Traditional Chinese fully.
Not added yet: GitHub release downloads were blocked in the environment that set up this repo.
Until then the HUD uses the system CJK font (`UI_FONT` in `src/ui/strings.ts`).
To add it: download the `.otf`/`.woff2`, put it in `assets/fonts/` with its `OFL.txt`, add a
`CREDITS.md` row, and add build-time subsetting to the characters in `data/strings.zh-TW.json` (plan §10).
