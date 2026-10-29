import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Browser/engine globals that must never appear in src/logic (it must run on a Node server later).
const browserOnlyGlobals = [
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
  'requestAnimationFrame', 'performance', 'fetch', 'location', 'Phaser',
].map((name) => ({ name, message: 'src/logic must stay engine- and browser-free (plan §4 rule 1).' }));

export default tseslint.config(
  { ignores: ['dist/', 'dev-dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.mjs', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/logic/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['phaser', 'phaser/*'], message: 'src/logic must not import the engine.' },
          { group: ['**/render/**', '**/ui/**', '**/input/**', '**/audio/**', '**/save/**', '**/debug/**'],
            message: 'src/logic must not depend on client layers.' },
        ],
      }],
      'no-restricted-globals': ['error', ...browserOnlyGlobals],
      // Logic must use the seedable RNG (plan §4 rule 4).
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use logic/rng.ts instead.' },
        { object: 'Date', property: 'now', message: 'Logic time is measured in ticks.' },
      ],
    },
  },
);
