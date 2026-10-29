// Rewrites the embedded tileset of every maps/*.json from tools/tileset-def.mjs (tile count,
// image size, blocked / blocksProjectile properties). Map layers and objects are untouched.
// Run: npm run sync:tileset   (after changing tileset-def.mjs or the tileset image layout)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tilesetJson } from './tileset-def.mjs';

for (const f of readdirSync('maps').filter((n) => n.endsWith('.json'))) {
  const path = `maps/${f}`;
  const map = JSON.parse(readFileSync(path, 'utf8'));
  map.tilesets = [tilesetJson()];
  writeFileSync(path, JSON.stringify(map));
  console.log('synced', path);
}
