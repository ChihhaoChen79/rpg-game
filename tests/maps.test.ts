// Content validation for every shipped map (rules in src/logic/mapcheck.ts, shared with the map
// editor): catches broken edits made in Tiled or the editor.
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import strings from '../data/strings.zh-TW.json';
import { CONTENT, TILED_MAPS } from '../src/content';
import { parseTiledMap } from '../src/logic/map';
import { checkMap } from '../src/logic/mapcheck';
import type { MapData } from '../src/logic/types';

const maps: Record<string, MapData> = Object.fromEntries(Object.entries(TILED_MAPS).map(([id, m]) => [id, parseTiledMap(id, m)]));

it('every file in maps/ is loaded by the game', () => {
  const files = readdirSync(new URL('../maps/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  expect(Object.keys(TILED_MAPS).sort()).toEqual(files.sort());
});

describe.each(Object.keys(maps))('map %s', (id) => {
  it('follows the map rules', () => {
    expect(checkMap(maps, id, CONTENT, strings as Record<string, string>)).toEqual([]);
  });
});
