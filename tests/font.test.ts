// The bundled pixel font is cut down to the characters the game uses (tools/subset-font.py).
// If this fails, new text uses a character the font file lacks: run `python3 tools/subset-font.py`.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const covered = new Set(readFileSync(new URL('assets/fonts/fusion-pixel-tc-subset.chars.txt', root), 'utf8'));

describe('pixel font subset', () => {
  it('covers every character in data/*.json', () => {
    const missing = new Set<string>();
    for (const f of readdirSync(new URL('data/', root)).filter((n) => n.endsWith('.json'))) {
      for (const ch of readFileSync(new URL(`data/${f}`, root), 'utf8')) {
        if (ch.charCodeAt(0) > 127 && !covered.has(ch) && ch.trim()) missing.add(ch);
      }
    }
    expect([...missing].join(''), 'run: python3 tools/subset-font.py').toBe('');
  });
});
