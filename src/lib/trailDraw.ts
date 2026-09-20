/**
 * What a trail picture draws, decided before anything is scaled.
 *
 * A session is one window per second, so a long one is thousands of ordered points
 * that cross the middle of the layout again and again: drawn whole it is a ball of
 * yarn at any zoom. So the path is summarised in time - each drawn sample is the
 * mean of the windows it stands for - and the picture is framed on the result.
 *
 * Summarised, not sub-sampled: every window still pulls on the sample that covers
 * it, so an excursion bends the path instead of vanishing with the windows that were
 * skipped. This is a drawing decision only, like the smoothing in `trailPath`: the
 * windows themselves are the data and every reader still hit-tests them.
 */

import type { TrailPoint } from "@/lib/types";

/** One drawn sample: a position, when it happened, and the windows behind it. */
export interface TrailSample {
  x: number;
  y: number;
  /** Start of the first window in the run, in seconds. */
  t: number;
  /** How many windows this sample averages. 1 when the trail is drawn whole. */
  n: number;
}

/**
 * Average `points` down to about `target` samples, in order.
 *
 * Returns the windows unchanged when there are already few enough, which is what
 * keeps a short recording drawn exactly as it was measured.
 */
export function trailSamples(
  points: TrailPoint[],
  target: number
): TrailSample[] {
  if (points.length <= target || target < 2)
    return points.map((p) => ({ x: p.pc1, y: p.pc2, t: p.t_start, n: 1 }));
  const block = Math.ceil(points.length / target);
  const out: TrailSample[] = [];
  for (let i = 0; i < points.length; i += block) {
    const run = points.slice(i, i + block);
    out.push({
      x: run.reduce((acc, p) => acc + p.pc1, 0) / run.length,
      y: run.reduce((acc, p) => acc + p.pc2, 0) / run.length,
      t: run[0].t_start,
      n: run.length,
    });
  }
  return out;
}

/**
 * Keep the regions the trail actually passed through: those within `reach` of a
 * drawn sample, in layout units.
 *
 * The cover's outer regions hold windows too, but a drawn position is a weighted
 * mean of region centres and so never reaches them; drawing them anyway spreads a
 * grey field over parts of the picture the session was never in.
 */
export function visitedRegions<T extends { x: number; y: number }>(
  regions: T[],
  samples: { x: number; y: number }[],
  reach: number
): T[] {
  if (samples.length === 0) return [];
  const r2 = reach * reach;
  return regions.filter((region) =>
    samples.some((s) => (s.x - region.x) ** 2 + (s.y - region.y) ** 2 <= r2)
  );
}
