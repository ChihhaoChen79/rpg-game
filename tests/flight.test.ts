import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { arrowTicks, flyTicks, spellTicks } from '../src/logic/combat';
import { newGame } from './helpers';

describe('arrows and spells fly at a constant speed', () => {
  it('a farther target takes longer, by the same speed every time', () => {
    const s = newGame('elf');
    const b = CONTENT.balance;
    const near = arrowTicks(s, 2);
    const far = arrowTicks(s, 8);
    expect(far).toBeGreaterThan(near);
    // same speed: the extra time is exactly the extra distance / speed
    expect(far - near).toBe(flyTicks(8, b.arrowTilesPerSec) - flyTicks(2, b.arrowTilesPerSec));
    expect(arrowTicks(s, 8)).toBe(arrowTicks(s, 8));
  });

  it('spells: the draw time is the same, the flight grows with distance; a faster (higher level) spell is quicker', () => {
    const s = newGame('mage');
    expect(spellTicks(s, 1, 7)).toBeGreaterThan(spellTicks(s, 1, 2));
    expect(spellTicks(s, 7, 7)).toBeLessThan(spellTicks(s, 1, 7));
    expect(spellTicks(s, 10, 7)).toBe(0); // instant
    // at least 1 tick of flight, even point blank
    expect(spellTicks(s, 1, 1)).toBeGreaterThan(CONTENT.balance.spellWindupTicks);
  });
});
