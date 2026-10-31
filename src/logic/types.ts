// Core plain-data types shared across logic modules.
import type { Rng } from './rng';

export interface Vec {
  x: number;
  y: number;
}

/** 4-direction facing used by sprites. */
export const Facing = {
  Down: 0,
  Left: 1,
  Right: 2,
  Up: 3,
} as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

// ---------------------------------------------------------------- maps

export interface Exit {
  x: number; // tile rect
  y: number;
  w: number;
  h: number;
  targetMap: string;
  targetX: number;
  targetY: number;
}

export interface SpawnArea {
  x: number; // tile rect
  y: number;
  w: number;
  h: number;
  monster: string;
  count: number;
  respawnTicks: number;
  respawnMaxTicks: number; // respawn time is random in [respawnTicks, respawnMaxTicks]
}

export interface NpcPlacement {
  npcId: string;
  x: number;
  y: number;
}

/** A named place teleport NPCs / spells can send the player to (Tiled point of class "arrival"). */
export interface ArrivalPoint {
  name: string;
  x: number;
  y: number;
}

export interface MapData {
  id: string;
  nameKey: string;
  respawnMap: string;
  width: number;
  height: number;
  blocked: Uint8Array; // 1 = impassable
  safe: Uint8Array; // 1 = safe zone
  opaque: Uint8Array; // 1 = blocks arrows and spells
  exits: Exit[];
  spawns: SpawnArea[];
  npcs: NpcPlacement[];
  start: Vec | null;
  respawn: Vec | null;
  arrivals: ArrivalPoint[];
}

// ---------------------------------------------------------------- content (data/*.json)

export type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis';
export type Stats = Record<StatKey, number>;
export const STAT_KEYS: readonly StatKey[] = ['str', 'dex', 'con', 'int', 'wis'];

export type ClassId = 'knight' | 'elf' | 'mage';
export const CLASS_IDS: readonly ClassId[] = ['knight', 'elf', 'mage'];

export type HotbarRef = { kind: 'item'; id: string } | { kind: 'spell'; id: string };

export interface ClassDef {
  nameKey: string;
  descKey: string;
  /** Character layer sheets always drawn (body, clothes, hair); equipment layers go on top. */
  appearance: string[];
  base: Stats;
  baseHp: number;
  baseMp: number;
  hpGain: [number, number];
  mpGain: [number, number];
  startGold: number;
  startItems: { itemId: string; count?: number; equip?: boolean }[];
  startSpells: string[];
  hotbar: (HotbarRef | null)[];
  magic: Partial<Record<SpellSchool, MagicRule>>;
  hit: { melee: number; ranged: number }; // class hit bonus in %
}

/** Kind of slot an item goes in (data). Rings and earrings fit either of two equipment slots. */
export type ItemSlot = 'weapon' | 'shield' | 'helmet' | 'armor' | 'pants' | 'cloak' | 'gloves' | 'boots'
  | 'necklace' | 'ring' | 'belt' | 'earring';
/** Where an equipped item sits on the character. */
export type EquipSlot = 'weapon' | 'shield' | 'helmet' | 'armor' | 'pants' | 'cloak' | 'gloves' | 'boots'
  | 'necklace' | 'ring1' | 'ring2' | 'belt' | 'earring1' | 'earring2';
export const EQUIP_SLOTS: readonly EquipSlot[] = [
  'weapon', 'shield', 'helmet', 'armor', 'pants', 'cloak', 'gloves', 'boots', 'necklace', 'ring1', 'ring2', 'belt', 'earring1', 'earring2',
];
/** Accessories: small stat bonuses, no outfit change, can't be enhanced. */
export const ACCESSORY_SLOTS: readonly ItemSlot[] = ['necklace', 'ring', 'belt', 'earring'];

/** The equipment slots an item of this kind can go in, in fill order. */
export function equipSlotsFor(slot: ItemSlot): EquipSlot[] {
  if (slot === 'ring') return ['ring1', 'ring2'];
  if (slot === 'earring') return ['earring1', 'earring2'];
  return [slot];
}

/** Stat bonuses an item gives while equipped (accessories mostly). */
export interface StatBonus {
  hp?: number;
  mp?: number;
  meleeDmg?: number;
  rangedDmg?: number;
  spellDmg?: number;
  meleeHit?: number; // %
  rangedHit?: number; // %
}
export const BONUS_KEYS: readonly (keyof StatBonus)[] = ['hp', 'mp', 'meleeDmg', 'rangedDmg', 'spellDmg', 'meleeHit', 'rangedHit'];

export interface WeaponStats {
  anim: 'slash' | 'thrust' | 'shoot'; // attack animation
  dmg: [number, number];
  hit: number; // % (hidden from players)
  accuracy?: number; // 命中 +x: % added to the hit chance (melee and bow; not spells)
  extraDmg?: number; // 額外攻擊 +x: added to every hit after the damage roll
  attackTicks: number;
  range: number; // tiles (Chebyshev); 1 = melee
  ranged: boolean; // uses arrows
  twoHanded: boolean;
  meleeDmg?: [number, number]; // bow used as a club when out of arrows
  durability: number;
  wearChance?: number; // chance per attack to lose 1 durability (default: balance.weaponWearChance)
}

export type ItemUse =
  | { type: 'heal'; hp?: number; mp?: number }
  | { type: 'maxDamage'; ticks: number }
  | { type: 'return' }
  | { type: 'teleport' }
  | { type: 'save' }
  | { type: 'learn'; spellId: string }
  | { type: 'enhanceWeapon' } // used on a weapon, see enhance.ts
  | { type: 'enhanceArmor' } // used on any other equipment
  | { type: 'protect' } // no equipment drop on the next death
  | { type: 'haste'; stage: SpeedStage; ticks: number }; // speed-up buff, see speed.ts

/**
 * Speed-up buffs come in stages: 1 = common (potion, village NPC), 2 = class potions / spells,
 * 3 = rare items. Each stage holds one buff at a time; different stages multiply.
 */
export type SpeedStage = 1 | 2 | 3;
export const SPEED_STAGES: readonly SpeedStage[] = [1, 2, 3];
export interface SpeedBuff {
  until: number; // tick
  source: string; // item or NPC id that gave it
}

export interface ItemDef {
  nameKey: string;
  descKey?: string;
  icon: string; // assets/sprites/icons/<icon>.png
  kind: 'gold' | 'consumable' | 'ammo' | 'equipment' | 'spellbook';
  weight: number; // tenths
  price: number;
  stackable: boolean;
  classes?: ClassId[];
  level?: number;
  use?: ItemUse;
  cooldownGroup?: string;
  cooldownTicks?: number;
  slot?: ItemSlot;
  arrowDamage?: number; // ammo: damage added to each bow shot
  sprite?: string; // character layer sheet drawn while equipped
  weapon?: WeaponStats;
  def?: number;
  mr?: number;
  bonus?: StatBonus;
  safeEnchant?: number; // enhancement that always succeeds (weapons 6, armor 4); hidden from players
}

export type SpellEffect =
  | { type: 'heal'; min: number; max: number }
  | { type: 'damage'; min: number; max: number }
  | { type: 'aoe'; min: number; max: number; radius: number } // target and every monster within radius
  | { type: 'maxDamage'; ticks: number }
  | { type: 'buffDef'; amount: number; ticks: number }
  | { type: 'buffMr'; amount: number; ticks: number };

/** Normal magic (levels 1-10) or elf magic (levels 1-3). */
export type SpellSchool = 'normal' | 'elf';
export const SPELL_SCHOOLS: readonly SpellSchool[] = ['normal', 'elf'];

/** How a class learns a school: one magic level per `every` player levels, at most `max`. */
export interface MagicRule {
  every: number;
  max: number;
  min?: number; // magic level available from player level 1 (the mage is born with level 1)
}

export interface SpellDef {
  nameKey: string;
  descKey: string;
  icon: string;
  school: SpellSchool;
  magicLevel: number;
  book: string; // item id of the spellbook that teaches it
  mp: number;
  cooldownTicks: number;
  castTicks: number;
  range: number;
  target: 'self' | 'enemy';
  effect: SpellEffect;
}

export interface MonsterDef {
  nameKey: string;
  sprite: string; // assets/sprites/monsters/<sprite>.png
  frame?: number; // sprite frame size in px (default 64; bosses are bigger)
  boss?: boolean; // respawn timer survives leaving the map and saving; boss HP bar in the HUD
  level: number;
  hp: number;
  dmg: [number, number];
  hit: number;
  evasion: number;
  def: number;
  mr: number; // %
  attackTicks: number;
  stepTicks: number;
  aggressive: boolean;
  aggroRange: number;
  leashRange: number;
  exp: number;
  alignment: number;
  gold: [number, number];
  drops: { itemId: string; chance: number; count?: [number, number] }[];
}

export type NpcRole = 'save' | 'shop' | 'warehouse' | 'blacksmith' | 'haste';

export interface NpcDef {
  nameKey: string;
  appearance: string[];
  role: NpcRole;
  shop?: string; // shop id in data/shops.json (role "shop")
  haste?: { stage: SpeedStage; ticks: number }; // role "haste": the speed-up this NPC gives (free)
}

export interface ShopDef {
  items: string[]; // item ids for sale, in display order
}

export interface Balance {
  levelCap: number;
  enhanceDestroyPct: number[]; // chance (%) a failed enhancement destroys the item: 1st, 2nd... step above safe; last repeats
  deathDropPct: number; // chance (%) to drop 1 equipped item on death at neutral Alignment
  deathDropEvilMaxPct: number; // ... at Alignment -1000 (good players go down to 0% at +1000)
  alignmentLabelAt: number; // |Alignment| from which a player counts as good / evil
  nameColorFullAt: number; // |Alignment| at which the name is fully blue (good) or red (evil)
  afkDefaults: AfkSettings;
  afkSearchRange: number; // tiles: AFK only looks for monsters this close
  afkPickupRange: number; // tiles: AFK picks up loot this close
  afkSkipTicks: number; // AFK ignores a monster it couldn't reach for this long
  hitClamp: [number, number];
  speedStages: number[]; // walk and attack speed multiplier of speed-up stage 1, 2, 3
  fists: { dmg: [number, number]; hit: number; attackTicks: number };
  meleeHitPerStr: number; // % hit per STR above 10 (melee, bow used as a club)
  rangedHitPerDex: number; // % hit per DEX above 10 (bow shots)
  hitBonusPerLevel: number;
  hitPerEnhance: number; // % hit per weapon enhancement level
  evasionPerDex: number;
  strDamageDiv: number;
  dexDamageDiv: number;
  intDamageDiv: number;
  wisHealDiv: number;
  mrPerWis: number;
  mrCap: number;
  weightBase: number; // carry limit in tenths = weightBase + STR x weightPerStr + CON x weightPerCon
  weightPerStr: number;
  weightPerCon: number;
  weightNoRegen: number;
  weightNoAttack: number;
  regenIntervalTicks: number;
  hpRegenConDiv: number;
  mpRegenWisDiv: number;
  safeRegenMult: number;
  deathExpLossPct: number;
  deathLevelFloor: number;
  respawnInvulnTicks: number;
  alignmentKillDiv: number;
  groundItemLifetimeTicks: number;
  groundCleanupIntervalTicks: number;
  noSpawnRadius: number;
  spawnMinPlayerDist: number;
  monsterWanderChance: number;
  monsterWanderRadius: number;
  monsterRepathTicks: number;
  inventorySlots: number;
  maxStack: number;
  bowMeleeWearMult: number;
  weaponWearChance: number;
  durabilityWarnPct: number[];
  repairCostRatio: number;
  sellRatio: number;
  warehouseSlots: number;
  npcReach: number;
}

export interface Content {
  classes: Record<ClassId, ClassDef>;
  items: Record<string, ItemDef>;
  spells: Record<string, SpellDef>;
  monsters: Record<string, MonsterDef>;
  npcs: Record<string, NpcDef>;
  shops: Record<string, ShopDef>;
  totalExp: number[]; // totalExp[L-1] = total Exp to reach level L
  balance: Balance;
}

export interface GameConfig {
  stepTicks: number;
  pathMaxNodes: number;
  clickSnapRadius: number;
}

// ---------------------------------------------------------------- dynamic state

/**
 * Tile-stepping movement. (x, y) is the tile the mover occupies, which during a step is
 * already the destination; (fromX, fromY) is where the step started. Rendering interpolates.
 */
export interface Mover {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  moving: boolean;
  stepElapsed: number; // ticks since the current step started
  path: Vec[]; // remaining tiles, next first
  facing: Facing;
}

/** An item in the inventory, equipment slots, warehouse or on the ground. */
export interface ItemStack {
  uid: number;
  itemId: string;
  count: number;
  enh: number; // enhancement level
  dur: number; // weapon durability (0 for other items)
}

export type PlayerAction =
  | { kind: 'none' }
  | { kind: 'attack'; monsterId: number }
  | { kind: 'pickup'; groundId: number }
  | { kind: 'talk'; npcId: string }
  | { kind: 'cast'; spellId: string; monsterId: number }; // walking into range to cast

export interface Player {
  name: string; // chosen at creation; '' for characters made before names existed
  classId: ClassId;
  stats: Stats;
  level: number;
  exp: number; // total
  hp: number;
  mp: number;
  hpGains: number[]; // HP gained at each level-up (index 0 = reaching level 2)
  mpGains: number[];
  alignment: number;
  gold: number;
  inventory: ItemStack[];
  warehouse: ItemStack[];
  equipment: Partial<Record<EquipSlot, ItemStack>>;
  spells: string[];
  hotbar: (HotbarRef | null)[];
  activeArrow: string; // preferred ammo item id
  cooldowns: Record<string, number>; // group or "spell:<id>" -> tick when ready
  maxDamageUntil: number; // tick
  buffs: { def?: Buff; mr?: Buff; speed?: Partial<Record<SpeedStage, SpeedBuff>> };
  afkSettings: AfkSettings; // saved
  protected: boolean; // protection scroll active: no equipment drop on the next death (saved)
  afk: AfkRun | null; // non-null while auto-hunting (not saved)
  mover: Mover;
  dest: Vec | null; // last ground destination, used to re-path around blockers
  action: PlayerAction;
  repathTick: number; // next tick the current action may re-plan its path
  actionReadyTick: number; // next tick an attack or cast may start
  invulnUntil: number;
  dead: boolean;
  lastCombatTick: number;
}

export type MonsterAi = 'idle' | 'chase' | 'return';

/** AFK auto-hunt options, set in the settings panel. */
export interface AfkSettings {
  hpPct: number; // drink an HP potion (or cast a heal) below this % of max HP
  mpPct: number; // drink an MP potion below this %
  pickup: boolean; // pick up loot nearby
  returnWhenOut: boolean; // read a return scroll and stop when HP potions run out
}

export interface AfkRun {
  mapId: string; // AFK stops if the player leaves this map
  targetId: number | null;
  skip: Record<number, number>; // monster id -> tick until which it is ignored (unreachable)
}

/** A timed spell effect on the player; `until` is a tick. */
export interface Buff {
  amount: number;
  until: number;
  spellId: string;
}

export interface Monster {
  id: number;
  defId: string;
  spawnIdx: number;
  mover: Mover;
  hp: number;
  ai: MonsterAi;
  actionReadyTick: number;
  repathTick: number;
  dead: boolean;
  respawnTick: number;
  lastHitTick: number;
}

export interface GroundItem {
  id: number;
  mapId: string;
  x: number;
  y: number;
  item: ItemStack; // itemId "gold" = gold coins, count = amount
  droppedTick: number;
}

export type LogParams = Record<string, string | number>;

export type GameEvent =
  | { type: 'mapChanged'; mapId: string }
  | { type: 'moveFailed' }
  | { type: 'log'; key: string; params?: LogParams; tone?: 'info' | 'good' | 'bad' | 'loot' }
  | { type: 'attack'; from: 'player' | number; to: 'player' | number; style: 'melee' | 'arrow' | 'spell'; spellId?: string }
  | { type: 'damage'; to: 'player' | number; amount: number; miss: boolean; magic: boolean }
  | { type: 'heal'; hp: number; mp: number }
  | { type: 'monsterDied'; id: number }
  | { type: 'levelUp'; level: number }
  | { type: 'playerDied'; expLost: number; levelBefore: number; levelAfter: number; dropped: ItemStack | null; protectionUsed: boolean }
  | { type: 'enhanced'; result: 'success' | 'fail' | 'destroyed'; itemId: string; enh: number }
  | { type: 'respawned' }
  | { type: 'npcInteract'; npcId: string }
  | { type: 'saveRequested' }
  | { type: 'bossAppeared'; id: number }
  /** An important message shown above the player for a few seconds (and in the log). */
  | { type: 'notice'; key: string; params?: LogParams };

export interface GameState {
  tick: number;
  rng: Rng;
  config: GameConfig;
  content: Content;
  maps: Record<string, MapData>;
  mapId: string;
  player: Player;
  monsters: Monster[]; // current map only
  groundItems: GroundItem[];
  bossTimers: Record<string, number>; // "<mapId>:<spawnIdx>" -> tick the boss may appear again
  nextId: number;
  events: GameEvent[]; // cleared at the start of every tick
}
