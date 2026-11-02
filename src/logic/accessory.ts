// Accessory upgrading (jeweler NPC): N identical accessories of the same +level become one of
// the next +level, up to balance.accessoryMaxEnh. Each + adds a fixed step to every stat the
// accessory has (balance.accessoryStep: HP +10, MP +5, others +1).
import { itemDef } from './content';
import { addStack, consume, newStack } from './inventory';
import { ACCESSORY_SLOTS, BONUS_KEYS, type Content, type GameState, type ItemDef, type ItemStack, type StatBonus } from './types';

export function isAccessory(d: ItemDef): boolean {
  return d.kind === 'equipment' && !!d.slot && ACCESSORY_SLOTS.includes(d.slot);
}

export interface ScaledBonus {
  def: number;
  mr: number;
  bonus: StatBonus;
}

/** What an item gives at this +level: accessories grow by a step per level for each stat they have. */
export function scaledBonus(c: Content, d: ItemDef, enh: number): ScaledBonus {
  const step = (k: string) => c.balance.accessoryStep[k] ?? 1;
  const acc = isAccessory(d);
  const n = acc ? enh : 0;
  const bonus: StatBonus = {};
  for (const k of BONUS_KEYS) {
    const base = d.bonus?.[k] ?? 0;
    if (base) bonus[k] = base + n * step(k);
  }
  return {
    // armor: +1 Def per enhancement; accessories: only the stats they already have grow
    def: acc ? ((d.def ?? 0) ? (d.def ?? 0) + n * step('def') : 0) : (d.def ?? 0) + enh,
    mr: (d.mr ?? 0) ? (d.mr ?? 0) + n * step('mr') : 0,
    bonus,
  };
}

export interface MergeGroup {
  itemId: string;
  enh: number;
  count: number; // how many in the bag (equipped ones don't count)
}

/** The accessories in the bag, grouped by type and +level (those below the max level). */
export function mergeGroups(c: Content, inv: ItemStack[]): MergeGroup[] {
  const out: MergeGroup[] = [];
  for (const st of inv) {
    const d = itemDef(c, st.itemId);
    if (!isAccessory(d) || st.enh >= c.balance.accessoryMaxEnh) continue;
    const g = out.find((x) => x.itemId === st.itemId && x.enh === st.enh);
    if (g) g.count += st.count;
    else out.push({ itemId: st.itemId, enh: st.enh, count: st.count });
  }
  return out.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.enh - b.enh);
}

/** Trade accessoryMergeCount of the same accessory and +level for one at +1 (the jeweler's job). */
export function mergeAccessories(s: GameState, itemId: string, enh: number): void {
  const c = s.content;
  const p = s.player;
  const need = c.balance.accessoryMergeCount;
  const g = mergeGroups(c, p.inventory).find((x) => x.itemId === itemId && x.enh === enh);
  if (!g || g.count < need) return;
  let left = need;
  for (const st of [...p.inventory]) {
    if (left <= 0) break;
    if (st.itemId !== itemId || st.enh !== enh) continue;
    const n = Math.min(left, st.count);
    consume(p, st.uid, n);
    left -= n;
  }
  addStack(c, p, newStack(s, itemId, 1, enh + 1)); // lighter than what was given up, so it fits
  s.events.push({ type: 'log', key: 'log.accessoryMerged', params: { item: itemDef(c, itemId).nameKey, n: enh + 1 }, tone: 'good' });
}
