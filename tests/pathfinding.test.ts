import { describe, expect, it } from 'vitest';
import { canStep, findPath, snapToWalkable } from '../src/logic/pathfinding';
import { asciiMap } from './helpers';

describe('findPath', () => {
  it('returns [] when already at goal', () => {
    const m = asciiMap(['...']);
    expect(findPath(m, { x: 1, y: 0 }, { x: 1, y: 0 }, 100)).toEqual([]);
  });

  it('uses diagonals: step count equals Chebyshev distance on open ground', () => {
    const m = asciiMap(Array(10).fill('..........'));
    const p = findPath(m, { x: 0, y: 0 }, { x: 7, y: 3 }, 1000)!;
    expect(p.length).toBe(7);
    expect(p[p.length - 1]).toEqual({ x: 7, y: 3 });
  });

  it('prefers a straight line over zigzags of equal length', () => {
    const m = asciiMap(Array(5).fill('..........'));
    const p = findPath(m, { x: 0, y: 2 }, { x: 6, y: 2 }, 1000)!;
    expect(p.every((t) => t.y === 2)).toBe(true);
  });

  it('routes around walls', () => {
    const m = asciiMap([
      '.....',
      '.###.',
      '.....',
    ]);
    const p = findPath(m, { x: 2, y: 0 }, { x: 2, y: 2 }, 1000)!;
    expect(p).not.toBeNull();
    for (const t of p) expect(m.blocked[t.y * m.width + t.x]).toBe(0);
  });

  it('does not cut wall corners diagonally', () => {
    const m = asciiMap([
      '.#',
      '..',
    ]);
    expect(canStep(m, 0, 0, 1, 1)).toBe(false);
    const p = findPath(m, { x: 0, y: 0 }, { x: 1, y: 1 }, 100)!;
    expect(p).toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  });

  it('returns null for unreachable or blocked goals', () => {
    const m = asciiMap([
      '..#..',
      '..#..',
    ]);
    expect(findPath(m, { x: 0, y: 0 }, { x: 4, y: 0 }, 1000)).toBeNull();
    expect(findPath(m, { x: 0, y: 0 }, { x: 2, y: 0 }, 1000)).toBeNull();
  });

  it('respects the extra pass function', () => {
    const m = asciiMap(['.....']);
    expect(findPath(m, { x: 0, y: 0 }, { x: 4, y: 0 }, 100, (x) => x !== 2)).toBeNull();
  });

  it('gives up after maxNodes expansions', () => {
    const m = asciiMap(Array(50).fill('.'.repeat(50)));
    expect(findPath(m, { x: 0, y: 0 }, { x: 49, y: 49 }, 5)).toBeNull();
  });
});

describe('snapToWalkable', () => {
  it('keeps a walkable target', () => {
    const m = asciiMap(['...']);
    expect(snapToWalkable(m, { x: 1, y: 0 }, { x: 0, y: 0 }, 2)).toEqual({ x: 1, y: 0 });
  });

  it('moves a blocked target to the nearest walkable tile, nearer the walker on ties', () => {
    const m = asciiMap([
      '.....',
      '.###.',
      '.....',
    ]);
    expect(snapToWalkable(m, { x: 2, y: 1 }, { x: 2, y: 2 }, 2)).toEqual({ x: 2, y: 2 });
    expect(snapToWalkable(m, { x: 2, y: 1 }, { x: 2, y: 0 }, 2)).toEqual({ x: 2, y: 0 });
  });

  it('returns null when nothing is in range', () => {
    const m = asciiMap(['#####']);
    expect(snapToWalkable(m, { x: 2, y: 0 }, { x: 0, y: 0 }, 2)).toBeNull();
  });
});
