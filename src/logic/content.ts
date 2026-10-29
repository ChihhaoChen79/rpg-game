// Lookups into the static content tables (data/*.json). Missing ids are content bugs, so throw.
import type { ClassDef, ClassId, Content, ItemDef, MonsterDef, NpcDef, SpellDef } from './types';

export function classDef(c: Content, id: ClassId): ClassDef {
  const d = c.classes[id];
  if (!d) throw new Error(`Unknown class "${id}"`);
  return d;
}

export function itemDef(c: Content, id: string): ItemDef {
  const d = c.items[id];
  if (!d) throw new Error(`Unknown item "${id}"`);
  return d;
}

export function spellDef(c: Content, id: string): SpellDef {
  const d = c.spells[id];
  if (!d) throw new Error(`Unknown spell "${id}"`);
  return d;
}

export function monsterDef(c: Content, id: string): MonsterDef {
  const d = c.monsters[id];
  if (!d) throw new Error(`Unknown monster "${id}"`);
  return d;
}

export function npcDef(c: Content, id: string): NpcDef {
  const d = c.npcs[id];
  if (!d) throw new Error(`Unknown NPC "${id}"`);
  return d;
}
