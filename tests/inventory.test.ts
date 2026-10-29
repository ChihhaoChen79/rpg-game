import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { addStack, cannotAdd, countItem, firstStackOf, newStack } from '../src/logic/inventory';
import { derive } from '../src/logic/stats';
import { newGame } from './helpers';

describe('inventory', () => {
  it('stackable items merge into one slot; gold goes to the counter', () => {
    const s = newGame();
    const slots = s.player.inventory.length;
    addStack(CONTENT, s.player, newStack(s, 'potion_hp_s', 5));
    expect(s.player.inventory.length).toBe(slots);
    expect(countItem(s.player, 'potion_hp_s')).toBe(15);
    const gold = s.player.gold;
    addStack(CONTENT, s.player, newStack(s, 'gold', 40));
    expect(s.player.gold).toBe(gold + 40);
  });

  it('refuses additions past 100% weight', () => {
    const s = newGame('mage');
    const d = derive(CONTENT, s.player);
    expect(cannotAdd(CONTENT, s.player, d.maxWeight, d.weight, 'arrow', 1)).toBeNull();
    expect(cannotAdd(CONTENT, s.player, d.maxWeight, d.weight, 'arrow', 100000)).toBe('log.tooHeavy');
  });

  it('potions of one type share a cooldown', () => {
    const s = newGame();
    s.player.hp = 1;
    addStack(CONTENT, s.player, newStack(s, 'potion_hp_l', 2));
    tick(s, [{ type: 'useItem', uid: firstStackOf(s.player, 'potion_hp_s')!.uid }]);
    const hp = s.player.hp;
    expect(hp).toBeGreaterThan(1);
    tick(s, [{ type: 'useItem', uid: firstStackOf(s.player, 'potion_hp_l')!.uid }]);
    expect(s.player.hp).toBe(hp); // still on the shared "hp" cooldown
    expect(countItem(s.player, 'potion_hp_l')).toBe(2);
  });
});

describe('equipment', () => {
  it('enforces class restrictions', () => {
    const s = newGame('mage');
    addStack(CONTENT, s.player, newStack(s, 'sword_practice'));
    const sword = firstStackOf(s.player, 'sword_practice')!;
    tick(s, [{ type: 'equip', uid: sword.uid }]);
    expect(s.player.equipment.weapon?.itemId).toBe('staff_apprentice');
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'log', key: 'log.wrongClass' }));
  });

  it('enforces level requirements', () => {
    const s = newGame('knight');
    addStack(CONTENT, s.player, newStack(s, 'sword_iron'));
    tick(s, [{ type: 'equip', uid: firstStackOf(s.player, 'sword_iron')!.uid }]);
    expect(s.player.equipment.weapon?.itemId).toBe('sword_practice');
  });

  it('armor adds Def; swapping returns the old piece to the bag', () => {
    const s = newGame('knight');
    const def = derive(CONTENT, s.player).def;
    addStack(CONTENT, s.player, newStack(s, 'boots_leather'));
    tick(s, [{ type: 'equip', uid: firstStackOf(s.player, 'boots_leather')!.uid }]);
    expect(derive(CONTENT, s.player).def).toBe(def + 1); // empty slot filled
    addStack(CONTENT, s.player, newStack(s, 'helmet_leather'));
    tick(s, [{ type: 'equip', uid: firstStackOf(s.player, 'helmet_leather')!.uid }]);
    expect(firstStackOf(s.player, 'helmet_iron')).toBeDefined(); // the old helmet is back in the bag
    tick(s, [{ type: 'unequip', slot: 'helmet' }]);
    expect(firstStackOf(s.player, 'helmet_leather')).toBeDefined();
  });
});
