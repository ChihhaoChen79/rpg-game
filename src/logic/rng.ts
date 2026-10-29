// Seedable RNG (mulberry32). All logic randomness must go through here (plan §4 rule 4).
// The state is a plain object so it can be saved and sent over the network later.

export interface Rng {
  s: number; // 32-bit state
}

export function rngCreate(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** Uniform float in [0, 1). */
export function rngNext(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform integer in [min, max] (inclusive). */
export function rngInt(r: Rng, min: number, max: number): number {
  return min + Math.floor(rngNext(r) * (max - min + 1));
}

/** True with probability p (0..1). */
export function rngChance(r: Rng, p: number): boolean {
  return rngNext(r) < p;
}
