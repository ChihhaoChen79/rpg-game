// The CSV sheets in tuning/ are the source of truth; data/ and maps/ must match what
// `npm run tuning` would generate from them. If this fails: run `npm run tuning`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importSheets, SHEETS } from '../tools/tuning-lib.mjs';
import { parseCsv, toCsv } from '../tools/csv.mjs';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const json = (p: string) => JSON.parse(read(p));
const maps = Object.fromEntries(readdirSync(new URL('maps/', root)).filter((f) => f.endsWith('.json'))
  .map((f) => [f.slice(0, -5), json(`maps/${f}`)]));
const csv = Object.fromEntries(Object.keys(SHEETS).map((k) => [k, read(`tuning/${k}.csv`)]));
const result = importSheets(csv, { maps, exists: (p: string) => existsSync(new URL(p, root)) });
const HINT = 'tuning/*.csv and data/ differ: run `npm run tuning`';

describe('tuning sheets', () => {
  it('have no errors', () => {
    expect(result.errors).toEqual([]);
  });
  it('match data/items.json, data/monsters.json and data/exp-table.json', () => {
    expect(result.items, HINT).toEqual(json('data/items.json'));
    expect(result.monsters, HINT).toEqual(json('data/monsters.json'));
    expect(result.totalExp, HINT).toEqual(json('data/exp-table.json').totalExp);
  });
  it('match the names in the strings file', () => {
    const strings = json('data/strings.zh-TW.json');
    for (const [k, v] of Object.entries(result.names)) expect(strings[k], `${k}: ${HINT}`).toBe(v);
  });
  it('match the spawn numbers in the maps', () => {
    for (const [id, m] of Object.entries(result.maps)) expect(m, `maps/${id}.json: ${HINT}`).toEqual(maps[id]);
  });
});

describe('csv', () => {
  it('round-trips quotes, commas and newlines', () => {
    const rows = [{ a: 'x,y', b: 'say "hi"' }, { a: 'line1\nline2', b: '中文' }];
    const parsed = parseCsv(toCsv(['a', 'b'], rows));
    expect(parsed).toEqual([['a', 'b'], ['x,y', 'say "hi"'], ['line1\nline2', '中文']]);
  });
  it('reports bad numbers with the file, line and column', () => {
    const bad = { ...csv, monsters: csv.monsters!.replace(/\n(slime,[^,]*,)1,/, '\n$1one,') };
    const r = importSheets(bad, { maps, exists: () => true });
    expect(r.errors.join('\n')).toMatch(/tuning\/monsters\.csv line 2, column "level": "one" is not a whole number/);
  });
});
