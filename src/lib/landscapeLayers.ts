/**
 * The measures the Brain Landscape can be drawn with (backend V3-0016, amended
 * 2026-11-13 and 2026-11-16).
 *
 * One landscape shows two measures over the plane of neural states: one as its height,
 * the other as its colour. Either can be any of:
 *
 * - `map`: where the person spent their time, every task together (the map's own height);
 * - `share`: of the time spent near each place, the share spent in one task;
 * - `time`: for one task, the seconds spent near each place, averaged over its runs;
 * - `reach`: for one task, the share of its runs that came near each place;
 * - `score`: for one task, the average score (accuracy, d', reaction time) of its runs
 *   near each place - a run's score is the whole run's, not its trials';
 * - `value`: for one self-reported label, the average answer near each place;
 * - `threshold`: for one label, the share of the windows near each place whose answer
 *   was above (or below) a threshold the reader picks;
 * - `band`: the average relative power of one band (alpha...) of the windows near each place;
 * - `main` (colour only): the task with the most time near each place.
 *
 * "Near" is the map's own blur width (`sigma`). The backend sends the inputs
 * (`GET /landscape/layers`); the blurring is here because the threshold and the energy
 * transform are the reader's and move at the speed of a slider. The binning and the blur
 * follow the map's own (`pipeline/neurometrics/brain.py`): bilinear onto the grid,
 * windows off the frame left out, a Gaussian truncated at four widths with zeros past
 * the edge.
 *
 * The frequency measures have an energy view, `U = -log(p + epsilon)`, capped at a
 * cutoff when one is set. Arbitrary units, like every terrain here: it is not a free
 * energy and nothing licenses reading it as one.
 */
import type { components } from "@/lib/api-types";
import { DEFAULT_EPSILON, potential, potentialCeiling } from "@/lib/landscape";

export type LayerSource = components["schemas"]["BrainLandscapeLayersOut"];
export type LayerLabel = components["schemas"]["BrainLandscapeLabelOut"];

export type MeasureKind =
  | "map"
  | "share"
  | "time"
  | "reach"
  | "score"
  | "value"
  | "threshold"
  | "band"
  | "main";
export const MEASURE_KINDS: readonly MeasureKind[] = [
  "map",
  "share",
  "time",
  "reach",
  "score",
  "value",
  "threshold",
  "band",
  "main",
];
/** Kinds whose value is how often something happened: they have an energy view. */
export const FREQUENCY_KINDS: readonly MeasureKind[] = [
  "map",
  "share",
  "time",
  "reach",
  "threshold",
];
/** Kinds that name a task. */
const TASK_KINDS: readonly MeasureKind[] = ["share", "time", "reach", "score"];

export type ScoreMetric = "accuracy" | "d_prime" | "rt_ms";
export const SCORE_METRICS: readonly ScoreMetric[] = [
  "accuracy",
  "d_prime",
  "rt_ms",
];

export type Direction = "above" | "below";

/** One measure as the reader set it up. */
export interface MeasureSpec {
  kind: MeasureKind;
  /** The task (block label) of a task measure. */
  task?: string;
  /** The label key of a `value` or `threshold` measure. */
  label?: string;
  /** On the label's own scale; on 0..1 when the label has none. */
  threshold?: number;
  direction?: Direction;
  /** Which score a `score` measure averages. */
  metric?: ScoreMetric;
  /** Which band a `band` measure averages. */
  band?: string;
  /** Show `-log(p + epsilon)` instead of `p` (frequency kinds only). */
  energy: boolean;
  /**
   * Draw the height as `log(1 + p / epsilon)` over its ceiling instead of `p` (frequency
   * kinds only, and not with `energy`): hills stay hills, but ground the windows only
   * crossed rises out of the flat plane next to a far denser peak.
   */
  log?: boolean;
  epsilon: number;
  /** Cap on the energy; null for none. */
  cutoff: number | null;
  /**
   * An extra Gaussian blur, its width in multiples of the map's own (so its variance is
   * `smooth^2` times the map's): the windows are averaged over `sqrt(1 + smooth^2)`
   * map widths instead of one. Absent or 0: none. Not for `map`, which is the map.
   */
  smooth?: number;
  /** The tasks a `main` measure chooses among; absent: every task. */
  tasks?: string[];
}

/** One landscape on the page: a measure for the height, another (or the same) for the colour. */
export interface ViewSpec {
  id: string;
  height: MeasureSpec;
  /** Null: coloured by its own height, as the map always was. */
  color: MeasureSpec | null;
}

export type Unit =
  | "density"
  | "seconds"
  | "share"
  | "reach"
  | "threshold"
  | "answer"
  | "energy"
  | "band"
  | "accuracy"
  | "dprime"
  | "ms";

/** A measure with a number at every place. */
export interface ContinuousField {
  type: "continuous";
  /**
   * What a height draws, `[row][column]`, scaled to about 0..1. Never blank: a measure
   * rises from the floor and sinks back to it, so it stands on the map instead of
   * floating as islands with cliff edges.
   */
  z: number[][];
  /** The measure itself, in `unit`; null where too few windows went to say. */
  value: (number | null)[][];
  unit: Unit;
  /**
   * How many windows' worth of weight each place stands on, for a measure that can be
   * unknown: `value` is null below `MIN_SUPPORT`. Lets a painter fade into "unknown"
   * smoothly instead of at a cell's edge.
   */
  support?: number[][];
}

/** A measure with a category at every place: which task was the main one there. */
export interface CategoricalField {
  type: "categorical";
  /** An index into `categories`; null where too few windows went to say. */
  category: (number | null)[][];
  /** The winner's share of the time spent near the place. */
  share: (number | null)[][];
  /**
   * Every category's share of the time near each place, `[category][row][column]`
   * (0 for a category not shown): what a painter blends between tasks with.
   */
  weights: number[][][];
  /** How many windows' worth of weight each place stands on (all the shown tasks'). */
  support: number[][];
  /** Every task, so a task keeps its colour whichever are shown. */
  categories: string[];
  /** The indices of `categories` the reader chose to show. */
  shown: number[];
}

export type MeasureField = ContinuousField | CategoricalField;

/** Below this many windows' worth of weight near a place, an average there is not given. */
export const MIN_SUPPORT = 0.5;
/**
 * From this many windows' worth of weight near a place, an average stands at its full
 * height; with less it sinks smoothly towards the floor, so where few windows went says
 * little instead of ending in a cliff.
 */
export const FULL_SUPPORT = 2;
/** At most this many landscapes on the page: each is a WebGL scene of its own. */
export const MAX_VIEWS = 4;
export { DEFAULT_EPSILON };
/** The widest extra blur offered, in map widths: past it the map is one blob. */
export const MAX_SMOOTH = 10;
/** Kernels stop at four widths, like `scipy.ndimage.gaussian_filter`'s default. */
const TRUNCATE = 4;
/** `reach` looks this many widths around a window; past it the kernel is below 1%. */
const REACH_SPAN = 3;

/**
 * The colours of the `main` measure's tasks, in turn, until the reader picks their own:
 * the trail's hues and the labels' blue, green and orange first, then hues far from
 * those, so neighbours in the list never look alike.
 */
export const CATEGORY_COLORS = [
  "#2a78d6",
  "#e2569c",
  "#1baf7a",
  "#e8a02a",
  "#7c5ce6",
  "#eb6834",
  "#1bafc4",
  "#8c6d46",
  "#93b52a",
  "#5b6b82",
] as const;

interface Grid {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  stepX: number;
  stepY: number;
  /** The blur width in cells, per axis. */
  sx: number;
  sy: number;
}

/** The map's grid, its blur widened by an extra one `smooth` map widths across. */
function gridOf(source: LayerSource, smooth = 0): Grid {
  const [x0, x1, y0, y1] = source.bounds;
  const stepX = (x1 - x0) / Math.max(1, source.nx - 1) || 1;
  const stepY = (y1 - y0) / Math.max(1, source.ny - 1) || 1;
  const sigma = source.sigma * Math.sqrt(1 + smooth * smooth);
  return {
    nx: source.nx,
    ny: source.ny,
    x0,
    y0,
    stepX,
    stepY,
    sx: sigma / stepX,
    sy: sigma / stepY,
  };
}

/** A position in fractional cells, or null off the map. */
function toCells(grid: Grid, x: number, y: number): [number, number] | null {
  const fx = (x - grid.x0) / grid.stepX;
  const fy = (y - grid.y0) / grid.stepY;
  const eps = 1e-9;
  if (
    fx < -eps ||
    fy < -eps ||
    fx > grid.nx - 1 + eps ||
    fy > grid.ny - 1 + eps
  )
    return null;
  return [fx, fy];
}

/** Bilinear binning of weighted points; off-map points are left out, never clamped. */
function splat(
  grid: Grid,
  points: readonly { x: number; y: number; w: number }[]
): Float64Array {
  const out = new Float64Array(grid.nx * grid.ny);
  for (const { x, y, w } of points) {
    const at = toCells(grid, x, y);
    if (!at || w === 0) continue;
    const [fx, fy] = at;
    const i = Math.min(grid.nx - 2, Math.max(0, Math.floor(fx)));
    const j = Math.min(grid.ny - 2, Math.max(0, Math.floor(fy)));
    const dx = fx - i;
    const dy = fy - j;
    out[j * grid.nx + i] += w * (1 - dx) * (1 - dy);
    out[j * grid.nx + i + 1] += w * dx * (1 - dy);
    out[(j + 1) * grid.nx + i] += w * (1 - dx) * dy;
    out[(j + 1) * grid.nx + i + 1] += w * dx * dy;
  }
  return out;
}

function kernel(sigma: number): Float64Array {
  if (!(sigma > 0)) return Float64Array.of(1);
  const radius = Math.max(1, Math.round(TRUNCATE * sigma));
  const k = new Float64Array(2 * radius + 1);
  let total = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    total += v;
  }
  for (let i = 0; i < k.length; i += 1) k[i] /= total;
  return k;
}

/**
 * Gaussian blur scaled so one window counts 1 at its own place: each point is worth the
 * unnormalised kernel `exp(-d^2 / 2 sigma^2)`, so a cell reads "windows within about
 * one width of here".
 */
export function blurGrid(
  data: Float64Array,
  nx: number,
  ny: number,
  sx: number,
  sy: number,
  /** Count windows (one is 1 at its place); false keeps the data's level (a smoothing). */
  count = true
): Float64Array {
  const kx = kernel(sx);
  const ky = kernel(sy);
  const rx = (kx.length - 1) / 2;
  const ry = (ky.length - 1) / 2;
  const pass = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      let s = 0;
      for (let k = -rx; k <= rx; k += 1) {
        const ii = i + k;
        if (ii >= 0 && ii < nx) s += data[j * nx + ii] * kx[k + rx];
      }
      pass[j * nx + i] = s;
    }
  }
  const out = new Float64Array(nx * ny);
  const scale = 2 * Math.PI * Math.max(sx, 1e-9) * Math.max(sy, 1e-9);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      let s = 0;
      for (let k = -ry; k <= ry; k += 1) {
        const jj = j + k;
        if (jj >= 0 && jj < ny) s += pass[jj * nx + i] * ky[k + ry];
      }
      out[j * nx + i] = count && sx > 0 && sy > 0 ? s * scale : s;
    }
  }
  return out;
}

/** The tasks that have runs, in first-seen order. */
export function layerTasks(source: LayerSource): string[] {
  const seen: string[] = [];
  for (const run of source.runs)
    if (run.task && !seen.includes(run.task)) seen.push(run.task);
  return seen;
}

/** Each run's answer to one label: the mean of its answers, normalised and raw. */
function runAnswers(
  source: LayerSource,
  key: string
): Map<number, { norm: number; raw: number }> {
  const index = source.labels.findIndex((l) => l.key === key);
  const sums = new Map<number, { norm: number; raw: number; n: number }>();
  for (const [run, label, norm, raw] of source.answers) {
    if (label !== index) continue;
    const s = sums.get(run) ?? { norm: 0, raw: 0, n: 0 };
    sums.set(run, { norm: s.norm + norm, raw: s.raw + raw, n: s.n + 1 });
  }
  return new Map(
    [...sums].map(([run, s]) => [run, { norm: s.norm / s.n, raw: s.raw / s.n }])
  );
}

function windowsOf(
  source: LayerSource,
  runs: Iterable<number>,
  weight: (run: number) => number
): { x: number; y: number; w: number }[] {
  const out: { x: number; y: number; w: number }[] = [];
  for (const r of runs) {
    const run = source.runs[r];
    if (!run) continue;
    const w = weight(r);
    for (let k = 0; k < run.x.length; k += 1)
      out.push({ x: run.x[k], y: run.y[k], w });
  }
  return out;
}

function rows<T extends number | null>(grid: Grid, cell: (index: number) => T) {
  return Array.from({ length: grid.ny }, (_, j) =>
    Array.from({ length: grid.nx }, (_, i) => cell(j * grid.nx + i))
  );
}

/** The share of `p` a frequency layer's energy view is computed from, per cell. */
interface Frequency {
  p: Float64Array;
  mask?: (index: number) => boolean;
  support?: Float64Array;
}

/**
 * Per cell, how close one run came: the kernel of its nearest window, 1 on top of a
 * window and 0.61 one width away. Averaged over runs, the share of runs that got there.
 */
function reached(
  grid: Grid,
  run: { x: readonly number[]; y: readonly number[] }
): Float64Array {
  const out = new Float64Array(grid.nx * grid.ny);
  const rx = Math.ceil(REACH_SPAN * grid.sx);
  const ry = Math.ceil(REACH_SPAN * grid.sy);
  const sx2 = 2 * grid.sx * grid.sx || 1;
  const sy2 = 2 * grid.sy * grid.sy || 1;
  for (let k = 0; k < run.x.length; k += 1) {
    const at = toCells(grid, run.x[k], run.y[k]);
    if (!at) continue;
    const [fx, fy] = at;
    const i0 = Math.max(0, Math.floor(fx - rx));
    const i1 = Math.min(grid.nx - 1, Math.ceil(fx + rx));
    const j0 = Math.max(0, Math.floor(fy - ry));
    const j1 = Math.min(grid.ny - 1, Math.ceil(fy + ry));
    for (let j = j0; j <= j1; j += 1) {
      const dy = (j - fy) * (j - fy);
      for (let i = i0; i <= i1; i += 1) {
        const v = Math.exp(-((i - fx) * (i - fx)) / sx2 - dy / sy2);
        const c = j * grid.nx + i;
        if (v > out[c]) out[c] = v;
      }
    }
  }
  return out;
}

/** A weighted average near each place, and how much weight it stands on. */
interface Average {
  mean: Float64Array;
  support: Float64Array;
  known: (index: number) => boolean;
  confidence: Float64Array;
}

function average(
  grid: Grid,
  points: readonly { x: number; y: number; w: number; v: number }[]
): Average {
  const blur = (data: Float64Array) =>
    blurGrid(data, grid.nx, grid.ny, grid.sx, grid.sy);
  const support = blur(splat(grid, points));
  const top = blur(
    splat(
      grid,
      points.map((p) => ({ x: p.x, y: p.y, w: p.w * p.v }))
    )
  );
  return {
    mean: top.map((v, c) => (support[c] > 0 ? v / support[c] : 0)),
    support,
    known: (c) => support[c] >= MIN_SUPPORT,
    confidence: support.map((v) => Math.min(1, v / FULL_SUPPORT)),
  };
}

/**
 * An average drawn as a height: scaled from `low` to `high`, sunk towards the floor
 * where little weight stands under it and softened once more at the map's width, so its
 * sides slope like a hill's instead of a wall's.
 */
function averageHeight(
  grid: Grid,
  avg: Average,
  low: number,
  high: number
): number[][] {
  const span = high - low || 1;
  const drawn = blurGrid(
    avg.mean.map(
      (v, c) => Math.min(1, Math.max(0, (v - low) / span)) * avg.confidence[c]
    ),
    grid.nx,
    grid.ny,
    grid.sx,
    grid.sy,
    false
  );
  return rows(grid, (c) => drawn[c]);
}

/** The lowest and highest known value of an average: what its height spans. */
function knownRange(avg: Average): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  avg.mean.forEach((v, c) => {
    if (!avg.known(c)) return;
    low = Math.min(low, v);
    high = Math.max(high, v);
  });
  return Number.isFinite(low) ? [low, high] : [0, 1];
}

function continuous(
  grid: Grid,
  avg: Average,
  unit: Unit,
  range: [number, number] = knownRange(avg),
  scale: (v: number) => number = (v) => v
): ContinuousField {
  return {
    type: "continuous",
    z: averageHeight(grid, avg, range[0], range[1]),
    value: rows(grid, (c) => (avg.known(c) ? scale(avg.mean[c]) : null)),
    unit,
    support: rows(grid, (c) => avg.support[c]),
  };
}

/** The runs of one task, by index. */
function runsOf(source: LayerSource, task: string | undefined): number[] {
  return source.runs
    .map((run, r) => (run.task === task ? r : -1))
    .filter((r) => r >= 0);
}

/** A count of windows near each place, weighted. */
function near(
  grid: Grid,
  source: LayerSource,
  runs: Iterable<number>,
  weight: (run: number) => number
): Float64Array {
  return blurGrid(
    splat(grid, windowsOf(source, runs, weight)),
    grid.nx,
    grid.ny,
    grid.sx,
    grid.sy
  );
}

/**
 * Evaluate one measure on the map's grid. `map` is the map's own height grid,
 * `[row][column]`. Returns null when the measure names a task, label or band the person
 * no longer has, or one without data (a task never scored).
 */
export function computeMeasure(
  source: LayerSource,
  map: readonly (readonly number[])[],
  spec: MeasureSpec
): MeasureField | null {
  const grid = gridOf(source, spec.kind === "map" ? 0 : (spec.smooth ?? 0));
  const n = grid.nx * grid.ny;
  let frequency: Frequency | null = null;
  let field: ContinuousField;
  const all = source.runs.map((_, r) => r);

  switch (spec.kind) {
    case "map": {
      const at = (c: number) =>
        map[Math.floor(c / grid.nx)]?.[c % grid.nx] ?? 0;
      field = {
        type: "continuous",
        z: rows(grid, at),
        value: rows(grid, at),
        unit: "density",
      };
      frequency = { p: Float64Array.from({ length: n }, (_, c) => at(c)) };
      break;
    }
    case "share": {
      const runs = runsOf(source, spec.task);
      if (runs.length === 0) return null;
      const mine = near(grid, source, runs, (r) => source.runs[r].dt);
      const total = near(grid, source, all, (r) => source.runs[r].dt);
      const count = near(grid, source, all, () => 1);
      const known = (c: number) => count[c] >= MIN_SUPPORT;
      const share = mine.map((v, c) =>
        total[c] > 0 ? Math.min(1, v / total[c]) : 0
      );
      const confidence = count.map((v) => Math.min(1, v / FULL_SUPPORT));
      const drawn = blurGrid(
        share.map((v, c) => v * confidence[c]),
        grid.nx,
        grid.ny,
        grid.sx,
        grid.sy,
        false
      );
      field = {
        type: "continuous",
        z: rows(grid, (c) => drawn[c]),
        value: rows(grid, (c) => (known(c) ? share[c] : null)),
        unit: "share",
        support: rows(grid, (c) => count[c]),
      };
      frequency = {
        p: share.map((v, c) => v * confidence[c]),
        mask: known,
        support: count,
      };
      break;
    }
    case "time": {
      const runs = runsOf(source, spec.task);
      if (runs.length === 0) return null;
      const perRun = near(grid, source, runs, (r) => source.runs[r].dt).map(
        (v) => v / runs.length
      );
      const duration =
        runs.reduce(
          (s, r) => s + source.runs[r].dt * source.runs[r].x.length,
          0
        ) / runs.length;
      const peak = Math.max(...perRun) || 1;
      field = {
        type: "continuous",
        z: rows(grid, (c) => perRun[c] / peak),
        value: rows(grid, (c) => perRun[c]),
        unit: "seconds",
      };
      frequency = { p: perRun.map((v) => Math.min(1, v / (duration || 1))) };
      break;
    }
    case "reach": {
      const runs = runsOf(source, spec.task);
      if (runs.length === 0) return null;
      const total = new Float64Array(n);
      for (const r of runs)
        total.set(reached(grid, source.runs[r]).map((v, c) => v + total[c]));
      const share = total.map((v) => v / runs.length);
      field = {
        type: "continuous",
        z: rows(grid, (c) => share[c]),
        value: rows(grid, (c) => share[c]),
        unit: "reach",
      };
      frequency = { p: share };
      break;
    }
    case "score": {
      const metric = spec.metric ?? "accuracy";
      const scores = new Map<number, number>();
      for (const r of runsOf(source, spec.task)) {
        const v = source.runs[r].score?.[metric];
        if (typeof v === "number") scores.set(r, v);
      }
      if (scores.size === 0) return null;
      const valued: { x: number; y: number; w: number; v: number }[] = [];
      for (const r of scores.keys()) {
        const run = source.runs[r];
        for (let k = 0; k < run.x.length; k += 1)
          valued.push({ x: run.x[k], y: run.y[k], w: 1, v: scores.get(r)! });
      }
      const avg = average(grid, valued);
      field = continuous(
        grid,
        avg,
        metric === "accuracy"
          ? "accuracy"
          : metric === "d_prime"
            ? "dprime"
            : "ms"
      );
      break;
    }
    case "band": {
      const b = source.bands?.names.indexOf(spec.band ?? "") ?? -1;
      if (!source.bands || b < 0) return null;
      const { x, y, values } = source.bands;
      const points: { x: number; y: number; w: number; v: number }[] = [];
      values[b].forEach((v, k) => {
        if (typeof v === "number") points.push({ x: x[k], y: y[k], w: 1, v });
      });
      if (points.length === 0) return null;
      field = continuous(grid, average(grid, points), "band");
      break;
    }
    case "value":
    case "threshold": {
      const label = source.labels.find((l) => l.key === spec.label);
      if (!label) return null;
      const answers = runAnswers(source, label.key);
      if (answers.size === 0) return null;
      const valued = (v: (run: number) => number) => {
        const out: { x: number; y: number; w: number; v: number }[] = [];
        for (const r of answers.keys()) {
          const run = source.runs[r];
          if (!run) continue;
          for (let k = 0; k < run.x.length; k += 1)
            out.push({ x: run.x[k], y: run.y[k], w: 1, v: v(r) });
        }
        return out;
      };
      if (spec.kind === "value") {
        const [low, high] = label.scale ?? [0, 1];
        const avg = average(
          grid,
          valued((r) => answers.get(r)?.norm ?? 0)
        );
        field = continuous(
          grid,
          avg,
          "answer",
          [0, 1],
          (v) => low + v * (high - low)
        );
      } else {
        const threshold = spec.threshold ?? defaultThreshold(label);
        const passes = (r: number) => {
          const a = answers.get(r);
          if (!a) return 0;
          const v = label.scale ? a.raw : a.norm;
          return (spec.direction ?? "above") === "above"
            ? Number(v > threshold)
            : Number(v < threshold);
        };
        const avg = average(grid, valued(passes));
        field = continuous(grid, avg, "threshold", [0, 1]);
        frequency = {
          p: avg.mean.map((v, c) => v * avg.confidence[c]),
          mask: avg.known,
          support: avg.support,
        };
      }
      break;
    }
    case "main":
      return mainTask(grid, source, spec.tasks);
  }

  if (spec.energy && frequency) return energy(grid, frequency, spec);
  if (spec.log && frequency) {
    const epsilon = spec.epsilon > 0 ? spec.epsilon : DEFAULT_EPSILON;
    const ceiling = Math.log1p(Math.max(...frequency.p, 0) / epsilon) || 1;
    const p = frequency.p;
    return {
      ...field,
      z: rows(grid, (c) => Math.log1p(Math.max(0, p[c]) / epsilon) / ceiling),
    };
  }
  return field;
}

/**
 * Which of the shown tasks had the most time near each place, its share of the shown
 * tasks' time, and every task's share for a painter to blend with. `shown` lists task
 * names; absent (or naming none the person has) means every task.
 */
function mainTask(
  grid: Grid,
  source: LayerSource,
  shown?: readonly string[]
): CategoricalField | null {
  const tasks = layerTasks(source);
  if (tasks.length === 0) return null;
  const picked = tasks
    .map((task, k) => (shown && !shown.includes(task) ? -1 : k))
    .filter((k) => k >= 0);
  const indices = picked.length > 0 ? picked : tasks.map((_, k) => k);
  const n = grid.nx * grid.ny;
  const best = new Float64Array(n);
  const winner = new Int32Array(n).fill(-1);
  const total = new Float64Array(n);
  const times = new Map<number, Float64Array>();
  for (const k of indices) {
    const time = near(
      grid,
      source,
      runsOf(source, tasks[k]),
      (r) => source.runs[r].dt
    );
    times.set(k, time);
    for (let c = 0; c < n; c += 1) {
      total[c] += time[c];
      if (time[c] > best[c]) {
        best[c] = time[c];
        winner[c] = k;
      }
    }
  }
  const count = near(
    grid,
    source,
    source.runs
      .map((run, r) => (indices.some((k) => tasks[k] === run.task) ? r : -1))
      .filter((r) => r >= 0),
    () => 1
  );
  const known = (c: number) => count[c] >= MIN_SUPPORT && winner[c] >= 0;
  return {
    type: "categorical",
    category: rows(grid, (c) => (known(c) ? winner[c] : null)),
    share: rows(grid, (c) =>
      known(c) && total[c] > 0 ? best[c] / total[c] : null
    ),
    weights: tasks.map((_, k) => {
      const time = times.get(k);
      return rows(grid, (c) => (time && total[c] > 0 ? time[c] / total[c] : 0));
    }),
    support: rows(grid, (c) => count[c]),
    categories: tasks,
    shown: indices,
  };
}

/**
 * `U = -log(p + epsilon)`, capped at the cutoff; drawn over its own ceiling (the cutoff,
 * or `-log epsilon`) so energies with the same settings share a scale. Wells are where
 * it happened most. The potential is `landscape.ts`'s, the one the 3D surfaces' wells
 * use too.
 */
function energy(
  grid: Grid,
  frequency: Frequency,
  spec: MeasureSpec
): ContinuousField {
  const ceiling = potentialCeiling(spec.epsilon, spec.cutoff);
  const u = (c: number) => potential(frequency.p[c], spec.epsilon, spec.cutoff);
  const shown = (c: number) => !frequency.mask || frequency.mask(c);
  const support = frequency.support;
  return {
    type: "continuous",
    z: rows(grid, (c) => u(c) / (ceiling || 1)),
    value: rows(grid, (c) => (shown(c) ? u(c) : null)),
    unit: "energy",
    ...(support ? { support: rows(grid, (c) => support[c]) } : {}),
  };
}

/** The middle of a label's scale (0.5 without one): a first threshold to move from. */
export function defaultThreshold(label: LayerLabel): number {
  const [low, high] = label.scale ?? [0, 1];
  return low + (high - low) / 2;
}

/** Whether a measure has an energy view. */
export function isFrequency(kind: MeasureKind): boolean {
  return FREQUENCY_KINDS.includes(kind);
}

/** The scores some run of `task` has: what a `score` measure can average for it. */
export function taskMetrics(source: LayerSource, task: string): ScoreMetric[] {
  return SCORE_METRICS.filter((metric) =>
    source.runs.some(
      (run) => run.task === task && typeof run.score?.[metric] === "number"
    )
  );
}

/** A measure with its settings at their defaults. */
export function measure(
  kind: MeasureKind,
  change: Partial<MeasureSpec> = {}
): MeasureSpec {
  return {
    kind,
    energy: false,
    epsilon: DEFAULT_EPSILON,
    cutoff: null,
    ...change,
  };
}

/** The first landscape: the map as it always was, height and colour where the time went. */
export function defaultView(id = "v0"): ViewSpec {
  return { id, height: measure("map"), color: null };
}

/**
 * A stored measure if it still makes sense against what the person has now - its task,
 * label, score or band still there - repaired where it can be; null otherwise.
 */
function reviveMeasure(
  raw: unknown,
  source: LayerSource,
  asColor: boolean
): MeasureSpec | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Partial<MeasureSpec>;
  if (!MEASURE_KINDS.includes(s.kind as MeasureKind)) return null;
  const kind = s.kind as MeasureKind;
  if (kind === "main" && !asColor) return null;
  if (TASK_KINDS.includes(kind) && !layerTasks(source).includes(s.task ?? ""))
    return null;
  if (
    kind === "score" &&
    !taskMetrics(source, s.task ?? "").includes(s.metric as ScoreMetric)
  )
    return null;
  if (
    (kind === "value" || kind === "threshold") &&
    !source.labels.some((l) => l.key === s.label)
  )
    return null;
  if (kind === "band" && !source.bands?.names.includes(s.band ?? ""))
    return null;
  return {
    kind,
    ...(typeof s.task === "string" ? { task: s.task } : {}),
    ...(typeof s.label === "string" ? { label: s.label } : {}),
    ...(typeof s.threshold === "number" ? { threshold: s.threshold } : {}),
    ...(kind === "threshold"
      ? { direction: s.direction === "below" ? "below" : "above" }
      : {}),
    ...(kind === "score" ? { metric: s.metric } : {}),
    ...(kind === "band" ? { band: s.band } : {}),
    energy: s.energy === true && isFrequency(kind),
    ...(s.log === true && s.energy !== true && isFrequency(kind)
      ? { log: true }
      : {}),
    epsilon:
      typeof s.epsilon === "number" && s.epsilon > 0
        ? s.epsilon
        : DEFAULT_EPSILON,
    cutoff: typeof s.cutoff === "number" && s.cutoff > 0 ? s.cutoff : null,
    ...(kind !== "map" &&
    typeof s.smooth === "number" &&
    s.smooth > 0 &&
    s.smooth <= MAX_SMOOTH
      ? { smooth: s.smooth }
      : {}),
    ...(kind === "main" && Array.isArray(s.tasks)
      ? (() => {
          const tasks = layerTasks(source).filter((task) =>
            (s.tasks as unknown[]).includes(task)
          );
          return tasks.length > 0 ? { tasks } : {};
        })()
      : {}),
  };
}

/**
 * The stored landscapes as far as they still apply: a height whose data is gone falls
 * back to the map, a colour to the height's own. Reads what a browser kept; never empty.
 */
export function reviveViews(raw: unknown, source: LayerSource): ViewSpec[] {
  const views = (Array.isArray(raw) ? raw : []).flatMap((entry): ViewSpec[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const v = entry as { id?: unknown; height?: unknown; color?: unknown };
    if (typeof v.id !== "string") return [];
    return [
      {
        id: v.id,
        height: reviveMeasure(v.height, source, false) ?? measure("map"),
        color: reviveMeasure(v.color, source, true),
      },
    ];
  });
  return views.length > 0 ? views.slice(0, MAX_VIEWS) : [defaultView()];
}
