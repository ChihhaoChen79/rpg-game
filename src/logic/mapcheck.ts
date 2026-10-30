// Rules every map must follow (docs/MAPS.md). Used by tests/maps.test.ts and by the map editor
// (tools/map-editor) before it saves, so a broken map never reaches the game.
import { exitAt, isWalkable } from './map';
import { findPath } from './pathfinding';
import type { Content, MapData, Vec } from './types';

/** Where a player can appear on `m`: start/respawn, arrival points, or arrival tiles of exits into it. */
export function entryPoints(maps: Record<string, MapData>, m: MapData): Vec[] {
  const out: Vec[] = [];
  if (m.start) out.push(m.start);
  if (m.respawn) out.push(m.respawn);
  for (const a of m.arrivals) out.push(a);
  for (const o of Object.values(maps)) for (const e of o.exits) if (e.targetMap === m.id) out.push({ x: e.targetX, y: e.targetY });
  return out;
}

/**
 * Problems with map `id`, as readable messages (empty = fine). `strings` is the strings file;
 * when given, the map's name must be in it.
 */
export function checkMap(maps: Record<string, MapData>, id: string, c: Content, strings?: Record<string, string>): string[] {
  const m = maps[id];
  if (!m) return [`map "${id}" not found`];
  const errs: string[] = [];
  const at = (p: Vec) => `(${p.x}, ${p.y})`;
  const entries = entryPoints(maps, m);
  if (entries.length === 0) errs.push('no way in: add a start, respawn or arrival point, or an exit from another map that leads here');
  for (const p of entries) if (!isWalkable(m, p.x, p.y)) errs.push(`entry point ${at(p)} is not walkable`);
  if (m.exits.length === 0 && m.arrivals.length === 0 && !m.start) errs.push('closed map without an arrival point: teleports could not reach it');

  const origin = entries.find((p) => isWalkable(m, p.x, p.y));
  for (const e of m.exits) {
    const target = maps[e.targetMap];
    if (!target) {
      errs.push(`exit ${at(e)} leads to unknown map "${e.targetMap}"`);
      continue;
    }
    const to = { x: e.targetX, y: e.targetY };
    if (!isWalkable(target, to.x, to.y)) errs.push(`exit ${at(e)} lands on ${e.targetMap} ${at(to)}, which is not walkable`);
    else if (exitAt(target, to.x, to.y)) errs.push(`exit ${at(e)} lands on ${e.targetMap} ${at(to)}, which is another exit`);
    if (origin && !findPath(m, origin, { x: e.x, y: e.y }, 200000)) errs.push(`exit ${at(e)} can't be reached from ${at(origin)}`);
  }
  for (const a of m.arrivals) {
    if (origin && !findPath(m, origin, a, 200000)) errs.push(`arrival point "${a.name}" ${at(a)} can't be reached from ${at(origin)}`);
  }

  const respawnMap = maps[m.respawnMap];
  if (!respawnMap) errs.push(`respawnMap "${m.respawnMap}" doesn't exist`);
  else if (!respawnMap.respawn && !respawnMap.start) errs.push(`respawnMap "${m.respawnMap}" has no respawn or start point`);

  for (const sp of m.spawns) {
    if (!c.monsters[sp.monster]) errs.push(`spawn area ${at(sp)} uses unknown monster "${sp.monster}"`);
    let open = false;
    for (let y = sp.y; y < sp.y + sp.h && !open; y++) for (let x = sp.x; x < sp.x + sp.w && !open; x++) open = isWalkable(m, x, y);
    if (!open) errs.push(`spawn area ${at(sp)} has no walkable tile`);
  }
  for (const n of m.npcs) if (!c.npcs[n.npcId]) errs.push(`NPC ${at(n)} uses unknown npcId "${n.npcId}"`);
  if (strings && !strings[m.nameKey]) errs.push(`map name "${m.nameKey}" is missing from data/strings.zh-TW.json`);
  return errs;
}
