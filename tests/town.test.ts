import { describe, expect, it } from 'vitest';
import { CONTENT, GAME_CONFIG, START_MAP, TILED_MAPS } from '../src/content';
import { createGame, tick } from '../src/logic/game';
import { SAVE_VERSION, savedPlayer, type SaveData } from '../src/logic/save';
import { addStack, countItem, firstStackOf, newStack } from '../src/logic/inventory';
import { moverPlace } from '../src/logic/movement';
import { changeMap } from '../src/logic/player';
import { repairCost, sellPrice } from '../src/logic/town';
import { wearFactor, damagePreview } from '../src/logic/combat';
import { currentMap } from '../src/logic/world';
import { defaultStats, newGame, runUntil } from './helpers';

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
    tick(s, [{ type: 'buy', npcId: 'merchant', itemId: 'sword_flame', count: 1 }]); // not in stock
    expect(firstStackOf(s.player, 'sword_flame')).toBeUndefined();
  });

  it('sells back at 50%', () => {
    const s = atNpc('merchant');
    const gold = s.player.gold;
    const st = firstStackOf(s.player, 'potion_hp_s')!;
    tick(s, [{ type: 'sell', npcId: 'merchant', uid: st.uid, count: 4 }]);
    expect(s.player.gold).toBe(gold + sellPrice(s, 'potion_hp_s', 4));
    expect(sellPrice(s, 'potion_hp_s', 4)).toBe(Math.floor(4 * CONTENT.items.potion_hp_s!.price / 2));
    expect(sellPrice(s, 'potion_hp_s')).toBe(Math.floor(CONTENT.items.potion_hp_s!.price / 2));
  });

  it('cheap items sell in bulk: 200 arrows at 1 gold sell for 100', () => {
    const s = atNpc('merchant', 'elf');
    const gold = s.player.gold;
    const uid = firstStackOf(s.player, 'arrow')!.uid;
    tick(s, [{ type: 'sell', npcId: 'merchant', uid, count: 1 }]);
    expect(s.player.gold).toBe(gold); // half a gold: refused
    expect(countItem(s.player, 'arrow')).toBe(200);
    tick(s, [{ type: 'sell', npcId: 'merchant', uid, count: 200 }]);
    expect(s.player.gold).toBe(gold + 100);
  });

  it('buys a whole basket at once', () => {
    const s = atNpc('merchant');
    s.player.gold = 1000;
    const potions = countItem(s.player, 'potion_hp_s');
    tick(s, [{ type: 'buyMany', npcId: 'merchant', items: [
      { itemId: 'potion_hp_s', count: 5 }, { itemId: 'scroll_return', count: 2 }, { itemId: 'potion_hp_s', count: 1 }, { itemId: 'sword_flame', count: 1 },
    ] }]);
    expect(countItem(s.player, 'potion_hp_s')).toBe(potions + 6);
    expect(countItem(s.player, 'scroll_return')).toBe(4);
    expect(countItem(s.player, 'sword_flame')).toBe(0); // not sold here: skipped
    expect(s.player.gold).toBe(1000 - 6 * CONTENT.items.potion_hp_s!.price - 2 * CONTENT.items.scroll_return!.price);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.boughtMany', params: expect.objectContaining({ n: 2 }) }));
  });

  it('refuses the whole basket if it costs too much or weighs too much', () => {
    const s = atNpc('merchant');
    s.player.gold = 150;
    const inv = JSON.stringify(s.player.inventory);
    tick(s, [{ type: 'buyMany', npcId: 'merchant', items: [{ itemId: 'potion_hp_s', count: 5 }, { itemId: 'sword_practice', count: 1 }] }]);
    expect(s.player.gold).toBe(150);
    expect(JSON.stringify(s.player.inventory)).toBe(inv);
    s.player.gold = 1e9;
    tick(s, [{ type: 'buyMany', npcId: 'merchant', items: [{ itemId: 'potion_hp_s', count: 5 }, { itemId: 'armor_leather', count: 50 }] }]);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.tooHeavy' }));
    expect(JSON.stringify(s.player.inventory)).toBe(inv);
  });

  it('sells several stacks at once (part of a stack too)', () => {
    const s = atNpc('merchant', 'elf');
    const gold = s.player.gold;
    const arrows = firstStackOf(s.player, 'arrow')!;
    const pots = firstStackOf(s.player, 'potion_hp_s')!;
    tick(s, [{ type: 'sellMany', npcId: 'merchant', items: [{ uid: arrows.uid, count: 100 }, { uid: pots.uid, count: 10 }] }]);
    expect(countItem(s.player, 'arrow')).toBe(100);
    expect(countItem(s.player, 'potion_hp_s')).toBe(0);
    expect(s.player.gold).toBe(gold + sellPrice(s, 'arrow', 100) + sellPrice(s, 'potion_hp_s', 10));
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

describe('warehouse (shared by all characters)', () => {
  const fee = CONTENT.balance.warehouseFee;

  it('deposits for free and withdraws for the fee, splitting and merging stacks', () => {
    const s = atNpc('banker');
    s.player.gold = 1000;
    const st = firstStackOf(s.player, 'potion_hp_s')!;
    const total = st.count;
    tick(s, [{ type: 'deposit', npcId: 'banker', uid: st.uid, count: 4 }]);
    tick(s, [{ type: 'deposit', npcId: 'banker', uid: st.uid, count: 2 }]);
    expect(s.shared.items).toHaveLength(1);
    expect(s.shared.items[0]!.count).toBe(6);
    expect(countItem(s.player, 'potion_hp_s')).toBe(total - 6);
    expect(s.player.gold).toBe(1000);
    tick(s, [{ type: 'withdraw', npcId: 'banker', uid: s.shared.items[0]!.uid, count: 6 }]);
    expect(s.shared.items).toHaveLength(0);
    expect(countItem(s.player, 'potion_hp_s')).toBe(total);
    expect(s.player.gold).toBe(1000 - fee);
  });

  it("can't take out without the fee", () => {
    const s = atNpc('banker');
    s.player.gold = 1000;
    const st = firstStackOf(s.player, 'potion_hp_s')!;
    tick(s, [{ type: 'deposit', npcId: 'banker', uid: st.uid, count: 1 }]);
    s.player.gold = fee - 1;
    tick(s, [{ type: 'withdraw', npcId: 'banker', uid: s.shared.items[0]!.uid, count: 1 }]);
    expect(s.shared.items).toHaveLength(1);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.warehouseFeeShort' }));
  });

  it('stores gold; taking it out pays the fee from it', () => {
    const s = atNpc('banker');
    s.player.gold = 5000;
    tick(s, [{ type: 'depositGold', npcId: 'banker', amount: 3000 }]);
    expect(s.shared.gold).toBe(3000);
    expect(s.player.gold).toBe(2000);
    s.player.gold = 0;
    tick(s, [{ type: 'withdrawGold', npcId: 'banker', amount: 1000 }]);
    expect(s.shared.gold).toBe(2000);
    expect(s.player.gold).toBe(1000 - fee);
  });

  it("another character's game sees the same warehouse (stacks get new ids)", () => {
    const a = atNpc('banker');
    const st = firstStackOf(a.player, 'potion_hp_s')!;
    tick(a, [{ type: 'deposit', npcId: 'banker', uid: st.uid, count: 3 }]);
    a.shared.gold = 500;
    const b = createGame({ config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 2,
      newCharacter: { classId: 'elf', stats: defaultStats('elf'), startMap: START_MAP },
      shared: JSON.parse(JSON.stringify(a.shared)) });
    expect(b.shared.gold).toBe(500);
    expect(b.shared.items[0]!.count).toBe(3);
    const ids = new Set([...b.player.inventory.map((x) => x.uid), ...b.shared.items.map((x) => x.uid)]);
    expect(ids.size).toBe(b.player.inventory.length + b.shared.items.length);
  });

  it("an old character's own warehouse moves into the shared one on load", () => {
    const a = newGame('knight');
    const sv = { version: SAVE_VERSION, savedAt: 0, mapId: 'village', x: 19, y: 15, nextId: a.nextId, bossTimers: {},
      player: { ...savedPlayer(a.player), warehouse: [{ uid: 1, itemId: 'potion_hp_s', count: 7, enh: 0, dur: 0 }] } };
    const g = createGame({ config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 3, save: sv as SaveData, shared: { items: [], gold: 10 } });
    expect(g.player.warehouse).toHaveLength(0);
    expect(g.shared.items.map((x) => [x.itemId, x.count])).toEqual([['potion_hp_s', 7]]);
    expect(g.shared.gold).toBe(10);
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
