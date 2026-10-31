import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { defaultAfkSettings } from '../src/logic/afkSettings';
import { addStack, consumeItem, countItem, newStack } from '../src/logic/inventory';
import { chebyshev } from '../src/logic/map';
import { migrateSave, SAVE_VERSION } from '../src/logic/save';
import type { AfkSettings } from '../src/logic/types';
import { changeMap } from '../src/logic/player';
import { derive } from '../src/logic/stats';
import { newGame, runUntil } from './helpers';

function fieldGame(cls: 'knight' | 'elf' | 'mage' = 'knight', seed = 5) {
  const s = newGame(cls, seed);
  changeMap(s, 'field1', 3, 21);
  return s;
}

describe('AFK auto-hunt', () => {
  it("won't start on a map without monsters", () => {
    const s = newGame('knight');
    tick(s, [{ type: 'setAfk', on: true }]);
    expect(s.player.afk).toBeNull();
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.afkNoMonsters' }));
  });

  it('finds and kills monsters on its own', () => {
    const s = fieldGame();
    tick(s, [{ type: 'setAfk', on: true }]);
    expect(s.player.afk).not.toBeNull();
    const exp0 = s.player.exp;
    runUntil(s, () => s.player.exp > exp0, 3000);
    expect(s.player.exp).toBeGreaterThan(exp0);
    expect(s.player.afk).not.toBeNull();
  });

  it('the mage casts attack spells while hunting', () => {
    const s = fieldGame('mage');
    tick(s, [{ type: 'setAfk', on: true }]);
    let cast = false;
    runUntil(s, () => (cast = s.events.some((e) => e.type === 'attack' && e.style === 'spell' && e.spellId === 'fireball')), 3000);
    expect(cast).toBe(true);
  });

  it('drinks a potion below the HP threshold', () => {
    const s = fieldGame();
    tick(s, [{ type: 'setAfk', on: true }]);
    const pots = countItem(s.player, 'potion_hp_s');
    s.player.hp = Math.floor(derive(CONTENT, s.player).maxHp * 0.3);
    tick(s, []);
    expect(countItem(s.player, 'potion_hp_s')).toBe(pots - 1);
  });

  it('out of HP potions: reads a return scroll and stops', () => {
    const s = fieldGame();
    consumeItem(s.player, 'potion_hp_s', countItem(s.player, 'potion_hp_s'));
    tick(s, [{ type: 'setAfk', on: true }]);
    s.player.hp = 1;
    tick(s, []);
    expect(s.player.afk).toBeNull();
    expect(s.mapId).toBe('village');
  });

  it('a manual move turns it off', () => {
    const s = fieldGame();
    tick(s, [{ type: 'setAfk', on: true }]);
    tick(s, [{ type: 'moveTo', x: 5, y: 21 }]);
    expect(s.player.afk).toBeNull();
  });

  it('old-style settings (HP / MP %) become the same rules, clamped to 0-100%', () => {
    const s = fieldGame();
    tick(s, [{ type: 'setAfkSettings', settings: { hpPct: 150, mpPct: -5, pickup: false, returnWhenOut: true } as unknown as AfkSettings }]);
    expect(s.player.afkSettings.rules).toEqual(defaultAfkSettings({ hpPct: 100, mpPct: 0 }).rules);
    expect(s.player.afkSettings.pickup).toBe(false);
  });
});

/** Auto-hunt on field1 with some settings changed. */
function hunting(patch: Partial<AfkSettings>, cls: 'knight' | 'elf' | 'mage' = 'knight', seed = 5) {
  const s = fieldGame(cls, seed);
  tick(s, [{ type: 'setAfkSettings', settings: { ...s.player.afkSettings, ...patch } }]);
  tick(s, [{ type: 'setAfk', on: true }]);
  return s;
}

describe('AFK settings v2', () => {
  it('rules run top to bottom; one that cannot act lets the next one try', () => {
    const s = hunting({ rules: [
      { stat: 'hp', below: 90, action: { kind: 'item', itemId: 'potion_hp_l' } }, // none carried
      { stat: 'hp', below: 90, action: { kind: 'hpPotion' } },
    ] });
    const pots = countItem(s.player, 'potion_hp_s');
    s.player.hp = Math.floor(derive(CONTENT, s.player).maxHp * 0.5);
    tick(s, []);
    expect(countItem(s.player, 'potion_hp_s')).toBe(pots - 1);
  });

  it('a count rule can send the player home', () => {
    const s = hunting({ rules: [{ stat: 'count', itemId: 'potion_hp_s', below: 100, action: { kind: 'return' } }] });
    tick(s, []);
    expect(s.player.afk).toBeNull();
    expect(s.mapId).toBe('village');
  });

  it('spell attack mode casts from range instead of walking up to the monster', () => {
    const s = hunting({ attack: { kind: 'spell', spellId: 'fireball' } }, 'mage');
    s.player.mp = 999;
    const dists: number[] = [];
    runUntil(s, () => {
      for (const e of s.events) {
        if (e.type !== 'attack' || e.from !== 'player' || e.style !== 'spell') continue;
        const m = s.monsters.find((x) => x.id === e.to)!;
        dists.push(chebyshev(s.player.mover.x, s.player.mover.y, m.mover.x, m.mover.y));
      }
      s.player.mp = 999;
      return dists.length >= 3;
    }, 4000);
    expect(dists.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...dists)).toBeGreaterThan(1); // cast from a distance, not in melee
  });

  it('weapon mode never casts', () => {
    const s = hunting({ attack: { kind: 'weapon' } }, 'mage');
    let cast = false;
    runUntil(s, () => (cast = cast || s.events.some((e) => e.type === 'attack' && e.style === 'spell')) && false, 1500);
    expect(cast).toBe(false);
  });

  it('keeps a buff spell and a buff item up', () => {
    const s = hunting({ buffs: ['spell:shield', 'item:potion_haste'], buffNearMonsters: false }, 'mage');
    s.player.spells.push('shield');
    s.player.mp = 999;
    addStack(CONTENT, s.player, newStack(s, 'potion_haste', 2));
    runUntil(s, () => !!s.player.buffs.def && !!s.player.buffs.speed?.[1], 50);
    expect(s.player.buffs.def).toBeDefined();
    expect(s.player.buffs.speed?.[1]).toBeDefined();
    expect(countItem(s.player, 'potion_haste')).toBe(1);
  });

  it('rests below the rest HP % and carries on when recovered', () => {
    const s = hunting({ restHpPct: 50, rules: [] });
    s.monsters.forEach((m) => { m.ai = 'idle'; });
    const max = derive(CONTENT, s.player).maxHp;
    s.player.hp = Math.floor(max * 0.3);
    tick(s, []);
    expect(s.player.afk?.resting).toBe(true);
    expect(s.player.action.kind).toBe('none');
    s.player.hp = max;
    tick(s, []);
    expect(s.player.afk?.resting).toBe(false);
  });

  it("doesn't rest while carrying over half the weight limit (no regeneration)", () => {
    const s = hunting({ restHpPct: 50, rules: [] });
    addStack(CONTENT, s.player, newStack(s, 'arrow', 9999));
    addStack(CONTENT, s.player, newStack(s, 'arrow', 9999));
    const d = derive(CONTENT, s.player);
    expect(d.weight).toBeGreaterThan(d.maxWeight * CONTENT.balance.weightNoRegen);
    s.player.hp = Math.floor(d.maxHp * 0.3);
    tick(s, []);
    expect(s.player.afk?.resting).toBe(false);
  });

  it('returns home above the set carry weight', () => {
    const s = hunting({ returnWeightPct: 5 });
    addStack(CONTENT, s.player, newStack(s, 'arrow', 9999));
    tick(s, []);
    expect(s.player.afk).toBeNull();
    expect(s.mapId).toBe('village');
  });

  it("doesn't pick up ignored items", () => {
    const s = hunting({ ignore: ['potion_hp_s'], rules: [] });
    s.monsters.forEach((m) => { m.dead = true; });
    const { x, y } = s.player.mover;
    s.groundItems.push({ id: s.nextId++, mapId: s.mapId, x: x + 1, y, item: newStack(s, 'potion_hp_s', 1), droppedTick: s.tick });
    const pots = countItem(s.player, 'potion_hp_s');
    runUntil(s, () => false, 60);
    expect(countItem(s.player, 'potion_hp_s')).toBe(pots);
  });

  it('only targets monsters inside the hunt radius (unless they attack)', () => {
    const s = hunting({ huntRadius: 3 });
    runUntil(s, () => false, 200);
    const o = s.player.afk!.origin;
    const t = s.player.afk!.targetId;
    if (t !== null) {
      const m = s.monsters.find((x) => x.id === t)!;
      expect(m.ai === 'chase' || chebyshev(o.x, o.y, m.mover.x, m.mover.y) <= 3).toBe(true);
    }
  });

  it('old saves (v7) get rules matching their old settings', () => {
    const v7 = { version: 7, mapId: 'village', x: 1, y: 1, nextId: 1, savedAt: 0, bossTimers: {},
      player: { inventory: [], afkSettings: { hpPct: 40, mpPct: 20, pickup: false, returnWhenOut: true } } };
    const sv = migrateSave(v7);
    expect(sv.version).toBe(SAVE_VERSION);
    expect(sv.player.afkSettings.rules[0]).toEqual({ stat: 'hp', below: 40, action: { kind: 'bestHeal' } });
    expect(sv.player.afkSettings.rules[2]).toEqual({ stat: 'mp', below: 20, action: { kind: 'mpPotion' } });
    expect(sv.player.afkSettings.pickup).toBe(false);
  });
});

describe('assist features while playing by hand', () => {
  it('rules drink potions without auto-hunt; their switch turns them off', () => {
    const s = fieldGame();
    const pots = countItem(s.player, 'potion_hp_s');
    s.player.hp = Math.floor(derive(CONTENT, s.player).maxHp * 0.3);
    tick(s, []);
    expect(s.player.afk).toBeNull();
    expect(countItem(s.player, 'potion_hp_s')).toBe(pots - 1);

    tick(s, [{ type: 'setAfkSettings', settings: { ...s.player.afkSettings, rulesOn: false } }]);
    s.player.cooldowns = {};
    s.player.hp = 1;
    tick(s, []);
    expect(countItem(s.player, 'potion_hp_s')).toBe(pots - 1);
  });

  it('buffs are kept up by hand when their switch is on', () => {
    const s = fieldGame('mage');
    s.player.spells.push('shield');
    s.player.mp = 999;
    tick(s, [{ type: 'setAfkSettings', settings: { ...s.player.afkSettings, buffs: ['spell:shield'], buffNearMonsters: false } }]);
    runUntil(s, () => !!s.player.buffs.def, 30);
    expect(s.player.buffs.def).toBeDefined();
  });

  it('picks up loot when standing still (not in safe zones)', () => {
    const s = fieldGame();
    const { x, y } = s.player.mover;
    s.groundItems.push({ id: s.nextId++, mapId: s.mapId, x: x + 1, y, item: newStack(s, 'potion_hp_l', 1), droppedTick: s.tick });
    runUntil(s, () => countItem(s.player, 'potion_hp_l') > 0, 60);
    expect(countItem(s.player, 'potion_hp_l')).toBe(1);
  });

  it('a "go home" rule does nothing in the village', () => {
    const s = newGame('knight');
    tick(s, [{ type: 'setAfkSettings', settings: { ...s.player.afkSettings, rules: [{ stat: 'hp', below: 100, action: { kind: 'return' } }] } }]);
    const before = countItem(s.player, 'scroll_return');
    s.player.hp = 1;
    tick(s, []);
    expect(countItem(s.player, 'scroll_return')).toBe(before);
  });
});
