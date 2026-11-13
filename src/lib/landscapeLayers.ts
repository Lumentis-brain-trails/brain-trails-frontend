/**
 * The Brain Landscape's other layers: heights over the same plane of neural states
 * (backend V3-0016, amended 2026-11-13).
 *
 * The map's own height is where the person spent their time, every task together. A
 * layer raises something else over the same grid:
 *
 * - `time`: for one task, the seconds spent near each place, averaged over its runs;
 * - `reach`: for one task, the share of its runs that came near each place;
 * - `value`: for one self-reported label, the average answer near each place;
 * - `threshold`: for one label, the share of the windows near each place whose answer
 *   was above (or below) a threshold the reader picks.
 *
 * "Near" is the map's own blur width (`sigma`), so a layer's hills are as wide as the
 * map's. The backend sends the inputs (`GET /landscape/layers`); the blurring is here
 * because the threshold, the colours and the energy transform are the reader's and move
 * at the speed of a slider. The binning and the blur follow the map's own
 * (`pipeline/neurometrics/brain.py`): bilinear onto the grid, windows off the frame left
 * out, a Gaussian truncated at four widths with zeros past the edge.
 *
 * The three frequency layers have an energy view, `U = -log(p + epsilon)`, capped at a
 * cutoff when one is set. Arbitrary units, like every terrain here: it is not a free
 * energy and nothing licenses reading it as one.
 */
import type { components } from "@/lib/api-types";

export type LayerSource = components["schemas"]["BrainLandscapeLayersOut"];
export type LayerLabel = components["schemas"]["BrainLandscapeLabelOut"];

export type LayerKind = "time" | "reach" | "value" | "threshold";
export const LAYER_KINDS: readonly LayerKind[] = [
  "time",
  "reach",
  "value",
  "threshold",
];
/** Kinds whose height is how often something happened: they have an energy view. */
export const FREQUENCY_KINDS: readonly LayerKind[] = [
  "time",
  "reach",
  "threshold",
];

export type Direction = "above" | "below";

/** One layer as the reader set it up. */
export interface LayerSpec {
  id: string;
  kind: LayerKind;
  /** The task (block label) of a `time` or `reach` layer. */
  task?: string;
  /** The label key of a `value` or `threshold` layer. */
  label?: string;
  /** On the label's own scale; on 0..1 when the label has none. */
  threshold?: number;
  direction?: Direction;
  color: string;
  visible: boolean;
  /** Show `-log(p + epsilon)` instead of `p` (frequency kinds only). */
  energy: boolean;
  epsilon: number;
  /** Cap on the energy; null for none. */
  cutoff: number | null;
}

/** A layer evaluated on the grid. */
export interface LayerField {
  /**
   * What is drawn, `[row][column]`, scaled to about 0..1. Never blank: a layer rises
   * from the floor and sinks back to it, so it stands on the map instead of floating
   * as islands with cliff edges, and its contours stay smooth.
   */
  z: number[][];
  /** What the hover says at each point, in the layer's own units. */
  value: (number | null)[][];
  /** Which unit `value` is in. */
  unit: "seconds" | "reach" | "threshold" | "answer" | "energy";
}

/** Below this many windows' worth of weight near a place, an average there is not given. */
export const MIN_SUPPORT = 0.5;
/**
 * From this many windows' worth of weight near a place, an answer layer stands at its
 * full height; with less it sinks smoothly towards the floor, so where few windows went
 * says little instead of ending in a cliff.
 */
export const FULL_SUPPORT = 2;
/** At most this many layers at once: more stacked translucent surfaces stop reading. */
export const MAX_LAYERS = 2;
export const DEFAULT_EPSILON = 0.01;
/** Kernels stop at four widths, like `scipy.ndimage.gaussian_filter`'s default. */
const TRUNCATE = 4;
/** `reach` looks this many widths around a window; past it the kernel is below 1%. */
const REACH_SPAN = 3;

/**
 * Colours a new layer is offered in turn: the trail's hues and the labels' blue, green
 * and orange, distinct enough to read through each other.
 */
export const LAYER_COLORS = [
  "#2a78d6",
  "#e2569c",
  "#1baf7a",
  "#e8a02a",
  "#7c5ce6",
  "#eb6834",
  "#1bafc4",
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

function gridOf(source: LayerSource): Grid {
  const [x0, x1, y0, y1] = source.bounds;
  const stepX = (x1 - x0) / Math.max(1, source.nx - 1) || 1;
  const stepY = (y1 - y0) / Math.max(1, source.ny - 1) || 1;
  return {
    nx: source.nx,
    ny: source.ny,
    x0,
    y0,
    stepX,
    stepY,
    sx: source.sigma / stepX,
    sy: source.sigma / stepY,
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
}

/**
 * Evaluate one layer on the map's grid. Returns null when the layer names a task or
 * label the person no longer has (a stored layer outliving its data).
 */
export function computeLayer(
  source: LayerSource,
  spec: LayerSpec
): LayerField | null {
  const grid = gridOf(source);
  const n = grid.nx * grid.ny;
  let frequency: Frequency | null = null;
  let field: LayerField;

  if (spec.kind === "time" || spec.kind === "reach") {
    const runs = source.runs
      .map((run, r) => (run.task === spec.task ? r : -1))
      .filter((r) => r >= 0);
    if (runs.length === 0) return null;
    if (spec.kind === "time") {
      const near = blurGrid(
        splat(
          grid,
          windowsOf(source, runs, (r) => source.runs[r].dt)
        ),
        grid.nx,
        grid.ny,
        grid.sx,
        grid.sy
      );
      const perRun = near.map((v) => v / runs.length);
      const duration =
        runs.reduce(
          (s, r) => s + source.runs[r].dt * source.runs[r].x.length,
          0
        ) / runs.length;
      const peak = Math.max(...perRun) || 1;
      field = {
        z: rows(grid, (c) => perRun[c] / peak),
        value: rows(grid, (c) => perRun[c]),
        unit: "seconds",
      };
      frequency = { p: perRun.map((v) => Math.min(1, v / (duration || 1))) };
    } else {
      const total = new Float64Array(n);
      for (const r of runs)
        total.set(reached(grid, source.runs[r]).map((v, c) => v + total[c]));
      const share = total.map((v) => v / runs.length);
      field = {
        z: rows(grid, (c) => share[c]),
        value: rows(grid, (c) => share[c]),
        unit: "reach",
      };
      frequency = { p: share };
    }
  } else {
    const label = source.labels.find((l) => l.key === spec.label);
    if (!label) return null;
    const answers = runAnswers(source, label.key);
    if (answers.size === 0) return null;
    const runs = [...answers.keys()];
    const support = blurGrid(
      splat(
        grid,
        windowsOf(source, runs, () => 1)
      ),
      grid.nx,
      grid.ny,
      grid.sx,
      grid.sy
    );
    const known = (c: number) => support[c] >= MIN_SUPPORT;
    const confidence = support.map((v) => Math.min(1, v / FULL_SUPPORT));
    // an answer layer changes fast where its support ends; drawn, it is softened once
    // more at the map's width so its sides slope like a hill's instead of a wall's
    const soften = (values: Float64Array) => {
      const drawn = blurGrid(
        values.map((v, c) => v * confidence[c]),
        grid.nx,
        grid.ny,
        grid.sx,
        grid.sy,
        false
      );
      return (c: number) => drawn[c];
    };
    const ratio = (weight: (run: number) => number) => {
      const top = blurGrid(
        splat(grid, windowsOf(source, runs, weight)),
        grid.nx,
        grid.ny,
        grid.sx,
        grid.sy
      );
      return top.map((v, c) =>
        support[c] > 0 ? Math.min(1, Math.max(0, v / support[c])) : 0
      );
    };
    if (spec.kind === "value") {
      const mean = ratio((r) => answers.get(r)?.norm ?? 0);
      const [low, high] = label.scale ?? [0, 1];
      field = {
        z: rows(grid, soften(mean)),
        value: rows(grid, (c) =>
          known(c) ? low + mean[c] * (high - low) : null
        ),
        unit: "answer",
      };
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
      const share = ratio(passes);
      field = {
        z: rows(grid, soften(share)),
        value: rows(grid, (c) => (known(c) ? share[c] : null)),
        unit: "threshold",
      };
      frequency = {
        p: share.map((v, c) => v * confidence[c]),
        mask: known,
      };
    }
  }

  if (spec.energy && frequency) return energy(grid, frequency, spec);
  return field;
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

/**
 * `U = -log(p + epsilon)`, capped at the cutoff; drawn over its own ceiling (the cutoff,
 * or `-log epsilon`) so energies with the same settings share a scale. Wells are where
 * it happened most.
 */
function energy(grid: Grid, frequency: Frequency, spec: LayerSpec): LayerField {
  const epsilon = spec.epsilon > 0 ? spec.epsilon : DEFAULT_EPSILON;
  const ceiling = spec.cutoff ?? -Math.log(epsilon);
  const u = (c: number) => {
    const value = -Math.log(frequency.p[c] + epsilon);
    return spec.cutoff === null ? value : Math.min(value, spec.cutoff);
  };
  const shown = (c: number) => !frequency.mask || frequency.mask(c);
  return {
    z: rows(grid, (c) => u(c) / (ceiling || 1)),
    value: rows(grid, (c) => (shown(c) ? u(c) : null)),
    unit: "energy",
  };
}

/** The middle of a label's scale (0.5 without one): a first threshold to move from. */
export function defaultThreshold(label: LayerLabel): number {
  const [low, high] = label.scale ?? [0, 1];
  return low + (high - low) / 2;
}

/** Whether a layer has an energy view. */
export function isFrequency(kind: LayerKind): boolean {
  return FREQUENCY_KINDS.includes(kind);
}

/**
 * The stored layers that still make sense against what the person has now: a task or
 * label they no longer have is dropped, odd entries too. Reads what a browser kept.
 */
export function reviveLayers(raw: unknown, source: LayerSource): LayerSpec[] {
  if (!Array.isArray(raw)) return [];
  const tasks = new Set(layerTasks(source));
  const labels = new Set(source.labels.map((l) => l.key));
  return raw
    .flatMap((entry): LayerSpec[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const s = entry as Partial<LayerSpec>;
      if (
        typeof s.id !== "string" ||
        !LAYER_KINDS.includes(s.kind as LayerKind) ||
        typeof s.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(s.color)
      )
        return [];
      const kind = s.kind as LayerKind;
      if ((kind === "time" || kind === "reach") && !tasks.has(s.task ?? ""))
        return [];
      if (
        (kind === "value" || kind === "threshold") &&
        !labels.has(s.label ?? "")
      )
        return [];
      return [
        {
          id: s.id,
          kind,
          task: s.task,
          label: s.label,
          threshold: typeof s.threshold === "number" ? s.threshold : undefined,
          direction: s.direction === "below" ? "below" : "above",
          color: s.color,
          visible: s.visible !== false,
          energy: s.energy === true && isFrequency(kind),
          epsilon:
            typeof s.epsilon === "number" && s.epsilon > 0
              ? s.epsilon
              : DEFAULT_EPSILON,
          cutoff:
            typeof s.cutoff === "number" && s.cutoff > 0 ? s.cutoff : null,
        },
      ];
    })
    .slice(0, MAX_LAYERS);
}

/** A colour darkened towards black by `amount` (0..1): a layer's shaded low ground. */
export function shade(color: string, amount: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const channel = (k: number) =>
    Math.round(parseInt(hex.slice(k, k + 2), 16) * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** A colour lightened towards white by `amount` (0..1): a layer's pale foot. */
export function tint(color: string, amount: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const channel = (k: number) => {
    const v = parseInt(hex.slice(k, k + 2), 16);
    return Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** A `#rrggbb` colour as `rgba(...)` with `alpha`: a layer's translucent shadow. */
export function rgba(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Two `#rrggbb` colours mixed, `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const ha = /^#([0-9a-f]{6})$/i.exec(a)?.[1];
  const hb = /^#([0-9a-f]{6})$/i.exec(b)?.[1];
  if (!ha || !hb) return a;
  const channel = (k: number) => {
    const va = parseInt(ha.slice(k, k + 2), 16);
    const vb = parseInt(hb.slice(k, k + 2), 16);
    return Math.round(va + (vb - va) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}
