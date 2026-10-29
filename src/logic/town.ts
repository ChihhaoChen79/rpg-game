// Village services (plan §7.14, §7.15, §7.12): shop, warehouse, blacksmith repair.
// Each service checks the player stands next to the right NPC, so a server can trust it later.
import { itemDef, npcDef } from './content';
import { addStack, cannotAdd, findStack, newStack } from './inventory';
import { chebyshev } from './map';
import { derive } from './stats';
import type { GameState, ItemStack, NpcRole } from './types';
import { currentMap } from './world';

function log(s: GameState, key: string, params?: Record<string, string | number>, tone: 'info' | 'good' | 'bad' | 'loot' = 'info'): void {
  s.events.push({ type: 'log', key, params, tone });
}

/** True if the player is alive and within reach of this NPC, and it has the role. */
function atNpc(s: GameState, npcId: string, role: NpcRole): boolean {
  const p = s.player;
  const n = currentMap(s).npcs.find((x) => x.npcId === npcId);
  if (p.dead || !n || s.content.npcs[npcId]?.role !== role) return false;
  if (chebyshev(p.mover.x, p.mover.y, n.x, n.y) > s.content.balance.npcReach) {
    log(s, 'log.tooFar', undefined, 'bad');
    return false;
  }
  return true;
}

/**
 * Gold for selling `count` of an item. Rounded down once for the whole batch, so cheap items like
 * arrows (1 gold, selling at 0.5 each) still pay when sold in bulk.
 */
export function sellPrice(s: GameState, itemId: string, count = 1): number {
  return Math.floor(itemDef(s.content, itemId).price * count * s.content.balance.sellRatio);
}

// ---------------------------------------------------------------- shop

export function buy(s: GameState, npcId: string, itemId: string, count: number): void {
  if (!atNpc(s, npcId, 'shop')) return;
  const shop = s.content.shops[npcDef(s.content, npcId).shop ?? ''];
  if (!shop || !shop.items.includes(itemId)) return;
  const p = s.player;
  const d = itemDef(s.content, itemId);
  const n = Math.max(1, Math.floor(count));
  const cost = d.price * n;
  if (cost > p.gold) return log(s, 'log.notEnoughGold', undefined, 'bad');
  // Non-stackable items take one slot each.
  const dv = derive(s.content, p);
  if (d.stackable) {
    const reason = cannotAdd(s.content, p, dv.maxWeight, dv.weight, itemId, n);
    if (reason) return log(s, reason, undefined, 'bad');
  } else {
    if (p.inventory.length + n > s.content.balance.inventorySlots) return log(s, 'log.inventoryFull', undefined, 'bad');
    if (dv.weight + d.weight * n > dv.maxWeight) return log(s, 'log.tooHeavy', undefined, 'bad');
  }
  p.gold -= cost;
  if (d.stackable) addStack(s.content, p, newStack(s, itemId, n));
  else for (let i = 0; i < n; i++) addStack(s.content, p, newStack(s, itemId, 1));
  log(s, 'log.bought', { item: d.nameKey, n, gold: cost }, 'loot');
}

export function sell(s: GameState, npcId: string, uid: number, count: number): void {
  if (!atNpc(s, npcId, 'shop')) return;
  const p = s.player;
  const st = findStack(p, uid);
  if (!st) return;
  const d = itemDef(s.content, st.itemId);
  if (d.kind === 'gold' || d.price <= 0) return log(s, 'log.cannotSell', undefined, 'bad');
  const n = Math.max(1, Math.min(Math.floor(count), st.count));
  const gold = sellPrice(s, st.itemId, n);
  if (gold <= 0) return log(s, 'log.sellMore', undefined, 'bad');
  st.count -= n;
  if (st.count === 0) p.inventory.splice(p.inventory.indexOf(st), 1);
  p.gold += gold;
  log(s, 'log.sold', { item: d.nameKey, n, gold }, 'loot');
}

// ---------------------------------------------------------------- warehouse

/** Move `count` of a stack between two lists (inventory <-> warehouse), merging stackables. */
function moveStack(s: GameState, from: ItemStack[], to: ItemStack[], uid: number, count: number, maxSlots: number): ItemStack | null {
  const st = from.find((x) => x.uid === uid);
  if (!st) return null;
  const d = itemDef(s.content, st.itemId);
  const n = Math.max(1, Math.min(Math.floor(count), st.count));
  const merge = d.stackable ? to.find((x) => x.itemId === st.itemId && x.enh === st.enh && x.count + n <= s.content.balance.maxStack) : undefined;
  if (!merge && to.length >= maxSlots) return null;
  let moved: ItemStack;
  if (n === st.count) {
    from.splice(from.indexOf(st), 1);
    moved = st;
  } else {
    st.count -= n;
    moved = { ...st, uid: s.nextId++, count: n };
  }
  if (merge) merge.count += n;
  else to.push(moved);
  return moved;
}

export function deposit(s: GameState, npcId: string, uid: number, count: number): void {
  if (!atNpc(s, npcId, 'warehouse')) return;
  const p = s.player;
  const moved = moveStack(s, p.inventory, p.warehouse, uid, count, s.content.balance.warehouseSlots);
  if (!moved) return log(s, 'log.warehouseFull', undefined, 'bad');
  log(s, 'log.deposited', { item: itemDef(s.content, moved.itemId).nameKey, n: moved.count });
}

export function withdraw(s: GameState, npcId: string, uid: number, count: number): void {
  if (!atNpc(s, npcId, 'warehouse')) return;
  const p = s.player;
  const st = p.warehouse.find((x) => x.uid === uid);
  if (!st) return;
  const n = Math.max(1, Math.min(Math.floor(count), st.count));
  const dv = derive(s.content, p);
  const reason = cannotAdd(s.content, p, dv.maxWeight, dv.weight, st.itemId, n);
  if (reason) return log(s, reason, undefined, 'bad');
  const moved = moveStack(s, p.warehouse, p.inventory, uid, n, s.content.balance.inventorySlots);
  if (!moved) return log(s, 'log.inventoryFull', undefined, 'bad');
  log(s, 'log.withdrew', { item: itemDef(s.content, moved.itemId).nameKey, n: moved.count });
}

// ---------------------------------------------------------------- blacksmith (weapon durability)

/** Gold to fully repair one weapon: price × repairCostRatio × fraction of durability missing. */
export function repairCost(s: GameState, st: ItemStack): number {
  const d = itemDef(s.content, st.itemId);
  const max = d.weapon?.durability ?? 0;
  if (max <= 0 || st.dur >= max) return 0;
  return Math.max(1, Math.ceil(d.price * s.content.balance.repairCostRatio * ((max - st.dur) / max)));
}

export function repair(s: GameState, npcId: string, uid: number | 'all'): void {
  if (!atNpc(s, npcId, 'blacksmith')) return;
  const p = s.player;
  const all = [p.equipment.weapon, ...p.inventory].filter((x): x is ItemStack => !!x && repairCost(s, x) > 0);
  const targets = uid === 'all' ? all : all.filter((x) => x.uid === uid);
  if (targets.length === 0) return;
  const cost = targets.reduce((t, x) => t + repairCost(s, x), 0);
  if (cost > p.gold) return log(s, 'log.notEnoughGold', undefined, 'bad');
  p.gold -= cost;
  for (const x of targets) x.dur = itemDef(s.content, x.itemId).weapon!.durability;
  log(s, 'log.repaired', { gold: cost }, 'good');
}
