// Versioned save format with migrations (plan §4 rule 6, §7.20). Pure: storage lives in src/save.
import type { AfkSettings, ClassId, EquipSlot, HotbarRef, ItemStack, Player, Stats } from './types';

export const SAVE_VERSION = 5;

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
  afkSettings: AfkSettings; // added in save version 5
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  savedAt: number; // ms since epoch, set by the caller
  mapId: string;
  x: number;
  y: number;
  nextId: number;
  player: SavedPlayer;
  bossTimers: Record<string, number>; // ticks of play time until each boss may appear (version 4)
}

export function savedPlayer(p: Player): SavedPlayer {
  return structuredCloneSafe({
    classId: p.classId, stats: p.stats, level: p.level, exp: p.exp, hp: p.hp, mp: p.mp,
    hpGains: p.hpGains, mpGains: p.mpGains, alignment: p.alignment, gold: p.gold,
    inventory: p.inventory, equipment: p.equipment, spells: p.spells, hotbar: p.hotbar, activeArrow: p.activeArrow,
    warehouse: p.warehouse, afkSettings: p.afkSettings,
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
  if (data.version === 3) data = { ...data, version: 4, bossTimers: {} } as typeof data; // v3 -> v4: boss timers
  if (data.version === 4) data = migrate4to5(data);
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

/** v4 -> v5: the magic list was redone (火焰箭 fire_bolt became 火球術 fireball); AFK settings were added. */
function migrate4to5(d: { version?: unknown; player?: Record<string, unknown> }): { version: number; player?: Record<string, unknown> } {
  if (!d.player) return { ...d, version: 5 };
  const afkSettings = { hpPct: 50, mpPct: 30, pickup: true, returnWhenOut: true };
  const rename = (id: unknown): unknown => (id === 'fire_bolt' ? 'fireball' : id);
  const spells = Array.isArray(d.player.spells) ? d.player.spells.map(rename) : [];
  const hotbar = Array.isArray(d.player.hotbar)
    ? d.player.hotbar.map((h: { kind?: string; id?: unknown } | null) => (h?.kind === 'spell' ? { ...h, id: rename(h.id) } : h))
    : d.player.hotbar;
  return { ...d, version: 5, player: { ...d.player, spells, hotbar, afkSettings } };
}

/** Boss timers as ticks remaining (the game clock restarts at 0 after loading). */
export function savedBossTimers(timers: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(timers)) if (t > now) out[k] = t - now;
  return out;
}
