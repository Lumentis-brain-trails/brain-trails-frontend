/**
 * Deterministic randomness.
 *
 * The task spec requires reproducible sessions ("trial generator supports deterministic
 * seeds"), and a session's seed is issued by the backend. `Math.random()` must not appear
 * anywhere under `src/lib/protocol/` - a single unseeded call makes a run unreproducible
 * without failing any test.
 */

/** A seeded uniform source on [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast, and good enough for trial sequencing. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a stable 32-bit seed from a session seed and a step id.
 *
 * Per-step derivation matters: reordering a protocol's steps must not change the trial
 * sequence any single step produces, or two runs of "the same" block are not comparable.
 */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f; // separator, so ("ab","c") and ("a","bc") differ
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher-Yates, in place, driven by `rng`. */
export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** A uniform integer in [min, max], inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** A uniform value from an inclusive `[min, max]` range tuple. */
export function jitter(rng: Rng, range: readonly [number, number]): number {
  return randInt(rng, range[0], range[1]);
}
