// Versioned save format with migrations (plan §4 rule 6, §7.20). Pure: storage lives in src/save.
import type { ClassId, EquipSlot, HotbarRef, ItemStack, Player, Stats } from './types';

export const SAVE_VERSION = 3;

/** The persistent part of a Player. Position, cooldowns and combat state are not saved. */
export interface SavedPlayer {
  classId: ClassId;
  stats: Stats;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  hpGains: number[];
  mpGains: number[];
  alignment: number;
  gold: number;
  inventory: ItemStack[];
  equipment: Partial<Record<EquipSlot, ItemStack>>;
  spells: string[];
  hotbar: (HotbarRef | null)[];
  activeArrow: string; // added in save version 2
  warehouse: ItemStack[]; // added in save version 3
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  savedAt: number; // ms since epoch, set by the caller
  mapId: string;
  x: number;
  y: number;
  nextId: number;
  player: SavedPlayer;
}

export function savedPlayer(p: Player): SavedPlayer {
  return structuredCloneSafe({
    classId: p.classId, stats: p.stats, level: p.level, exp: p.exp, hp: p.hp, mp: p.mp,
    hpGains: p.hpGains, mpGains: p.mpGains, alignment: p.alignment, gold: p.gold,
    inventory: p.inventory, equipment: p.equipment, spells: p.spells, hotbar: p.hotbar, activeArrow: p.activeArrow,
    warehouse: p.warehouse,
  });
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Upgrade any older save to the current version. Throws if the data is not a save we know. */
export function migrateSave(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('Not a save file');
  let data = raw as { version?: unknown; player?: Record<string, unknown> };
  if (typeof data.version !== 'number') throw new Error('Save has no version');
  if (data.version > SAVE_VERSION) throw new Error(`Save version ${data.version} is newer than this game`);
  if (data.version === 1) data = migrate1to2(data);
  if (data.version === 2) data = migrate2to3(data);
  const s = data as unknown as SaveData;
  if (!s.player || typeof s.mapId !== 'string' || !Array.isArray(s.player.inventory)) throw new Error('Save is damaged');
  return s;
}

/** v1 -> v2: arrow types were added; old saves shoot plain arrows. */
function migrate1to2(d: { version?: unknown; player?: Record<string, unknown> }): { version: number; player?: Record<string, unknown> } {
  return { ...d, version: 2, player: d.player ? { ...d.player, activeArrow: 'arrow' } : d.player };
}

/** v2 -> v3: the warehouse was added, empty for old saves. */
function migrate2to3(d: { version?: unknown; player?: Record<string, unknown> }): { version: number; player?: Record<string, unknown> } {
  return { ...d, version: 3, player: d.player ? { ...d.player, warehouse: [] } : d.player };
}
