# Project notes for Claude

- **Git workflow:** commit and push directly to `main` (owner's choice). No feature branches or PRs
  unless asked. Every push to `main` runs lint, tests and build, then deploys to GitHub Pages
  (`.github/workflows/deploy.yml`), so run `npm run lint && npm test && npm run build` before pushing.
- **Design source of truth:** `docs/PLAN.md`. Keep the README status table current.
- **`src/logic/` stays pure:** no Phaser, no browser globals, no `Math.random`/`Date.now`
  (lint-enforced). All randomness via `src/logic/rng.ts`; all player actions are Commands.
- **Data-driven:** tunable numbers in `data/*.json`, all UI text in `data/strings.zh-TW.json`
  (Traditional Chinese only), maps in `maps/` (rules in `docs/MAPS.md`).
- **Tuning sheets are the source of truth** for items, equipment, monsters, drops, spawn numbers
  and the Exp table: edit `tuning/*.csv`, then `npm run tuning` (regenerates `data/items.json`,
  `data/monsters.json`, `data/exp-table.json`, item/monster strings, map spawn properties and
  `tuning/CATALOG.md`). Never hand-edit those generated files; `tests/tuning.test.ts` checks they match.
- **Assets:** only CC0 / CC-BY / CC-BY-SA / GPL / SIL OFL; list each one in `CREDITS.md`.
- **Style:** plain data types + functions (owner is a C programmer); classes only where Phaser needs them.
- **Owner:** Windows + VS Code, about 1 hour/day, tests on an iPhone via
  https://chihhaochen79.github.io/rpg-game/
