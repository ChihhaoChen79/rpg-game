// Separate config so the slow balance simulation never runs in `npm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tools/sim/**/*.test.ts'], environment: 'node' },
});
