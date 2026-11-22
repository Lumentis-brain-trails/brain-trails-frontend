/**
 * A block's stretch of the run, on the person's Brain Landscape.
 *
 * The landscape (`GET /recordings/{id}/landscape`) carries this recording's whole trail
 * on the person's map: one point per window, `t` the window's start in session seconds,
 * the same windows the analysis cuts. The comparison view's landscape row lights the
 * stretch of one block and leaves the rest of the run as a faint line; this module cuts
 * that stretch and lines it up with the block's own windows (labels, focus), nothing
 * else - the places are the backend's.
 */
/** A block's span in session seconds, as the backend cuts it. */
export interface Span {
  t_start_s: number;
  t_end_s: number;
}

export interface LandscapeTrail {
  t: readonly number[];
  x: readonly number[];
  y: readonly number[];
}

/** The lit stretch: the block's windows on the map, in order. */
export interface Trajectory {
  t: number[];
  x: number[];
  y: number[];
  /**
   * For each point, its index among the block's windows as the analysis lists them
   * (`blockWindows`), so labels and the focus line up; null when the analysis has no
   * window starting at that time.
   */
  window: (number | null)[];
}

/** Session seconds to milliseconds, as a key two lists of rounded starts can share. */
const key = (t: number) => Math.round(t * 1000);

/**
 * The windows of `trail` that start inside `[t_start_s, t_end_s)`, as the backend cuts
 * a block, each matched to the block's analysis window that starts at the same moment.
 *
 * @param windowT start times of the block's windows in the analysis, in order
 */
export function blockTrajectory(
  trail: LandscapeTrail,
  block: Span,
  windowT: readonly number[]
): Trajectory {
  const index = new Map(windowT.map((t, i) => [key(t), i]));
  const out: Trajectory = { t: [], x: [], y: [], window: [] };
  const n = Math.min(trail.t.length, trail.x.length, trail.y.length);
  for (let i = 0; i < n; i++) {
    const t = trail.t[i];
    if (t < block.t_start_s || t >= block.t_end_s) continue;
    out.t.push(t);
    out.x.push(trail.x[i]);
    out.y.push(trail.y[i]);
    out.window.push(index.get(key(t)) ?? null);
  }
  return out;
}

/**
 * Where the run was at session time `t`: the last lit window starting at or before
 * it (the first one before the stretch begins), null for an empty stretch.
 */
export function placeAt(
  trajectory: Trajectory,
  t: number
): { x: number; y: number } | null {
  if (trajectory.t.length === 0) return null;
  let at = 0;
  for (let i = 0; i < trajectory.t.length; i++) {
    if (trajectory.t[i] <= t) at = i;
    else break;
  }
  return { x: trajectory.x[at], y: trajectory.y[at] };
}
