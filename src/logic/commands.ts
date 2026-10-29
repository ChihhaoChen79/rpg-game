// Every player intent is a Command (plan §4 rule 2). Input and UI layers create them;
// the game tick consumes them. In the online phase they are what the client sends.
import type { AfkSettings, EquipSlot, HotbarRef } from './types';

export type Command =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'stop' }
  | { type: 'attack'; monsterId: number }
  | { type: 'pickup'; groundId: number }
  | { type: 'pickupNearest' }
  | { type: 'talk'; npcId: string }
  | { type: 'useItem'; uid: number }
  | { type: 'useHotbar'; slot: number; targetId?: number }
  | { type: 'castSpell'; spellId: string; targetId?: number }
  | { type: 'equip'; uid: number }
  | { type: 'unequip'; slot: EquipSlot }
  | { type: 'dropItem'; uid: number; count: number }
  | { type: 'setHotbar'; slot: number; ref: HotbarRef | null }
  | { type: 'respawn' }
  | { type: 'buy'; npcId: string; itemId: string; count: number }
  | { type: 'sell'; npcId: string; uid: number; count: number }
  | { type: 'deposit'; npcId: string; uid: number; count: number }
  | { type: 'withdraw'; npcId: string; uid: number; count: number }
  | { type: 'repair'; npcId: string; uid: number | 'all' }
  | { type: 'setAfk'; on: boolean }
  | { type: 'setAfkSettings'; settings: AfkSettings };
