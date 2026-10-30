// Item details shown in the inventory and the shop: damage, extra attack, durability, defense,
// requirements. One line per Text object so a "?" can sit right after the 實際傷害 line.
import Phaser from 'phaser';
import { CONTENT } from '../content';
import { damagePreview } from '../logic/combat';
import { cannotEquip } from '../logic/inventory';
import type { ItemDef, Player, WeaponStats } from '../logic/types';
import { learnText, spellEffectText, spellLevelText } from './spellText';
import { t } from './strings';
import { button, label } from './widgets';

const SEP = '　'; // full-width space between items on one line

export interface InfoLine {
  text: string;
  help?: string; // shown in a message box from a "?" button after the line
}

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** "實際傷害 6-10（敏捷 +4、箭 +1、額外攻擊 +2）": what this weapon would really do, before the target's Def. */
function damageLine(p: Player, w: WeaponStats, enh: number, dur: number): string {
  const pv = damagePreview(CONTENT, p, w, enh, dur);
  if (w.ranged && !pv.arrowId) return t('inv.noArrows', { min: pv.total[0], max: pv.total[1] });
  const parts = [t(`inv.part.${pv.stat}`, { n: sign(pv.statBonus) })];
  if (pv.arrowId) parts.push(t('inv.part.arrow', { item: CONTENT.items[pv.arrowId]!.nameKey, n: sign(pv.arrowDamage) }));
  if (pv.extra) parts.push(t('inv.part.extra', { n: sign(pv.extra) }));
  return t('inv.dmgTotal', { min: pv.total[0], max: pv.total[1], parts: parts.join('、') });
}

/**
 * Detail lines for an item. `enh` / `dur` are the stack's (a shop item is new: 0 and full).
 * The weapon's hit rate stays hidden; its accuracy and extra attack are shown as traits.
 */
export function itemInfoLines(p: Player, def: ItemDef, enh: number, dur?: number): InfoLine[] {
  const lines: InfoLine[] = [];
  if (def.descKey) lines.push({ text: t(def.descKey) });
  const w = def.weapon;
  if (w) {
    const parts = [t('inv.dmg', { min: w.dmg[0], max: w.dmg[1] })];
    if (w.accuracy) parts.push(t('inv.accuracy', { n: sign(w.accuracy) }));
    if (w.extraDmg) parts.push(t('inv.extraDmg', { n: sign(w.extraDmg) }));
    if (w.range > 1) parts.push(t('inv.range', { n: w.range }));
    if (w.twoHanded) parts.push(t('inv.twoHanded'));
    lines.push({ text: parts.join(SEP) });
    // Real damage depends on the player's stats, so only for weapons their class can use.
    if (!def.classes || def.classes.includes(p.classId)) lines.push({ text: damageLine(p, w, enh, dur ?? w.durability), help: t('inv.dmgHelp') });
    lines.push({ text: t('inv.durability', { n: dur ?? w.durability, max: w.durability }) });
  }
  if (def.kind === 'ammo') lines.push({ text: t('inv.arrowDamage', { n: def.arrowDamage ?? 0 }) });
  if (def.use?.type === 'learn') {
    const sp = CONTENT.spells[def.use.spellId]!;
    lines.push({ text: `${spellLevelText(sp)}${SEP}${spellEffectText(sp)}` }, { text: t('spells.learnLine', { text: learnText(p, def.use.spellId).text }) });
  }
  if (def.def) lines.push({ text: t('inv.def', { n: def.def }) + (def.mr ? `${SEP}${t('inv.mr', { n: def.mr })}` : '') });
  else if (def.mr) lines.push({ text: t('inv.mr', { n: def.mr }) });
  const req: string[] = [];
  if (def.classes && def.classes.length < 3) req.push(t('inv.classes', { list: def.classes.map((k) => t(CONTENT.classes[k].nameKey)).join('、') }));
  if (def.level && def.level > 1) req.push(t('inv.levelReq', { n: def.level }));
  req.push(t('inv.itemWeight', { w: (def.weight / 10).toFixed(1) }));
  lines.push({ text: req.join(SEP) });
  return lines;
}

/** Why the player can't equip this (translated), or null. */
export function equipProblem(p: Player, def: ItemDef): string | null {
  const reason = def.kind === 'equipment' ? cannotEquip(p, def) : null;
  return reason ? t('inv.cannotEquip', { reason: t(reason) }) : null;
}

/**
 * Draws the lines from (x, y) downward; lines with help get a small "?" button after them.
 * Returns the y below the last line.
 */
export function drawInfoLines(
  scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, lines: InfoLine[],
  o: { size: number; color: string; wrap: number; onHelp(text: string): void },
): number {
  for (const line of lines) {
    const tx = label(scene, x, y, line.text, { size: o.size, color: o.color, wrap: o.wrap });
    c.add(tx);
    if (line.help) {
      const help = line.help;
      const s = o.size + 6;
      c.add(button(scene, x + Math.min(tx.width, o.wrap) + 6, y - 3, s, s, '?', () => o.onHelp(help), { size: o.size - 1 }).container);
    }
    y += tx.height;
  }
  return y;
}
