/**
 * The live trail's motion (T4b): a continuous curve through the points, and a glide from
 * one picture to the next instead of a jump.
 *
 * Every point the worker sends is final, but each new row also refreshes the projection,
 * so the whole trail shifts a little once a second; drawn as it comes, that reads as a
 * twitch and the newest segment pops in. `interpolate` moves every point from where it
 * was drawn to where it now is, and grows a new point out of the previous end, so the
 * line is continuous in time; `curveSegments` draws it as a Catmull-Rom curve, one cubic
 * Bezier per segment so each keeps its own colour.
 */

export type Point = readonly [number, number];

/** Ease-out cubic: fast at first, settling on the target. */
export function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * The picture `t` of the way from `from` to `to` (0 = from, 1 = to).
 *
 * Points both pictures have move straight; points only `to` has start at the last point
 * `from` drew, so the trail grows instead of appearing. With nothing drawn yet, `to`.
 */
export function interpolate(
  from: readonly Point[],
  to: readonly Point[],
  t: number
): Point[] {
  if (from.length === 0 || t >= 1) return to.map((p) => [p[0], p[1]]);
  const e = ease(t);
  const anchor = from[from.length - 1];
  return to.map((p, i) => {
    const a = i < from.length ? from[i] : anchor;
    return [a[0] + (p[0] - a[0]) * e, a[1] + (p[1] - a[1]) * e];
  });
}

/**
 * One cubic Bezier per segment of the Catmull-Rom curve through `points`.
 *
 * Segment `i` runs from point `i` to point `i + 1`; its controls lean on the points
 * either side (the ends repeat themselves), so consecutive segments share a tangent and
 * the curve has no corners. Returns `[p0, c1, c2, p1]` per segment.
 */
export function curveSegments(
  points: readonly Point[]
): [Point, Point, Point, Point][] {
  const out: [Point, Point, Point, Point][] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    out.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return out;
}

/**
 * Each value the mean of the last `k` up to it (fewer at the start): the live trail's
 * own smoothing (backend V4-0004, 2026-11-10), for the windows placed on a landscape,
 * which come one by one, unsmoothed.
 */
export function trailingMean(values: readonly number[], k: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= k) sum -= values[i - k];
    out.push(sum / Math.min(i + 1, k));
  }
  return out;
}
