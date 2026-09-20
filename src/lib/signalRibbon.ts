/**
 * Geometry of the contact ribbon: a bundle of loose strands that reads as one
 * body, disturbed locally by whichever electrode is losing contact.
 *
 * The screen has four electrodes and no room for four charts, so contact is
 * shown as one continuous band instead. Each electrode owns a stretch of it
 * through a Gaussian kernel, and the kernels are normalised against each other
 * so the band is continuous everywhere: there is no seam between sensors and no
 * stretch of ribbon that belongs to nobody.
 *
 * An electrode does not reshape the band. It adds a phase term, so the strands
 * passing over it stop turning together and fray. That keeps a bad sensor
 * legible as *local* trouble while the band stays one object.
 *
 * Everything here is framework-free and deterministic; the canvas work lives in
 * `components/SignalRibbon.tsx`, the way `trailPath` sits under `TrailRibbon`.
 */

import { EEG_CHANNELS, type EegChannel } from "./muse/protocol";
import type { QualityLevel } from "./muse/quality";

const TAU = Math.PI * 2;

/**
 * Where each electrode sits along the ribbon, left to right as worn.
 *
 * These are the centres of four equal columns (1/8, 3/8, 5/8, 7/8), so a plain
 * four-column grid of lamps lines up with the band underneath at every width
 * without measuring anything.
 */
export const RIBBON_POSITIONS: Record<EegChannel, number> = {
  TP9: 0.125,
  AF7: 0.375,
  AF8: 0.625,
  TP10: 0.875,
};

/**
 * Disturbance injected by each quality level, 0 (clean) to 1 (pure artefact).
 *
 * `unknown` sits mid-scale on purpose: before the first window arrives the band
 * should look unsettled rather than either calm or alarming.
 */
export const NOISE_BY_LEVEL: Record<QualityLevel, number> = {
  good: 0.06,
  unknown: 0.45,
  noisy: 0.62,
  saturated: 0.78,
  flat: 0.95,
};

/**
 * Blend radius of one electrode's kernel, in ribbon units.
 *
 * The electrodes are 0.25 apart, and this is the trade-off between the two
 * things the band has to do. Too wide and an electrode never owns even its own
 * position: at 0.17 a lone bad sensor only carries 0.59 of the blend under its
 * own lamp, so the band tops out orange and can never say "this one is wrong".
 * Narrow enough and it does (0.92 of the blend, so the ramp reaches its hot
 * end), while the kernels still overlap far too much to leave a seam.
 */
export const DEFAULT_SIGMA = 0.105;

/** Disturbance per channel, in `EEG_CHANNELS` order. */
export function noiseFromQuality(
  quality: Record<EegChannel, { level: QualityLevel }>
): number[] {
  return EEG_CHANNELS.map((c) => NOISE_BY_LEVEL[quality[c].level]);
}

/**
 * Each electrode's share of the influence at `u`, normalised to sum to 1.
 *
 * This is a partition of unity: dividing the Gaussians by their own sum means
 * the four kernels always account for exactly one unit of influence, so no
 * stretch of the band is left unclaimed between electrodes and none is counted
 * twice where two kernels overlap.
 */
export function kernelWeights(u: number, sigma = DEFAULT_SIGMA): number[] {
  const raw = EEG_CHANNELS.map((c) => {
    const d = (u - RIBBON_POSITIONS[c]) / sigma;
    return Math.exp(-0.5 * d * d);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / total);
}

/** Blended disturbance at `u`, given one value per channel. */
export function noiseAt(
  u: number,
  noise: readonly number[],
  sigma = DEFAULT_SIGMA
): number {
  const w = kernelWeights(u, sigma);
  let sum = 0;
  for (let i = 0; i < w.length; i++) sum += w[i] * noise[i];
  return sum;
}

/** One strand's fixed identity: what stops it from being a copy of its neighbour. */
export interface Strand {
  /** Wavelengths across the width. */
  k: number;
  /** Its own drift rate, and the direction it drifts in. */
  w: number;
  sign: 1 | -1;
  phase: number;
  /** How wide it rides, as a fraction of the bundle's spread. */
  swing: number;
  /** A finer tremor that only wakes up on a dirty contact. */
  k2: number;
  w2: number;
  p2: number;
  /** Which of the three tinted gradients it is stroked with. */
  tint: 0 | 1 | 2;
  alpha: number;
  width: number;
}

/** Small deterministic PRNG, so a resize never reshuffles the bundle. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A bundle of `count` strands. Deterministic for a given seed, and stable under
 * a change of count: strand *n* is the same strand whether the bundle holds ten
 * of them or twenty, so the slider never reshuffles what is on screen.
 */
export function buildStrands(count: number, seed = 20260920): Strand[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    k: 0.72 + 1.15 * rnd(),
    w: 0.14 + 0.3 * rnd(),
    phase: rnd() * TAU,
    swing: 0.26 + 0.74 * rnd(),
    k2: 2.2 + 4.0 * rnd(),
    w2: 0.2 + 0.55 * rnd(),
    p2: rnd() * TAU,
    tint: ((rnd() * 3) | 0) as 0 | 1 | 2,
    alpha: 0.16 + 0.34 * rnd(),
    width: 0.9 + 1.4 * rnd(),
    sign: (rnd() < 0.5 ? -1 : 1) as 1 | -1,
  }));
}

/**
 * The slow centre line every strand orbits, as a fraction of the band's height.
 *
 * Shared by the whole bundle: this is the only thing holding it together, and
 * why a set of independent curves still reads as one object.
 */
export function centreOffset(u: number, t: number): number {
  return (
    0.055 * Math.sin(TAU * 0.62 * u + t * 0.29) +
    0.032 * Math.sin(TAU * 1.27 * u - t * 0.21 + 1.1)
  );
}

/**
 * Half-height of the bundle at disturbance `n`, as a fraction of the band's
 * height. It opens only a little: a bad electrode should be felt as
 * interference, not as a change of shape.
 */
export function spreadFraction(n: number): number {
  return 0.105 + 0.072 * n;
}

/**
 * Where one strand rides at `u`, in units of the bundle's spread.
 *
 * The last term of `theta` is the whole point: a carrier that only bites where
 * the kernel mix says the contact is dirty, scrambling *when* this strand turns
 * rather than dragging it somewhere. `interference` scales it, and at 0 the
 * bundle stays coherent no matter how bad the contact is.
 */
export function strandOffset(
  s: Strand,
  u: number,
  n: number,
  t: number,
  interference = 1
): number {
  const theta =
    TAU * s.k * u +
    s.sign * s.w * t +
    s.phase +
    1.9 * interference * n * Math.sin(TAU * 3.1 * u + t * 1.7 + s.phase);
  const tremor = TAU * s.k2 * u + s.w2 * t * 2.1 + s.p2;
  return s.swing * Math.sin(theta) + 0.3 * (0.06 + 1.25 * n) * Math.sin(tremor);
}
