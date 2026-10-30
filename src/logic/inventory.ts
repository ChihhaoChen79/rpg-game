// Inventory, weight and equipment (plan §7.11, §7.14).
import { itemDef } from './content';
import { equipSlotsFor, type Content, type EquipSlot, type GameState, type ItemDef, type ItemStack, type Player } from './types';

export function newStack(s: GameState, itemId: string, count = 1, enh = 0): ItemStack {
  const d = itemDef(s.content, itemId);
  return { uid: s.nextId++, itemId, count, enh, dur: d.weapon?.durability ?? 0 };
}

export function stackWeight(c: Content, st: ItemStack): number {
  return itemDef(c, st.itemId).weight * st.count;
}

/** Total carried weight in tenths, equipped items included; gold weighs nothing. */
export function inventoryWeight(c: Content, p: Player): number {
  let w = 0;
  for (const st of p.inventory) w += stackWeight(c, st);
  for (const st of Object.values(p.equipment)) if (st) w += stackWeight(c, st);
  return w;
}

export function findStack(p: Player, uid: number): ItemStack | undefined {
  return p.inventory.find((st) => st.uid === uid);
}

export function firstStackOf(p: Player, itemId: string): ItemStack | undefined {
  return p.inventory.find((st) => st.itemId === itemId);
}

export function countItem(p: Player, itemId: string): number {
  let n = 0;
  for (const st of p.inventory) if (st.itemId === itemId) n += st.count;
  return n;
}

/** Why `count` of `itemId` can't be added, or null if it fits (slots, stack size, weight). */
export function cannotAdd(c: Content, p: Player, maxWeight: number, weight: number, itemId: string, count: number):
  'log.inventoryFull' | 'log.tooHeavy' | null {
  const d = itemDef(c, itemId);
  if (d.kind === 'gold') return null;
  if (weight + d.weight * count > maxWeight) return 'log.tooHeavy';
  const merge = d.stackable && p.inventory.some((st) => st.itemId === itemId && st.count + count <= c.balance.maxStack);
  if (!merge && p.inventory.length >= c.balance.inventorySlots) return 'log.inventoryFull';
  return null;
}

/** Adds without checks (callers check cannotAdd first). Stackable items merge into one slot. */
export function addStack(c: Content, p: Player, st: ItemStack): void {
  const d = itemDef(c, st.itemId);
  if (d.kind === 'gold') {
    p.gold += st.count;
    return;
  }
  if (d.stackable) {
    const existing = p.inventory.find((e) => e.itemId === st.itemId && e.count + st.count <= c.balance.maxStack);
    if (existing) {
      existing.count += st.count;
      return;
    }
  }
  p.inventory.push(st);
}

/** Remove `n` from a stack (deleting it when empty). Returns false if there weren't enough. */
export function consume(p: Player, uid: number, n = 1): boolean {
  const i = p.inventory.findIndex((st) => st.uid === uid);
  const st = p.inventory[i];
  if (!st || st.count < n) return false;
  st.count -= n;
  if (st.count === 0) p.inventory.splice(i, 1);
  return true;
}

export function consumeItem(p: Player, itemId: string, n = 1): boolean {
  const st = firstStackOf(p, itemId);
  return st ? consume(p, st.uid, n) : false;
}

/** Why the player can't equip this item, or null. */
export function cannotEquip(p: Player, d: ItemDef): string | null {
  if (d.kind !== 'equipment' || !d.slot) return 'log.notEquipment';
  if (d.classes && !d.classes.includes(p.classId)) return 'log.wrongClass';
  if (d.level && p.level < d.level) return 'log.levelTooLow';
  return null;
}

export function equip(s: GameState, uid: number): void {
  const c = s.content;
  const p = s.player;
  const st = findStack(p, uid);
  if (!st) return;
  const d = itemDef(c, st.itemId);
  const reason = cannotEquip(p, d);
  if (reason) {
    s.events.push({ type: 'log', key: reason, tone: 'bad' });
    return;
  }
  // Rings and earrings fill the first free of their two slots, else replace the first.
  const slots = equipSlotsFor(d.slot!);
  const slot = slots.find((k) => !p.equipment[k]) ?? slots[0]!;
  const weapon = p.equipment.weapon ? itemDef(c, p.equipment.weapon.itemId) : null;
  if (slot === 'shield' && weapon?.weapon?.twoHanded) {
    s.events.push({ type: 'log', key: 'log.twoHandedBlocksShield', tone: 'bad' });
    return;
  }
  p.inventory.splice(p.inventory.indexOf(st), 1);
  const old = p.equipment[slot];
  if (old) p.inventory.push(old);
  if (slot === 'weapon' && d.weapon?.twoHanded && p.equipment.shield) {
    p.inventory.push(p.equipment.shield); // two-handed weapons block the shield slot
    delete p.equipment.shield;
  }
  p.equipment[slot] = st;
  s.events.push({ type: 'log', key: 'log.equipped', params: { item: d.nameKey } });
}

export function unequip(s: GameState, slot: EquipSlot): void {
  const p = s.player;
  const st = p.equipment[slot];
  if (!st) return;
  if (p.inventory.length >= s.content.balance.inventorySlots) {
    s.events.push({ type: 'log', key: 'log.inventoryFull', tone: 'bad' });
    return;
  }
  delete p.equipment[slot];
  p.inventory.push(st);
  s.events.push({ type: 'log', key: 'log.unequipped', params: { item: itemDef(s.content, st.itemId).nameKey } });
}
