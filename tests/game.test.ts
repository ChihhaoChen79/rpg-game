import { describe, expect, it } from 'vitest';
import { currentMap, playerInSafeZone, tick } from '../src/logic/game';
import { moverAdvance, moverBeginStep, moverCreate, moverSetDestination } from '../src/logic/movement';
import { Facing } from '../src/logic/types';
import { asciiMap, newGame, runUntil } from './helpers';

describe('mover', () => {
  it('takes stepTicks ticks per tile and chains steps without pauses', () => {
    const m = asciiMap(['.....']);
    const mv = moverCreate(0, 0);
    expect(moverSetDestination(m, mv, { x: 3, y: 0 }, 100, 0)).toBe(true);
    let arrivals = 0;
    let ticks = 0;
    moverBeginStep(m, mv);
    while ((mv.moving || mv.path.length) && ticks < 100) {
      if (moverAdvance(mv, 3)) arrivals++;
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
  it('starts in the village safe zone at full HP/MP', () => {
    const s = newGame();
    expect(s.mapId).toBe('village');
    expect(playerInSafeZone(s)).toBe(true);
    expect(s.player.hp).toBeGreaterThan(0);
    expect(s.monsters).toHaveLength(0);
  });

  it('walks to a clicked tile via commands', () => {
    const s = newGame();
    const mv = s.player.mover;
    const target = { x: mv.x - 3, y: mv.y + 1 };
    tick(s, [{ type: 'moveTo', ...target }]);
    runUntil(s, () => !mv.moving && mv.path.length === 0, 50);
    expect({ x: mv.x, y: mv.y }).toEqual(target);
  });

  it('reports moveFailed for unreachable targets', () => {
    const s = newGame();
    tick(s, [{ type: 'moveTo', x: -50, y: -50 }]);
    expect(s.events).toContainEqual({ type: 'moveFailed' });
  });

  it('walking onto the east gate changes map and spawns that map\'s monsters', () => {
    const s = newGame();
    const exit = currentMap(s).exits[0]!;
    tick(s, [{ type: 'moveTo', x: exit.x, y: exit.y }]);
    runUntil(s, () => s.mapId === 'field1', 500);
    expect(s.mapId).toBe('field1');
    expect(s.player.mover).toMatchObject({ x: exit.targetX, y: exit.targetY, moving: false });
    expect(s.monsters.length).toBeGreaterThan(0);
  });

  it('NPC tiles block movement and talking walks next to the NPC', () => {
    const s = newGame();
    const npc = currentMap(s).npcs[0]!;
    tick(s, [{ type: 'talk', npcId: npc.npcId }]);
    let talked = false;
    runUntil(s, () => (talked = s.events.some((e) => e.type === 'npcInteract')), 200);
    expect(talked).toBe(true);
    const mv = s.player.mover;
    expect(Math.max(Math.abs(mv.x - npc.x), Math.abs(mv.y - npc.y))).toBe(1);
  });
});
