import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { addStack, countItem, firstStackOf, newStack } from '../src/logic/inventory';
import { levelForMagic, maxMagicLevel } from '../src/logic/magic';
import { changeMap } from '../src/logic/player';
import { derive } from '../src/logic/stats';
import type { GameState } from '../src/logic/types';
import { newGame, runUntil } from './helpers';

const rules = (cls: 'knight' | 'elf' | 'mage') => CONTENT.classes[cls].magic;

describe('magic levels per class', () => {
  it('knight: only normal magic level 1, at player level 50', () => {
    expect(levelForMagic(rules('knight').normal, 1)).toBe(50);
    expect(levelForMagic(rules('knight').normal, 2)).toBeNull();
    expect(levelForMagic(rules('knight').elf, 1)).toBeNull();
    expect(maxMagicLevel(CONTENT, 'knight', 'normal', 49)).toBe(0);
    expect(maxMagicLevel(CONTENT, 'knight', 'normal', 99)).toBe(1);
  });
  it('elf: normal magic every 8 levels up to 6, elf magic every 15 levels up to 3', () => {
    expect([1, 2, 6].map((l) => levelForMagic(rules('elf').normal, l))).toEqual([8, 16, 48]);
    expect(levelForMagic(rules('elf').normal, 7)).toBeNull();
    expect([1, 2, 3].map((l) => levelForMagic(rules('elf').elf, l))).toEqual([15, 30, 45]);
    expect(maxMagicLevel(CONTENT, 'elf', 'normal', 99)).toBe(6);
    expect(maxMagicLevel(CONTENT, 'elf', 'elf', 99)).toBe(3);
  });
  it('mage: born with level 1, then one magic level per 4 player levels up to 10', () => {
    expect(levelForMagic(rules('mage').normal, 1)).toBe(1);
    expect([2, 10].map((l) => levelForMagic(rules('mage').normal, l))).toEqual([8, 40]);
    expect(maxMagicLevel(CONTENT, 'mage', 'normal', 1)).toBe(1);
    expect(maxMagicLevel(CONTENT, 'mage', 'normal', 99)).toBe(10);
    expect(levelForMagic(rules('mage').elf, 1)).toBeNull();
  });
  it('only the mage starts with spells: 初級治癒術 and 火球術', () => {
    expect(newGame('mage').player.spells).toEqual(['heal', 'fireball']);
    expect(newGame('knight').player.spells).toEqual([]);
    expect(newGame('elf').player.spells).toEqual([]);
  });
});

function giveBook(s: GameState, spellId: string): number {
  addStack(CONTENT, s.player, newStack(s, `book_${spellId}`, 1));
  return firstStackOf(s.player, `book_${spellId}`)!.uid;
}

describe('learning from spellbooks', () => {
  it('needs the right player level, then teaches the spell, uses up the book and fills a hotbar slot', () => {
    const s = newGame('elf');
    const uid = giveBook(s, 'heal');
    tick(s, [{ type: 'useItem', uid }]);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.learnNeedLevel', params: { n: 8 } }));
    expect(s.player.spells).toEqual([]);
    s.player.level = 8;
    tick(s, [{ type: 'useItem', uid }]);
    expect(s.player.spells).toEqual(['heal']);
    expect(countItem(s.player, 'book_heal')).toBe(0);
    expect(s.player.hotbar).toContainEqual({ kind: 'spell', id: 'heal' });
  });
  it('refuses spells the class can never learn and spells already known', () => {
    const s = newGame('mage');
    tick(s, [{ type: 'useItem', uid: giveBook(s, 'spirit_power') }]);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.cannotLearnClass' }));
    tick(s, [{ type: 'useItem', uid: giveBook(s, 'heal') }]);
    expect(s.events).toContainEqual(expect.objectContaining({ key: 'log.alreadyLearned' }));
    expect(countItem(s.player, 'book_heal')).toBe(1);
  });
  it('the village sells normal magic 1-4 (魔法導師) and elf magic 1 (精靈長老)', () => {
    const levels = (shop: string) => CONTENT.shops[shop]!.items.map((id) => CONTENT.spells[id.replace(/^book_/, '')]!);
    expect(levels('magic').every((sp) => sp.school === 'normal' && sp.magicLevel <= 4)).toBe(true);
    expect(new Set(levels('magic').map((sp) => sp.magicLevel))).toEqual(new Set([1, 2, 3, 4]));
    expect(levels('elf_magic').every((sp) => sp.school === 'elf' && sp.magicLevel === 1)).toBe(true);
    expect(CONTENT.npcs.magic_teacher!.shop).toBe('magic');
    expect(CONTENT.npcs.elf_elder!.shop).toBe('elf_magic');
  });
});

describe('spell effects', () => {
  it('保護術 raises Def until it runs out; death clears it', () => {
    const s = newGame('mage');
    s.player.spells.push('shield');
    s.player.mp = 50;
    const before = derive(CONTENT, s.player).def;
    tick(s, [{ type: 'castSpell', spellId: 'shield' }]);
    const e = CONTENT.spells.shield!.effect as { amount: number; ticks: number };
    expect(derive(CONTENT, s.player).def).toBe(before + e.amount);
    runUntil(s, () => !s.player.buffs.def, e.ticks + 5);
    expect(derive(CONTENT, s.player).def).toBe(before);
  });
  it('area spells hit every monster near the target', () => {
    const s = newGame('mage', 3);
    changeMap(s, 'field1', 3, 21);
    s.player.spells.push('fire_burst');
    s.player.mp = 100;
    const [a, b2] = s.monsters.filter((m) => !m.dead);
    a!.mover.x = 6; a!.mover.y = 21;
    b2!.mover.x = 7; b2!.mover.y = 22;
    for (const m of s.monsters) if (m !== a && m !== b2) m.mover.x = 50;
    tick(s, [{ type: 'castSpell', spellId: 'fire_burst', targetId: a!.id }]);
    const hit = s.events.filter((e) => e.type === 'damage' && e.magic).map((e) => (e as { to: number }).to);
    expect(hit.sort()).toEqual([a!.id, b2!.id].sort());
  });
});
