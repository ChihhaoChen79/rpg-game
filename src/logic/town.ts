// Village services (plan §7.14, §7.15, §7.12): shop, warehouse, blacksmith repair.
// Each service checks the player stands next to the right NPC, so a server can trust it later.
import { itemDef, npcDef } from './content';
import { addStack, cannotAdd, findStack, newStack } from './inventory';
import { chebyshev } from './map';
import { applyHaste } from './speed';
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

export interface BuyLine { itemId: string; count: number }
export interface SellLine { uid: number; count: number }

export function buy(s: GameState, npcId: string, itemId: string, count: number): void {
  buyMany(s, npcId, [{ itemId, count }]);
}

/**
 * Buys a whole basket at once, or nothing: it is refused if the total costs more than the
 * player's gold, weighs too much, or needs more free slots than there are.
 */
export function buyMany(s: GameState, npcId: string, lines: readonly BuyLine[]): void {
  if (!atNpc(s, npcId, 'shop')) return;
  const shop = s.content.shops[npcDef(s.content, npcId).shop ?? ''];
  if (!shop) return;
  // One entry per item, only things this shop sells.
  const want = new Map<string, number>();
  for (const l of lines) {
    const n = Math.floor(l.count);
    if (n > 0 && shop.items.includes(l.itemId)) want.set(l.itemId, (want.get(l.itemId) ?? 0) + n);
  }
  if (want.size === 0) return;
  const p = s.player;
  const b = s.content.balance;
  let cost = 0;
  let weight = 0;
  let slots = 0;
  for (const [itemId, n] of want) {
    const d = itemDef(s.content, itemId);
    cost += d.price * n;
    weight += d.weight * n;
    // Stackables merge into an existing stack with room; anything else takes a slot each.
    if (!d.stackable) slots += n;
    else if (!p.inventory.some((st) => st.itemId === itemId && st.count + n <= b.maxStack)) slots += 1;
  }
  if (cost > p.gold) return log(s, 'log.notEnoughGold', undefined, 'bad');
  const dv = derive(s.content, p);
  if (dv.weight + weight > dv.maxWeight) return log(s, 'log.tooHeavy', undefined, 'bad');
  if (p.inventory.length + slots > b.inventorySlots) return log(s, 'log.inventoryFull', undefined, 'bad');
  p.gold -= cost;
  for (const [itemId, n] of want) {
    if (itemDef(s.content, itemId).stackable) addStack(s.content, p, newStack(s, itemId, n));
    else for (let i = 0; i < n; i++) addStack(s.content, p, newStack(s, itemId, 1));
  }
  const [first] = want;
  if (want.size === 1) log(s, 'log.bought', { item: itemDef(s.content, first![0]).nameKey, n: first![1], gold: cost }, 'loot');
  else log(s, 'log.boughtMany', { n: want.size, gold: cost }, 'loot');
}

export function sell(s: GameState, npcId: string, uid: number, count: number): void {
  sellMany(s, npcId, [{ uid, count }]);
}

/** Sells every listed stack (or part of it). Items the shop won't take are skipped. */
export function sellMany(s: GameState, npcId: string, lines: readonly SellLine[]): void {
  if (!atNpc(s, npcId, 'shop')) return;
  const p = s.player;
  const sold: { st: ItemStack; n: number; gold: number }[] = [];
  let refused = false;
  for (const l of lines) {
    const st = findStack(p, l.uid);
    if (!st || sold.some((x) => x.st === st)) continue;
    const d = itemDef(s.content, st.itemId);
    if (d.kind === 'gold' || d.price <= 0) {
      refused = true;
      continue;
    }
    const n = Math.max(1, Math.min(Math.floor(l.count), st.count));
    const gold = sellPrice(s, st.itemId, n);
    if (gold > 0) sold.push({ st, n, gold });
    else refused = true;
  }
  if (sold.length === 0) {
    if (lines.length === 1 && refused) {
      const st = findStack(p, lines[0]!.uid);
      const d = st ? itemDef(s.content, st.itemId) : undefined;
      return log(s, d && d.price > 0 ? 'log.sellMore' : 'log.cannotSell', undefined, 'bad');
    }
    return log(s, 'log.cannotSell', undefined, 'bad');
  }
  let total = 0;
  for (const { st, n, gold } of sold) {
    st.count -= n;
    if (st.count === 0) p.inventory.splice(p.inventory.indexOf(st), 1);
    total += gold;
  }
  p.gold += total;
  if (sold.length === 1) log(s, 'log.sold', { item: itemDef(s.content, sold[0]!.st.itemId).nameKey, n: sold[0]!.n, gold: total }, 'loot');
  else log(s, 'log.soldMany', { n: sold.length, gold: total }, 'loot');
}

// ---------------------------------------------------------------- speed-up NPC

/** A speed-up NPC's free buff (replaces the player's current buff of that stage). */
export function npcHaste(s: GameState, npcId: string): void {
  if (!atNpc(s, npcId, 'haste')) return;
  const h = npcDef(s.content, npcId).haste;
  if (h) applyHaste(s, h.stage, h.ticks, npcId);
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
