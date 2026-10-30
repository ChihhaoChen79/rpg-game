// Enhancement with scrolls (plan §7.13). Up to the item's safe level it always succeeds; each
// step above it halves the chance (50%, 25%, 12.5%...). A failure above the safe level either
// leaves the item as it was or destroys it (balance.enhanceDestroyPct, rising per step).
import { itemDef } from './content';
import { consume, findStack } from './inventory';
import { rngChance } from './rng';
import { ACCESSORY_SLOTS, type Content, type EquipSlot, type GameState, type ItemDef, type ItemStack } from './types';

/** Can this scroll (an item with an enhance use) be used on this item? */
export function scrollFits(scroll: ItemDef, target: ItemDef): boolean {
  if (target.kind !== 'equipment' || !target.slot || ACCESSORY_SLOTS.includes(target.slot)) return false;
  if (scroll.use?.type === 'enhanceWeapon') return target.slot === 'weapon';
  if (scroll.use?.type === 'enhanceArmor') return target.slot !== 'weapon';
  return false;
}

/** Steps above the safe level this enhancement would be (0 = at or below safe: always works). */
function stepAboveSafe(d: ItemDef, enh: number): number {
  return Math.max(0, enh + 1 - (d.safeEnchant ?? 0));
}

/** Chance (0..1) that enhancing from `enh` to `enh + 1` succeeds. */
export function enhanceChance(d: ItemDef, enh: number): number {
  return 0.5 ** stepAboveSafe(d, enh);
}

/** Chance (0..1) that a failed enhancement from `enh` destroys the item. */
export function destroyChance(c: Content, d: ItemDef, enh: number): number {
  const step = stepAboveSafe(d, enh);
  if (step === 0) return 0;
  const t = c.balance.enhanceDestroyPct;
  return (t[Math.min(step, t.length) - 1] ?? 0) / 100;
}

/** The stack with this uid, in the bag or equipped. */
function findOwned(s: GameState, uid: number): { stack: ItemStack; slot: EquipSlot | null } | null {
  const p = s.player;
  const bag = findStack(p, uid);
  if (bag) return { stack: bag, slot: null };
  for (const [slot, st] of Object.entries(p.equipment)) if (st?.uid === uid) return { stack: st, slot: slot as EquipSlot };
  return null;
}

export function enhance(s: GameState, scrollUid: number, targetUid: number): void {
  const c = s.content;
  const p = s.player;
  if (p.dead) return;
  const scroll = findStack(p, scrollUid);
  const target = findOwned(s, targetUid);
  if (!scroll || !target) return;
  const sd = itemDef(c, scroll.itemId);
  const td = itemDef(c, target.stack.itemId);
  if (!scrollFits(sd, td)) {
    s.events.push({ type: 'log', key: 'log.enhanceWrongTarget', tone: 'bad' });
    return;
  }
  consume(p, scrollUid, 1);
  const st = target.stack;
  const name = td.nameKey;
  if (rngChance(s.rng, enhanceChance(td, st.enh))) {
    st.enh++;
    s.events.push({ type: 'enhanced', result: 'success', itemId: st.itemId, enh: st.enh });
    s.events.push({ type: 'log', key: 'log.enhanceSuccess', params: { item: name, n: st.enh }, tone: 'good' });
  } else if (rngChance(s.rng, destroyChance(c, td, st.enh))) {
    if (target.slot) delete p.equipment[target.slot];
    else p.inventory.splice(p.inventory.indexOf(st), 1);
    s.events.push({ type: 'enhanced', result: 'destroyed', itemId: st.itemId, enh: st.enh });
    s.events.push({ type: 'log', key: 'log.enhanceDestroyed', params: { item: name, n: st.enh }, tone: 'bad' });
  } else {
    s.events.push({ type: 'enhanced', result: 'fail', itemId: st.itemId, enh: st.enh });
    s.events.push({ type: 'log', key: 'log.enhanceFail', params: { item: name, n: st.enh }, tone: 'bad' });
  }
}
