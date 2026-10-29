// Monster spawning and AI (plan §7.10, §7.18).
import { monsterAttack } from './combat';
import { monsterDef } from './content';
import { chebyshev, isSafe, isWalkable } from './map';
import { moverAdvance, moverBeginStep, moverCreate, moverPlace } from './movement';
import { findPath, findPathInRange } from './pathfinding';
import { rngChance, rngInt } from './rng';
import type { GameState, MapData, Monster, SpawnArea } from './types';
import { currentMap, monsterAt, monsterPass, playerInSafeZone, playerOn } from './world';

const SPAWN_TRIES = 30;
const SPAWN_RETRY_TICKS = 10;
const WANDER_MAX_NODES = 200;

/** Tiles near map entry points never get monsters (plan §7.10). */
function nearEntryPoint(s: GameState, map: MapData, x: number, y: number): boolean {
  const r = s.content.balance.noSpawnRadius;
  const points = [map.start, map.respawn];
  for (const p of points) if (p && chebyshev(p.x, p.y, x, y) <= r) return true;
  for (const e of map.exits) {
    const cx = Math.max(e.x, Math.min(x, e.x + e.w - 1));
    const cy = Math.max(e.y, Math.min(y, e.y + e.h - 1));
    if (chebyshev(cx, cy, x, y) <= r) return true;
  }
  // Arrival points of exits leading into this map count as entry points too.
  for (const other of Object.values(s.maps)) {
    for (const e of other.exits) {
      if (e.targetMap === map.id && chebyshev(e.targetX, e.targetY, x, y) <= r) return true;
    }
  }
  return false;
}

function pickSpawnTile(s: GameState, area: SpawnArea): { x: number; y: number } | null {
  const map = currentMap(s);
  const pm = s.player.mover;
  for (let i = 0; i < SPAWN_TRIES; i++) {
    const x = rngInt(s.rng, area.x, area.x + area.w - 1);
    const y = rngInt(s.rng, area.y, area.y + area.h - 1);
    if (!isWalkable(map, x, y) || isSafe(map, x, y)) continue;
    if (monsterAt(s, x, y) || playerOn(s, x, y)) continue;
    if (nearEntryPoint(s, map, x, y)) continue;
    if (chebyshev(pm.x, pm.y, x, y) < s.content.balance.spawnMinPlayerDist) continue;
    return { x, y };
  }
  return null;
}

function trySpawn(s: GameState, m: Monster): void {
  const area = currentMap(s).spawns[m.spawnIdx]!;
  const tile = pickSpawnTile(s, area);
  if (!tile) {
    m.respawnTick = s.tick + SPAWN_RETRY_TICKS;
    return;
  }
  m.dead = false;
  m.hp = monsterDef(s.content, m.defId).hp;
  m.ai = 'idle';
  m.actionReadyTick = s.tick;
  moverPlace(m.mover, tile.x, tile.y);
}

/** Fill the current map's spawn areas (called on entering a map). */
export function spawnMapMonsters(s: GameState): void {
  s.monsters = [];
  const spawns = currentMap(s).spawns;
  spawns.forEach((area, spawnIdx) => {
    for (let i = 0; i < area.count; i++) {
      const m: Monster = {
        id: s.nextId++, defId: area.monster, spawnIdx, mover: moverCreate(0, 0), hp: 0, ai: 'idle',
        actionReadyTick: 0, repathTick: 0, dead: true, respawnTick: s.tick, lastHitTick: -1,
      };
      s.monsters.push(m);
      trySpawn(s, m);
    }
  });
}

function home(s: GameState, m: Monster): { x: number; y: number } {
  const a = currentMap(s).spawns[m.spawnIdx]!;
  return { x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) };
}

function distFromArea(s: GameState, m: Monster): number {
  const a = currentMap(s).spawns[m.spawnIdx]!;
  const cx = Math.max(a.x, Math.min(m.mover.x, a.x + a.w - 1));
  const cy = Math.max(a.y, Math.min(m.mover.y, a.y + a.h - 1));
  return chebyshev(cx, cy, m.mover.x, m.mover.y);
}

/** The player can be chased and hit: alive, outside safe zones, not invulnerable. */
export function playerTargetable(s: GameState): boolean {
  const p = s.player;
  return !p.dead && s.tick >= p.invulnUntil && !playerInSafeZone(s);
}

function returnHome(s: GameState, m: Monster): void {
  m.ai = 'return';
  const map = currentMap(s);
  const h = home(s, m);
  m.mover.path = findPathInRange(map, m.mover, h, 2, s.config.pathMaxNodes, monsterPass(s, m)) ?? [];
}

function think(s: GameState, m: Monster): void {
  const b = s.content.balance;
  const md = monsterDef(s.content, m.defId);
  const map = currentMap(s);
  const pm = s.player.mover;
  const dist = chebyshev(m.mover.x, m.mover.y, pm.x, pm.y);

  if (m.ai === 'return') {
    if (distFromArea(s, m) === 0 || m.mover.path.length === 0) {
      if (!m.mover.moving) {
        m.ai = 'idle';
        m.hp = md.hp; // leashed monsters reset (plan §7.10)
      }
    }
    return;
  }

  if (m.ai === 'chase') {
    if (!playerTargetable(s) || distFromArea(s, m) > md.leashRange) {
      returnHome(s, m);
      return;
    }
    if (dist <= 1) {
      if (!m.mover.moving) {
        m.mover.path = [];
        if (s.tick >= m.actionReadyTick) monsterAttack(s, m);
      }
      return;
    }
    if (s.tick >= m.repathTick || m.mover.path.length === 0) {
      m.repathTick = s.tick + b.monsterRepathTicks;
      const path = findPathInRange(map, m.mover, pm, 1, s.config.pathMaxNodes, monsterPass(s, m));
      if (path) m.mover.path = path;
      else returnHome(s, m); // unreachable: give up
    }
    return;
  }

  // idle
  if (md.aggressive && dist <= md.aggroRange && playerTargetable(s)) {
    m.ai = 'chase';
    m.repathTick = s.tick;
    return;
  }
  if (!m.mover.moving && m.mover.path.length === 0 && rngChance(s.rng, b.monsterWanderChance)) {
    const r = b.monsterWanderRadius;
    const a = currentMap(s).spawns[m.spawnIdx]!;
    const tx = Math.max(a.x, Math.min(a.x + a.w - 1, m.mover.x + rngInt(s.rng, -r, r)));
    const ty = Math.max(a.y, Math.min(a.y + a.h - 1, m.mover.y + rngInt(s.rng, -r, r)));
    m.mover.path = findPath(map, m.mover, { x: tx, y: ty }, WANDER_MAX_NODES, monsterPass(s, m)) ?? [];
  }
}

export function monstersTick(s: GameState): void {
  const map = currentMap(s);
  for (const m of s.monsters) {
    if (m.dead) {
      if (s.tick >= m.respawnTick) trySpawn(s, m);
      continue;
    }
    const md = monsterDef(s.content, m.defId);
    moverAdvance(m.mover, md.stepTicks);
    think(s, m);
    if (s.player.dead && m.ai === 'chase') m.ai = 'return';
    moverBeginStep(map, m.mover, monsterPass(s, m));
  }
}
