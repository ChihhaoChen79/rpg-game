import { describe, expect, it } from 'vitest';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../src/content';
import { createGame } from '../src/logic/game';
import { changeMap } from '../src/logic/player';
import { damageMonster } from '../src/logic/combat';
import { migrateSave, SAVE_VERSION, savedBossTimers, savedPlayer } from '../src/logic/save';
import { TICKS_PER_SECOND } from '../src/logic/time';
import { currentMap } from '../src/logic/world';
import { newGame, runUntil } from './helpers';

const HOUR = 3600 * TICKS_PER_SECOND;

function inDungeon(seed = 1) {
  const s = newGame('knight', seed);
  changeMap(s, 'dungeon1', 5, 20);
  return s;
}
const boss = (s: ReturnType<typeof newGame>) => s.monsters.find((m) => CONTENT.monsters[m.defId]!.boss)!;

describe('dungeon boss', () => {
  it('the field has an entrance to the dungeon and the dungeon one back', () => {
    const s = newGame();
    expect(s.maps.field1!.exits.some((e) => e.targetMap === 'dungeon1')).toBe(true);
    expect(s.maps.dungeon1!.exits.some((e) => e.targetMap === 'field1')).toBe(true);
  });

  it('appears in its hall the first time', () => {
    const s = inDungeon();
    const b = boss(s);
    expect(b.dead).toBe(false);
    const area = currentMap(s).spawns[b.spawnIdx]!;
    expect(b.mover.x).toBeGreaterThanOrEqual(area.x);
    expect(b.mover.x).toBeLessThan(area.x + area.w);
  });

  it('respawns 1 to 2 hours after being killed, even if the player leaves and comes back', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = inDungeon(seed);
      const b = boss(s);
      damageMonster(s, b, 99999, false);
      const wait = b.respawnTick - s.tick;
      expect(wait).toBeGreaterThanOrEqual(HOUR);
      expect(wait).toBeLessThanOrEqual(2 * HOUR);
      changeMap(s, 'field1', 53, 40);
      changeMap(s, 'dungeon1', 5, 20);
      expect(boss(s).dead).toBe(true);
      expect(boss(s).respawnTick).toBe(b.respawnTick);
    }
  });

  it('comes back when its timer runs out', () => {
    const s = inDungeon(3);
    damageMonster(s, boss(s), 99999, false);
    const t = boss(s).respawnTick;
    s.tick = t - 1; // skip ahead
    runUntil(s, () => !boss(s).dead, 50);
    expect(boss(s).dead).toBe(false);
  });

  it('its timer survives saving and loading', () => {
    const s = inDungeon(4);
    damageMonster(s, boss(s), 99999, false);
    const left = boss(s).respawnTick - s.tick;
    const save = migrateSave(JSON.parse(JSON.stringify({
      version: SAVE_VERSION, savedAt: 0, mapId: 'dungeon1', x: 5, y: 20, nextId: s.nextId,
      player: savedPlayer(s.player), bossTimers: savedBossTimers(s.bossTimers, s.tick),
    })));
    const loaded = createGame({ config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 9, save });
    expect(boss(loaded).dead).toBe(true);
    expect(boss(loaded).respawnTick).toBe(left);
  });
});
