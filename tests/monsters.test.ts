import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { chebyshev, isSafe } from '../src/logic/map';
import { changeMap } from '../src/logic/player';
import { currentMap } from '../src/logic/world';
import { newGame, runUntil } from './helpers';

describe('spawning (plan §7.10)', () => {
  it('fills every spawn area, away from entry points and the player', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = newGame('knight', seed);
      changeMap(s, 'field1', 1, 22);
      const map = currentMap(s);
      const expected = map.spawns.reduce((n, a) => n + a.count, 0);
      expect(s.monsters).toHaveLength(expected);
      for (const m of s.monsters.filter((x) => !x.dead)) {
        expect(chebyshev(m.mover.x, m.mover.y, 1, 22)).toBeGreaterThan(CONTENT.balance.noSpawnRadius);
        expect(isSafe(map, m.mover.x, m.mover.y)).toBe(false);
      }
    }
  });
});

describe('AI', () => {
  it('passive slimes ignore a nearby player; aggressive wolves chase', () => {
    const s = newGame('knight', 3);
    changeMap(s, 'field1', 1, 22);
    const slime = s.monsters.find((m) => m.defId === 'slime' && !m.dead)!;
    const wolf = s.monsters.find((m) => m.defId === 'wolf' && !m.dead)!;
    s.player.hp = 9999;
    s.player.mover.x = slime.mover.x + 2;
    s.player.mover.y = slime.mover.y;
    for (let i = 0; i < 20; i++) tick(s, []);
    expect(slime.ai).toBe('idle');
    s.player.mover.x = wolf.mover.x + 2;
    s.player.mover.y = wolf.mover.y;
    tick(s, []);
    expect(wolf.ai).toBe('chase');
  });

  it('gives up and resets when the player is far beyond the leash', () => {
    const s = newGame('knight', 4);
    changeMap(s, 'field1', 1, 22);
    const wolf = s.monsters.find((m) => m.defId === 'wolf' && !m.dead)!;
    wolf.ai = 'chase';
    wolf.hp = 1;
    s.player.invulnUntil = s.tick + 100000; // untargetable: monsters give up at once
    tick(s, []);
    expect(wolf.ai).toBe('return');
    runUntil(s, () => wolf.ai === 'idle', 1000);
    expect(wolf.hp).toBe(CONTENT.monsters.wolf!.hp);
  });

  it('respawns killed monsters after the timer, never near the player', () => {
    const s = newGame('knight', 5);
    changeMap(s, 'field1', 1, 22);
    const m = s.monsters.find((x) => !x.dead)!;
    m.dead = true;
    m.respawnTick = s.tick + 5;
    runUntil(s, () => !m.dead, 200);
    expect(m.dead).toBe(false);
    const pm = s.player.mover;
    expect(chebyshev(pm.x, pm.y, m.mover.x, m.mover.y)).toBeGreaterThanOrEqual(CONTENT.balance.spawnMinPlayerDist);
  });
});
