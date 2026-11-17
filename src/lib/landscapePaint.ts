/**
 * A Brain Landscape's colours, one per drawn point (backend V3-0016, amended 2026-11-16).
 *
 * A Plotly surface looks its colour up in a colour scale, so a category is a band of the
 * scale with a step at its edge, and "unknown here" can only be a second, translucent
 * surface over it: both show the grid's cells. Painted point by point instead, a colour
 * can be anything, so it blends: from one main task into the next by how their shares of
 * the time compare, and into the no-data grey by how few windows went there. Everything
 * is interpolated smoothly from the map's grid (`lib/refine.ts`) before it is painted,
 * so no edge follows the cells.
 */
import {
  CATEGORY_COLORS,
  MIN_SUPPORT,
  type MeasureField,
} from "@/lib/landscapeLayers";
import { fillBlanks, refineGrid } from "@/lib/refine";

export type Ramp = readonly (readonly [number, string])[];
type Rgb = [number, number, number];

/** What the colour means, for the key under the plot. */
export type ColorKey =
  | { type: "ramp"; low: number; high: number }
  | { type: "categories"; entries: { name: string; color: string }[] };

/**
 * Below this many windows' worth of weight a place is all grey, from `KNOWN_AT` all
 * colour, smoothly between. `MIN_SUPPORT`, where the hover stops giving a value, falls
 * in between, a third of the way to full colour.
 */
export const GREY_BELOW = MIN_SUPPORT / 2;
export const KNOWN_AT = MIN_SUPPORT * 2;
/**
 * How strongly the main task's colour wins over the others: each task weighs its share
 * of the time to this power, so a place with one clear winner wears its colour and only
 * a place shared about evenly shows a mix.
 */
const SHARPNESS = 4;

/** The colour of the `k`-th category. */
export function categoryColor(k: number): string {
  return CATEGORY_COLORS[k % CATEGORY_COLORS.length];
}

/**
 * The map's ramp as a colour measure uses it: from its first tinted stop up, since the
 * ramp's near-white foot would read as "nothing here" next to the no-data grey.
 */
export function measureRamp(ramp: Ramp): [number, string][] {
  const from = ramp.find(([at]) => at > 0)?.[0] ?? 0;
  return ramp
    .filter(([at]) => at >= from)
    .map(([at, c]): [number, string] => [(at - from) / (1 - from || 1), c]);
}

/** `#rrggbb` (or `#rgb`) as three channels, 0 to 255. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isFinite(n)
    ? [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    : [128, 128, 128];
}

/** The ramp's colour at `t` in `[0, 1]`, linearly between its stops. */
export function rampAt(
  ramp: readonly (readonly [number, Rgb])[],
  t: number
): Rgb {
  const x = Math.min(1, Math.max(0, t));
  for (let s = 1; s < ramp.length; s += 1) {
    const [b, cb] = ramp[s];
    if (x > b && s < ramp.length - 1) continue;
    const [a, ca] = ramp[s - 1];
    const f = b > a ? Math.min(1, Math.max(0, (x - a) / (b - a))) : 1;
    return [0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * f) as Rgb;
  }
  return ramp[0]?.[1] ?? [128, 128, 128];
}

/** 0 at or below `edge0`, 1 at or above `edge1`, a smooth S between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

const css = ([r, g, b]: Rgb) =>
  `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

const mix = (a: Rgb, b: Rgb, f: number): Rgb => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];

/**
 * How known the colour is at each refined point, 0 (grey) to 1 (full colour): from the
 * windows' weight when the measure has it, else from where it has a value at all.
 */
export function knownOf(field: MeasureField, factor: number): number[][] {
  if (field.support)
    return refineGrid(field.support, factor).map((row) =>
      row.map((v) => smoothstep(GREY_BELOW, KNOWN_AT, v))
    );
  const known =
    field.type === "continuous"
      ? field.value.map((row) => row.map((v) => (v === null ? 0 : 1)))
      : field.category.map((row) => row.map((c) => (c === null ? 0 : 1)));
  return refineGrid(known, factor).map((row) =>
    row.map((k) => Math.min(1, Math.max(0, k)))
  );
}

/** The lowest and highest value a continuous measure gives: what the ramp spans. */
function rangeOf(
  values: readonly (readonly (number | null)[])[]
): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const row of values)
    for (const v of row) {
      if (v === null) continue;
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
  return Number.isFinite(low) ? [low, high] : [0, 1];
}

/**
 * Every refined point's colour, row by row (`[row * columns + column]`), as CSS
 * `rgb()`, and the key that explains them.
 *
 * - No field: the height itself (`height`, already refined, about 0..1) on the full ramp,
 *   as the map always was.
 * - A continuous measure: its value on the ramp from its first tint, scaled to its range
 *   on this map, faded into `noData` where few windows went.
 * - The main task: the shown tasks' colours blended by their shares of the time (the
 *   larger share sharply favoured), faded into `noData` the same way.
 */
export function paint(
  field: MeasureField | null,
  height: readonly (readonly number[])[],
  ramp: Ramp,
  noData: string,
  factor: number
): { colors: string[]; key: ColorKey } {
  const grey = hexToRgb(noData);
  if (!field) {
    const stops = ramp.map(([at, c]) => [at, hexToRgb(c)] as const);
    return {
      colors: height.flatMap((row) => row.map((v) => css(rampAt(stops, v)))),
      key: { type: "ramp", low: 0, high: 1 },
    };
  }
  const known = knownOf(field, factor);
  if (field.type === "continuous") {
    const [low, high] = rangeOf(field.value);
    const span = high - low || 1;
    const filled = fillBlanks(field.value).map((row) =>
      row.map((v) => (v === null ? low : v))
    );
    const values = refineGrid(filled, factor);
    const stops = measureRamp(ramp).map(
      ([at, c]) => [at, hexToRgb(c)] as const
    );
    return {
      colors: values.flatMap((row, j) =>
        row.map((v, i) =>
          css(mix(grey, rampAt(stops, (v - low) / span), known[j][i]))
        )
      ),
      key: { type: "ramp", low, high },
    };
  }
  const colors = field.categories.map((_, k) => hexToRgb(categoryColor(k)));
  const weights = field.shown.map((k) => ({
    rgb: colors[k],
    grid: refineGrid(field.weights[k], factor),
  }));
  return {
    colors: known.flatMap((row, j) =>
      row.map((kn, i) => {
        let total = 0;
        const sum: Rgb = [0, 0, 0];
        for (const { rgb, grid } of weights) {
          const w = Math.max(0, grid[j][i]) ** SHARPNESS;
          total += w;
          sum[0] += rgb[0] * w;
          sum[1] += rgb[1] * w;
          sum[2] += rgb[2] * w;
        }
        const own: Rgb =
          total > 0 ? [sum[0] / total, sum[1] / total, sum[2] / total] : grey;
        return css(mix(grey, own, total > 0 ? kn : 0));
      })
    ),
    key: {
      type: "categories",
      entries: field.shown.map((k) => ({
        name: field.categories[k],
        color: categoryColor(k),
      })),
    },
  };
}

/**
 * Two triangles per cell of a `columns x rows` grid of points numbered row by row:
 * what a Plotly `mesh3d` draws the ground with.
 */
export function triangulate(
  columns: number,
  rows: number
): { i: Uint32Array; j: Uint32Array; k: Uint32Array } {
  const cells = Math.max(0, columns - 1) * Math.max(0, rows - 1);
  const i = new Uint32Array(cells * 2);
  const j = new Uint32Array(cells * 2);
  const k = new Uint32Array(cells * 2);
  let t = 0;
  for (let r = 0; r + 1 < rows; r += 1)
    for (let c = 0; c + 1 < columns; c += 1) {
      const a = r * columns + c;
      const b = a + 1;
      const d = a + columns;
      const e = d + 1;
      i[t] = a;
      j[t] = b;
      k[t] = e;
      t += 1;
      i[t] = a;
      j[t] = e;
      k[t] = d;
      t += 1;
    }
  return { i, j, k };
}
