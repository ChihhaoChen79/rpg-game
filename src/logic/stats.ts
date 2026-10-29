// Derived stats, Exp and leveling (plan §7.2, §7.3, §7.7).
import { classDef, itemDef } from './content';
import { inventoryWeight } from './inventory';
import { rngInt } from './rng';
import type { Content, GameState, Player } from './types';

export interface Derived {
  maxHp: number;
  maxMp: number;
  hitBonus: number; // % added to weapon hit rate
  evasion: number; // % subtracted from attackers' hit chance
  meleeBonus: number; // damage
  rangedBonus: number;
  spellBonus: number;
  healBonus: number;
  def: number;
  mr: number; // %
  weight: number; // tenths
  maxWeight: number;
  hpRegen: number; // per regen interval, before the safe-zone multiplier
  mpRegen: number;
}

const sum = (a: number[]) => a.reduce((t, v) => t + v, 0);

export function derive(c: Content, p: Player): Derived {
  const b = c.balance;
  const cls = classDef(c, p.classId);
  const st = p.stats;
  let def = 0;
  let mrGear = 0;
  for (const stack of Object.values(p.equipment)) {
    if (!stack) continue;
    const d = itemDef(c, stack.itemId);
    if (d.slot !== 'weapon') def += (d.def ?? 0) + stack.enh;
    mrGear += d.mr ?? 0;
  }
  return {
    maxHp: cls.baseHp + st.con + sum(p.hpGains),
    maxMp: cls.baseMp + Math.floor(st.int / 2) + sum(p.mpGains),
    hitBonus: Math.floor((st.dex - 10) * b.hitBonusPerDex + p.level * b.hitBonusPerLevel),
    evasion: Math.max(0, Math.floor((st.dex - 10) * b.evasionPerDex)),
    meleeBonus: Math.floor((st.str - 10) / b.strDamageDiv),
    rangedBonus: Math.floor((st.dex - 10) / b.dexDamageDiv),
    spellBonus: Math.floor((st.int - 10) / b.intDamageDiv),
    healBonus: Math.max(0, Math.floor((st.wis - 10) / b.wisHealDiv)),
    def: def + (p.buffs.def?.amount ?? 0),
    mr: Math.min(b.mrCap, Math.max(0, (st.wis - 10) * b.mrPerWis + mrGear + (p.buffs.mr?.amount ?? 0))),
    weight: inventoryWeight(c, p),
    maxWeight: (st.str + st.con) * b.weightPerStat,
    hpRegen: 1 + Math.floor(st.con / b.hpRegenConDiv),
    mpRegen: 1 + Math.floor(st.wis / b.mpRegenWisDiv),
  };
}

/** Total Exp needed to reach `level`. */
export function expForLevel(c: Content, level: number): number {
  const t = c.totalExp;
  return t[Math.min(Math.max(level, 1), t.length) - 1] ?? 0;
}

/** Exp progress inside the current level, 0..1 (1 at the level cap). */
export function levelProgress(c: Content, p: Player): number {
  if (p.level >= c.balance.levelCap) return 1;
  const lo = expForLevel(c, p.level);
  const hi = expForLevel(c, p.level + 1);
  return hi > lo ? Math.min(1, Math.max(0, (p.exp - lo) / (hi - lo))) : 1;
}

function levelUp(s: GameState): void {
  const p = s.player;
  const cls = classDef(s.content, p.classId);
  const hp = rngInt(s.rng, cls.hpGain[0], cls.hpGain[1]);
  const mp = rngInt(s.rng, cls.mpGain[0], cls.mpGain[1]);
  p.level++;
  p.hpGains.push(hp); // recorded so a level-down removes exactly this (plan §7.3)
  p.mpGains.push(mp);
  p.hp += hp;
  p.mp += mp;
  s.events.push({ type: 'levelUp', level: p.level });
  s.events.push({ type: 'log', key: 'log.levelUp', params: { level: p.level }, tone: 'good' });
}

export function gainExp(s: GameState, amount: number): void {
  const c = s.content;
  const p = s.player;
  p.exp += amount;
  s.events.push({ type: 'log', key: 'log.exp', params: { exp: amount }, tone: 'good' });
  while (p.level < c.balance.levelCap && p.exp >= expForLevel(c, p.level + 1)) levelUp(s);
}

function levelDown(c: Content, p: Player): void {
  p.level--;
  p.hpGains.pop();
  p.mpGains.pop();
  const d = derive(c, p);
  p.hp = Math.min(p.hp, d.maxHp);
  p.mp = Math.min(p.mp, d.maxMp);
}

/**
 * Death Exp penalty: lose deathExpLossPct% of the Exp span of the current level. May drop one
 * level, but never below deathLevelFloor; at or below the floor, Exp clamps to the level start.
 */
export function applyDeathExpLoss(c: Content, p: Player): { expLost: number; levelBefore: number; levelAfter: number } {
  const b = c.balance;
  const levelBefore = p.level;
  const before = p.exp;
  const span = expForLevel(c, p.level + 1) - expForLevel(c, p.level);
  let exp = p.exp - Math.floor((span * b.deathExpLossPct) / 100);
  if (exp < expForLevel(c, p.level)) {
    if (p.level > b.deathLevelFloor) {
      levelDown(c, p);
      exp = Math.max(exp, expForLevel(c, p.level));
    } else {
      exp = expForLevel(c, p.level);
    }
  }
  p.exp = exp;
  return { expLost: before - exp, levelBefore, levelAfter: p.level };
}
