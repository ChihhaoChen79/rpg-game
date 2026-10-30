import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { checkMap } from '../src/logic/mapcheck';
import type { MapData } from '../src/logic/types';
import { asciiMap } from './helpers';

function world(m: MapData, extra: Partial<MapData> = {}): Record<string, MapData> {
  const home = { ...asciiMap(['....', '....'], 'home'), respawn: { x: 0, y: 0 } };
  return { home, [m.id]: { ...m, respawnMap: 'home', ...extra } };
}

describe('map rules (shared with the map editor)', () => {
  it('accepts a simple map with a start point', () => {
    const m = asciiMap(['....', '....'], 'a');
    expect(checkMap(world(m, { start: { x: 0, y: 0 } }), 'a', CONTENT)).toEqual([]);
  });
  it('a closed map is fine with an arrival point, not without one', () => {
    const m = asciiMap(['....', '....'], 'a');
    expect(checkMap(world(m, { arrivals: [{ name: '營地', x: 1, y: 1 }] }), 'a', CONTENT)).toEqual([]);
    expect(checkMap(world(m), 'a', CONTENT).join()).toMatch(/no way in/);
  });
  it('finds bad exits, unknown monsters and NPCs', () => {
    const m = asciiMap(['..#.', '..#.'], 'a');
    const errs = checkMap(world(m, {
      start: { x: 0, y: 0 },
      exits: [{ x: 3, y: 0, w: 1, h: 1, targetMap: 'home', targetX: 0, targetY: 0 }, { x: 0, y: 1, w: 1, h: 1, targetMap: 'nowhere', targetX: 0, targetY: 0 }],
      spawns: [{ x: 0, y: 0, w: 1, h: 1, monster: 'dragon', count: 1, respawnTicks: 10, respawnMaxTicks: 10 }],
      npcs: [{ npcId: 'ghost', x: 1, y: 1 }],
    }), 'a', CONTENT).join('\n');
    expect(errs).toMatch(/can't be reached/);
    expect(errs).toMatch(/unknown map "nowhere"/);
    expect(errs).toMatch(/unknown monster "dragon"/);
    expect(errs).toMatch(/unknown npcId "ghost"/);
  });
  it('needs a respawn map with a respawn point', () => {
    const m = asciiMap(['....'], 'a');
    expect(checkMap({ a: { ...m, start: { x: 0, y: 0 }, respawnMap: 'b' } }, 'a', CONTENT).join()).toMatch(/respawnMap "b" doesn't exist/);
  });
});
