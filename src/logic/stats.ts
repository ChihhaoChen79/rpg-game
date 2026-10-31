// Derived stats, Exp and leveling (plan §7.2, §7.3, §7.7).
import { classDef, itemDef } from './content';
import { inventoryWeight } from './inventory';
import { rngInt } from './rng';
import { maxMagicLevel } from './magic';
import type { Content, GameState, Player } from './types';
import { BONUS_KEYS, SPELL_SCHOOLS, type StatBonus } from './types';

export interface Derived {
  maxHp: number;
  maxMp: number;
  meleeHit: number; // % added to the hit chance of melee attacks: class + level + STR
  rangedHit: number; // ... of bow shots: class + level + DEX
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
  gear: Gear; // the part of the values above that comes from equipment
}

/** What equipped items add (already included in Derived). */
export type Gear = Required<StatBonus> & { def: number; mr: number };

const sum = (a: number[]) => a.reduce((t, v) => t + v, 0);

export function derive(c: Content, p: Player): Derived {
  const b = c.balance;
  const cls = classDef(c, p.classId);
  const st = p.stats;
  const gear: Gear = { hp: 0, mp: 0, meleeDmg: 0, rangedDmg: 0, spellDmg: 0, meleeHit: 0, rangedHit: 0, def: 0, mr: 0 };
  for (const stack of Object.values(p.equipment)) {
    if (!stack) continue;
    const d = itemDef(c, stack.itemId);
    if (d.slot !== 'weapon') gear.def += (d.def ?? 0) + stack.enh;
    gear.mr += d.mr ?? 0;
    for (const k of BONUS_KEYS) gear[k] += d.bonus?.[k] ?? 0;
  }
  return {
    maxHp: cls.baseHp + st.con + sum(p.hpGains) + gear.hp,
    maxMp: cls.baseMp + Math.floor(st.int / 2) + sum(p.mpGains) + gear.mp,
    meleeHit: Math.floor(cls.hit.melee + p.level * b.hitBonusPerLevel + (st.str - 10) * b.meleeHitPerStr) + gear.meleeHit,
    rangedHit: Math.floor(cls.hit.ranged + p.level * b.hitBonusPerLevel + (st.dex - 10) * b.rangedHitPerDex) + gear.rangedHit,
    evasion: Math.max(0, Math.floor((st.dex - 10) * b.evasionPerDex)),
    meleeBonus: Math.floor((st.str - 10) / b.strDamageDiv) + gear.meleeDmg,
    rangedBonus: Math.floor((st.dex - 10) / b.dexDamageDiv) + gear.rangedDmg,
    spellBonus: Math.floor((st.int - 10) / b.intDamageDiv) + gear.spellDmg,
    healBonus: Math.max(0, Math.floor((st.wis - 10) / b.wisHealDiv)),
    def: gear.def + (p.buffs.def?.amount ?? 0),
    mr: Math.min(b.mrCap, Math.max(0, (st.wis - 10) * b.mrPerWis + gear.mr + (p.buffs.mr?.amount ?? 0))),
    weight: inventoryWeight(c, p),
    maxWeight: b.weightBase + st.str * b.weightPerStr + st.con * b.weightPerCon,
    hpRegen: 1 + Math.floor(st.con / b.hpRegenConDiv),
    mpRegen: 1 + Math.floor(st.wis / b.mpRegenWisDiv),
    gear,
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
  // Reaching a level that unlocks a new magic level for this class.
  for (const school of SPELL_SCHOOLS) {
    const before = maxMagicLevel(s.content, p.classId, school, p.level - 1);
    const now = maxMagicLevel(s.content, p.classId, school, p.level);
    if (now > before) notice(s, 'notice.newMagicLevel', { school: `spells.school.${school}`, n: now });
  }
}

/** Shown above the player and written to the log. */
export function notice(s: GameState, key: string, params?: Record<string, string | number>): void {
  s.events.push({ type: 'notice', key, params });
  s.events.push({ type: 'log', key, params, tone: 'good' });
}

export function gainExp(s: GameState, amount: number): void {
  const c = s.content;
  const p = s.player;
  p.exp += amount;
  s.events.push({ type: 'log', key: 'log.exp', params: { exp: amount }, tone: 'good' });
  while (p.level < c.balance.levelCap && p.exp >= expForLevel(c, p.level + 1)) levelUp(s);
}

/** Keep HP / MP within their maximum (after a level-down or taking off +HP / +MP gear). */
export function clampVitals(c: Content, p: Player): void {
  const d = derive(c, p);
  p.hp = Math.min(p.hp, d.maxHp);
  p.mp = Math.min(p.mp, d.maxMp);
}

function levelDown(c: Content, p: Player): void {
  p.level--;
  p.hpGains.pop();
  p.mpGains.pop();
  clampVitals(c, p);
}

/** % of the level's Exp span lost on death at this level: the last row whose fromLevel <= level. */
export function deathExpLossPct(b: Content['balance'], level: number): number {
  let pct = 0;
  for (const row of b.deathExpLossPct) if (level >= row.fromLevel) pct = row.pct;
  return pct;
}

/**
 * Death Exp penalty: lose deathExpLossPct% (by level, see balance.json) of the Exp span of the current level. May drop one
 * level, but never below deathLevelFloor; at or below the floor, Exp clamps to the level start.
 */
export function applyDeathExpLoss(c: Content, p: Player): { expLost: number; levelBefore: number; levelAfter: number } {
  const b = c.balance;
  const levelBefore = p.level;
  const before = p.exp;
  const span = expForLevel(c, p.level + 1) - expForLevel(c, p.level);
  let exp = p.exp - Math.floor((span * deathExpLossPct(b, p.level)) / 100);
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
