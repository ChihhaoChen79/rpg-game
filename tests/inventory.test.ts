import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { addStack, cannotAdd, countItem, firstStackOf, newStack } from '../src/logic/inventory';
import { derive } from '../src/logic/stats';
import { scrollFits } from '../src/logic/enhance';
import { ACCESSORY_SLOTS } from '../src/logic/types';
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

describe('accessories and pants', () => {
  const give = (s: ReturnType<typeof newGame>, id: string) => {
    addStack(CONTENT, s.player, newStack(s, id, 1));
    return s.player.inventory[s.player.inventory.length - 1]!.uid;
  };

  it('two rings fill both ring slots; a third replaces the first', () => {
    const s = newGame('knight');
    s.player.level = 10;
    tick(s, [{ type: 'equip', uid: give(s, 'ring_power') }]);
    tick(s, [{ type: 'equip', uid: give(s, 'ring_guard') }]);
    expect(s.player.equipment.ring1?.itemId).toBe('ring_power');
    expect(s.player.equipment.ring2?.itemId).toBe('ring_guard');
    tick(s, [{ type: 'equip', uid: give(s, 'ring_mind') }]);
    expect(s.player.equipment.ring1?.itemId).toBe('ring_mind');
    expect(countItem(s.player, 'ring_power')).toBe(1); // back in the bag
  });

  it('bonuses add to the derived stats and are reported as gear', () => {
    const s = newGame('knight');
    s.player.level = 10;
    const before = derive(CONTENT, s.player);
    tick(s, [{ type: 'equip', uid: give(s, 'belt_warrior') }]); // HP +20, melee hit +2
    tick(s, [{ type: 'equip', uid: give(s, 'ring_power') }]); // melee damage +2
    tick(s, [{ type: 'equip', uid: give(s, 'pants_chain') }]); // Def 3
    const d = derive(CONTENT, s.player);
    expect(d.maxHp).toBe(before.maxHp + 20);
    expect(d.meleeHit).toBe(before.meleeHit + 2);
    expect(d.meleeBonus).toBe(before.meleeBonus + 2);
    expect(d.def).toBe(before.def + 3);
    expect(d.gear.hp).toBe(20);
    expect(d.gear.def).toBe(before.gear.def + 3);
  });

  it('taking off +HP gear keeps HP within the new maximum', () => {
    const s = newGame('knight');
    s.player.level = 10;
    tick(s, [{ type: 'equip', uid: give(s, 'belt_warrior') }]);
    s.player.hp = derive(CONTENT, s.player).maxHp;
    tick(s, [{ type: 'unequip', slot: 'belt' }]);
    expect(s.player.hp).toBe(derive(CONTENT, s.player).maxHp);
  });

  it('accessories cannot be enhanced; pants can', () => {
    const armorScroll = CONTENT.items.scroll_enhance_a!;
    expect(scrollFits(armorScroll, CONTENT.items.ring_power!)).toBe(false);
    expect(scrollFits(armorScroll, CONTENT.items.earring_pearl!)).toBe(false);
    expect(scrollFits(armorScroll, CONTENT.items.pants_leather!)).toBe(true);
  });

  it('accessories have no character sprite', () => {
    for (const d of Object.values(CONTENT.items)) {
      if (d.slot && ACCESSORY_SLOTS.includes(d.slot)) expect(d.sprite).toBeUndefined();
    }
  });
});
