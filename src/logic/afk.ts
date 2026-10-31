// Auto-hunt and assist (docs/PLAN.md §7.22). Assist features have their own switches and also
// work while playing by hand: rules ("HP below 30% → use this potion"), buffs to keep up and
// picking up loot. Auto-hunt (the 自動 button) adds the fighting: attack mode, resting,
// targeting, hunt radius and going home. Any manual move, death or leaving the map turns
// auto-hunt off. Runs inside the tick, so it is deterministic like everything else.
import { normalizeAfkSettings } from './afkSettings';
import { itemDef, monsterDef, spellDef } from './content';
import { cannotAdd, countItem } from './inventory';
import { chebyshev } from './map';
import { castSpell, orderAttack, orderMove, orderPickup, useItem } from './player';
import { rngInt } from './rng';
import { derive } from './stats';
import type { AfkAction, AfkRuleStat, AfkSettings, GameState, ItemStack, Monster, SpellDef } from './types';
import { SPEED_STAGES } from './types';
import { currentMap, monsterById, playerInSafeZone } from './world';

export function setAfk(s: GameState, on: boolean): void {
  const p = s.player;
  if (!on) {
    if (p.afk) stopAfk(s, 'log.afkOff');
    return;
  }
  if (p.afk || p.dead) return;
  if (currentMap(s).spawns.length === 0) {
    s.events.push({ type: 'log', key: 'log.afkNoMonsters', tone: 'bad' });
    return;
  }
  p.afk = { mapId: s.mapId, origin: { x: p.mover.x, y: p.mover.y }, targetId: null, skip: {}, resting: false };
  s.events.push({ type: 'log', key: 'log.afkOn', tone: 'good' });
}

export function stopAfk(s: GameState, key: string): void {
  if (!s.player.afk) return;
  s.player.afk = null;
  s.events.push({ type: 'log', key, tone: key === 'log.afkOff' ? 'info' : 'bad' });
}

export function setAfkSettings(s: GameState, v: AfkSettings): void {
  s.player.afkSettings = normalizeAfkSettings(s.content, v);
}

const ready = (s: GameState, key: string): boolean => s.tick >= (s.player.cooldowns[key] ?? 0);

/** Can this item be used right now (owned, allowed for the class, off cooldown)? */
function usableStack(s: GameState, itemId: string): ItemStack | undefined {
  const d = itemDef(s.content, itemId);
  if (d.classes && !d.classes.includes(s.player.classId)) return undefined;
  if (d.cooldownGroup && !ready(s, d.cooldownGroup)) return undefined;
  return s.player.inventory.find((st) => st.itemId === itemId);
}

/** The first potion in the bag that restores `stat` and is ready, and whether any is carried. */
function potionFor(s: GameState, stat: 'hp' | 'mp'): { stack: ItemStack | undefined; any: boolean } {
  let any = false;
  for (const st of s.player.inventory) {
    const d = itemDef(s.content, st.itemId);
    if (d.use?.type !== 'heal' || !d.use[stat]) continue;
    if (d.classes && !d.classes.includes(s.player.classId)) continue;
    any = true;
    if (!d.cooldownGroup || ready(s, d.cooldownGroup)) return { stack: st, any };
  }
  return { stack: undefined, any };
}

/** Spells we know that pass `pick` and can be cast now, strongest first. */
function knownSpells(s: GameState, pick: (sp: SpellDef) => boolean): [string, SpellDef][] {
  const p = s.player;
  return p.spells.map((id) => [id, spellDef(s.content, id)] as [string, SpellDef])
    .filter(([id, sp]) => pick(sp) && p.mp >= sp.mp && ready(s, `spell:${id}`))
    .sort((a, b) => b[1].magicLevel - a[1].magicLevel);
}

/** Can a self spell be cast right now? */
function canCastSelf(s: GameState, id: string): boolean {
  const p = s.player;
  return p.spells.includes(id) && p.mp >= spellDef(s.content, id).mp && ready(s, `spell:${id}`) && s.tick >= p.actionReadyTick;
}

/** Read a return scroll (if any) and stop. */
function returnAndStop(s: GameState, key: string): void {
  const scroll = s.player.inventory.find((st) => itemDef(s.content, st.itemId).use?.type === 'return');
  stopAfk(s, key);
  if (scroll) useItem(s, scroll.uid);
}

/** Try one rule action. Returns true if it did something. */
function doAction(s: GameState, a: AfkAction): boolean {
  switch (a.kind) {
    case 'item': {
      const st = usableStack(s, a.itemId);
      if (!st) return false;
      useItem(s, st.uid);
      return true;
    }
    case 'spell':
      if (!canCastSelf(s, a.spellId)) return false;
      castSpell(s, a.spellId);
      return true;
    case 'hpPotion':
    case 'mpPotion': {
      const pot = potionFor(s, a.kind === 'hpPotion' ? 'hp' : 'mp');
      if (!pot.stack) return false;
      useItem(s, pot.stack.uid);
      return true;
    }
    case 'bestHeal': {
      if (s.tick < s.player.actionReadyTick) return false;
      const heal = knownSpells(s, (sp) => sp.effect.type === 'heal')[0];
      if (!heal) return false;
      castSpell(s, heal[0]);
      return true;
    }
    case 'return': {
      // Not from a safe zone (already home); by hand only with a return scroll to read.
      if (playerInSafeZone(s)) return false;
      const hasScroll = s.player.inventory.some((st) => itemDef(s.content, st.itemId).use?.type === 'return');
      if (!hasScroll && !s.player.afk) return false;
      returnAndStop(s, 'log.afkRuleReturn');
      return true;
    }
  }
}

/** How many the player carries, for a count rule: one item, all arrows, all HP / MP potions. */
function ruleCount(s: GameState, stat: AfkRuleStat, itemId?: string): number {
  const p = s.player;
  if (stat === 'count') return countItem(p, itemId ?? '');
  let n = 0;
  for (const st of p.inventory) {
    const d = itemDef(s.content, st.itemId);
    if (d.classes && !d.classes.includes(p.classId)) continue;
    if (stat === 'ammo' ? d.kind === 'ammo' : d.use?.type === 'heal' && !!d.use[stat === 'hpPotions' ? 'hp' : 'mp']) n += st.count;
  }
  return n;
}

/**
 * The player's rules, top to bottom: the first one whose condition holds and that can act now
 * runs (one whose potion is on cooldown or used up lets the next one try). Returns true if
 * something was done this tick.
 */
function runRules(s: GameState): boolean {
  const p = s.player;
  const d = derive(s.content, p);
  const set = p.afkSettings;
  let hpLow = false;
  for (const r of set.rules) {
    const holds = r.stat === 'hp' ? p.hp * 100 < d.maxHp * r.below
      : r.stat === 'mp' ? p.mp * 100 < d.maxMp * r.below
        : ruleCount(s, r.stat, r.itemId) < r.below;
    if (!holds) continue;
    if (r.stat === 'hp') hpLow = true;
    if (doAction(s, r.action)) return true;
  }
  // Auto-hunting, HP is low, nothing could help, and no HP potion is left: go home.
  if (p.afk && hpLow && set.returnWhenOut && !potionFor(s, 'hp').any) {
    returnAndStop(s, 'log.afkOutOfPotions');
    return true;
  }
  return false;
}

/** Is this buff ("spell:<id>" / "item:<id>") active on the player? */
function buffActive(s: GameState, key: string): boolean {
  const p = s.player;
  const [kind, id] = key.split(':') as [string, string];
  const effect = kind === 'spell' ? spellDef(s.content, id).effect : null;
  const use = kind === 'item' ? itemDef(s.content, id).use : null;
  if (effect?.type === 'buffDef') return !!p.buffs.def;
  if (effect?.type === 'buffMr') return !!p.buffs.mr;
  if (effect?.type === 'maxDamage' || use?.type === 'maxDamage') return p.maxDamageUntil > s.tick;
  if (use?.type === 'haste') return SPEED_STAGES.includes(use.stage) && (p.buffs.speed?.[use.stage]?.until ?? 0) > s.tick;
  return true;
}

/** Renew one missing buff from the player's list. Returns true if it did something. */
function keepBuffs(s: GameState, monstersNear: boolean): boolean {
  const set = s.player.afkSettings;
  if (set.buffs.length === 0 || (set.buffNearMonsters && !monstersNear)) return false;
  for (const key of set.buffs) {
    if (buffActive(s, key)) continue;
    const [kind, id] = key.split(':') as [string, string];
    if (kind === 'spell' && canCastSelf(s, id)) {
      castSpell(s, id);
      return true;
    }
    if (kind === 'item') {
      const st = usableStack(s, id);
      if (st) {
        useItem(s, st.uid);
        return true;
      }
    }
  }
  return false;
}

/** Nearest loot we can carry and want, within reach. */
function lootNearby(s: GameState): number | null {
  const p = s.player;
  const d = derive(s.content, p);
  const ignore = p.afkSettings.ignore;
  let best: number | null = null;
  let bestD = Infinity;
  for (const g of s.groundItems) {
    if (g.mapId !== s.mapId || ignore.includes(g.item.itemId)) continue;
    const dd = chebyshev(p.mover.x, p.mover.y, g.x, g.y);
    if (dd > s.content.balance.afkPickupRange || dd >= bestD) continue;
    if (cannotAdd(s.content, p, d.maxWeight, d.weight, g.item.itemId, g.item.count)) continue;
    best = g.id;
    bestD = dd;
  }
  return best;
}

/** Inside the hunt area (huntRadius tiles around where auto-hunt started; 0 = anywhere)? */
function inHuntArea(s: GameState, x: number, y: number): boolean {
  const r = s.player.afkSettings.huntRadius;
  const o = s.player.afk!.origin;
  return r <= 0 || chebyshev(o.x, o.y, x, y) <= r;
}

/** Is this monster fighting us? */
const attackingUs = (m: Monster): boolean => m.ai === 'chase';

function nearestMonster(s: GameState): number | null {
  const p = s.player;
  const afk = p.afk!;
  const set = p.afkSettings;
  let best: number | null = null;
  let bestD = Infinity;
  for (const m of s.monsters) {
    if (m.dead || (afk.skip[m.id] ?? 0) > s.tick) continue;
    const fighting = attackingUs(m);
    // Bosses and monsters outside the hunt area are left alone unless they come for us.
    if (!fighting && set.avoidBoss && monsterDef(s.content, m.defId).boss) continue;
    if (!fighting && !inHuntArea(s, m.mover.x, m.mover.y)) continue;
    const dd = chebyshev(p.mover.x, p.mover.y, m.mover.x, m.mover.y);
    const score = set.targetAttackers && fighting ? dd - 100 : dd;
    if (dd > s.content.balance.afkSearchRange || score >= bestD) continue;
    best = m.id;
    bestD = score;
  }
  return best;
}

/** Walk to a random tile in one of this map's spawn areas (inside the hunt area if one is set). */
function wander(s: GameState): void {
  const p = s.player;
  const o = p.afk!.origin;
  const r = p.afkSettings.huntRadius;
  if (r > 0) {
    orderMove(s, { x: o.x + rngInt(s.rng, -r, r), y: o.y + rngInt(s.rng, -r, r) });
    return;
  }
  const spawns = currentMap(s).spawns;
  const a = spawns[rngInt(s.rng, 0, spawns.length - 1)]!;
  orderMove(s, { x: a.x + rngInt(s.rng, 0, a.w - 1), y: a.y + rngInt(s.rng, 0, a.h - 1) });
}

/**
 * Resting: below the rest HP / MP %, stand still until both are back to afkRestResumePct.
 * Not while carrying more than half the weight limit (nothing regenerates then).
 */
function updateResting(s: GameState): boolean {
  const p = s.player;
  const afk = p.afk!;
  const set = p.afkSettings;
  const d = derive(s.content, p);
  const b = s.content.balance;
  if (d.weight > d.maxWeight * b.weightNoRegen) {
    afk.resting = false;
    return false;
  }
  const hpPct = (p.hp * 100) / d.maxHp;
  const mpPct = d.maxMp > 0 ? (p.mp * 100) / d.maxMp : 100;
  if (!afk.resting && ((set.restHpPct > 0 && hpPct < set.restHpPct) || (set.restMpPct > 0 && mpPct < set.restMpPct))) {
    afk.resting = true;
    s.events.push({ type: 'log', key: 'log.afkRest' });
  } else if (afk.resting && hpPct >= b.afkRestResumePct && mpPct >= b.afkRestResumePct) {
    afk.resting = false;
    s.events.push({ type: 'log', key: 'log.afkRestDone' });
  }
  return afk.resting;
}

/** The attack spell to use on the target now, or null for a weapon attack. */
function chooseSpell(s: GameState): string | null {
  const p = s.player;
  const a = p.afkSettings.attack;
  if (a.kind === 'weapon') return null;
  if (a.kind === 'spell') {
    const sp = s.content.spells[a.spellId];
    return sp && p.spells.includes(a.spellId) && p.mp >= sp.mp ? a.spellId : null;
  }
  // auto: the strongest attack spell we can afford, keeping enough MP for one heal spell
  const healMp = Math.min(...p.spells.map((id) => spellDef(s.content, id)).filter((sp) => sp.effect.type === 'heal').map((sp) => sp.mp), Infinity);
  const reserve = Number.isFinite(healMp) ? healMp : 0;
  return knownSpells(s, (sp) => sp.target === 'enemy').find(([, sp]) => p.mp - sp.mp >= reserve)?.[0] ?? null;
}

const STOPPERS = ['log.cannotAttackHeavy', 'log.cannotMoveHeavy'];
const GIVE_UP = ['log.unreachable', 'log.noCombatInSafeZone'];
const loggedThisTick = (s: GameState, keys: string[]): boolean =>
  s.events.some((e) => e.type === 'log' && keys.includes(e.key));

/** Standing still by hand: no order, not walking. */
const idle = (s: GameState): boolean => {
  const p = s.player;
  return p.action.kind === 'none' && !p.mover.moving && p.mover.path.length === 0 && !p.dest;
};

export function afkTick(s: GameState): void {
  const p = s.player;
  if (p.dead) {
    if (p.afk) stopAfk(s, 'log.afkStopped');
    return;
  }
  if (p.afk && (s.mapId !== p.afk.mapId || loggedThisTick(s, STOPPERS))) stopAfk(s, 'log.afkStopped');
  const set = p.afkSettings;
  if (p.afk) {
    const d = derive(s.content, p);
    if (set.returnWeightPct > 0 && d.weight * 100 > d.maxWeight * set.returnWeightPct) {
      returnAndStop(s, 'log.afkTooHeavy');
      return;
    }
  }
  if (set.rulesOn && runRules(s)) return;
  const afk = p.afk;
  if (!afk) {
    // Playing by hand: only the assist features.
    const near = s.monsters.some((m) => !m.dead && (attackingUs(m) || chebyshev(p.mover.x, p.mover.y, m.mover.x, m.mover.y) <= s.content.balance.afkSearchRange));
    if (set.buffsOn && keepBuffs(s, near)) return;
    if (set.pickup && idle(s) && !playerInSafeZone(s)) {
      const g = lootNearby(s);
      if (g !== null) orderPickup(s, g);
    }
    return;
  }

  // Drop a target that died, or that we couldn't reach (ignore it for a while).
  const busy = p.action.kind === 'attack' || p.action.kind === 'cast';
  if (afk.targetId !== null) {
    const m = monsterById(s, afk.targetId);
    if (!m) afk.targetId = null;
    else if (!busy && loggedThisTick(s, GIVE_UP)) {
      afk.skip[afk.targetId] = s.tick + s.content.balance.afkSkipTicks;
      afk.targetId = null;
    }
  }

  const attacked = s.monsters.some((m) => !m.dead && attackingUs(m));
  const near = attacked || s.monsters.some((m) => !m.dead && chebyshev(p.mover.x, p.mover.y, m.mover.x, m.mover.y) <= s.content.balance.afkSearchRange);
  if (set.buffsOn && keepBuffs(s, near)) return;

  // Resting: stand still, but defend ourselves.
  if (updateResting(s) && !attacked) {
    if (p.action.kind !== 'none' || p.mover.path.length > 0) {
      p.action = { kind: 'none' };
      p.mover.path = [];
      p.dest = null;
    }
    afk.targetId = null;
    return;
  }

  if (afk.targetId === null) {
    if (set.pickup && p.action.kind !== 'pickup') {
      const g = lootNearby(s);
      if (g !== null) {
        orderPickup(s, g);
        return;
      }
    }
    if (p.action.kind === 'pickup') return;
    const id = nearestMonster(s);
    if (id === null) {
      if (!p.mover.moving && p.mover.path.length === 0 && !p.dest) wander(s);
      return;
    }
    afk.targetId = id;
  }

  if (playerInSafeZone(s)) {
    if (!busy) orderAttack(s, afk.targetId); // reports the safe zone and gives the target up
    return;
  }
  // Attack: a spell walks only into the spell's range and waits there for its cooldown, so
  // casters (and bows, through the weapon's range) keep their distance; else the weapon.
  if (p.action.kind === 'cast') return;
  const spell = chooseSpell(s);
  if (spell) {
    if (ready(s, `spell:${spell}`)) castSpell(s, spell, afk.targetId);
    else if (p.action.kind === 'attack') p.action = { kind: 'none' }; // wait in place
    return;
  }
  if (p.action.kind !== 'attack' || p.action.monsterId !== afk.targetId) orderAttack(s, afk.targetId);
}
