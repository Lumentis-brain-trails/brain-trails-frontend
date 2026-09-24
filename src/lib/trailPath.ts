/**
 * The trail's drawn shape, shared by every renderer that draws one.
 *
 * A session's windows are samples, not corners: what the state did between two of
 * them is not measured, and joining them with straight segments invents a corner at
 * every window - which reads as a broken line with knots instead of one movement.
 * So the drawn path is a Catmull-Rom spline through the windows, in the
 * **centripetal** parameterisation (alpha = 0.5): the uniform one loops and
 * overshoots wherever two consecutive windows nearly coincide, which is exactly
 * what a session settling into a basin produces.
 *
 * The spline is only how the path is drawn. The windows stay the data: every
 * renderer still marks them and still hit-tests them, so nothing smoothed here is
 * ever read back as a measurement.
 */

/**
 * A point of the drawn curve, in whatever space the caller draws in. Not the API's
 * `TrailPoint`, which is a measured window; this is a place on the line.
 */
export interface CurvePoint {
  x: number;
  y: number;
  /** Where in time this point sits: 0 at the first window, 1 at the last. */
  u: number;
}

/** Shortest knot span, to keep a repeated window from dividing by zero. */
const EPS = 1e-6;

/** Catmull-Rom's alpha: 0.5 is the centripetal parameterisation. */
const ALPHA = 0.5;

/**
 * Resample a trail into a smooth polyline dense enough to be stroked as one curve.
 *
 * @param points - The windows, in order, each with its time fraction `u`.
 * @param samples - Roughly how many points to return; spread evenly over the
 *   windows, at least one per gap. More samples only cost SVG path data, so this
 *   trades file size for smoothness, never accuracy.
 * @returns The curve, first and last window included exactly. Fewer than two
 *   points in, the same points out.
 */
export function trailCurve(points: CurvePoint[], samples = 320): CurvePoint[] {
  if (points.length < 2) return points.slice();
  const gaps = points.length - 1;
  const perGap = Math.max(1, Math.round(samples / gaps));
  const curve: CurvePoint[] = [];
  for (let i = 0; i < gaps; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    // Phantom endpoints by reflection: duplicating p1/p2 instead would give a
    // zero-length knot span and flatten the ends.
    const p0 = i > 0 ? points[i - 1] : reflect(p1, p2);
    const p3 = i + 2 < points.length ? points[i + 2] : reflect(p2, p1);
    for (let s = 0; s < perGap; s += 1) {
      curve.push(interpolate(p0, p1, p2, p3, s / perGap));
    }
  }
  curve.push(points[points.length - 1]);
  return curve;
}

/** A run of the curve drawn as one stroke: one colour, one emphasis. */
export interface TrailBand {
  points: CurvePoint[];
  /** Time fraction the band is coloured by: the middle of its own span. */
  u: number;
  /** Whether the band falls inside the caller's highlighted range. */
  inRange: boolean;
}

/**
 * Cut a curve into the strokes that draw it.
 *
 * A gradient cannot follow a path, so the ramp is approximated by stroking short
 * runs of the curve in flat colours. Cutting at `steps` colour buckets rather than
 * at every sample keeps the element count at a few dozen instead of a few hundred
 * while staying under the eye's threshold for banding, and consecutive bands share
 * their boundary sample so the stroke has no gaps.
 *
 * @param curve - Output of {@link trailCurve}.
 * @param steps - Colour buckets over the whole trail.
 * @param range - Time fractions to keep at full weight, everything else dimmed;
 *   `null` (the default) emphasises the whole trail. An empty range (one whose
 *   start is above its end) dims all of it.
 */
export function trailBands(
  curve: CurvePoint[],
  steps = 48,
  range: [number, number] | null = null
): TrailBand[] {
  if (curve.length < 2) return [];
  const key = (p: CurvePoint) =>
    `${Math.min(steps - 1, Math.floor(clamp01(p.u) * steps))}:${
      inRange(p.u, range) ? 1 : 0
    }`;
  const bands: TrailBand[] = [];
  let run: CurvePoint[] = [curve[0]];
  let current = key(curve[0]);
  for (let i = 1; i < curve.length; i += 1) {
    const next = key(curve[i]);
    if (next !== current) {
      run.push(curve[i]); // overlap, so the strokes meet
      bands.push(band(run, range));
      run = [curve[i]];
      current = next;
    } else {
      run.push(curve[i]);
    }
  }
  if (run.length > 1) bands.push(band(run, range));
  return bands;
}

/** Points as SVG path data: one `M` and a run of `L`. */
export function polylinePath(points: CurvePoint[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join("");
}

function band(points: CurvePoint[], range: [number, number] | null): TrailBand {
  const u = (points[0].u + points[points.length - 1].u) / 2;
  return { points, u, inRange: inRange(u, range) };
}

function inRange(u: number, range: [number, number] | null): boolean {
  return !range || (u >= range[0] && u <= range[1]);
}

function clamp01(u: number): number {
  return Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
}

/** `from` mirrored through `through`: the phantom point beyond an end. */
function reflect(through: CurvePoint, from: CurvePoint): CurvePoint {
  return {
    x: 2 * through.x - from.x,
    y: 2 * through.y - from.y,
    u: 2 * through.u - from.u,
  };
}

/**
 * The Barry-Goldman pyramid: three rounds of linear interpolation over the four
 * knots, which is Catmull-Rom for any parameterisation, `s` in [0, 1) between
 * `p1` and `p2`.
 */
function interpolate(
  p0: CurvePoint,
  p1: CurvePoint,
  p2: CurvePoint,
  p3: CurvePoint,
  s: number
): CurvePoint {
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + s * (t2 - t1);
  const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
  const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
  const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
  const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
  const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
  const point = mix(b1, b2, (t - t1) / (t2 - t1));
  // Colour is time, and time is linear in the windows: read it off the gap, not
  // off the curve, so a slow stretch is not recoloured by its own geometry.
  return { x: point.x, y: point.y, u: p1.u + (p2.u - p1.u) * s };
}

function knot(a: CurvePoint, b: CurvePoint): number {
  return Math.max(EPS, Math.hypot(b.x - a.x, b.y - a.y) ** ALPHA);
}

function mix(a: CurvePoint, b: CurvePoint, f: number): CurvePoint {
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    u: a.u + (b.u - a.u) * f,
  };
}

/**
 * Soften a trail's jitter: each window moves to the Gaussian-weighted mean of its
 * neighbours in time (`sigma` in windows, three sigmas each side).
 *
 * Consecutive windows overlap and carry noise of their own, so the raw path zigzags where
 * the state barely moved; a light average keeps the course and drops the zigzag. The
 * first and last windows keep more of their own weight (the kernel is cut, not
 * reflected), so a trail still starts and ends where it did. Drawing only: the numbers
 * are never computed from the softened path.
 */
export function smoothPath<T extends { x: number; y: number }>(
  points: readonly T[],
  sigma = 1.2
): T[] {
  if (!(sigma > 0) || points.length < 3) return points.slice();
  const reach = Math.max(1, Math.ceil(3 * sigma));
  const weights = Array.from({ length: reach + 1 }, (_, d) =>
    Math.exp(-(d * d) / (2 * sigma * sigma))
  );
  return points.map((point, i) => {
    let x = 0;
    let y = 0;
    let total = 0;
    for (let d = -reach; d <= reach; d += 1) {
      const j = i + d;
      if (j < 0 || j >= points.length) continue;
      const w = weights[Math.abs(d)];
      x += points[j].x * w;
      y += points[j].y * w;
      total += w;
    }
    return { ...point, x: x / total, y: y / total };
  });
}
