import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { applyDef, applyMr, attackProfile, hitChance } from '../src/logic/combat';
import { tick } from '../src/logic/game';
import { consumeItem } from '../src/logic/inventory';
import { changeMap } from '../src/logic/player';
import { derive } from '../src/logic/stats';
import { newGame, runUntil } from './helpers';

const b = CONTENT.balance;

describe('formulas (plan §7.4)', () => {
  it('hit chance clamps to 5..95', () => {
    expect(hitChance(b, 85, 0, 10)).toBe(75);
    expect(hitChance(b, 200, 0, 0)).toBe(95);
    expect(hitChance(b, 10, 0, 80)).toBe(5);
  });
  it('Def reduction is dmg*100/(100+Def), minimum 1', () => {
    expect(applyDef(10, 0)).toBe(10);
    expect(applyDef(10, 100)).toBe(5);
    expect(applyDef(1, 1000)).toBe(1);
  });
  it('MR reduction caps at 75%', () => {
    expect(applyMr(b, 100, 50)).toBe(50);
    expect(applyMr(b, 100, 90)).toBe(25);
    expect(applyMr(b, 1, 75)).toBe(1);
  });
  it('an elf without arrows clubs with the bow at melee range', () => {
    const s = newGame('elf');
    expect(attackProfile(CONTENT, s.player)).toMatchObject({ usesArrow: true, range: 6 });
    consumeItem(s.player, 'arrow', 200);
    expect(attackProfile(CONTENT, s.player)).toMatchObject({ usesArrow: false, bowMelee: true, range: 1 });
  });
});

function fieldGame(cls: 'knight' | 'elf' | 'mage' = 'knight') {
  const s = newGame(cls, 7);
  changeMap(s, 'field1', 3, 21);
  return s;
}

describe('fighting', () => {
  it('auto-attacks a monster until it dies, then gains Exp and drops gold', () => {
    const s = fieldGame();
    const slime = s.monsters.find((m) => m.defId === 'slime')!;
    s.player.hp = 9999; // keep the test about killing, not surviving
    tick(s, [{ type: 'attack', monsterId: slime.id }]);
    runUntil(s, () => slime.dead, 3000);
    expect(slime.dead).toBe(true);
    expect(s.player.exp).toBeGreaterThan(0);
    expect(s.groundItems.some((g) => g.item.itemId === 'gold')).toBe(true);
    expect(s.player.action.kind).toBe('none');
  });

  it('elf arrows are consumed one per shot', () => {
    const s = fieldGame('elf');
    const before = s.player.inventory.find((i) => i.itemId === 'arrow')!.count;
    const m = s.monsters[0]!;
    s.player.hp = 9999;
    tick(s, [{ type: 'attack', monsterId: m.id }]);
    let shots = 0;
    runUntil(s, () => (shots += s.events.filter((e) => e.type === 'attack' && e.from === 'player').length) >= 3, 3000);
    const after = s.player.inventory.find((i) => i.itemId === 'arrow')!.count;
    expect(before - after).toBe(shots);
  });

  it('the mage fire bolt costs MP and always hits', () => {
    const s = fieldGame('mage');
    const m = s.monsters.find((x) => x.defId === 'slime')!;
    s.player.mover.x = m.mover.x - 2;
    s.player.mover.y = m.mover.y;
    s.tick = 1; // not a regen tick
    const mp = s.player.mp;
    tick(s, [{ type: 'castSpell', spellId: 'fire_bolt', targetId: m.id }]);
    expect(s.player.mp).toBe(mp - CONTENT.spells.fire_bolt!.mp);
    expect(s.events.some((e) => e.type === 'damage' && e.to === m.id && !e.miss && e.magic)).toBe(true);
  });

  it('dying shows the penalty, and respawning returns to the village at full HP with brief invulnerability', () => {
    const s = fieldGame();
    const wolf = s.monsters.find((m) => m.defId === 'wolf')!;
    s.player.hp = 1;
    s.player.mover.x = wolf.mover.x - 1; // stand next to a wolf
    s.player.mover.y = wolf.mover.y;
    s.player.mover.fromX = s.player.mover.x;
    s.player.mover.fromY = s.player.mover.y;
    let died = false;
    runUntil(s, () => (died = s.events.some((e) => e.type === 'playerDied')), 500);
    expect(died).toBe(true);
    expect(s.player.dead).toBe(true);
    tick(s, [{ type: 'moveTo', x: 5, y: 5 }]); // ignored while dead
    expect(s.player.mover.path).toEqual([]);
    tick(s, [{ type: 'respawn' }]);
    expect(s.mapId).toBe('village');
    expect(s.player.dead).toBe(false);
    expect(s.player.hp).toBe(derive(CONTENT, s.player).maxHp);
    expect(s.player.invulnUntil).toBeGreaterThan(s.tick);
  });
});
