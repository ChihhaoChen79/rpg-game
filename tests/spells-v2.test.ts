import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { firstStackOf } from '../src/logic/inventory';
import { changeMap } from '../src/logic/player';
import { gainExp, expForLevel, derive } from '../src/logic/stats';
import { savedPlayer, restoredBuffs } from '../src/logic/save';
import { manualOnly, newGame, runUntil } from './helpers';

describe('spells fly like arrows (lower magic levels take longer)', () => {
  it('a low-level spell hits after its flight; a level 10 spell hits at once', () => {
    expect(CONTENT.balance.spellFlightTicks[0]).toBeGreaterThan(CONTENT.balance.spellFlightTicks[5]!);
    expect(CONTENT.balance.spellFlightTicks[9]).toBe(0);
    const s = newGame('mage', 3);
    changeMap(s, 'field1', 3, 21);
    s.player.spells.push('judgment');
    s.player.mp = 500;
    const m = s.monsters.find((x) => !x.dead)!;
    m.mover.x = 6; m.mover.y = 21; m.hp = 99999;
    tick(s, [{ type: 'castSpell', spellId: 'judgment', targetId: m.id }]);
    expect(s.events.some((e) => e.type === 'damage' && e.to === m.id)).toBe(true);
  });
});

describe('healing while shooting', () => {
  it('a heal clicked mid-cooldown is cast as soon as the character is ready', () => {
    const s = manualOnly(newGame('elf', 3));
    changeMap(s, 'field1', 3, 21);
    s.tick = 1; // not a regen tick
    s.player.spells.push('nature_heal');
    s.player.hp = 5;
    const hp0 = s.player.hp;
    s.player.mp = 50;
    s.player.actionReadyTick = s.tick + 6; // busy with a shot
    tick(s, [{ type: 'castSpell', spellId: 'nature_heal' }]);
    expect(s.player.hp).toBe(hp0);
    runUntil(s, () => s.player.hp > hp0, 20);
    expect(s.player.hp).toBeGreaterThan(hp0);
  });
});

describe('blue potion raises mana recovery instead of giving MP', () => {
  it('adds MP at each regen step for a while, then ends', () => {
    const s = manualOnly(newGame('mage', 3));
    changeMap(s, 'field1', 3, 21); // outside the safe zone (regen is faster there)
    s.tick = 1; // not a regen tick
    const potion = firstStackOf(s.player, 'potion_mp')!; // the mage starts with some
    s.player.mp = 0;
    tick(s, [{ type: 'useItem', uid: potion.uid }]);
    expect(s.player.mp).toBe(0); // nothing at once
    const use = CONTENT.items.potion_mp!.use as { type: 'mpRegen'; amount: number; ticks: number };
    expect(use.type).toBe('mpRegen');
    const base = derive(CONTENT, s.player).mpRegen;
    const start = s.player.mp;
    runUntil(s, () => s.player.mp > start, 100);
    expect(s.player.mp - start).toBe(base + use.amount);
    runUntil(s, () => !s.player.buffs.mpRegen, use.ticks + 5);
    expect(s.player.buffs.mpRegen).toBeUndefined();
  });

  it('is saved with its time left', () => {
    const s = newGame('mage', 3);
    s.player.buffs.mpRegen = { amount: 2, until: s.tick + 300 };
    const sv = savedPlayer(s.player, s.tick);
    expect(sv.buffs?.mpRegen).toEqual({ amount: 2, left: 300 });
    expect(restoredBuffs(sv.buffs).buffs.mpRegen).toEqual({ amount: 2, until: 300 });
  });
});

describe('level up', () => {
  it('restores all HP and MP', () => {
    const s = newGame('knight', 3);
    s.player.hp = 1;
    s.player.mp = 0;
    gainExp(s, expForLevel(CONTENT, 2) - s.player.exp);
    const d = derive(CONTENT, s.player);
    expect(s.player.level).toBe(2);
    expect(s.player.hp).toBe(d.maxHp);
    expect(s.player.mp).toBe(d.maxMp);
  });
});
