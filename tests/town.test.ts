import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { addStack, countItem, firstStackOf, newStack } from '../src/logic/inventory';
import { moverPlace } from '../src/logic/movement';
import { changeMap } from '../src/logic/player';
import { repairCost, sellPrice } from '../src/logic/town';
import { wearFactor, damagePreview } from '../src/logic/combat';
import { currentMap } from '../src/logic/world';
import { newGame, runUntil } from './helpers';

/** Village game with the player standing next to an NPC. */
function atNpc(npcId: string, cls: 'knight' | 'elf' | 'mage' = 'knight') {
  const s = newGame(cls);
  const n = currentMap(s).npcs.find((x) => x.npcId === npcId)!;
  moverPlace(s.player.mover, n.x, n.y + 1);
  return s;
}

describe('shop', () => {
  it('buys at list price; stackables merge', () => {
    const s = atNpc('merchant');
    const gold = s.player.gold;
    const before = countItem(s.player, 'potion_hp_s');
    tick(s, [{ type: 'buy', npcId: 'merchant', itemId: 'potion_hp_s', count: 3 }]);
    expect(countItem(s.player, 'potion_hp_s')).toBe(before + 3);
    expect(s.player.gold).toBe(gold - 3 * CONTENT.items.potion_hp_s!.price);
  });

  it('refuses without enough gold or items it does not stock', () => {
    const s = atNpc('merchant');
    s.player.gold = 5;
    tick(s, [{ type: 'buy', npcId: 'merchant', itemId: 'potion_hp_l', count: 1 }]);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.notEnoughGold' }));
    s.player.gold = 99999;
    tick(s, [{ type: 'buy', npcId: 'merchant', itemId: 'sword_iron', count: 1 }]); // not in stock
    expect(firstStackOf(s.player, 'sword_iron')).toBeUndefined();
  });

  it('sells back at 50%', () => {
    const s = atNpc('merchant');
    const gold = s.player.gold;
    const st = firstStackOf(s.player, 'potion_hp_s')!;
    tick(s, [{ type: 'sell', npcId: 'merchant', uid: st.uid, count: 4 }]);
    expect(s.player.gold).toBe(gold + 4 * sellPrice(s, 'potion_hp_s'));
    expect(sellPrice(s, 'potion_hp_s')).toBe(Math.floor(CONTENT.items.potion_hp_s!.price / 2));
  });

  it('only works next to the shopkeeper', () => {
    const s = newGame();
    const gold = s.player.gold;
    tick(s, [{ type: 'buy', npcId: 'merchant', itemId: 'potion_hp_s', count: 1 }]);
    expect(s.player.gold).toBe(gold);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.tooFar' }));
  });

  it('every stocked item exists', () => {
    for (const shop of Object.values(CONTENT.shops)) for (const id of shop.items) expect(CONTENT.items[id], id).toBeDefined();
  });
});

describe('warehouse', () => {
  it('deposits and withdraws, splitting and merging stacks', () => {
    const s = atNpc('banker');
    const st = firstStackOf(s.player, 'potion_hp_s')!;
    const total = st.count;
    tick(s, [{ type: 'deposit', npcId: 'banker', uid: st.uid, count: 4 }]);
    tick(s, [{ type: 'deposit', npcId: 'banker', uid: st.uid, count: 2 }]);
    expect(s.player.warehouse).toHaveLength(1);
    expect(s.player.warehouse[0]!.count).toBe(6);
    expect(countItem(s.player, 'potion_hp_s')).toBe(total - 6);
    tick(s, [{ type: 'withdraw', npcId: 'banker', uid: s.player.warehouse[0]!.uid, count: 6 }]);
    expect(s.player.warehouse).toHaveLength(0);
    expect(countItem(s.player, 'potion_hp_s')).toBe(total);
  });
});

describe('weapon durability and repair (plan §7.12)', () => {
  it('worn weapons hit softer; broken ones deal 1', () => {
    expect(wearFactor(300, 300)).toBe(1);
    expect(wearFactor(150, 300)).toBe(1);
    expect(wearFactor(75, 300)).toBe(0.75);
    expect(wearFactor(0, 300)).toBe(0);
    const s = newGame('knight');
    const w = CONTENT.items.sword_practice!.weapon!;
    expect(damagePreview(CONTENT, s.player, w, 0, 0).total).toEqual([1, 1]);
  });

  it('attacking wears the weapon down', () => {
    const s = newGame('knight', 3);
    const sword = s.player.equipment.weapon!;
    const start = sword.dur;
    // Fight in the field until the sword has lost some durability.
    s.player.hp = 99999;
    changeMap(s, 'field1', 3, 21);
    let hits = 0;
    runUntil(s, () => {
      const m = s.monsters.find((x) => !x.dead);
      if (s.player.action.kind === 'none' && m) tick(s, [{ type: 'attack', monsterId: m.id }]);
      hits += s.events.filter((e) => e.type === 'attack' && e.from === 'player').length;
      return sword.dur < start;
    }, 20000);
    expect(sword.dur).toBeLessThan(start);
    expect(hits).toBeGreaterThan(0);
  });

  it('the blacksmith restores durability for gold', () => {
    const s = atNpc('blacksmith');
    const sword = s.player.equipment.weapon!;
    sword.dur = 30;
    const cost = repairCost(s, sword);
    expect(cost).toBeGreaterThan(0);
    const gold = s.player.gold;
    tick(s, [{ type: 'repair', npcId: 'blacksmith', uid: 'all' }]);
    expect(sword.dur).toBe(CONTENT.items.sword_practice!.weapon!.durability);
    expect(s.player.gold).toBe(gold - cost);
  });

  it('cannot repair without enough gold', () => {
    const s = atNpc('blacksmith');
    s.player.equipment.weapon!.dur = 1;
    s.player.gold = 0;
    addStack(CONTENT, s.player, newStack(s, 'potion_hp_s')); // irrelevant item stays untouched
    tick(s, [{ type: 'repair', npcId: 'blacksmith', uid: 'all' }]);
    expect(s.player.equipment.weapon!.dur).toBe(1);
  });
});
