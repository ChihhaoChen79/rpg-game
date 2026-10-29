// Balance simulation (not part of `npm test`): real game logic, many fights per class/monster.
// Run: npm run sim:balance  (writes tools/sim/balance-report.md)
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CONTENT, GAME_CONFIG, TILED_MAPS } from '../../src/content';
import { createGame, tick } from '../../src/logic/game';
import { addStack, newStack } from '../../src/logic/inventory';
import { learnBlock } from '../../src/logic/magic';
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

/** Gear a character of each class would wear in each field tier (bought or dropped there). */
const TIER_GEAR: Record<string, Record<ClassId, string[]>> = {
  field2: { knight: ['sword_steel', 'armor_scale', 'shield_iron'], elf: ['bow_long', 'armor_elven'], mage: ['staff_oak', 'robe_magus'] },
  field3: { knight: ['sword_flame', 'armor_plate', 'shield_iron'], elf: ['bow_elven', 'armor_elven'], mage: ['staff_crystal', 'robe_magus'] },
};

function fight(b: (typeof BUILDS)[string], monster: string, level: number, seed: number, mapId = 'field1') {
  const s: GameState = createGame({
    config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed,
    newCharacter: { classId: b.cls, stats: b.stats, startMap: 'village' },
  });
  if (level > 1) gainExp(s, expForLevel(CONTENT, level) - s.player.exp);
  if (b.arrow) {
    addStack(CONTENT, s.player, newStack(s, b.arrow, 200));
    s.player.activeArrow = b.arrow;
  }
  for (const id of TIER_GEAR[mapId]?.[b.cls] ?? []) s.player.equipment[CONTENT.items[id]!.slot!] = newStack(s, id);
  changeMap(s, mapId, 3, 21);
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
    if (b.cls === 'mage' && s.player.mp >= 3 && s.tick >= (s.player.cooldowns['spell:fireball'] ?? 0) && s.player.spells.includes('fireball')) {
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

/** Level-12 kit for the boss fight: starting gear, potions, the spells the class can know by then. */
const BOSS_KIT: Record<ClassId, [string, number][]> = {
  knight: [['potion_hp_l', 10], ['potion_hp_s', 20], ['potion_rage', 2]],
  elf: [['potion_hp_l', 10], ['potion_hp_s', 20], ['arrow_silver', 400]],
  mage: [['potion_hp_l', 10], ['potion_hp_s', 6], ['potion_mp', 10]],
};

/** One fight against a single monster, played by the AFK logic (potions, heals, spells). */
function afkFight(b: (typeof BUILDS)[string], level: number, seed: number, mapId: string, monster: (id: string) => boolean, gear: string[] = []) {
  const s: GameState = createGame({
    config: GAME_CONFIG, content: CONTENT, maps: TILED_MAPS, seed,
    newCharacter: { classId: b.cls, stats: b.stats, startMap: 'village' },
  });
  gainExp(s, expForLevel(CONTENT, level) - s.player.exp);
  for (const [id, n] of BOSS_KIT[b.cls]) addStack(CONTENT, s.player, newStack(s, id, n));
  for (const id of gear) s.player.equipment[CONTENT.items[id]!.slot!] = newStack(s, id);
  if (b.arrow) s.player.activeArrow = 'arrow_silver';
  // Every spell sold in the village that this class can learn at this level.
  const books = Object.values(CONTENT.shops).flatMap((sh) => sh.items).filter((id) => id.startsWith('book_'));
  for (const id of books.map((bk) => bk.slice(5))) if (!learnBlock(CONTENT, s.player, id)) s.player.spells.push(id);
  s.player.afkSettings = { hpPct: 70, mpPct: 20, pickup: false, returnWhenOut: false };
  changeMap(s, mapId, mapId === 'dungeon1' ? 40 : 3, mapId === 'dungeon1' ? 20 : 21);
  const boss = s.monsters.find((x) => monster(x.defId) && !x.dead)!;
  for (const o of s.monsters) if (o !== boss) { o.dead = true; o.respawnTick = 1e9; }
  const map = currentMap(s);
  let spot = null;
  for (let r = 4; r <= 6 && !spot; r++) {
    for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      const x = boss.mover.x + dx, y = boss.mover.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && isWalkable(map, x, y) && lineOfSight(map, x, y, boss.mover.x, boss.mover.y)) spot = { x, y };
    }
  }
  if (!spot) return null;
  moverPlace(s.player.mover, spot.x, spot.y);
  const d = derive(CONTENT, s.player);
  s.player.hp = d.maxHp;
  s.player.mp = d.maxMp;
  tick(s, [{ type: 'setAfk', on: true }]);
  const pots0 = ['potion_hp_l', 'potion_hp_s'].map((id) => s.player.inventory.find((x) => x.itemId === id)?.count ?? 0);
  const start = s.tick;
  let n = 0;
  while (!boss.dead && !s.player.dead && n++ < 6000) tick(s, []);
  const pots = ['potion_hp_l', 'potion_hp_s'].map((id, i) => pots0[i]! - (s.player.inventory.find((x) => x.itemId === id)?.count ?? 0));
  return { secs: (s.tick - start) / 10, won: boss.dead, bossHpLeft: boss.dead ? 0 : boss.hp, potsL: pots[0]!, potsS: pots[1]!, maxHp: d.maxHp };
}

// SIM_FIELDS=1 npm run sim:balance: only the new-field tables, 30 fights per row (quick tuning).
const FIELDS_ONLY = !!process.env.SIM_FIELDS;
const RUNS = FIELDS_ONLY ? 30 : 100;

it('balance report', () => {
  const lines = ['# Balance simulation', '', 'Real game logic, 300 one-on-one fights each, starting 3 tiles apart with a clear shot. Mage casts fire bolt whenever possible, staff otherwise.', ''];
  for (const level of FIELDS_ONLY ? [] : [1, 10]) {
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
  for (const [mapId, level, monsters] of [['field2', 12, ['spider', 'dire_wolf', 'orc']], ['field3', 18, ['fire_wolf', 'golem', 'death_knight']]] as const) {
    lines.push(`## ${mapId}, level ${level}: one fight played by the AFK logic`, '',
      `Gear: ${Object.entries(TIER_GEAR[mapId]!).map(([c, g]) => `${c}: ${g.join(', ')}`).join('; ')}. Potions and spells as in the boss fight below.`,
      'Potions used per kill is the real cost of hunting there.', '',
      '| Build | Max HP | Monster | Wins | Time (s) | Large / small potions per fight |', '|---|---|---|---|---|---|');
    for (const [name, b] of Object.entries(BUILDS)) {
      if (name.includes('plain')) continue;
      for (const monster of monsters) {
        const runs = Array.from({ length: RUNS }, (_, i) => afkFight(b, level, i + 1, mapId, (id) => id === monster, TIER_GEAR[mapId]![b.cls])).filter((r) => r !== null);
        const avg = (f: (r: (typeof runs)[number]) => number) => (runs.reduce((t, r) => t + f(r), 0) / runs.length).toFixed(1);
        lines.push(`| ${name} | ${runs[0]!.maxHp} | ${monster} | ${Math.round((100 * runs.filter((r) => r.won).length) / runs.length)}% | ${avg((r) => r.secs)} | ${avg((r) => r.potsL)} / ${avg((r) => r.potsS)} |`);
      }
    }
    lines.push('');
  }

  if (FIELDS_ONLY) {
    writeFileSync(new URL('./balance-report-fields.md', import.meta.url), lines.join('\n'));
    return;
  }
  const boss = Object.values(CONTENT.monsters).find((m) => m.boss)!;
  lines.push('## Boss', '',
    `${boss.hp} HP. Played by the AFK logic (HP potion / heal below 70%), 100 fights per row. Kit: starting gear,`,
    '10 large + 20 small HP potions on top of the starting ones (Knight +2 rage potions, Elf 400 silver arrows;',
    'Mage only 6 small but 10 MP potions to stay under 80% weight) and every village spell the class can learn at that level.',
    'Target for the beginner area: hard but winnable at level 12.', '',
    '| Build | Lv | Max HP | Wins | Time (s) | Large / small potions used | Boss HP left when losing |', '|---|---|---|---|---|---|---|');
  for (const level of [10, 12, 15]) {
    for (const [name, b] of Object.entries(BUILDS)) {
      if (name.includes('plain')) continue;
      const runs = Array.from({ length: 100 }, (_, i) => afkFight(b, level, i + 1, 'dungeon1', (id) => !!CONTENT.monsters[id]!.boss)).filter((r) => r !== null);
      const avg = (rs: typeof runs, f: (r: (typeof runs)[number]) => number) => (rs.length ? rs.reduce((t, r) => t + f(r), 0) / rs.length : 0).toFixed(0);
      const lost = runs.filter((r) => !r.won);
      lines.push(`| ${name} | ${level} | ${runs[0]!.maxHp} | ${runs.length - lost.length}% | ${avg(runs, (r) => r.secs)} | ${avg(runs, (r) => r.potsL)} / ${avg(runs, (r) => r.potsS)} | ${lost.length ? avg(lost, (r) => r.bossHpLeft) : '—'} |`);
    }
  }
  lines.push('');
  writeFileSync(new URL('./balance-report.md', import.meta.url), lines.join('\n'));
}, 600_000);
