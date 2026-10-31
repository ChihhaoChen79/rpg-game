// Auto-hunt settings: defaults, cleaning up whatever the UI or an old save sends, and the
// lists the settings window offers (attack spells, buffs to keep up, rule actions).
import { itemDef } from './content';
import { AFK_RULE_STATS, type AfkAction, type AfkAttack, type AfkRule, type AfkRuleStat, type AfkSettings, type Content, type ItemDef, type Player, type SpellDef } from './types';

/** HP / MP rules compare %; the other stats are counts. */
export function isPctStat(stat: AfkRuleStat): boolean {
  return stat === 'hp' || stat === 'mp';
}

/** Settings of a new character, and what older saves are converted to (same behaviour as before). */
export function defaultAfkSettings(old?: { hpPct?: number; mpPct?: number; pickup?: boolean; returnWhenOut?: boolean }): AfkSettings {
  const hp = old?.hpPct ?? 50;
  const mp = old?.mpPct ?? 30;
  return {
    attack: { kind: 'auto' },
    restHpPct: 0,
    restMpPct: 0,
    targetAttackers: true,
    avoidBoss: false,
    huntRadius: 0,
    buffsOn: true,
    buffs: [],
    buffNearMonsters: true,
    rulesOn: true,
    rules: [
      { stat: 'hp', below: hp, action: { kind: 'bestHeal' } },
      { stat: 'hp', below: hp, action: { kind: 'hpPotion' } },
      { stat: 'mp', below: mp, action: { kind: 'mpPotion' } },
    ],
    pickup: old?.pickup ?? true,
    ignore: [],
    returnWhenOut: old?.returnWhenOut ?? true,
    returnWeightPct: 0,
  };
}

const clampInt = (n: unknown, lo: number, hi: number, dflt: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;

/** A self spell that buffs (Def, MR, max damage). */
export function isBuffSpell(sp: SpellDef): boolean {
  return sp.target === 'self' && (sp.effect.type === 'buffDef' || sp.effect.type === 'buffMr' || sp.effect.type === 'maxDamage');
}

/** An item that gives a timed buff (speed-up, max damage). */
export function isBuffItem(d: ItemDef): boolean {
  return d.use?.type === 'haste' || d.use?.type === 'maxDamage';
}

function cleanAction(c: Content, a: AfkAction | undefined): AfkAction | null {
  if (!a || typeof a !== 'object') return null;
  switch (a.kind) {
    case 'hpPotion': case 'mpPotion': case 'bestHeal': case 'return':
      return { kind: a.kind };
    case 'item':
      return c.items[a.itemId]?.use ? { kind: 'item', itemId: a.itemId } : null;
    case 'spell':
      return c.spells[a.spellId]?.target === 'self' ? { kind: 'spell', spellId: a.spellId } : null;
    default:
      return null;
  }
}

function cleanAttack(c: Content, a: AfkAttack | undefined): AfkAttack {
  if (a?.kind === 'weapon') return { kind: 'weapon' };
  if (a?.kind === 'spell' && c.spells[a.spellId]?.target === 'enemy') return { kind: 'spell', spellId: a.spellId };
  return { kind: 'auto' };
}

/**
 * Any settings object (from the UI, a save, or the old 4-field format) made valid: numbers in
 * range, only known spells / items, at most balance.afkMaxRules rules.
 */
export function normalizeAfkSettings(c: Content, raw: unknown): AfkSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AfkSettings> & { hpPct?: number; mpPct?: number };
  if (!('rules' in r)) return defaultAfkSettings({ hpPct: clampInt(r.hpPct, 0, 100, 50), mpPct: clampInt(r.mpPct, 0, 100, 30), pickup: r.pickup, returnWhenOut: r.returnWhenOut });
  const d = defaultAfkSettings();
  const rules: AfkRule[] = [];
  for (const rule of Array.isArray(r.rules) ? r.rules : []) {
    if (rules.length >= c.balance.afkMaxRules) break;
    const action = cleanAction(c, rule?.action);
    if (!action || !AFK_RULE_STATS.includes(rule.stat)) continue;
    if (rule.stat === 'count' && !(rule.itemId && c.items[rule.itemId])) continue;
    const below = clampInt(rule.below, 0, isPctStat(rule.stat) ? 100 : 9999, 0);
    rules.push(rule.stat === 'count' ? { stat: 'count', itemId: rule.itemId, below, action } : { stat: rule.stat, below, action });
  }
  const buffs = (Array.isArray(r.buffs) ? r.buffs : []).filter((k): k is string => {
    if (typeof k !== 'string') return false;
    const [kind, id] = k.split(':');
    if (kind === 'spell') return !!c.spells[id ?? ''] && isBuffSpell(c.spells[id!]!);
    if (kind === 'item') return !!c.items[id ?? ''] && isBuffItem(c.items[id!]!);
    return false;
  });
  const ignore = (Array.isArray(r.ignore) ? r.ignore : []).filter((id): id is string => typeof id === 'string' && !!c.items[id] && c.items[id]!.kind !== 'gold');
  return {
    attack: cleanAttack(c, r.attack),
    restHpPct: clampInt(r.restHpPct, 0, 100, d.restHpPct),
    restMpPct: clampInt(r.restMpPct, 0, 100, d.restMpPct),
    targetAttackers: r.targetAttackers ?? d.targetAttackers,
    avoidBoss: r.avoidBoss ?? d.avoidBoss,
    huntRadius: clampInt(r.huntRadius, 0, 200, d.huntRadius),
    buffsOn: r.buffsOn ?? d.buffsOn,
    buffs: [...new Set(buffs)],
    buffNearMonsters: r.buffNearMonsters ?? d.buffNearMonsters,
    rulesOn: r.rulesOn ?? d.rulesOn,
    rules,
    pickup: r.pickup ?? d.pickup,
    ignore: [...new Set(ignore)],
    returnWhenOut: r.returnWhenOut ?? d.returnWhenOut,
    returnWeightPct: clampInt(r.returnWeightPct, 0, 100, d.returnWeightPct),
  };
}

/** Attack spells this player knows (for the attack picker), strongest first. */
export function afkAttackSpells(c: Content, p: Player): string[] {
  return p.spells.filter((id) => c.spells[id]?.target === 'enemy').sort((a, b) => c.spells[b]!.magicLevel - c.spells[a]!.magicLevel);
}

/** Buffs the player could keep up: known buff spells and buff items they can use. */
export function afkBuffOptions(c: Content, p: Player): string[] {
  const spells = p.spells.filter((id) => isBuffSpell(c.spells[id]!)).map((id) => `spell:${id}`);
  const items = Object.entries(c.items)
    .filter(([, d]) => isBuffItem(d) && (!d.classes || d.classes.includes(p.classId)))
    .map(([id]) => `item:${id}`);
  return [...spells, ...items];
}

/** Items a rule can use: consumables this class can use (potions, scrolls...). */
export function afkRuleItems(c: Content, p: Player): string[] {
  return Object.entries(c.items)
    .filter(([, d]) => d.kind === 'consumable' && d.use && d.use.type !== 'learn' && (!d.classes || d.classes.includes(p.classId)))
    .map(([id]) => id);
}

/** Self spells a rule can cast (heals and buffs). */
export function afkRuleSpells(c: Content, p: Player): string[] {
  return p.spells.filter((id) => c.spells[id]?.target === 'self');
}

/** Is this item useful to count in a rule ("when I have fewer than N red potions")? */
export function countableItem(c: Content, id: string): boolean {
  const d = itemDef(c, id);
  return d.stackable && d.kind !== 'gold';
}
