// Magic levels and who may learn what (rules per class in data/classes.json → "magic").
//   Knight: normal magic level 1 at player level 50.
//   Elf:    normal magic +1 level every 8 player levels (max 6); elf magic every 15 (max 3).
//   Mage:   normal magic +1 level every 4 player levels (max 10); born with level 1.
import { classDef, spellDef } from './content';
import type { ClassId, Content, MagicRule, Player, SpellSchool } from './types';

/** Highest magic level of a school this class can use at this player level (0 = none). */
export function maxMagicLevel(c: Content, cls: ClassId, school: SpellSchool, playerLevel: number): number {
  const rule = classDef(c, cls).magic[school];
  if (!rule) return 0;
  return Math.min(rule.max, Math.max(rule.min ?? 0, Math.floor(playerLevel / rule.every)));
}

/** Player level at which this class can learn a magic level, or null if never. */
export function levelForMagic(rule: MagicRule | undefined, magicLevel: number): number | null {
  if (!rule || magicLevel > rule.max) return null;
  if (rule.min !== undefined && magicLevel <= rule.min) return 1;
  return magicLevel * rule.every;
}

/** Why the player can't learn this spell now (a strings key + params), or null if they can. */
export function learnBlock(c: Content, p: Player, spellId: string): { key: string; params?: Record<string, number> } | null {
  const sp = spellDef(c, spellId);
  if (p.spells.includes(spellId)) return { key: 'log.alreadyLearned' };
  const need = levelForMagic(classDef(c, p.classId).magic[sp.school], sp.magicLevel);
  if (need === null) return { key: 'log.cannotLearnClass' };
  if (p.level < need) return { key: 'log.learnNeedLevel', params: { n: need } };
  return null;
}

/**
 * Drop spells that no longer exist or that this class can never learn (when loading a save made
 * under older rules). Spells stay known after a level-down.
 */
export function pruneSpells(c: Content, p: Player): void {
  const allowed = (id: string): boolean => {
    const sp = c.spells[id];
    if (!sp) return false;
    const need = levelForMagic(classDef(c, p.classId).magic[sp.school], sp.magicLevel);
    return need !== null;
  };
  p.spells = p.spells.filter(allowed);
  p.hotbar = p.hotbar.map((h) => (h?.kind === 'spell' && !p.spells.includes(h.id) ? null : h));
}
