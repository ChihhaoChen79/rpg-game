// Balance simulation (not part of `npm test`): real game logic, many fights per class/monster.
// Run: npm run sim:balance  (writes tools/sim/balance-report.md)
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../../src/content';
import { createGame, tick } from '../../src/logic/game';
import { addStack, newStack } from '../../src/logic/inventory';
import { isWalkable, lineOfSight } from '../../src/logic/map';
import { moverPlace } from '../../src/logic/movement';
import { changeMap } from '../../src/logic/player';
import { currentMap } from '../../src/logic/world';
import { derive, expForLevel, gainExp } from '../../src/logic/stats';
import type { ClassId, GameState, Stats } from '../../src/logic/types';

const BUILDS: Record<string, { cls: ClassId; stats: Stats; arrow?: string }> = {
  'Knight (STR18 CON18)': { cls: 'knight', stats: { str: 18, dex: 10, con: 18, int: 8, wis: 8 } },
  'Elf, plain arrows (DEX18 CON14)': { cls: 'elf', stats: { str: 11, dex: 18, con: 14, int: 10, wis: 9 } },
  'Elf, silver arrows (DEX18 CON14)': { cls: 'elf', stats: { str: 11, dex: 18, con: 14, int: 10, wis: 9 }, arrow: 'arrow_silver' },
  'Mage (INT18 WIS16)': { cls: 'mage', stats: { str: 8, dex: 10, con: 10, int: 18, wis: 16 } },
};

function fight(b: (typeof BUILDS)[string], monster: string, level: number, seed: number) {
  const s: GameState = createGame({
    config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed,
    newCharacter: { classId: b.cls, stats: b.stats, startMap: 'village' },
  });
  if (level > 1) gainExp(s, expForLevel(CONTENT, level) - s.player.exp);
  if (b.arrow) {
    addStack(CONTENT, s.player, newStack(s, b.arrow, 200));
    s.player.activeArrow = b.arrow;
  }
  changeMap(s, 'field1', 3, 21);
  const d = derive(CONTENT, s.player);
  s.player.hp = d.maxHp;
  s.player.mp = d.maxMp;
  const m = s.monsters.find((x) => x.defId === monster && !x.dead)!;
  for (const o of s.monsters) {
    if (o === m) continue; // a 1-on-1 fight
    o.dead = true;
    o.respawnTick = 1e9;
  }
  // Start 3 tiles away on open ground with a clear shot, so ranged characters get first shots in.
  const map = currentMap(s);
  let spot = null;
  for (let dy = -3; dy <= 3 && !spot; dy++) {
    for (let dx = -3; dx <= 3 && !spot; dx++) {
      const x = m.mover.x + dx;
      const y = m.mover.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === 3 && isWalkable(map, x, y) && lineOfSight(map, x, y, m.mover.x, m.mover.y)) spot = { x, y };
    }
  }
  if (!spot) return null;
  moverPlace(s.player.mover, spot.x, spot.y);
  tick(s, [{ type: 'attack', monsterId: m.id }]);
  m.ai = 'chase';
  const start = s.tick;
  let taken = 0; // damage events, not the HP bar: a level-up mid-fight refills HP
  let mpSpent = 0;
  let n = 0;
  while (!m.dead && !s.player.dead && n++ < 3000) {
    const cmds = [];
    if (b.cls === 'mage' && s.player.mp >= 3 && s.tick >= (s.player.cooldowns['spell:fireball'] ?? 0)) {
      cmds.push({ type: 'castSpell' as const, spellId: 'fireball', targetId: m.id });
    }
    tick(s, cmds);
    for (const e of s.events) {
      if (e.type === 'damage' && e.to === 'player') taken += e.amount;
      if (e.type === 'attack' && e.style === 'spell' && e.spellId) mpSpent += CONTENT.spells[e.spellId]!.mp;
    }
    if (s.player.action.kind === 'none' && !m.dead) s.player.action = { kind: 'attack', monsterId: m.id };
  }
  return { secs: (s.tick - start) / 10, hpLost: taken, died: s.player.dead, mpUsed: mpSpent, maxHp: d.maxHp, timeout: !m.dead && !s.player.dead };
}

it('balance report', () => {
  const lines = ['# Balance simulation', '', 'Real game logic, 300 one-on-one fights each, starting 3 tiles apart with a clear shot. Mage casts fire bolt whenever possible, staff otherwise.', ''];
  for (const level of [1, 10]) {
    lines.push(`## Level ${level}`, '', '| Build | Max HP | Monster | Time to kill (s) | Damage taken | Deaths | MP spent |', '|---|---|---|---|---|---|---|');
    for (const [name, b] of Object.entries(BUILDS)) {
      for (const monster of ['slime', 'wolf', 'imp']) {
        const runs = Array.from({ length: 300 }, (_, i) => fight(b, monster, level, i + 1)).filter((r) => r !== null);
        const avg = (f: (r: (typeof runs)[number]) => number) => (runs.reduce((t, r) => t + f(r), 0) / runs.length).toFixed(1);
        const deaths = runs.filter((r) => r.died).length;
        if (runs.some((r) => r.timeout)) throw new Error(`${name} vs ${monster}: a fight did not finish normally`);
        lines.push(`| ${name} | ${runs[0]!.maxHp} | ${monster} | ${avg((r) => r.secs)} | ${avg((r) => r.hpLost)} | ${(deaths / 3).toFixed(0)}% | ${avg((r) => r.mpUsed)} |`);
      }
    }
    lines.push('');
  }
  writeFileSync(new URL('./balance-report.md', import.meta.url), lines.join('\n'));
}, 600_000);
