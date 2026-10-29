import { CONTENT, GAME_CONFIG, START_MAP, TILED_MAPS } from '../src/content';
import { createGame, tick } from '../src/logic/game';
import { classDef } from '../src/logic/content';
import type { ClassId, GameState, MapData, Stats } from '../src/logic/types';

/** Build a map from ASCII rows: '#' wall, 'T' tree (wall that also blocks arrows), '.' floor, 's' safe floor. */
export function asciiMap(rows: string[], id = 'test'): MapData {
  const h = rows.length;
  const w = rows[0]!.length;
  const blocked = new Uint8Array(w * h);
  const safe = new Uint8Array(w * h);
  const opaque = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '#' || c === 'T') blocked[y * w + x] = 1;
      if (c === 'T') opaque[y * w + x] = 1;
      if (c === 's') safe[y * w + x] = 1;
    }
  });
  return {
    id, nameKey: id, respawnMap: id, width: w, height: h, blocked, safe, opaque, exits: [], spawns: [], npcs: [],
    start: null, respawn: null,
  };
}

/** Base stats plus the 6 bonus points dumped into the first stats that have room. */
export function defaultStats(classId: ClassId): Stats {
  const st = { ...classDef(CONTENT, classId).base };
  let left = 6;
  for (const k of ['str', 'dex', 'con', 'int', 'wis'] as const) {
    const add = Math.min(left, 18 - st[k]);
    st[k] += add;
    left -= add;
  }
  return st;
}

export function newGame(classId: ClassId = 'knight', seed = 1): GameState {
  return createGame({
    config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed,
    newCharacter: { classId, stats: defaultStats(classId), startMap: START_MAP },
  });
}

/** Run ticks until `until` returns true or `max` ticks pass. Returns ticks run. */
export function runUntil(s: GameState, until: () => boolean, max = 2000): number {
  let n = 0;
  while (!until() && n < max) {
    tick(s, []);
    n++;
  }
  return n;
}
