// AFK auto-hunt: while on, the game fights for the player. It targets the nearest monster, casts
// the strongest attack spell it can afford, drinks potions below the set HP/MP %, picks up loot
// and wanders the map's spawn areas when nothing is around. Any manual move, death or leaving
// the map turns it off. Runs inside the tick, so it is deterministic like everything else.
import { itemDef, spellDef } from './content';
import { cannotAdd } from './inventory';
import { chebyshev } from './map';
import { castSpell, orderAttack, orderMove, orderPickup, useItem } from './player';
import { rngInt } from './rng';
import { derive } from './stats';
import type { AfkSettings, GameState, ItemStack, SpellDef } from './types';
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
  p.afk = { mapId: s.mapId, targetId: null, skip: {} };
  s.events.push({ type: 'log', key: 'log.afkOn', tone: 'good' });
}

export function stopAfk(s: GameState, key: string): void {
  if (!s.player.afk) return;
  s.player.afk = null;
  s.events.push({ type: 'log', key, tone: key === 'log.afkOff' ? 'info' : 'bad' });
}

export function setAfkSettings(s: GameState, v: AfkSettings): void {
  const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  s.player.afkSettings = { hpPct: pct(v.hpPct), mpPct: pct(v.mpPct), pickup: !!v.pickup, returnWhenOut: !!v.returnWhenOut };
}

const ready = (s: GameState, key: string): boolean => s.tick >= (s.player.cooldowns[key] ?? 0);

/** The first potion in the bag that restores `stat` and is off cooldown (undefined if none ready). */
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

function knownSpells(s: GameState, pick: (sp: SpellDef) => boolean): [string, SpellDef][] {
  const p = s.player;
  return p.spells.map((id) => [id, spellDef(s.content, id)] as [string, SpellDef])
    .filter(([id, sp]) => pick(sp) && p.mp >= sp.mp && ready(s, `spell:${id}`))
    .sort((a, b) => b[1].magicLevel - a[1].magicLevel);
}

/** Keep HP and MP up. Returns true if it did something this tick. */
function selfCare(s: GameState): boolean {
  const p = s.player;
  const d = derive(s.content, p);
  const set = p.afkSettings;
  if (p.hp * 100 < d.maxHp * set.hpPct) {
    if (s.tick >= p.actionReadyTick) {
      const heal = knownSpells(s, (sp) => sp.effect.type === 'heal')[0];
      if (heal) {
        castSpell(s, heal[0]);
        return true;
      }
    }
    const pot = potionFor(s, 'hp');
    if (pot.stack) {
      useItem(s, pot.stack.uid);
      return true;
    }
    if (!pot.any && set.returnWhenOut) {
      const scroll = p.inventory.find((st) => itemDef(s.content, st.itemId).use?.type === 'return');
      stopAfk(s, 'log.afkOutOfPotions');
      if (scroll) useItem(s, scroll.uid);
      return true;
    }
  }
  if (p.mp * 100 < d.maxMp * set.mpPct) {
    const pot = potionFor(s, 'mp');
    if (pot.stack) {
      useItem(s, pot.stack.uid);
      return true;
    }
  }
  return false;
}

/** Nearest loot we can carry, within reach and not under a monster fight. */
function lootNearby(s: GameState): number | null {
  const p = s.player;
  const d = derive(s.content, p);
  let best: number | null = null;
  let bestD = Infinity;
  for (const g of s.groundItems) {
    if (g.mapId !== s.mapId) continue;
    const dd = chebyshev(p.mover.x, p.mover.y, g.x, g.y);
    if (dd > s.content.balance.afkPickupRange || dd >= bestD) continue;
    if (cannotAdd(s.content, p, d.maxWeight, d.weight, g.item.itemId, g.item.count)) continue;
    best = g.id;
    bestD = dd;
  }
  return best;
}

function nearestMonster(s: GameState): number | null {
  const p = s.player;
  const afk = p.afk!;
  let best: number | null = null;
  let bestD = Infinity;
  for (const m of s.monsters) {
    if (m.dead || (afk.skip[m.id] ?? 0) > s.tick) continue;
    const dd = chebyshev(p.mover.x, p.mover.y, m.mover.x, m.mover.y);
    // Monsters already fighting us come first.
    const score = m.ai === 'chase' ? dd - 100 : dd;
    if (dd > s.content.balance.afkSearchRange || score >= bestD) continue;
    best = m.id;
    bestD = score;
  }
  return best;
}

/** Walk to a random tile in one of this map's spawn areas. */
function wander(s: GameState): void {
  const spawns = currentMap(s).spawns;
  const a = spawns[rngInt(s.rng, 0, spawns.length - 1)]!;
  const x = a.x + rngInt(s.rng, 0, a.w - 1);
  const y = a.y + rngInt(s.rng, 0, a.h - 1);
  orderMove(s, { x, y });
}

const STOPPERS = ['log.cannotAttackHeavy', 'log.cannotMoveHeavy'];
const GIVE_UP = ['log.unreachable', 'log.noCombatInSafeZone'];
const loggedThisTick = (s: GameState, keys: string[]): boolean =>
  s.events.some((e) => e.type === 'log' && keys.includes(e.key));

export function afkTick(s: GameState): void {
  const p = s.player;
  const afk = p.afk;
  if (!afk) return;
  if (p.dead) {
    stopAfk(s, 'log.afkStopped');
    return;
  }
  if (s.mapId !== afk.mapId) {
    stopAfk(s, 'log.afkStopped');
    return;
  }
  if (loggedThisTick(s, STOPPERS)) {
    stopAfk(s, 'log.afkStopped');
    return;
  }
  if (selfCare(s) || !p.afk) return;

  if (afk.targetId !== null) {
    const m = monsterById(s, afk.targetId);
    const busy = p.action.kind === 'attack' || p.action.kind === 'cast';
    if (!m) afk.targetId = null;
    else if (!busy && loggedThisTick(s, GIVE_UP)) {
      // Couldn't reach it (or it stands in a safe zone): ignore it for a while.
      afk.skip[afk.targetId] = s.tick + s.content.balance.afkSkipTicks;
      afk.targetId = null;
    } else if (!busy) orderAttack(s, m.id); // a finished cast: back to fighting it
  }

  if (afk.targetId === null) {
    if (p.afkSettings.pickup && p.action.kind !== 'pickup') {
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
    orderAttack(s, id);
  }

  // Cast the strongest attack spell we can afford, keeping enough MP for one heal spell.
  if (afk.targetId === null || s.tick < p.actionReadyTick || playerInSafeZone(s) || p.action.kind !== 'attack') return;
  const healMp = Math.min(...p.spells.map((id) => spellDef(s.content, id)).filter((sp) => sp.effect.type === 'heal').map((sp) => sp.mp), Infinity);
  const reserve = Number.isFinite(healMp) ? healMp : 0;
  const spell = knownSpells(s, (sp) => sp.target === 'enemy').find(([, sp]) => p.mp - sp.mp >= reserve);
  if (spell) castSpell(s, spell[0], afk.targetId); // walks into range first if needed
}
