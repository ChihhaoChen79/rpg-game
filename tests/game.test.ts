import { describe, expect, it } from 'vitest';
import { createGame, currentMap, playerInSafeZone, tick } from '../src/logic/game';
import { moverAdvance, moverBeginStep, moverCreate, moverSetDestination } from '../src/logic/movement';
import { Facing } from '../src/logic/types';
import config from '../data/game-config.json';
import village from '../maps/village.json';
import field1 from '../maps/field1.json';
import type { TiledMap } from '../src/logic/map';
import { asciiMap } from './helpers';

function newGame() {
  return createGame({
    config,
    maps: { village: village as TiledMap, field1: field1 as TiledMap },
    startMap: 'village',
    seed: 1,
  });
}

describe('mover', () => {
  it('takes stepTicks ticks per tile and chains steps without pauses', () => {
    const m = asciiMap(['.....']);
    const mv = moverCreate(0, 0);
    expect(moverSetDestination(m, mv, { x: 3, y: 0 }, 100, 0)).toBe(true);
    const stepTicks = 3;
    let arrivals = 0;
    let ticks = 0;
    moverBeginStep(m, mv);
    while ((mv.moving || mv.path.length) && ticks < 100) {
      if (moverAdvance(mv, stepTicks)) arrivals++;
      moverBeginStep(m, mv);
      ticks++;
    }
    expect(arrivals).toBe(3);
    expect(ticks).toBe(9);
    expect(mv.x).toBe(3);
    expect(mv.facing).toBe(Facing.Right);
  });

  it('a new destination mid-step does not interrupt the current step', () => {
    const m = asciiMap(['.....', '.....']);
    const mv = moverCreate(2, 0);
    moverSetDestination(m, mv, { x: 4, y: 0 }, 100, 0);
    moverBeginStep(m, mv);
    expect(mv.x).toBe(3);
    moverAdvance(mv, 3);
    moverSetDestination(m, mv, { x: 0, y: 0 }, 100, 0);
    expect(mv.moving).toBe(true);
    expect(mv.fromX).toBe(2);
    expect(mv.path[0]).toEqual({ x: 2, y: 0 });
  });
});

describe('game', () => {
  it('starts in the village safe zone', () => {
    const s = newGame();
    expect(s.mapId).toBe('village');
    expect(playerInSafeZone(s)).toBe(true);
  });

  it('walks to a clicked tile via commands', () => {
    const s = newGame();
    const mv = s.player.mover;
    const target = { x: mv.x + 3, y: mv.y + 1 };
    tick(s, [{ type: 'moveTo', ...target }]);
    for (let i = 0; i < 30; i++) tick(s, []);
    expect({ x: mv.x, y: mv.y }).toEqual(target);
    expect(mv.moving).toBe(false);
  });

  it('reports moveFailed for unreachable targets', () => {
    const s = newGame();
    tick(s, [{ type: 'moveTo', x: -50, y: -50 }]);
    expect(s.events).toContainEqual({ type: 'moveFailed' });
  });

  it('walking onto the east gate changes map to the field', () => {
    const s = newGame();
    const exit = currentMap(s).exits[0]!;
    tick(s, [{ type: 'moveTo', x: exit.x, y: exit.y }]);
    let changed = false;
    for (let i = 0; i < 500 && !changed; i++) {
      tick(s, []);
      changed = s.events.some((e) => e.type === 'mapChanged');
    }
    expect(changed).toBe(true);
    expect(s.mapId).toBe('field1');
    expect(s.player.mover).toMatchObject({ x: exit.targetX, y: exit.targetY, moving: false });
    expect(playerInSafeZone(s)).toBe(false);
  });

  it('stop clears the queued path but finishes the current step', () => {
    const s = newGame();
    const mv = s.player.mover;
    tick(s, [{ type: 'moveTo', x: mv.x + 5, y: mv.y }]);
    tick(s, [{ type: 'stop' }]);
    for (let i = 0; i < 10; i++) tick(s, []);
    expect(mv.moving).toBe(false);
    expect(mv.path).toEqual([]);
  });

  it('the state is serializable apart from typed arrays in static map data', () => {
    const s = newGame();
    const { maps: _maps, ...dynamic } = s;
    expect(JSON.parse(JSON.stringify(dynamic))).toEqual(dynamic);
  });
});
