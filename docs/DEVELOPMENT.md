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
| `npm run gen:art` | Regenerate placeholder art (overwrites PNGs) |

## Dev-only keys

- `G`: toggle tile grid / blocked (red) / safe zone (blue) / exits (green) overlay.
- Browser console: `__game` is the Phaser game; `__game.registry.get('state')` is the live game state.

## Layout of the code

- `src/logic/`: pure game rules (state, commands, tick, map parsing, A*, movement). No Phaser,
  no `window`, no `Math.random` (lint-enforced). Everything here is unit-tested.
- `src/render/`: Phaser scenes. `WorldScene` runs the 10 Hz fixed tick and interpolates drawing.
- `src/input/`: mouse/touch → Commands. `src/ui/`: HUD and strings.
- `data/`: tunable numbers (`game-config.json`) and UI text (`strings.zh-TW.json`).
- `maps/`: Tiled maps, see `docs/MAPS.md`.

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
