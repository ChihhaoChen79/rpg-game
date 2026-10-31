// Hit, damage, kills and death (plan §7.4, §7.5, §7.7, §7.8).
import { itemDef, monsterDef } from './content';
import { consumeItem, countItem, newStack } from './inventory';
import { rngChance, rngInt, type Rng } from './rng';
import { applyDeathExpLoss, derive, gainExp } from './stats';
import type { Balance, Content, EquipSlot, GameState, ItemStack, Monster, Player, WeaponStats } from './types';
import { scheduleRespawn } from './monsters';
import { playerAttackTicks } from './speed';
import { dropToGround } from './world';

// ---------------------------------------------------------------- pure formulas

/** Hit chance in %, clamped to balance.hitClamp. */
export function hitChance(b: Balance, weaponHit: number, hitBonus: number, evasion: number): number {
  return Math.min(b.hitClamp[1], Math.max(b.hitClamp[0], weaponHit + hitBonus - evasion));
}

/** Physical damage after Def: damage × 100 / (100 + Def), minimum 1. */
export function applyDef(damage: number, def: number): number {
  return Math.max(1, Math.round((damage * 100) / (100 + Math.max(0, def))));
}

/** Magic damage after MR: damage × (1 − MR%), MR capped by balance.mrCap, minimum 1. */
export function applyMr(b: Balance, damage: number, mr: number): number {
  const pct = Math.min(b.mrCap, Math.max(0, mr));
  return Math.max(1, Math.round((damage * (100 - pct)) / 100));
}

export function rollRange(r: Rng, range: [number, number], useMax: boolean): number {
  return useMax ? range[1] : rngInt(r, range[0], range[1]);
}

// ---------------------------------------------------------------- player weapon

export interface AttackProfile {
  weapon: WeaponStats;
  dmg: [number, number];
  range: number;
  arrowId: string | null; // ammo this shot uses
  arrowDamage: number;
  bowMelee: boolean;
}

/**
 * Which arrows the next shot uses: the player's chosen ammo while it lasts, otherwise the
 * weakest arrows carried, so better arrows aren't spent by accident. Null if none.
 */
export function chooseArrow(c: Content, p: Player): string | null {
  if (countItem(p, p.activeArrow) > 0) return p.activeArrow;
  let best: string | null = null;
  let bestDmg = Infinity;
  for (const st of p.inventory) {
    const d = itemDef(c, st.itemId);
    if (d.kind === 'ammo' && (d.arrowDamage ?? 0) < bestDmg) {
      best = st.itemId;
      bestDmg = d.arrowDamage ?? 0;
    }
  }
  return best;
}

/** What an attack with this weapon looks like: fists, melee weapon, bow + arrow, or bow as a club. */
export function weaponProfile(c: Content, p: Player, w: WeaponStats | undefined): AttackProfile {
  if (!w) {
    const f = c.balance.fists;
    const weapon: WeaponStats = { anim: 'slash', dmg: f.dmg, hit: f.hit, attackTicks: f.attackTicks, range: 1, ranged: false, twoHanded: false, durability: 0 };
    return { weapon, dmg: f.dmg, range: 1, arrowId: null, arrowDamage: 0, bowMelee: false };
  }
  if (w.ranged) {
    const arrowId = chooseArrow(c, p);
    if (arrowId) return { weapon: w, dmg: w.dmg, range: w.range, arrowId, arrowDamage: itemDef(c, arrowId).arrowDamage ?? 0, bowMelee: false };
    return { weapon: w, dmg: w.meleeDmg ?? [1, 1], range: 1, arrowId: null, arrowDamage: 0, bowMelee: true };
  }
  return { weapon: w, dmg: w.dmg, range: w.range, arrowId: null, arrowDamage: 0, bowMelee: false };
}

/** The player's next attack with the equipped weapon. */
export function attackProfile(c: Content, p: Player): AttackProfile {
  const st = p.equipment.weapon;
  return weaponProfile(c, p, st ? itemDef(c, st.itemId).weapon : undefined);
}

export interface DamagePreview {
  base: [number, number]; // weapon roll
  stat: 'str' | 'dex';
  statBonus: number;
  arrowId: string | null;
  arrowDamage: number;
  enh: number;
  extra: number; // 額外攻擊: the weapon's own + 1 per enhancement level
  wornPct: number; // 100 = full damage; lower when the weapon is worn
  broken: boolean;
  total: [number, number]; // before the target's Def
}

/**
 * Durability effect (plan §7.12): full damage down to half durability, then damage falls
 * linearly to 50% just before breaking; a broken weapon (0) deals 1.
 */
export function wearFactor(dur: number, max: number): number {
  if (max <= 0) return 1;
  if (dur <= 0) return 0;
  const frac = dur / max;
  return frac >= 0.5 ? 1 : 0.5 + frac;
}

function applyWear(raw: number, factor: number): number {
  return factor === 0 ? 1 : Math.max(1, Math.floor(raw * factor));
}

/**
 * Hit bonus (%) of an attack: class + level + STR (melee) or DEX (bow shot), plus the weapon's
 * accuracy and its enhancement level. A bow used as a club gets neither weapon bonus.
 */
export function attackHitBonus(c: Content, p: Player, prof: AttackProfile): number {
  const d = derive(c, p);
  const base = prof.arrowId !== null ? d.rangedHit : d.meleeHit;
  const st = p.equipment.weapon;
  if (!st || prof.bowMelee) return base;
  return base + (prof.weapon.accuracy ?? 0) + st.enh * c.balance.hitPerEnhance;
}

/**
 * Damage range of an attack, before Def (plan §7.4): weapon roll + STR (melee) or DEX (bow)
 * bonus + arrow + extra attack (the weapon's own + enhancement). Shown in item descriptions and the character window.
 */
export function damagePreview(c: Content, p: Player, w: WeaponStats | undefined, enh: number, dur?: number): DamagePreview {
  const prof = weaponProfile(c, p, w);
  const d = derive(c, p);
  const shooting = prof.arrowId !== null;
  const statBonus = shooting ? d.rangedBonus : d.meleeBonus;
  const e = prof.bowMelee ? 0 : enh;
  const extra = prof.bowMelee ? 0 : e + (w?.extraDmg ?? 0);
  const add = statBonus + prof.arrowDamage + extra;
  const f = w ? wearFactor(dur ?? w.durability, w.durability) : 1;
  return {
    base: prof.dmg, stat: shooting ? 'dex' : 'str', statBonus, arrowId: prof.arrowId, arrowDamage: prof.arrowDamage, enh: e, extra,
    wornPct: Math.round(f * 100), broken: f === 0,
    total: [applyWear(Math.max(1, prof.dmg[0] + add), f), applyWear(Math.max(1, prof.dmg[1] + add), f)],
  };
}

/** Each attack may cost the weapon 1 durability; warn at the thresholds and when it breaks. */
function wearWeapon(s: GameState, prof: AttackProfile): void {
  const st = s.player.equipment.weapon;
  const w = prof.weapon;
  if (!st || w.durability <= 0 || st.dur <= 0) return;
  const chance = (w.wearChance ?? s.content.balance.weaponWearChance) * (prof.bowMelee ? s.content.balance.bowMeleeWearMult : 1);
  if (!rngChance(s.rng, chance)) return;
  const before = (st.dur / w.durability) * 100;
  st.dur -= 1;
  const after = (st.dur / w.durability) * 100;
  const name = itemDef(s.content, st.itemId).nameKey;
  if (st.dur === 0) s.events.push({ type: 'log', key: 'log.weaponBroken', params: { item: name }, tone: 'bad' });
  else {
    for (const pct of s.content.balance.durabilityWarnPct) {
      if (before > pct && after <= pct) s.events.push({ type: 'log', key: 'log.durabilityLow', params: { item: name, pct }, tone: 'bad' });
    }
  }
}

// ---------------------------------------------------------------- attacks

export function playerAttack(s: GameState, m: Monster): void {
  const c = s.content;
  const p = s.player;
  const md = monsterDef(c, m.defId);
  const d = derive(c, p);
  const prof = attackProfile(c, p);
  if (prof.arrowId) consumeItem(p, prof.arrowId);
  wearWeapon(s, prof);
  p.actionReadyTick = s.tick + playerAttackTicks(s, prof.weapon.attackTicks);
  p.lastCombatTick = s.tick;
  m.lastHitTick = s.tick;
  s.events.push({ type: 'attack', from: 'player', to: m.id, style: prof.arrowId ? 'arrow' : 'melee' });

  if (!rngChance(s.rng, hitChance(c.balance, prof.weapon.hit, attackHitBonus(c, p, prof), md.evasion) / 100)) {
    s.events.push({ type: 'damage', to: m.id, amount: 0, miss: true, magic: false });
    provoke(m);
    return;
  }
  // 額外攻擊 (the weapon's extra damage + 1 per enhancement level) is added after the roll.
  const extra = prof.bowMelee ? 0 : (p.equipment.weapon?.enh ?? 0) + (prof.weapon.extraDmg ?? 0);
  const bonus = prof.arrowId ? d.rangedBonus + prof.arrowDamage : d.meleeBonus;
  const raw = rollRange(s.rng, prof.dmg, s.tick < p.maxDamageUntil) + bonus + extra;
  const st = p.equipment.weapon;
  const worn = applyWear(Math.max(1, raw), st ? wearFactor(st.dur, prof.weapon.durability) : 1);
  damageMonster(s, m, applyDef(worn, md.def), false);
}

export function damageMonster(s: GameState, m: Monster, amount: number, magic: boolean): void {
  m.hp -= amount;
  m.lastHitTick = s.tick;
  s.player.lastCombatTick = s.tick;
  s.events.push({ type: 'damage', to: m.id, amount, miss: false, magic });
  if (m.hp <= 0) killMonster(s, m);
  else provoke(m);
}

/** Passive monsters fight back once hit. */
function provoke(m: Monster): void {
  if (m.ai === 'idle') m.ai = 'chase';
}

function killMonster(s: GameState, m: Monster): void {
  const c = s.content;
  const md = monsterDef(c, m.defId);
  const p = s.player;
  m.dead = true;
  m.hp = 0;
  m.mover.path = [];
  scheduleRespawn(s, m);
  s.events.push({ type: 'monsterDied', id: m.id });
  s.events.push({ type: 'log', key: 'log.killed', params: { monster: md.nameKey } });
  if (p.action.kind === 'attack' && p.action.monsterId === m.id) p.action = { kind: 'none' };

  gainExp(s, md.exp);
  // Killing evil raises Alignment, killing good lowers it (plan §7.8).
  const delta = Math.round(-md.alignment / c.balance.alignmentKillDiv);
  if (delta !== 0) p.alignment = Math.max(-1000, Math.min(1000, p.alignment + delta));

  const { x, y } = m.mover;
  const gold = rngInt(s.rng, md.gold[0], md.gold[1]);
  if (gold > 0) dropToGround(s, x, y, newStack(s, 'gold', gold));
  for (const drop of md.drops) {
    if (!rngChance(s.rng, drop.chance)) continue;
    const n = drop.count ? rngInt(s.rng, drop.count[0], drop.count[1]) : 1;
    dropToGround(s, x, y, newStack(s, drop.itemId, n));
  }
}

export function monsterAttack(s: GameState, m: Monster): void {
  const c = s.content;
  const p = s.player;
  const md = monsterDef(c, m.defId);
  const d = derive(c, p);
  m.actionReadyTick = s.tick + md.attackTicks;
  p.lastCombatTick = s.tick;
  s.events.push({ type: 'attack', from: m.id, to: 'player', style: 'melee' });
  if (!rngChance(s.rng, hitChance(c.balance, md.hit, 0, d.evasion) / 100)) {
    s.events.push({ type: 'damage', to: 'player', amount: 0, miss: true, magic: false });
    return;
  }
  const amount = applyDef(rngInt(s.rng, md.dmg[0], md.dmg[1]), d.def);
  p.hp -= amount;
  s.events.push({ type: 'damage', to: 'player', amount, miss: false, magic: false });
  if (p.hp <= 0) playerDie(s);
}

/** Chance (0..1) to drop one equipped item on death, from Alignment (plan §7.8). */
export function deathDropChance(b: Balance, alignment: number): number {
  const at = b.alignmentLabelAt;
  const base = b.deathDropPct / 100;
  if (alignment >= at) return Math.max(0, base * (1000 - alignment) / (1000 - at));
  if (alignment <= -at) return Math.min(b.deathDropEvilMaxPct / 100, base + (b.deathDropEvilMaxPct / 100 - base) * (-alignment - at) / (1000 - at));
  return base;
}

/** Death may drop one random equipped item on the death tile, unless a protection scroll is active. */
function deathDrop(s: GameState): { dropped: ItemStack | null; protectionUsed: boolean } {
  const p = s.player;
  if (p.protected) {
    p.protected = false; // used up by dying, needed or not
    return { dropped: null, protectionUsed: true };
  }
  const slots = (Object.keys(p.equipment) as EquipSlot[]).filter((k) => p.equipment[k]);
  if (!slots.length || !rngChance(s.rng, deathDropChance(s.content.balance, p.alignment))) return { dropped: null, protectionUsed: false };
  const slot = slots[rngInt(s.rng, 0, slots.length - 1)]!;
  const st = p.equipment[slot]!;
  delete p.equipment[slot];
  dropToGround(s, p.mover.x, p.mover.y, st);
  return { dropped: { ...st }, protectionUsed: false };
}

export function playerDie(s: GameState): void {
  const p = s.player;
  const drop = deathDrop(s);
  p.hp = 0;
  p.dead = true;
  p.action = { kind: 'none' };
  p.dest = null;
  p.mover.path = [];
  p.maxDamageUntil = 0;
  p.buffs = {};
  const r = applyDeathExpLoss(s.content, p);
  for (const m of s.monsters) if (m.ai === 'chase') m.ai = 'return';
  s.events.push({ type: 'playerDied', ...r, ...drop });
  s.events.push({ type: 'log', key: 'log.died', params: { exp: r.expLost }, tone: 'bad' });
}
