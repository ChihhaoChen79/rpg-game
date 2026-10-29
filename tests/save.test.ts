import { describe, expect, it } from 'vitest';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../src/content';
import { createGame } from '../src/logic/game';
import { migrateSave, SAVE_VERSION, savedPlayer, type SaveData } from '../src/logic/save';
import { newGame } from './helpers';

describe('save format', () => {
  it('round-trips the persistent player data', () => {
    const s = newGame('elf');
    s.player.gold = 1234;
    s.player.hpGains = [7, 9];
    s.player.level = 3;
    const data: SaveData = {
      version: SAVE_VERSION, savedAt: 0, mapId: s.mapId, x: s.player.mover.x, y: s.player.mover.y,
      nextId: s.nextId, player: savedPlayer(s.player), bossTimers: {},
    };
    const loaded = createGame({
      config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 2,
      save: migrateSave(JSON.parse(JSON.stringify(data))),
    });
    expect(savedPlayer(loaded.player)).toEqual(savedPlayer(s.player));
    expect(loaded.player.mover).toMatchObject({ x: data.x, y: data.y });
  });

  it('upgrades a version 1 save step by step (plain arrows, empty warehouse)', () => {
    const s = newGame('elf');
    const { activeArrow: _a, warehouse: _w, ...v1player } = savedPlayer(s.player);
    const v1 = { version: 1, savedAt: 0, mapId: 'village', x: 19, y: 15, nextId: s.nextId, player: v1player };
    const m = migrateSave(JSON.parse(JSON.stringify(v1)));
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.player.activeArrow).toBe('arrow');
    expect(m.player.warehouse).toEqual([]);
  });

  it('rejects garbage and saves from a newer version', () => {
    expect(() => migrateSave(null)).toThrow();
    expect(() => migrateSave({ hello: 1 })).toThrow();
    expect(() => migrateSave({ version: SAVE_VERSION + 1 })).toThrow();
  });
});
