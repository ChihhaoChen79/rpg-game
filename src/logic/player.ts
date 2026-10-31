// Player creation, per-tick actions, items, spells, regen and respawn.
import { defaultAfkSettings } from './afkSettings';
import { attackProfile, applyMr, damageMonster, playerAttack } from './combat';
import { classDef, itemDef, spellDef } from './content';
import { addStack, cannotAdd, consume, findStack, firstStackOf } from './inventory';
import { learnBlock } from './magic';
import { chebyshev, exitAt, isWalkable, lineOfSight } from './map';
import { spawnMapMonsters } from './monsters';
import { applyHaste } from './speed';
import { moverCreate, moverPlace } from './movement';
import { findPath, findPathInRange, snapToWalkable } from './pathfinding';
import { rngInt } from './rng';
import { derive } from './stats';
import type { ClassId, GameState, Player, Stats, Vec } from './types';
import { equipSlotsFor, STAT_KEYS } from './types';
import {
  currentMap, groundById, monsterAt, monsterById, playerInSafeZone, playerPass,
} from './world';

export const BONUS_POINTS = 6;
export const MAX_START_STAT = 18;
const REPATH_TICKS = 5;

/** Validates a creation allocation: exactly BONUS_POINTS spent, nothing below base or above MAX_START_STAT. */
export function validAllocation(base: Stats, stats: Stats): boolean {
  let spent = 0;
  for (const k of STAT_KEYS) {
    const v = stats[k];
    if (!Number.isInteger(v) || v < base[k] || v > MAX_START_STAT) return false;
    spent += v - base[k];
  }
  return spent === BONUS_POINTS;
}

export const NAME_MAX = 10; // characters

/** A character name as stored: trimmed, inner whitespace collapsed, control characters removed, at most NAME_MAX. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, NAME_MAX).join('');
}

export function createPlayer(
  content: GameState['content'], nextId: () => number, classId: ClassId, stats: Stats, at: Vec, name = '',
): Player {
  const cls = classDef(content, classId);
  if (!validAllocation(cls.base, stats)) throw new Error('Invalid stat allocation');
  const p: Player = {
    name: cleanName(name), classId, stats: { ...stats }, level: 1, exp: 0, hp: 0, mp: 0, hpGains: [], mpGains: [], alignment: 0,
    gold: cls.startGold, inventory: [], warehouse: [], equipment: {}, spells: [...cls.startSpells],
    hotbar: cls.hotbar.map((h) => (h ? { ...h } : null)), activeArrow: 'arrow', cooldowns: {}, maxDamageUntil: 0, buffs: {},
    afkSettings: defaultAfkSettings(), afk: null, protected: false,
    mover: moverCreate(at.x, at.y), dest: null, action: { kind: 'none' }, repathTick: 0,
    actionReadyTick: 0, invulnUntil: 0, dead: false, lastCombatTick: -1000,
  };
  for (const si of cls.startItems) {
    const d = itemDef(content, si.itemId);
    const st = { uid: nextId(), itemId: si.itemId, count: si.count ?? 1, enh: 0, dur: d.weapon?.durability ?? 0 };
    if (si.equip && d.slot) p.equipment[equipSlotsFor(d.slot)[0]!] = st;
    else addStack(content, p, st);
  }
  const dv = derive(content, p);
  p.hp = dv.maxHp;
  p.mp = dv.maxMp;
  return p;
}

// ---------------------------------------------------------------- movement orders

function tooHeavyToMove(s: GameState): boolean {
  const d = derive(s.content, s.player);
  if (d.weight < d.maxWeight) return false;
  s.events.push({ type: 'log', key: 'log.cannotMoveHeavy', tone: 'bad' });
  return true;
}

export function orderMove(s: GameState, target: Vec): void {
  const p = s.player;
  p.action = { kind: 'none' };
  if (tooHeavyToMove(s)) return;
  const map = currentMap(s);
  const pass = playerPass(s);
  const goal = snapToWalkable(map, target, p.mover, s.config.clickSnapRadius, pass);
  const path = goal ? findPath(map, p.mover, goal, s.config.pathMaxNodes, pass) : null;
  if (!goal || !path) {
    p.dest = null;
    s.events.push({ type: 'moveFailed' });
    return;
  }
  p.dest = goal;
  p.mover.path = path;
}

/** Re-plan around a monster that stepped into the way. */
function continueMove(s: GameState): void {
  const p = s.player;
  const mv = p.mover;
  if (!p.dest || mv.moving || mv.path.length > 0) return;
  if (mv.x === p.dest.x && mv.y === p.dest.y) {
    p.dest = null;
    return;
  }
  const path = findPath(currentMap(s), mv, p.dest, s.config.pathMaxNodes, playerPass(s));
  if (path) mv.path = path;
  else p.dest = null;
}

/**
 * Walk toward `target` until within `range` (and, beyond melee range, with a clear line of
 * sight). Returns true once there and standing still.
 */
function approach(s: GameState, target: Vec, range: number): boolean {
  const p = s.player;
  const mv = p.mover;
  const map = currentMap(s);
  const clear = range > 1 ? (x: number, y: number) => lineOfSight(map, x, y, target.x, target.y) : undefined;
  if (chebyshev(mv.x, mv.y, target.x, target.y) <= range && (!clear || clear(mv.x, mv.y))) {
    if (!mv.moving) mv.path = [];
    return !mv.moving;
  }
  if (mv.moving) return false;
  if (mv.path.length === 0 || s.tick >= p.repathTick) {
    if (tooHeavyToMove(s)) {
      p.action = { kind: 'none' };
      return false;
    }
    p.repathTick = s.tick + REPATH_TICKS;
    const path = findPathInRange(map, mv, target, range, s.config.pathMaxNodes, playerPass(s), clear);
    if (!path) {
      p.action = { kind: 'none' };
      s.events.push({ type: 'log', key: 'log.unreachable', tone: 'bad' });
      return false;
    }
    mv.path = path;
  }
  return false;
}

function faceToward(p: Player, t: Vec): void {
  const dx = t.x - p.mover.x;
  const dy = t.y - p.mover.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) p.mover.facing = dx < 0 ? 1 : 2;
  else if (dy !== 0) p.mover.facing = dy < 0 ? 3 : 0;
}

// ---------------------------------------------------------------- per-tick action

export function playerActionTick(s: GameState): void {
  const p = s.player;
  const a = p.action;
  if (p.dead) return;
  if (a.kind === 'none') {
    continueMove(s);
    return;
  }
  if (a.kind === 'attack') {
    const m = monsterById(s, a.monsterId);
    if (!m) {
      p.action = { kind: 'none' };
      return;
    }
    const prof = attackProfile(s.content, p);
    if (!approach(s, m.mover, prof.range)) return;
    faceToward(p, m.mover);
    if (s.tick < p.actionReadyTick) return;
    if (playerInSafeZone(s)) {
      s.events.push({ type: 'log', key: 'log.noCombatInSafeZone', tone: 'bad' });
      p.action = { kind: 'none' };
      return;
    }
    const d = derive(s.content, p);
    if (d.weight > d.maxWeight * s.content.balance.weightNoAttack) {
      s.events.push({ type: 'log', key: 'log.cannotAttackHeavy', tone: 'bad' });
      p.action = { kind: 'none' };
      return;
    }
    playerAttack(s, m);
    return;
  }
  if (a.kind === 'pickup') {
    const g = groundById(s, a.groundId);
    if (!g) {
      p.action = { kind: 'none' };
      return;
    }
    if (!approach(s, g, 1)) return;
    p.action = { kind: 'none' };
    pickUp(s, g.id);
    return;
  }
  if (a.kind === 'cast') {
    const m = monsterById(s, a.monsterId);
    if (!m) {
      p.action = { kind: 'none' };
      return;
    }
    if (!approach(s, m.mover, spellDef(s.content, a.spellId).range)) return;
    if (s.tick < p.actionReadyTick) return;
    p.action = { kind: 'none' };
    castSpell(s, a.spellId, m.id);
    return;
  }
  if (a.kind === 'talk') {
    const npc = currentMap(s).npcs.find((n) => n.npcId === a.npcId);
    if (!npc) {
      p.action = { kind: 'none' };
      return;
    }
    if (!approach(s, npc, 1)) return;
    faceToward(p, npc);
    p.action = { kind: 'none' };
    s.events.push({ type: 'npcInteract', npcId: a.npcId });
  }
}

// ---------------------------------------------------------------- ground items

export function pickUp(s: GameState, groundId: number): void {
  const p = s.player;
  const g = groundById(s, groundId);
  if (!g) return;
  if (chebyshev(p.mover.x, p.mover.y, g.x, g.y) > 1) return;
  const d = derive(s.content, p);
  const reason = cannotAdd(s.content, p, d.maxWeight, d.weight, g.item.itemId, g.item.count);
  if (reason) {
    s.events.push({ type: 'log', key: reason, tone: 'bad' });
    return;
  }
  s.groundItems.splice(s.groundItems.indexOf(g), 1);
  addStack(s.content, p, g.item);
  const def = itemDef(s.content, g.item.itemId);
  if (def.kind === 'gold') s.events.push({ type: 'log', key: 'log.pickedGold', params: { n: g.item.count }, tone: 'loot' });
  else s.events.push({ type: 'log', key: 'log.picked', params: { item: def.nameKey, n: g.item.count }, tone: 'loot' });
}

/** Space key: nearest ground item within 1 tile. */
export function pickUpNearest(s: GameState): void {
  const mv = s.player.mover;
  let best: number | null = null;
  let bestD = Infinity;
  for (const g of s.groundItems) {
    if (g.mapId !== s.mapId) continue;
    const dd = chebyshev(mv.x, mv.y, g.x, g.y);
    if (dd <= 1 && dd < bestD) {
      best = g.id;
      bestD = dd;
    }
  }
  if (best !== null) pickUp(s, best);
}

// ---------------------------------------------------------------- items

function cooldownReady(s: GameState, key: string): boolean {
  return s.tick >= (s.player.cooldowns[key] ?? 0);
}

export function useItem(s: GameState, uid: number): void {
  const c = s.content;
  const p = s.player;
  if (p.dead) return;
  const st = findStack(p, uid);
  if (!st) return;
  const d = itemDef(c, st.itemId);
  if (d.kind === 'ammo') {
    // "Using" arrows makes them the ones the bow shoots next.
    p.activeArrow = st.itemId;
    s.events.push({ type: 'log', key: 'log.ammoSelected', params: { item: d.nameKey } });
    return;
  }
  if (!d.use) return;
  if (d.classes && !d.classes.includes(p.classId)) {
    s.events.push({ type: 'log', key: 'log.wrongClass', tone: 'bad' });
    return;
  }
  if (d.cooldownGroup && !cooldownReady(s, d.cooldownGroup)) {
    s.events.push({ type: 'log', key: 'log.cooldown', tone: 'bad' });
    return;
  }
  const u = d.use;
  const dv = derive(c, p);
  switch (u.type) {
    case 'heal': {
      const hp = Math.min(u.hp ?? 0, dv.maxHp - p.hp);
      const mp = Math.min(u.mp ?? 0, dv.maxMp - p.mp);
      p.hp += hp;
      p.mp += mp;
      s.events.push({ type: 'heal', hp, mp });
      break;
    }
    case 'maxDamage':
      p.maxDamageUntil = s.tick + u.ticks;
      s.events.push({ type: 'log', key: 'log.maxDamageOn', tone: 'good' });
      break;
    case 'return':
      returnToVillage(s);
      break;
    case 'teleport':
      if (!teleportRandom(s)) return;
      break;
    case 'save':
      s.events.push({ type: 'saveRequested' });
      break;
    case 'haste':
      applyHaste(s, u.stage, u.ticks, st.itemId);
      break;
    case 'enhanceWeapon':
    case 'enhanceArmor':
      // Needs a target item: the UI asks for one and sends an 'enhance' command.
      s.events.push({ type: 'log', key: 'log.enhancePick' });
      return;
    case 'protect':
      if (p.protected) {
        s.events.push({ type: 'log', key: 'log.alreadyProtected', tone: 'bad' });
        return;
      }
      p.protected = true;
      s.events.push({ type: 'log', key: 'log.protected', tone: 'good' });
      break;
    case 'learn': {
      const block = learnBlock(c, p, u.spellId);
      if (block) {
        s.events.push({ type: 'log', key: block.key, params: block.params, tone: 'bad' });
        return;
      }
      p.spells.push(u.spellId);
      const free = p.hotbar.indexOf(null);
      if (free >= 0) p.hotbar[free] = { kind: 'spell', id: u.spellId };
      s.events.push({ type: 'log', key: 'log.learned', params: { spell: spellDef(c, u.spellId).nameKey }, tone: 'good' });
      break;
    }
  }
  if (d.cooldownGroup) p.cooldowns[d.cooldownGroup] = s.tick + (d.cooldownTicks ?? 0);
  consume(p, uid, 1);
}

/** Hotbar slot: use the first stack of an item, or cast a spell on the current target. */
export function useHotbar(s: GameState, slot: number, targetId?: number): void {
  const ref = s.player.hotbar[slot];
  if (!ref) return;
  if (ref.kind === 'spell') {
    castSpell(s, ref.id, targetId);
    return;
  }
  const st = firstStackOf(s.player, ref.id);
  if (!st) {
    s.events.push({ type: 'log', key: 'log.noneLeft', params: { item: itemDef(s.content, ref.id).nameKey }, tone: 'bad' });
    return;
  }
  const d = itemDef(s.content, ref.id);
  if (d.kind === 'equipment') return; // equipping from the hotbar is not supported yet
  useItem(s, st.uid);
}

export function dropItem(s: GameState, uid: number, count: number): void {
  const p = s.player;
  const st = findStack(p, uid);
  if (!st || p.dead) return;
  const n = Math.max(1, Math.min(count, st.count));
  const dropped = n === st.count ? st : { ...st, uid: s.nextId++, count: n };
  if (dropped === st) p.inventory.splice(p.inventory.indexOf(st), 1);
  else st.count -= n;
  s.groundItems.push({ id: s.nextId++, mapId: s.mapId, x: p.mover.x, y: p.mover.y, item: dropped, droppedTick: s.tick });
}

// ---------------------------------------------------------------- spells

export function castSpell(s: GameState, spellId: string, targetId?: number): void {
  const c = s.content;
  const p = s.player;
  if (p.dead) return;
  if (!p.spells.includes(spellId)) return;
  const sp = spellDef(c, spellId);
  const fail = (key: string): void => {
    s.events.push({ type: 'log', key, tone: 'bad' });
  };
  if (!cooldownReady(s, `spell:${spellId}`)) return fail('log.cooldown');
  if (p.mp < sp.mp) return fail('log.notEnoughMp');

  let target = null;
  if (sp.target === 'enemy') {
    const id = targetId ?? (p.action.kind === 'attack' ? p.action.monsterId : undefined);
    target = id !== undefined ? monsterById(s, id) : undefined;
    if (!target) return fail('log.needTarget');
    if (playerInSafeZone(s)) return fail('log.noCombatInSafeZone');
    const inRange = chebyshev(p.mover.x, p.mover.y, target.mover.x, target.mover.y) <= sp.range
      && lineOfSight(currentMap(s), p.mover.x, p.mover.y, target.mover.x, target.mover.y);
    if (!inRange || p.mover.moving || s.tick < p.actionReadyTick) {
      // Walk into range (and a clear line of sight), then cast: see playerActionTick.
      p.action = { kind: 'cast', spellId, monsterId: target.id };
      p.dest = null;
      p.repathTick = s.tick;
      return;
    }
    faceToward(p, target.mover);
  } else if (s.tick < p.actionReadyTick) {
    return;
  }

  p.mp -= sp.mp;
  p.cooldowns[`spell:${spellId}`] = s.tick + sp.cooldownTicks;
  p.actionReadyTick = s.tick + sp.castTicks;
  const dv = derive(c, p);
  const e = sp.effect;
  s.events.push({ type: 'attack', from: 'player', to: target ? target.id : 'player', style: 'spell', spellId });
  if (e.type === 'heal') {
    const amount = Math.min(rngInt(s.rng, e.min, e.max) + dv.healBonus, dv.maxHp - p.hp);
    p.hp += amount;
    s.events.push({ type: 'heal', hp: amount, mp: 0 });
  } else if (e.type === 'damage' && target) {
    const md = c.monsters[target.defId]!;
    const raw = rngInt(s.rng, e.min, e.max) + dv.spellBonus;
    damageMonster(s, target, applyMr(c.balance, raw, md.mr), true);
  } else if (e.type === 'aoe' && target) {
    // Every living monster within `radius` tiles of the target (rolled separately).
    const { x, y } = target.mover;
    const hit = s.monsters.filter((m) => !m.dead && chebyshev(x, y, m.mover.x, m.mover.y) <= e.radius);
    for (const m of hit) {
      const raw = rngInt(s.rng, e.min, e.max) + dv.spellBonus;
      damageMonster(s, m, applyMr(c.balance, raw, c.monsters[m.defId]!.mr), true);
    }
  } else if (e.type === 'maxDamage') {
    p.maxDamageUntil = s.tick + e.ticks;
    s.events.push({ type: 'log', key: 'log.maxDamageOn', tone: 'good' });
  } else if (e.type === 'buffDef' || e.type === 'buffMr') {
    const kind = e.type === 'buffDef' ? 'def' : 'mr';
    p.buffs[kind] = { amount: e.amount, until: s.tick + e.ticks, spellId };
    s.events.push({ type: 'log', key: kind === 'def' ? 'log.buffDef' : 'log.buffMr', params: { n: e.amount }, tone: 'good' });
  }
}

/** Ends Def / MR buffs whose time is up. */
export function buffTick(s: GameState): void {
  const p = s.player;
  for (const kind of ['def', 'mr'] as const) {
    const b = p.buffs[kind];
    if (b && s.tick >= b.until) {
      delete p.buffs[kind];
      s.events.push({ type: 'log', key: 'log.buffEnded', params: { spell: spellDef(s.content, b.spellId).nameKey } });
    }
  }
}

// ---------------------------------------------------------------- regen, death, travel

export function regenTick(s: GameState): void {
  const c = s.content;
  const p = s.player;
  if (p.dead || s.tick % c.balance.regenIntervalTicks !== 0) return;
  const d = derive(c, p);
  if (d.weight > d.maxWeight * c.balance.weightNoRegen) return;
  const mult = playerInSafeZone(s) ? c.balance.safeRegenMult : 1;
  p.hp = Math.min(d.maxHp, p.hp + d.hpRegen * mult);
  p.mp = Math.min(d.maxMp, p.mp + d.mpRegen * mult);
}

export function changeMap(s: GameState, mapId: string, x: number, y: number): void {
  if (!s.maps[mapId]) throw new Error(`Unknown map "${mapId}"`);
  const changed = mapId !== s.mapId;
  s.mapId = mapId;
  const p = s.player;
  moverPlace(p.mover, x, y);
  p.action = { kind: 'none' };
  p.dest = null;
  if (changed) spawnMapMonsters(s);
  s.events.push({ type: 'mapChanged', mapId });
}

function respawnPoint(s: GameState): { mapId: string; x: number; y: number } {
  const mapId = currentMap(s).respawnMap;
  const m = s.maps[mapId];
  const pt = m?.respawn ?? m?.start;
  if (!m || !pt) throw new Error(`Map "${mapId}" has no respawn point`);
  return { mapId, x: pt.x, y: pt.y };
}

export function returnToVillage(s: GameState): void {
  const r = respawnPoint(s);
  changeMap(s, r.mapId, r.x, r.y);
}

export function respawn(s: GameState): void {
  const p = s.player;
  if (!p.dead) return;
  const r = respawnPoint(s);
  p.dead = false;
  const d = derive(s.content, p);
  p.hp = d.maxHp;
  p.mp = d.maxMp;
  p.invulnUntil = s.tick + s.content.balance.respawnInvulnTicks;
  changeMap(s, r.mapId, r.x, r.y);
  s.events.push({ type: 'respawned' });
}

function teleportRandom(s: GameState): boolean {
  const map = currentMap(s);
  for (let i = 0; i < 200; i++) {
    const x = rngInt(s.rng, 0, map.width - 1);
    const y = rngInt(s.rng, 0, map.height - 1);
    if (!isWalkable(map, x, y) || monsterAt(s, x, y) || exitAt(map, x, y)) continue;
    changeMap(s, s.mapId, x, y);
    return true;
  }
  s.events.push({ type: 'log', key: 'log.teleportFailed', tone: 'bad' });
  return false;
}

/** Check exits after the player arrives on a tile. */
export function onPlayerArrive(s: GameState): void {
  const mv = s.player.mover;
  const exit = exitAt(currentMap(s), mv.x, mv.y);
  if (exit) changeMap(s, exit.targetMap, exit.targetX, exit.targetY);
}

/** Start attacking (auto-attack until death, a new order, or unreachable; plan §5). */
export function orderAttack(s: GameState, monsterId: number): void {
  const p = s.player;
  if (p.dead || !monsterById(s, monsterId)) return;
  p.action = { kind: 'attack', monsterId };
  p.dest = null;
  p.repathTick = s.tick;
}

export function orderPickup(s: GameState, groundId: number): void {
  const p = s.player;
  if (p.dead || !groundById(s, groundId)) return;
  p.action = { kind: 'pickup', groundId };
  p.dest = null;
  p.repathTick = s.tick;
}

export function orderTalk(s: GameState, npcId: string): void {
  const p = s.player;
  if (p.dead) return;
  p.action = { kind: 'talk', npcId };
  p.dest = null;
  p.repathTick = s.tick;
}
