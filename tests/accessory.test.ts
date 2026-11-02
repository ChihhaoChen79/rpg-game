import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { scaledBonus } from '../src/logic/accessory';
import { tick } from '../src/logic/game';
import { addStack, countItem, newStack } from '../src/logic/inventory';
import { moverPlace } from '../src/logic/movement';
import { derive } from '../src/logic/stats';
import { currentMap } from '../src/logic/world';
import { newGame } from './helpers';

const need = CONTENT.balance.accessoryMergeCount;

function atJeweler() {
  const s = newGame('knight');
  const n = currentMap(s).npcs.find((x) => x.npcId === 'jeweler')!;
  moverPlace(s.player.mover, n.x, n.y + 1);
  return s;
}
const give = (s: ReturnType<typeof newGame>, id: string, n: number, enh = 0) => {
  for (let i = 0; i < n; i++) addStack(CONTENT, s.player, newStack(s, id, 1, enh));
};
const merge = (s: ReturnType<typeof newGame>, id: string, enh: number) =>
  tick(s, [{ type: 'mergeAccessory', npcId: 'jeweler', itemId: id, enh }]);
const levels = (s: ReturnType<typeof newGame>, id: string) => s.player.inventory.filter((x) => x.itemId === id).map((x) => x.enh).sort();

describe('jeweler: merging accessories', () => {
  it('turns the needed number of the same type and +level into one at +1', () => {
    const s = atJeweler();
    give(s, 'ring_power', need + 2);
    merge(s, 'ring_power', 0);
    expect(levels(s, 'ring_power')).toEqual([0, 0, 1]);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.accessoryMerged' }));
  });

  it('needs the full number, the same +level, and the jeweler nearby', () => {
    const s = atJeweler();
    give(s, 'ring_power', need - 1);
    merge(s, 'ring_power', 0);
    expect(levels(s, 'ring_power')).toHaveLength(need - 1);
    give(s, 'ring_power', 1, 1); // a +1 doesn't count toward the +0 pile
    merge(s, 'ring_power', 0);
    expect(levels(s, 'ring_power')).toHaveLength(need);
    give(s, 'ring_power', 1);
    moverPlace(s.player.mover, 1, 1);
    merge(s, 'ring_power', 0);
    expect(levels(s, 'ring_power')).toHaveLength(need + 1);
  });

  it('stops at the highest +level and ignores non-accessories', () => {
    const s = atJeweler();
    give(s, 'ring_guard', need, CONTENT.balance.accessoryMaxEnh);
    merge(s, 'ring_guard', CONTENT.balance.accessoryMaxEnh);
    expect(countItem(s.player, 'ring_guard')).toBe(need);
    give(s, 'sword_iron', need);
    merge(s, 'sword_iron', 0);
    expect(countItem(s.player, 'sword_iron')).toBe(need);
  });

  it('equipped accessories are not used up', () => {
    const s = atJeweler();
    s.player.level = 10;
    give(s, 'ring_power', need);
    tick(s, [{ type: 'equip', uid: s.player.inventory.find((x) => x.itemId === 'ring_power')!.uid }]);
    merge(s, 'ring_power', 0);
    expect(countItem(s.player, 'ring_power')).toBe(need - 1);
  });
});

describe('accessory bonuses grow with the +level', () => {
  it('every stat it has gains a step per level; the others stay 0', () => {
    const def = CONTENT.items.ring_power!;
    expect(scaledBonus(CONTENT, def, 0).bonus.meleeDmg).toBe(2);
    expect(scaledBonus(CONTENT, def, 3).bonus.meleeDmg).toBe(5);
    expect(scaledBonus(CONTENT, def, 3).bonus.hp).toBeUndefined();
    expect(scaledBonus(CONTENT, def, 3).def).toBe(0);
    const neck = CONTENT.items.necklace_copper!;
    expect(scaledBonus(CONTENT, neck, 2).bonus.hp).toBe(10 + 2 * CONTENT.balance.accessoryStep.hp!);
    const guard = CONTENT.items.ring_guard!;
    expect(scaledBonus(CONTENT, guard, 4).def).toBe(2 + 4);
  });

  it('derive counts the equipped accessory at its +level', () => {
    const s = newGame('knight');
    const before = derive(CONTENT, s.player).meleeBonus;
    s.player.equipment.ring1 = newStack(s, 'ring_power', 1, 3);
    expect(derive(CONTENT, s.player).meleeBonus).toBe(before + 5);
  });
});

describe('accessory drop rates', () => {
  it('normal monsters drop far less than bosses', () => {
    const acc = new Set(Object.entries(CONTENT.items).filter(([, d]) => ['necklace', 'ring', 'belt', 'earring'].includes(d.slot ?? '')).map(([id]) => id));
    for (const [id, m] of Object.entries(CONTENT.monsters)) {
      for (const d of m.drops) {
        if (!acc.has(d.itemId)) continue;
        if (m.boss) expect(d.chance, id).toBeLessThan(0.1); // below the old 10%
        else expect(d.chance, id).toBeLessThan(0.001);
      }
    }
  });
});
