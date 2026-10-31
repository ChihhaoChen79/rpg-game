import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { addStack, firstStackOf, newStack } from '../src/logic/inventory';
import { applyHaste, playerAttackTicks, playerStepTicks, speedMult } from '../src/logic/speed';
import { currentMap } from '../src/logic/world';
import { newGame, runUntil } from './helpers';

const b = CONTENT.balance;

describe('speed-up stages', () => {
  it('stage 1 makes walking and attacking 1.5x faster', () => {
    const s = newGame('knight');
    const step = playerStepTicks(s);
    const atk = playerAttackTicks(s, 9);
    applyHaste(s, 1, 100, 'potion_haste');
    expect(speedMult(CONTENT, s.player, s.tick)).toBe(b.speedStages[0]);
    expect(playerStepTicks(s)).toBeCloseTo(step / 1.5);
    expect(playerAttackTicks(s, 9)).toBe(Math.round(9 / 1.5));
    expect(atk).toBe(9);
  });

  it('a new buff of the same stage replaces the old one, even a longer one', () => {
    const s = newGame('knight');
    applyHaste(s, 1, 6000, 'wind_priest');
    applyHaste(s, 1, 100, 'potion_haste');
    expect(s.player.buffs.speed?.[1]).toEqual({ until: s.tick + 100, source: 'potion_haste' });
    expect(speedMult(CONTENT, s.player, s.tick)).toBe(b.speedStages[0]);
  });

  it('different stages multiply', () => {
    const s = newGame('knight');
    applyHaste(s, 1, 100, 'a');
    applyHaste(s, 2, 100, 'b');
    expect(speedMult(CONTENT, s.player, s.tick)).toBeCloseTo(b.speedStages[0]! * b.speedStages[1]!);
  });

  it('runs out and logs it', () => {
    const s = newGame('knight');
    applyHaste(s, 1, 5, 'potion_haste');
    runUntil(s, () => s.events.some((e) => e.type === 'log' && e.key === 'log.hasteEnded'), 20);
    expect(s.player.buffs.speed?.[1]).toBeUndefined();
    expect(speedMult(CONTENT, s.player, s.tick)).toBe(1);
  });

  it('the speed potion gives the stage 1 buff', () => {
    const s = newGame('knight');
    addStack(CONTENT, s.player, newStack(s, 'potion_haste', 1));
    tick(s, [{ type: 'useItem', uid: firstStackOf(s.player, 'potion_haste')!.uid }]);
    expect(s.player.buffs.speed?.[1]?.source).toBe('potion_haste');
    expect(firstStackOf(s.player, 'potion_haste')).toBeUndefined();
  });

  it('the wind priest gives it for 10 minutes, only when standing next to them', () => {
    const s = newGame('knight');
    const n = currentMap(s).npcs.find((x) => x.npcId === 'wind_priest')!;
    tick(s, [{ type: 'npcHaste', npcId: 'wind_priest' }]);
    expect(s.player.buffs.speed?.[1]).toBeUndefined(); // too far away
    s.player.mover.x = n.x;
    s.player.mover.y = n.y + 1;
    tick(s, [{ type: 'npcHaste', npcId: 'wind_priest' }]);
    expect(s.player.buffs.speed?.[1]?.until).toBe(s.tick - 1 + 6000);
  });

  it('walking 10 tiles takes about 2/3 of the time with stage 1', () => {
    const walk = (fast: boolean) => {
      const s = newGame('knight');
      if (fast) applyHaste(s, 1, 10000, 'x');
      const { x, y } = s.player.mover;
      s.player.mover.path = Array.from({ length: 10 }, (_, i) => ({ x: x + i + 1, y }));
      return runUntil(s, () => s.player.mover.path.length === 0 && !s.player.mover.moving, 200);
    };
    const slow = walk(false);
    const fast = walk(true);
    expect(fast).toBeLessThan(slow);
    expect(fast / slow).toBeCloseTo(2 / 3, 1);
  });
});
