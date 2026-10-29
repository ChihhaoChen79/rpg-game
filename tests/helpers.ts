import type { MapData } from '../src/logic/types';

/** Build a map from ASCII rows: '#' wall, '.' floor, 's' safe floor. */
export function asciiMap(rows: string[], id = 'test'): MapData {
  const h = rows.length;
  const w = rows[0]!.length;
  const blocked = new Uint8Array(w * h);
  const safe = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '#') blocked[y * w + x] = 1;
      if (c === 's') safe[y * w + x] = 1;
    }
  });
  return { id, nameKey: id, width: w, height: h, blocked, safe, exits: [], start: null, respawn: null };
}
