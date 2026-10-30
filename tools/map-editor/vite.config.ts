// Map editor dev server: `npm run editor` (developer tool, not part of the game build).
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { editorApi } from './server';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export default defineConfig({
  root,
  base: '/',
  define: { __APP_VERSION__: JSON.stringify('editor') },
  plugins: [editorApi(root)],
  // Only scan the editor page (the game's index.html needs the PWA plugin, which the editor doesn't load).
  optimizeDeps: { entries: ['tools/map-editor/index.html'] },
  server: {
    open: '/tools/map-editor/index.html',
    // Saving rewrites maps and data files; the editor reloads itself and reopens the map.
    watch: { ignored: ['**/tuning/CATALOG.md'] },
  },
});
