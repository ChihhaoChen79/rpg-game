// Versioned save format with migrations (plan §4 rule 6, §7.20). Pure: storage lives in src/save.
import { defaultAfkSettings } from './afkSettings';
import type { AfkSettings, ClassId, EquipSlot, HotbarRef, ItemStack, Player, Stats } from './types';

export const SAVE_VERSION = 8;

/** The persistent part of a Player. Position, cooldowns and combat state are not saved. */
export interface SavedPlayer {
  name: string; // added in save version 6
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
  afkSettings: AfkSettings; // added in save version 5, new format in version 8
  protected: boolean; // added in save version 7
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
    name: p.name, classId: p.classId, stats: p.stats, level: p.level, exp: p.exp, hp: p.hp, mp: p.mp,
    hpGains: p.hpGains, mpGains: p.mpGains, alignment: p.alignment, gold: p.gold,
    inventory: p.inventory, equipment: p.equipment, spells: p.spells, hotbar: p.hotbar, activeArrow: p.activeArrow,
    warehouse: p.warehouse, afkSettings: p.afkSettings, protected: p.protected,
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
  if (data.version === 5) data = { ...data, version: 6, player: data.player ? { name: '', ...data.player } : data.player }; // v5 -> v6: names
  if (data.version === 6) data = { ...data, version: 7, player: data.player ? { protected: false, ...data.player } : data.player }; // v6 -> v7: protection
  if (data.version === 7) data = migrate7to8(data);
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

/** v7 -> v8: auto-hunt settings became rules; the old HP / MP % become the same rules as before. */
function migrate7to8(d: { version?: unknown; player?: Record<string, unknown> }): { version: number; player?: Record<string, unknown> } {
  if (!d.player) return { ...d, version: 8 };
  const old = (d.player.afkSettings ?? {}) as { hpPct?: number; mpPct?: number; pickup?: boolean; returnWhenOut?: boolean };
  return { ...d, version: 8, player: { ...d.player, afkSettings: defaultAfkSettings(old) } };
}

/** Boss timers as ticks remaining (the game clock restarts at 0 after loading). */
export function savedBossTimers(timers: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(timers)) if (t > now) out[k] = t - now;
  return out;
}

// ---------------------------------------------------------------- exported files

/**
 * Exported save files carry a checksum so a hand-edited file is refused on import. It is not
 * security (the salt ships with the game); it only stops casual editing (plan §7.20).
 */
const CHECKSUM_SALT = 'rpg-game:save-file:v1';

/** cyrb53: a fast 53-bit string hash, as 14 hex digits. */
function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Checksum of everything in the file except the checksum itself (key order as written). */
function fileChecksum(data: Record<string, unknown>): string {
  const { checksum: _c, ...rest } = data;
  return hash53(CHECKSUM_SALT + JSON.stringify(rest));
}

/** The object to write to an export file: the save plus its checksum (last key). */
export function signSaveFile(data: SaveData): SaveData & { checksum: string } {
  return { ...data, checksum: fileChecksum(data as unknown as Record<string, unknown>) };
}

/**
 * Checks and upgrades an imported file. Throws Error('save.tampered') (a strings key) if the
 * checksum is missing or doesn't match, otherwise returns the migrated save without the checksum.
 */
export function readSaveFile(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('Not a save file');
  const obj = raw as Record<string, unknown>;
  if (typeof obj.checksum !== 'string' || obj.checksum !== fileChecksum(obj)) throw new Error('save.tampered');
  const { checksum: _c, ...data } = obj;
  return migrateSave(data);
}
