import { describe, expect, it } from 'vitest';
import { CONTENT, GAME_CONFIG, START_MAP, TILED_MAPS } from '../src/content';
import { createGame } from '../src/logic/game';
import { cleanName, NAME_MAX } from '../src/logic/player';
import { nameColor } from '../src/render/nameColor';
import { defaultStats } from './helpers';

describe('player names', () => {
  it('are trimmed, cleaned and cut to NAME_MAX characters', () => {
    expect(cleanName('  晨風  勇者 ')).toBe('晨風 勇者');
    expect(cleanName('a\u0000b\nc')).toBe('abc');
    expect([...cleanName('一二三四五六七八九十十一')]).toHaveLength(NAME_MAX);
    expect(cleanName('   ')).toBe('');
  });
  it('are stored on new characters', () => {
    const s = createGame({
      config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed: 1,
      newCharacter: { name: ' 小明 ', classId: 'elf', stats: defaultStats('elf'), startMap: START_MAP },
    });
    expect(s.player.name).toBe('小明');
  });
});

describe('name color follows Alignment', () => {
  const full = CONTENT.balance.nameColorFullAt;
  it('is white at 0, blue when good, red when evil', () => {
    expect(nameColor(0, full)).toBe('#ffffff');
    expect(nameColor(full, full)).toBe('#4a8cff');
    expect(nameColor(-full, full)).toBe('#ff4040');
    expect(nameColor(full * 5, full)).toBe('#4a8cff');
  });
  it('changes gradually', () => {
    const half = nameColor(full / 2, full);
    expect(half).not.toBe('#ffffff');
    expect(half).not.toBe('#4a8cff');
    expect(parseInt(half.slice(1, 3), 16)).toBeGreaterThan(0x4a); // red channel halfway down
    expect(parseInt(half.slice(1, 3), 16)).toBeLessThan(0xff);
  });
});
