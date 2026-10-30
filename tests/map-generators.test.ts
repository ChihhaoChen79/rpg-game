// Map editor presets (tools/map-editor): deterministic, fully connected, loadable by the game.
import { describe, expect, it } from 'vitest';
import { parseTiledMap } from '../src/logic/map';
import { DEFAULTS, generate, PRESETS, reachable, walkable, type GenOptions } from '../tools/map-editor/src/generators';
import { fromTiled, toTiled } from '../tools/map-editor/src/model';

const opts = (preset: GenOptions['preset'], seed: number, extra: Partial<GenOptions> = {}): GenOptions =>
  ({ ...DEFAULTS, preset, seed, id: 'gen', ...(preset === 'village' ? { width: 40, height: 30 } : {}), ...extra });

describe.each(PRESETS)('preset %s', (preset) => {
  it('same seed gives the same map; another seed a different one', () => {
    const a = toTiled(generate(opts(preset, 7)));
    expect(toTiled(generate(opts(preset, 7)))).toEqual(a);
    expect(toTiled(generate(opts(preset, 8)))).not.toEqual(a);
  });

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: every walkable tile can be reached, and the game can load it`, () => {
      const m = generate(opts(preset, seed, preset === 'dungeon' ? { maze: 80 } : { water: seed % 2 ? 'river' : 'pond', road: seed % 3 ? 'ew' : 'cross' }));
      const from = m.objects.find((o) => o.kind === 'start' || o.kind === 'arrival') ?? { x: Math.floor(m.width / 2), y: Math.floor(m.height / 2) - 1 };
      const seen = reachable(m, from.x, from.y);
      let open = 0;
      let reached = 0;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        if (!walkable(m, x, y)) continue;
        open++;
        if (seen[y * m.width + x]) reached++;
      }
      expect(open).toBeGreaterThan(m.width * m.height * 0.2);
      expect(reached).toBe(open);
      const tiled = toTiled(m);
      const parsed = parseTiledMap('gen', tiled);
      expect(parsed.width).toBe(m.width);
      expect(fromTiled('gen', tiled).objects).toEqual(m.objects); // round trip
    });
  }
});

describe('dungeon boss room', () => {
  it('places a boss spawn area with a 1-2 hour respawn, or none when turned off', () => {
    const boss = generate(opts('dungeon', 3)).objects.find((o) => o.kind === 'spawn');
    expect(boss).toMatchObject({ name: 'boss', props: { monster: 'troll', count: 1, respawnSec: 3600, respawnMaxSec: 7200 } });
    expect(generate(opts('dungeon', 3, { bossRoom: false })).objects.some((o) => o.kind === 'spawn')).toBe(false);
  });
});
