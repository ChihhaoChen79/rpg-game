// Hit, damage, kills and death (plan §7.4, §7.5, §7.7, §7.8).
import { itemDef, monsterDef } from './content';
import { consumeItem, countItem, newStack } from './inventory';
import { rngChance, rngInt, type Rng } from './rng';
import { applyDeathExpLoss, derive, gainExp } from './stats';
import type { Balance, Content, GameState, Monster, Player, WeaponStats } from './types';
import { currentMap, dropToGround } from './world';

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
  usesArrow: boolean;
  bowMelee: boolean;
}

/** What the player's next attack looks like: equipped weapon, fists, or a bow without arrows. */
export function attackProfile(c: Content, p: Player): AttackProfile {
  const st = p.equipment.weapon;
  const w = st ? itemDef(c, st.itemId).weapon : undefined;
  if (!w) {
    const f = c.balance.fists;
    const weapon: WeaponStats = { dmg: f.dmg, hit: f.hit, attackTicks: f.attackTicks, range: 1, ranged: false, twoHanded: false, durability: 0 };
    return { weapon, dmg: f.dmg, range: 1, usesArrow: false, bowMelee: false };
  }
  if (w.ranged) {
    if (countItem(p, 'arrow') > 0) return { weapon: w, dmg: w.dmg, range: w.range, usesArrow: true, bowMelee: false };
    return { weapon: w, dmg: w.meleeDmg ?? [1, 1], range: 1, usesArrow: false, bowMelee: true };
  }
  return { weapon: w, dmg: w.dmg, range: w.range, usesArrow: false, bowMelee: false };
}

// ---------------------------------------------------------------- attacks

export function playerAttack(s: GameState, m: Monster): void {
  const c = s.content;
  const p = s.player;
  const md = monsterDef(c, m.defId);
  const d = derive(c, p);
  const prof = attackProfile(c, p);
  if (prof.usesArrow) consumeItem(p, 'arrow');
  p.actionReadyTick = s.tick + prof.weapon.attackTicks;
  p.lastCombatTick = s.tick;
  m.lastHitTick = s.tick;
  s.events.push({ type: 'attack', from: 'player', to: m.id, style: prof.usesArrow ? 'arrow' : 'melee' });

  if (!rngChance(s.rng, hitChance(c.balance, prof.weapon.hit, d.hitBonus, md.evasion) / 100)) {
    s.events.push({ type: 'damage', to: m.id, amount: 0, miss: true, magic: false });
    provoke(m);
    return;
  }
  const enh = p.equipment.weapon?.enh ?? 0;
  const bonus = prof.usesArrow ? d.rangedBonus : d.meleeBonus;
  const raw = rollRange(s.rng, prof.dmg, s.tick < p.maxDamageUntil) + bonus + (prof.bowMelee ? 0 : enh);
  damageMonster(s, m, applyDef(raw, md.def), false);
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
  m.respawnTick = s.tick + (currentMap(s).spawns[m.spawnIdx]?.respawnTicks ?? 0);
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

export function playerDie(s: GameState): void {
  const p = s.player;
  p.hp = 0;
  p.dead = true;
  p.action = { kind: 'none' };
  p.dest = null;
  p.mover.path = [];
  p.maxDamageUntil = 0;
  const r = applyDeathExpLoss(s.content, p);
  for (const m of s.monsters) if (m.ai === 'chase') m.ai = 'return';
  s.events.push({ type: 'playerDied', ...r });
  s.events.push({ type: 'log', key: 'log.died', params: { exp: r.expLost }, tone: 'bad' });
}
