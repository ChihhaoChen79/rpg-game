import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { validAllocation } from '../src/logic/player';
import { applyDeathExpLoss, derive, expForLevel, gainExp } from '../src/logic/stats';
import { newGame } from './helpers';

describe('character creation', () => {
  const base = CONTENT.classes.knight.base;
  it('requires exactly 6 bonus points, no stat above 18 or below base', () => {
    expect(validAllocation(base, { ...base, str: base.str + 2, con: base.con + 4 })).toBe(true);
    expect(validAllocation(base, { ...base, str: base.str + 5 })).toBe(false); // only 5 spent
    expect(validAllocation(base, { ...base, str: 19, dex: base.dex + 3 })).toBe(false); // 19 > 18
    expect(validAllocation(base, { ...base, int: base.int - 1, str: base.str + 2, con: base.con + 5 })).toBe(false);
  });

  it('each class starts with its gear equipped and HP/MP full', () => {
    for (const cls of ['knight', 'elf', 'mage'] as const) {
      const s = newGame(cls);
      const d = derive(CONTENT, s.player);
      expect(s.player.equipment.weapon).toBeDefined();
      expect(s.player.hp).toBe(d.maxHp);
      expect(s.player.mp).toBe(d.maxMp);
      expect(d.weight).toBeLessThan(d.maxWeight * CONTENT.balance.weightNoRegen);
    }
  });
});

describe('leveling', () => {
  it('records each level-up gain and raises max HP by exactly that much', () => {
    const s = newGame('knight');
    const before = derive(CONTENT, s.player).maxHp;
    gainExp(s, expForLevel(CONTENT, 3) - s.player.exp);
    expect(s.player.level).toBe(3);
    expect(s.player.hpGains).toHaveLength(2);
    const [g1, g2] = s.player.hpGains as [number, number];
    expect(derive(CONTENT, s.player).maxHp).toBe(before + g1 + g2);
    for (const g of s.player.hpGains) {
      expect(g).toBeGreaterThanOrEqual(CONTENT.classes.knight.hpGain[0]);
      expect(g).toBeLessThanOrEqual(CONTENT.classes.knight.hpGain[1]);
    }
  });

  it('stops at the level cap', () => {
    const s = newGame();
    gainExp(s, 10_000_000);
    expect(s.player.level).toBe(CONTENT.balance.levelCap);
  });
});

describe('death Exp loss (plan §7.7)', () => {
  const span = (L: number) => expForLevel(CONTENT, L + 1) - expForLevel(CONTENT, L);

  it('loses 10% of the current level span', () => {
    const s = newGame();
    gainExp(s, expForLevel(CONTENT, 12) - s.player.exp + Math.ceil(span(12) / 2));
    const r = applyDeathExpLoss(CONTENT, s.player);
    expect(r.expLost).toBe(Math.floor(span(12) / 10));
    expect(r.levelAfter).toBe(12);
  });

  it('can de-level above 10 and removes exactly that level\'s HP gain', () => {
    const s = newGame();
    gainExp(s, expForLevel(CONTENT, 12) - s.player.exp); // exactly at level start
    const p = s.player;
    const gains = p.hpGains.length;
    const maxBefore = derive(CONTENT, p).maxHp;
    const lastGain = p.hpGains[gains - 1]!;
    const r = applyDeathExpLoss(CONTENT, p);
    expect(r.levelAfter).toBe(11);
    expect(p.hpGains).toHaveLength(gains - 1);
    expect(derive(CONTENT, p).maxHp).toBe(maxBefore - lastGain);
    expect(p.exp).toBe(expForLevel(CONTENT, 12) - Math.floor(span(12) / 10));
  });

  it('never drops below level 10; Exp clamps to the level start instead', () => {
    const s = newGame();
    gainExp(s, expForLevel(CONTENT, 10) - s.player.exp + 1);
    const r = applyDeathExpLoss(CONTENT, s.player);
    expect(r.levelAfter).toBe(10);
    expect(s.player.exp).toBe(expForLevel(CONTENT, 10));
  });

  it('at low levels Exp also just clamps', () => {
    const s = newGame();
    const r = applyDeathExpLoss(CONTENT, s.player);
    expect(r).toEqual({ expLost: 0, levelBefore: 1, levelAfter: 1 });
  });
});
