// Text about spells shared by the spells panel, the inventory and the shop.
import type Phaser from 'phaser';
import { CONTENT } from '../content';
import { learnBlock, levelForMagic, maxMagicLevel } from '../logic/magic';
import { TICKS_PER_SECOND } from '../logic/time';
import type { ItemDef, Player, SpellDef, SpellSchool } from '../logic/types';
import { SPELL_SCHOOLS } from '../logic/types';
import { t } from './strings';
import { iconImage } from './widgets';

const secs = (ticks: number): string => String(+(ticks / TICKS_PER_SECOND).toFixed(1));

/** "一般魔法 3 級" */
export function spellLevelText(sp: SpellDef): string {
  return t('spells.level', { school: t(`spells.school.${sp.school}`), n: sp.magicLevel });
}

/** What the spell does, with its numbers. */
export function spellEffectText(sp: SpellDef): string {
  const e = sp.effect;
  switch (e.type) {
    case 'heal': return t('spells.effect.heal', { min: e.min, max: e.max });
    case 'damage': return t('spells.effect.damage', { min: e.min, max: e.max });
    case 'aoe': return t('spells.effect.aoe', { min: e.min, max: e.max, r: e.radius });
    case 'maxDamage': return t('spells.effect.maxDamage', { s: secs(e.ticks) });
    case 'buffDef': return t('spells.effect.buffDef', { n: e.amount, s: secs(e.ticks) });
    case 'buffMr': return t('spells.effect.buffMr', { n: e.amount, s: secs(e.ticks) });
  }
}

export function spellCostText(sp: SpellDef): string {
  return t('spells.cost', { mp: sp.mp, cd: secs(sp.cooldownTicks), range: sp.target === 'self' ? t('spells.self') : sp.range });
}

/** For a spellbook: can this player learn it, and if not, why. */
export function learnText(p: Player, spellId: string): { text: string; ok: boolean } {
  const block = learnBlock(CONTENT, p, spellId);
  return block ? { text: t(block.key, block.params), ok: false } : { text: t('spells.canLearn'), ok: true };
}

/** "一般魔法：目前可學到 2 級（等級 16 可學 3 級）", one line per school the class can learn. */
export function magicSummary(p: Player): string[] {
  const rules = CONTENT.classes[p.classId].magic;
  const out: string[] = [];
  for (const school of SPELL_SCHOOLS as readonly SpellSchool[]) {
    const rule = rules[school];
    if (!rule) continue;
    const now = maxMagicLevel(CONTENT, p.classId, school, p.level);
    const next = now < rule.max ? levelForMagic(rule, now + 1) : null;
    out.push(t(next === null ? 'spells.summaryMax' : 'spells.summary', { school: t(`spells.school.${school}`), n: now, lv: next ?? 0, next: now + 1 }));
  }
  if (!out.length) out.push(t('spells.noMagic'));
  return out;
}

/**
 * Spellbooks all share one icon; this draws the spell's icon small on the book's bottom-right
 * corner (x, y = the book icon's center). Returns [] for other items.
 */
export function bookBadge(scene: Phaser.Scene, x: number, y: number, def: ItemDef, size: number): Phaser.GameObjects.Image[] {
  if (def.use?.type !== 'learn') return [];
  const sp = CONTENT.spells[def.use.spellId];
  if (!sp) return [];
  const b = Math.round(size * 0.55);
  return [iconImage(scene, x + size / 2 - b / 2 + 2, y + size / 2 - b / 2 + 2, sp.icon, b)];
}
