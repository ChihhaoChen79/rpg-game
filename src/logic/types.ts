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
}

export interface NpcPlacement {
  npcId: string;
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
}

export type EquipSlot = 'weapon' | 'shield' | 'helmet' | 'armor' | 'cloak' | 'gloves' | 'boots';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'shield', 'helmet', 'armor', 'cloak', 'gloves', 'boots'];

export interface WeaponStats {
  anim: 'slash' | 'thrust' | 'shoot'; // attack animation
  dmg: [number, number];
  hit: number; // %
  attackTicks: number;
  range: number; // tiles (Chebyshev); 1 = melee
  ranged: boolean; // uses arrows
  twoHanded: boolean;
  meleeDmg?: [number, number]; // bow used as a club when out of arrows
  durability: number;
}

export type ItemUse =
  | { type: 'heal'; hp?: number; mp?: number }
  | { type: 'maxDamage'; ticks: number }
  | { type: 'return' }
  | { type: 'teleport' }
  | { type: 'save' };

export interface ItemDef {
  nameKey: string;
  descKey?: string;
  icon: number;
  kind: 'gold' | 'consumable' | 'ammo' | 'equipment';
  weight: number; // tenths
  price: number;
  stackable: boolean;
  classes?: ClassId[];
  level?: number;
  use?: ItemUse;
  cooldownGroup?: string;
  cooldownTicks?: number;
  slot?: EquipSlot;
  sprite?: string; // character layer sheet drawn while equipped
  weapon?: WeaponStats;
  def?: number;
  mr?: number;
}

export type SpellEffect =
  | { type: 'heal'; min: number; max: number }
  | { type: 'damage'; min: number; max: number }
  | { type: 'maxDamage'; ticks: number };

export interface SpellDef {
  nameKey: string;
  descKey: string;
  icon: number;
  group: 'common' | 'mage' | 'spirit';
  classes: ClassId[];
  level: number;
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

export interface NpcDef {
  nameKey: string;
  appearance: string[];
  role: 'save';
}

export interface Balance {
  levelCap: number;
  hitClamp: [number, number];
  fists: { dmg: [number, number]; hit: number; attackTicks: number };
  hitBonusPerDex: number;
  hitBonusPerLevel: number;
  evasionPerDex: number;
  strDamageDiv: number;
  dexDamageDiv: number;
  intDamageDiv: number;
  wisHealDiv: number;
  mrPerWis: number;
  mrCap: number;
  weightPerStat: number;
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
}

export interface Content {
  classes: Record<ClassId, ClassDef>;
  items: Record<string, ItemDef>;
  spells: Record<string, SpellDef>;
  monsters: Record<string, MonsterDef>;
  npcs: Record<string, NpcDef>;
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
  | { kind: 'talk'; npcId: string };

export interface Player {
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
  equipment: Partial<Record<EquipSlot, ItemStack>>;
  spells: string[];
  hotbar: (HotbarRef | null)[];
  cooldowns: Record<string, number>; // group or "spell:<id>" -> tick when ready
  maxDamageUntil: number; // tick
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
  | { type: 'playerDied'; expLost: number; levelBefore: number; levelAfter: number }
  | { type: 'respawned' }
  | { type: 'npcInteract'; npcId: string }
  | { type: 'saveRequested' };

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
  nextId: number;
  events: GameEvent[]; // cleared at the start of every tick
}
