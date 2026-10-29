import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { tick } from '../src/logic/game';
import { consumeItem, countItem } from '../src/logic/inventory';
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

  it('settings are clamped to 0-100%', () => {
    const s = fieldGame();
    tick(s, [{ type: 'setAfkSettings', settings: { hpPct: 150, mpPct: -5, pickup: false, returnWhenOut: true } }]);
    expect(s.player.afkSettings).toEqual({ hpPct: 100, mpPct: 0, pickup: false, returnWhenOut: true });
  });
});
