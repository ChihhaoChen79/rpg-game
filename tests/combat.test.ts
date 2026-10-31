import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { applyDef, applyMr, attackHitBonus, attackProfile, chooseArrow, damagePreview, hitChance } from '../src/logic/combat';
import { tick } from '../src/logic/game';
import { addStack, consumeItem, firstStackOf, newStack } from '../src/logic/inventory';
import { changeMap } from '../src/logic/player';
import { derive } from '../src/logic/stats';
import { manualOnly, newGame, runUntil } from './helpers';

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
    expect(attackProfile(CONTENT, s.player)).toMatchObject({ arrowId: 'arrow', range: 6 });
    consumeItem(s.player, 'arrow', 200);
    expect(attackProfile(CONTENT, s.player)).toMatchObject({ arrowId: null, bowMelee: true, range: 1 });
  });
});

function fieldGame(cls: 'knight' | 'elf' | 'mage' = 'knight') {
  const s = manualOnly(newGame(cls, 7));
  changeMap(s, 'field1', 3, 21);
  return s;
}

describe('hit bonus: class + level + STR (melee) / DEX (bow) + weapon accuracy + enhancement', () => {
  it('melee uses the class melee bonus, level and STR', () => {
    const s = newGame('knight');
    const p = s.player;
    p.stats.str = 18;
    p.level = 10;
    const want = CONTENT.classes.knight.hit.melee + Math.floor(10 * b.hitBonusPerLevel + 8 * b.meleeHitPerStr);
    expect(derive(CONTENT, p).meleeHit).toBe(want);
    expect(attackHitBonus(CONTENT, p, attackProfile(CONTENT, p))).toBe(want); // practice sword: no accuracy
  });

  it('adds the weapon accuracy and +1 per enhancement level', () => {
    const s = newGame('knight');
    const p = s.player;
    const base = derive(CONTENT, p).meleeHit;
    p.equipment.weapon = { ...newStack(s, 'sword_keen', 1), enh: 3 };
    expect(attackHitBonus(CONTENT, p, attackProfile(CONTENT, p))).toBe(base + 4 + 3 * b.hitPerEnhance);
  });

  it('bow shots use DEX; a bow used as a club gets no weapon bonuses', () => {
    const s = newGame('elf');
    const p = s.player;
    p.equipment.weapon = { ...newStack(s, 'bow_hawk', 1), enh: 2 };
    const d = derive(CONTENT, p);
    expect(attackHitBonus(CONTENT, p, attackProfile(CONTENT, p))).toBe(d.rangedHit + 5 + 2);
    consumeItem(p, 'arrow', 200);
    expect(attackHitBonus(CONTENT, p, attackProfile(CONTENT, p))).toBe(d.meleeHit);
  });
});

describe('extra attack (額外攻擊) is added after the roll', () => {
  it('weapon extra attack + 1 per enhancement level', () => {
    const s = newGame('knight');
    const p = s.player;
    p.stats.str = 10; // no STR bonus
    const sword = CONTENT.items.sword_heavy!.weapon!;
    const pv = damagePreview(CONTENT, p, sword, 3);
    expect(pv.extra).toBe(2 + 3);
    expect(pv.total).toEqual([9 + 5, 16 + 5]);
  });
});

describe('arrows (bow damage = bow roll + DEX bonus + arrow)', () => {
  it('damage preview adds the DEX bonus and the arrow bonus', () => {
    const s = newGame('elf');
    s.player.stats.dex = 18; // +4
    const bow = CONTENT.items.bow_short!.weapon;
    expect(damagePreview(CONTENT, s.player, bow, 0).total).toEqual([1 + 4 + 1, 5 + 4 + 1]);
    addStack(CONTENT, s.player, newStack(s, 'arrow_silver', 10));
    tick(s, [{ type: 'useItem', uid: firstStackOf(s.player, 'arrow_silver')!.uid }]); // choose silver arrows
    expect(s.player.activeArrow).toBe('arrow_silver');
    expect(damagePreview(CONTENT, s.player, bow, 0).total).toEqual([1 + 4 + 3, 5 + 4 + 3]);
  });

  it('shoots the chosen arrows, then falls back to the weakest arrows', () => {
    const s = newGame('elf');
    addStack(CONTENT, s.player, newStack(s, 'arrow_silver', 1));
    s.player.activeArrow = 'arrow_silver';
    expect(chooseArrow(CONTENT, s.player)).toBe('arrow_silver');
    consumeItem(s.player, 'arrow_silver');
    expect(chooseArrow(CONTENT, s.player)).toBe('arrow');
    consumeItem(s.player, 'arrow', 200);
    expect(chooseArrow(CONTENT, s.player)).toBeNull();
  });

  it('every hit deals at least bow min + DEX bonus + arrow bonus (before Def)', () => {
    const s = fieldGame('elf');
    s.player.stats.dex = 18;
    s.player.hp = 9999;
    const slime = s.monsters.find((m) => m.defId === 'slime' && !m.dead)!; // Def 0
    tick(s, [{ type: 'attack', monsterId: slime.id }]);
    const hits: number[] = [];
    runUntil(s, () => {
      for (const e of s.events) if (e.type === 'damage' && e.to === slime.id && !e.miss) hits.push(e.amount);
      return slime.dead;
    }, 3000);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h).toBeGreaterThanOrEqual(6);
    for (const h of hits) expect(h).toBeLessThanOrEqual(10);
  });
});

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
    tick(s, [{ type: 'castSpell', spellId: 'fireball', targetId: m.id }]);
    expect(s.player.mp).toBe(mp - CONTENT.spells.fireball!.mp);
    expect(s.events.some((e) => e.type === 'damage' && e.to === m.id && !e.miss && e.magic)).toBe(true);
  });

  it('a spell cast from too far walks into range, then casts', () => {
    const s = fieldGame('mage');
    const m = s.monsters.find((x) => x.defId === 'slime' && !x.dead)!;
    tick(s, [{ type: 'castSpell', spellId: 'fireball', targetId: m.id }]);
    expect(s.player.action.kind).toBe('cast');
    let cast = false;
    runUntil(s, () => (cast = s.events.some((e) => e.type === 'attack' && e.style === 'spell')), 1000);
    expect(cast).toBe(true);
    expect(s.events.some((e) => e.type === 'damage' && e.to === m.id && e.magic)).toBe(true);
    expect(s.player.action.kind).toBe('none');
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
