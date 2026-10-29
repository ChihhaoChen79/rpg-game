// Content validation for every shipped map: catches broken edits made in Tiled.
import { describe, expect, it } from 'vitest';
import { exitAt, isWalkable, parseTiledMap, type TiledMap } from '../src/logic/map';
import { findPath } from '../src/logic/pathfinding';
import type { MapData } from '../src/logic/types';
import village from '../maps/village.json';
import field1 from '../maps/field1.json';

const maps: Record<string, MapData> = {
  village: parseTiledMap('village', village as TiledMap),
  field1: parseTiledMap('field1', field1 as TiledMap),
};

describe.each(Object.values(maps))('map $id', (m) => {
  const origin = m.start ?? m.respawn;

  it('has a start or respawn point on a walkable tile', () => {
    expect(origin).not.toBeNull();
    expect(isWalkable(m, origin!.x, origin!.y)).toBe(true);
    if (m.respawn) expect(isWalkable(m, m.respawn.x, m.respawn.y)).toBe(true);
  });

  it('has at least one exit', () => {
    expect(m.exits.length).toBeGreaterThan(0);
  });

  it('every exit is reachable and leads to a walkable, non-exit tile of a real map', () => {
    for (const e of m.exits) {
      const target = maps[e.targetMap];
      expect(target, `exit to ${e.targetMap}`).toBeDefined();
      expect(isWalkable(target!, e.targetX, e.targetY)).toBe(true);
      expect(exitAt(target!, e.targetX, e.targetY)).toBeNull();
      expect(findPath(m, origin!, { x: e.x, y: e.y }, 100000)).not.toBeNull();
    }
  });
});
