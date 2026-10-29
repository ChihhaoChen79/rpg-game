import { describe, expect, it } from 'vitest';
import { rngChance, rngCreate, rngInt, rngNext } from '../src/logic/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = rngCreate(42);
    const b = rngCreate(42);
    for (let i = 0; i < 100; i++) expect(rngNext(a)).toBe(rngNext(b));
  });

  it('state survives a JSON round trip', () => {
    const a = rngCreate(7);
    rngNext(a);
    const b = JSON.parse(JSON.stringify(a));
    expect(rngNext(b)).toBe(rngNext(a));
  });

  it('rngInt stays in range and hits both ends', () => {
    const r = rngCreate(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rngInt(r, 3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('rngChance roughly matches probability', () => {
    const r = rngCreate(99);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (rngChance(r, 0.25)) hits++;
    expect(hits / 10000).toBeGreaterThan(0.23);
    expect(hits / 10000).toBeLessThan(0.27);
  });
});
