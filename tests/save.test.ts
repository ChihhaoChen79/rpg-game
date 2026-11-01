import { describe, expect, it } from 'vitest';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../src/content';
import { createGame, tick } from '../src/logic/game';
import { migrateSave, readAnySaveFile, readSaveFile, SAVE_VERSION, savedPlayer, signPlayerFile, signSaveFile, type PlayerFile, type SaveData } from '../src/logic/save';
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

  it('version 4 saves: 火焰箭 becomes 火球術, spells the class can never learn are dropped', () => {
    const s = newGame('mage');
    const p = savedPlayer(s.player);
    const v4 = {
      version: 4, savedAt: 0, mapId: 'village', x: 19, y: 15, nextId: s.nextId, bossTimers: {},
      player: { ...p, spells: ['heal', 'fire_bolt', 'spirit_power'], hotbar: [{ kind: 'spell', id: 'fire_bolt' }, { kind: 'spell', id: 'spirit_power' }, null, null, null, null] },
    };
    const m = migrateSave(JSON.parse(JSON.stringify(v4)));
    expect(m.player.spells).toEqual(['heal', 'fireball', 'spirit_power']);
    const g = createGame({ config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 1, save: m });
    expect(g.player.spells).toEqual(['heal', 'fireball']); // mages can't learn elf magic
    expect(g.player.hotbar.slice(0, 2)).toEqual([{ kind: 'spell', id: 'fireball' }, null]);
  });

  it('version 5 saves get an empty name (shown as the class name)', () => {
    const s = newGame('elf');
    const { name: _n, ...p } = savedPlayer(s.player);
    const v5 = { version: 5, savedAt: 0, mapId: 'village', x: 19, y: 15, nextId: s.nextId, bossTimers: {}, player: p };
    expect(migrateSave(JSON.parse(JSON.stringify(v5))).player.name).toBe('');
  });

  it('rejects garbage and saves from a newer version', () => {
    expect(() => migrateSave(null)).toThrow();
    expect(() => migrateSave({ hello: 1 })).toThrow();
    expect(() => migrateSave({ version: SAVE_VERSION + 1 })).toThrow();
  });

  it('exported files carry a checksum; edited or unsigned files are refused', () => {
    const s = newGame('knight');
    const data: SaveData = {
      version: SAVE_VERSION, savedAt: 1700000000000, mapId: 'village', x: 19, y: 15, nextId: s.nextId,
      player: savedPlayer(s.player), bossTimers: {},
    };
    const text = JSON.stringify(signSaveFile(data), null, 2); // as written to the file
    expect(readSaveFile(JSON.parse(text))).toEqual(data);
    const edited = JSON.parse(text);
    edited.player.gold = 99999;
    expect(() => readSaveFile(edited)).toThrow('save.tampered');
    const { checksum: _c, ...unsigned } = JSON.parse(text);
    expect(() => readSaveFile(unsigned)).toThrow('save.tampered');
  });
});

describe('buffs are saved with their time left', () => {
  it('Def / speed-up / max-damage survive save and load', () => {
    const s = newGame('knight');
    for (let i = 0; i < 50; i++) tick(s, []);
    s.player.buffs.def = { amount: 5, until: s.tick + 300, spellId: 'shield' };
    s.player.buffs.speed = { 1: { until: s.tick + 6000, source: 'wind_priest' } };
    s.player.maxDamageUntil = s.tick + 100;
    const sv = { version: SAVE_VERSION, savedAt: 0, mapId: s.mapId, x: s.player.mover.x, y: s.player.mover.y,
      nextId: s.nextId, player: savedPlayer(s.player, s.tick), bossTimers: {} } as SaveData;
    const g = createGame({ config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 1, save: migrateSave(JSON.parse(JSON.stringify(sv))) });
    expect(g.player.buffs.def).toEqual({ amount: 5, until: 300, spellId: 'shield' }); // clock restarts at 0
    expect(g.player.buffs.speed?.[1]).toEqual({ until: 6000, source: 'wind_priest' });
    expect(g.player.maxDamageUntil).toBe(100);
  });

  it('expired buffs are not saved', () => {
    const s = newGame('knight');
    for (let i = 0; i < 50; i++) tick(s, []);
    s.player.buffs.mr = { amount: 20, until: s.tick - 1, spellId: 'magic_barrier' };
    expect(savedPlayer(s.player, s.tick).buffs).toEqual({});
  });
});

describe('player save file (every slot + the shared warehouse)', () => {
  const file = (): PlayerFile => {
    const a = newGame('knight');
    const sv = { version: SAVE_VERSION, savedAt: 1, mapId: a.mapId, x: 1, y: 1, nextId: a.nextId, player: savedPlayer(a.player), bossTimers: {} } as SaveData;
    return { kind: 'player', version: 1, savedAt: 2, slots: [sv, null, sv], shared: { items: [{ uid: 1, itemId: 'bow_long', count: 1, enh: 2, dur: 400 }], gold: 3000 } };
  };

  it('round-trips all slots and the warehouse', () => {
    const r = readAnySaveFile(JSON.parse(JSON.stringify(signPlayerFile(file()))));
    expect(r.kind).toBe('player');
    if (r.kind !== 'player') return;
    expect(r.file.slots.map((x) => !!x)).toEqual([true, false, true]);
    expect(r.file.shared.gold).toBe(3000);
    expect(r.file.shared.items[0]!.itemId).toBe('bow_long');
  });

  it('a changed file is rejected', () => {
    const signed = signPlayerFile(file());
    signed.shared.gold = 999999;
    expect(() => readAnySaveFile(JSON.parse(JSON.stringify(signed)))).toThrow('save.tampered');
  });

  it('older single-character files are still read', () => {
    const one = file().slots[0]!;
    const r = readAnySaveFile(JSON.parse(JSON.stringify(signSaveFile(one))));
    expect(r.kind).toBe('character');
  });
});
