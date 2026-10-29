// Game state creation and the fixed-rate tick (plan §4 rule 3: 10 ticks/sec).
import type { Command } from './commands';
import { equip, unequip } from './inventory';
import { parseTiledMap, type TiledMap } from './map';
import { spawnMapMonsters, monstersTick } from './monsters';
import { moverAdvance, moverBeginStep, moverCreate } from './movement';
import {
  castSpell, createPlayer, dropItem, onPlayerArrive, orderAttack, orderMove, orderPickup, orderTalk,
  pickUpNearest, playerActionTick, regenTick, respawn, useHotbar, useItem,
} from './player';
import { rngCreate } from './rng';
import { buy, deposit, repair, sell, withdraw } from './town';
import type { SaveData } from './save';
import { derive } from './stats';
import type { ClassId, Content, GameConfig, GameState, MapData, Player, Stats } from './types';
import { cleanupGround, currentMap, playerPass } from './world';

export { TICKS_PER_SECOND, TICK_MS } from './time';
export { currentMap, playerInSafeZone } from './world';

export interface GameInit {
  config: GameConfig;
  content: Content;
  maps: Record<string, TiledMap>;
  seed: number;
  /** Either a new character placed at startMap's start point... */
  newCharacter?: { classId: ClassId; stats: Stats; startMap: string };
  /** ...or a loaded save. */
  save?: SaveData;
}

export function createGame(init: GameInit): GameState {
  const maps: Record<string, MapData> = {};
  for (const [id, tiled] of Object.entries(init.maps)) maps[id] = parseTiledMap(id, tiled);
  let nextId = init.save?.nextId ?? 1;
  const ids = () => nextId++;

  let mapId: string;
  let player: Player;
  if (init.save) {
    const sv = init.save;
    mapId = maps[sv.mapId] ? sv.mapId : Object.keys(maps)[0]!;
    player = {
      ...JSON.parse(JSON.stringify(sv.player)),
      cooldowns: {}, maxDamageUntil: 0, mover: moverCreate(sv.x, sv.y), dest: null, action: { kind: 'none' },
      repathTick: 0, actionReadyTick: 0, invulnUntil: 0, dead: false, lastCombatTick: -1000,
    };
  } else if (init.newCharacter) {
    const nc = init.newCharacter;
    const start = maps[nc.startMap]?.start;
    if (!start) throw new Error(`Map "${nc.startMap}" has no start point`);
    mapId = nc.startMap;
    player = createPlayer(init.content, ids, nc.classId, nc.stats, start);
  } else {
    throw new Error('createGame needs newCharacter or save');
  }

  const s: GameState = {
    tick: 0, rng: rngCreate(init.seed), config: init.config, content: init.content, maps, mapId, player,
    monsters: [], groundItems: [], nextId, events: [],
  };
  const d = derive(s.content, player);
  player.hp = Math.max(1, Math.min(player.hp, d.maxHp));
  player.mp = Math.min(player.mp, d.maxMp);
  spawnMapMonsters(s);
  return s;
}

function applyCommand(s: GameState, c: Command): void {
  const p = s.player;
  if (p.dead && c.type !== 'respawn') return;
  switch (c.type) {
    case 'moveTo': orderMove(s, c); break;
    case 'stop':
      p.mover.path = [];
      p.dest = null;
      p.action = { kind: 'none' };
      break;
    case 'attack': orderAttack(s, c.monsterId); break;
    case 'pickup': orderPickup(s, c.groundId); break;
    case 'pickupNearest': pickUpNearest(s); break;
    case 'talk': orderTalk(s, c.npcId); break;
    case 'useItem': useItem(s, c.uid); break;
    case 'useHotbar': useHotbar(s, c.slot, c.targetId); break;
    case 'castSpell': castSpell(s, c.spellId, c.targetId); break;
    case 'equip': equip(s, c.uid); break;
    case 'unequip': unequip(s, c.slot); break;
    case 'dropItem': dropItem(s, c.uid, c.count); break;
    case 'setHotbar':
      if (c.slot >= 0 && c.slot < p.hotbar.length) p.hotbar[c.slot] = c.ref;
      break;
    case 'respawn': respawn(s); break;
    case 'buy': buy(s, c.npcId, c.itemId, c.count); break;
    case 'sell': sell(s, c.npcId, c.uid, c.count); break;
    case 'deposit': deposit(s, c.npcId, c.uid, c.count); break;
    case 'withdraw': withdraw(s, c.npcId, c.uid, c.count); break;
    case 'repair': repair(s, c.npcId, c.uid); break;
  }
}

/** Advance the simulation by one tick. Events produced are left in s.events. */
export function tick(s: GameState, commands: readonly Command[]): void {
  s.events = [];
  for (const c of commands) applyCommand(s, c);

  const p = s.player;
  if (!p.dead) {
    if (moverAdvance(p.mover, s.config.stepTicks)) onPlayerArrive(s);
    playerActionTick(s);
    moverBeginStep(currentMap(s), p.mover, playerPass(s));
  }
  monstersTick(s);
  regenTick(s);
  cleanupGround(s);
  s.tick++;
}
