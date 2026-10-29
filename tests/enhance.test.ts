import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { deathDropChance, playerDie } from '../src/logic/combat';
import { destroyChance, enhanceChance } from '../src/logic/enhance';
import { tick } from '../src/logic/game';
import { addStack, countItem, firstStackOf, newStack } from '../src/logic/inventory';
import { derive } from '../src/logic/stats';
import type { GameState } from '../src/logic/types';
import { newGame } from './helpers';

const sword = CONTENT.items.sword_practice!;
const helmet = CONTENT.items.helmet_iron!;

function give(s: GameState, itemId: string, n = 1): number {
  addStack(CONTENT, s.player, newStack(s, itemId, n));
  return firstStackOf(s.player, itemId)!.uid;
}

describe('enhancement chances (plan §7.13)', () => {
  it('always succeeds up to the safe level (weapons +6, armor +4), then halves per step', () => {
    expect(sword.safeEnchant).toBe(6);
    expect(helmet.safeEnchant).toBe(4);
    expect([0, 5].map((e) => enhanceChance(sword, e))).toEqual([1, 1]);
    expect([6, 7, 8, 9].map((e) => enhanceChance(sword, e))).toEqual([0.5, 0.25, 0.125, 0.0625]);
    expect([3, 4, 5].map((e) => enhanceChance(helmet, e))).toEqual([1, 0.5, 0.25]);
  });
  it('failures destroy the item 30% / 50% / 70% / 90%, and never at or below safe', () => {
    expect(destroyChance(CONTENT, sword, 5)).toBe(0);
    expect([6, 7, 8, 9, 12].map((e) => destroyChance(CONTENT, sword, e))).toEqual([0.3, 0.5, 0.7, 0.9, 0.9]);
    expect(destroyChance(CONTENT, helmet, 4)).toBe(0.3);
  });
});

describe('enhance command', () => {
  it('a weapon scroll raises the equipped weapon and its damage; the scroll is used up', () => {
    const s = newGame('knight');
    const scroll = give(s, 'scroll_enhance_w', 2);
    const w = s.player.equipment.weapon!;
    tick(s, [{ type: 'enhance', scrollUid: scroll, targetUid: w.uid }]);
    expect(w.enh).toBe(1);
    expect(countItem(s.player, 'scroll_enhance_w')).toBe(1);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'enhanced', result: 'success', enh: 1 }));
  });
  it('an armor scroll adds Def; scrolls refuse the wrong kind of item', () => {
    const s = newGame('knight');
    const def0 = derive(CONTENT, s.player).def;
    const scroll = give(s, 'scroll_enhance_a', 2);
    tick(s, [{ type: 'enhance', scrollUid: scroll, targetUid: s.player.equipment.helmet!.uid }]);
    expect(derive(CONTENT, s.player).def).toBe(def0 + 1);
    tick(s, [{ type: 'enhance', scrollUid: scroll, targetUid: s.player.equipment.weapon!.uid }]);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.enhanceWrongTarget' }));
    expect(countItem(s.player, 'scroll_enhance_a')).toBe(1);
  });
  it('past the safe level some items are destroyed (and some fail harmlessly)', () => {
    const results = { success: 0, fail: 0, destroyed: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const s = newGame('knight', seed);
      const w = s.player.equipment.weapon!;
      w.enh = 6;
      tick(s, [{ type: 'enhance', scrollUid: give(s, 'scroll_enhance_w'), targetUid: w.uid }]);
      const e = s.events.find((x) => x.type === 'enhanced') as { result: keyof typeof results };
      results[e.result]++;
      if (e.result === 'destroyed') expect(s.player.equipment.weapon).toBeUndefined();
    }
    // Expected: 50% success, 35% unchanged, 15% destroyed.
    expect(results.success).toBeGreaterThan(70);
    expect(results.fail).toBeGreaterThan(45);
    expect(results.destroyed).toBeGreaterThan(12);
    expect(results.destroyed).toBeLessThan(50);
  });
});

describe('equipment drop on death (plan §7.7, §7.8)', () => {
  const b = CONTENT.balance;
  it('chance follows Alignment: 10% neutral, 0% at +1000, 80% at -1000', () => {
    expect(deathDropChance(b, 0)).toBeCloseTo(0.1);
    expect(deathDropChance(b, 650)).toBeCloseTo(0.05);
    expect(deathDropChance(b, 1000)).toBeCloseTo(0);
    expect(deathDropChance(b, -650)).toBeCloseTo(0.45);
    expect(deathDropChance(b, -1000)).toBeCloseTo(0.8);
  });
  it('a dropped item lands on the death tile, keeping its enhancement', () => {
    let dropped = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s = newGame('knight', seed);
      s.player.alignment = -1000;
      s.player.equipment.weapon!.enh = 3;
      playerDie(s);
      const e = s.events.find((x) => x.type === 'playerDied') as { dropped: { itemId: string; enh: number } | null };
      if (!e.dropped) continue;
      dropped++;
      const g = s.groundItems.find((x) => x.item.itemId === e.dropped!.itemId)!;
      expect(g).toMatchObject({ x: s.player.mover.x, y: s.player.mover.y });
      if (e.dropped.itemId === 'sword_practice') expect(g.item.enh).toBe(3);
    }
    expect(dropped).toBeGreaterThan(60); // 80% expected
  });
  it('a protection scroll prevents the drop once, and is used up by dying', () => {
    const s = newGame('knight');
    tick(s, [{ type: 'useItem', uid: give(s, 'scroll_protect') }]);
    expect(s.player.protected).toBe(true);
    s.player.alignment = -1000;
    const before = Object.keys(s.player.equipment).length;
    playerDie(s);
    expect(Object.keys(s.player.equipment).length).toBe(before);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'playerDied', protectionUsed: true, dropped: null }));
    expect(s.player.protected).toBe(false);
  });
});
