/**
 * A coarse grid drawn finer: what makes a Brain Landscape render smooth.
 *
 * The map's heights come on a 160 x 160 grid, and a 3D surface drawn straight from it
 * shows its cells: a narrow peak is a handful of facets with a kink at the top, and
 * anything with an edge - where a measure stops being known, where one main task gives
 * way to another - is a staircase one cell high. Drawn at `factor` times the resolution,
 * heights are interpolated with a monotone cubic (Catmull-Rom clamped to the four
 * nearest samples, so it is smooth and never invents a bump or a dip the data does not
 * have), and an edge is placed where the known region's indicator crosses one half, which
 * follows the boundary's shape instead of the cells'.
 *
 * Nothing here adds information: it only stops the grid from showing.
 */
import type { ContinuousField } from "@/lib/landscapeLayers";

/** The grid's points per side once refined: every old point kept, `factor - 1` between. */
export function refinedLength(n: number, factor: number): number {
  return n < 2 ? n : (n - 1) * factor + 1;
}

/** An evenly spread axis refined: the old values kept, the new ones evenly between. */
export function refineAxis(
  values: readonly number[],
  factor: number
): number[] {
  const n = values.length;
  if (n < 2 || factor <= 1) return [...values];
  return Array.from({ length: refinedLength(n, factor) }, (_, k) => {
    const i = Math.min(n - 2, Math.floor(k / factor));
    const t = k / factor - i;
    return values[i] + (values[i + 1] - values[i]) * t;
  });
}

/** Where a fine index falls between coarse ones: the lower one and the fraction past it. */
function locate(k: number, n: number, factor: number): [number, number] {
  const i = Math.min(n - 2, Math.floor(k / factor));
  return [i, k / factor - i];
}

/** Catmull-Rom between `b` and `c`, clamped to them: smooth, and no overshoot. */
function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const v =
    0.5 *
    (2 * b +
      (c - a) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (3 * b - a - 3 * c + d) * t3);
  return Math.min(Math.max(b, c), Math.max(Math.min(b, c), v));
}

/** One row (or column) refined with the clamped cubic. */
function refineLine(line: readonly number[], factor: number): number[] {
  const n = line.length;
  if (n < 2 || factor <= 1) return [...line];
  const at = (i: number) => line[Math.min(n - 1, Math.max(0, i))];
  return Array.from({ length: refinedLength(n, factor) }, (_, k) => {
    const [i, t] = locate(k, n, factor);
    return t === 0 ? line[i] : cubic(at(i - 1), at(i), at(i + 1), at(i + 2), t);
  });
}

/**
 * A full grid of numbers, `[row][column]`, refined by `factor` on both axes with the
 * clamped cubic: rows first, then the columns of the result.
 */
export function refineGrid(
  grid: readonly (readonly number[])[],
  factor: number
): number[][] {
  if (factor <= 1 || grid.length < 2) return grid.map((row) => [...row]);
  const wide = grid.map((row) => refineLine(row, factor));
  const width = wide[0]?.length ?? 0;
  const columns = Array.from({ length: width }, (_, i) =>
    refineLine(
      wide.map((row) => row[i]),
      factor
    )
  );
  return Array.from({ length: columns[0]?.length ?? 0 }, (_, j) =>
    columns.map((column) => column[j])
  );
}

/**
 * A grid with blanks refined: a fine point is known where the known indicator,
 * interpolated, is at least one half - so the edge of the known region is drawn along
 * its shape - and its value is the bilinear average of the known coarse points around
 * it.
 */
export function refineMasked(
  grid: readonly (readonly (number | null)[])[],
  factor: number
): (number | null)[][] {
  const ny = grid.length;
  const nx = grid[0]?.length ?? 0;
  if (factor <= 1 || ny < 2 || nx < 2) return grid.map((row) => [...row]);
  const known = refineGrid(
    grid.map((row) => row.map((v) => (v === null ? 0 : 1))),
    factor
  );
  return known.map((row, jj) =>
    row.map((k, ii) => {
      if (k < 0.5) return null;
      const [j, ty] = locate(jj, ny, factor);
      const [i, tx] = locate(ii, nx, factor);
      let sum = 0;
      let weight = 0;
      for (const [dj, di, w] of [
        [0, 0, (1 - ty) * (1 - tx)],
        [0, 1, (1 - ty) * tx],
        [1, 0, ty * (1 - tx)],
        [1, 1, ty * tx],
      ] as const) {
        const v = grid[j + dj][i + di];
        if (v === null || w === 0) continue;
        sum += v * w;
        weight += w;
      }
      return weight > 0 ? sum / weight : null;
    })
  );
}

/**
 * A grid of categories (or anything that does not average, such as hover text) refined
 * by taking the nearest coarse point.
 */
export function refineNearest<T>(
  grid: readonly (readonly T[])[],
  factor: number
): T[][] {
  const ny = grid.length;
  const nx = grid[0]?.length ?? 0;
  if (factor <= 1 || ny < 2 || nx < 2) return grid.map((row) => [...row]);
  return Array.from({ length: refinedLength(ny, factor) }, (_, jj) =>
    Array.from({ length: refinedLength(nx, factor) }, (_, ii) => {
      const j = Math.min(ny - 1, Math.round(jj / factor));
      const i = Math.min(nx - 1, Math.round(ii / factor));
      return grid[j][i];
    })
  );
}

/** A measure's height refined; its values (blank where unknown) refined with their edge. */
export function refineContinuous(
  field: ContinuousField,
  factor: number
): ContinuousField {
  return {
    ...field,
    z: refineGrid(field.z, factor),
    value: refineMasked(field.value, factor),
  };
}

/**
 * Every blank filled with the nearest known value (4-neighbour steps), so a colour can
 * be painted everywhere and "unknown here" faded over it (`lib/landscapePaint.ts`)
 * instead of drawn as a hard, cell-shaped edge. A grid with nothing known is returned as it is.
 */
export function fillBlanks<T>(
  grid: readonly (readonly (T | null)[])[]
): (T | null)[][] {
  const ny = grid.length;
  const nx = grid[0]?.length ?? 0;
  const out = grid.map((row) => [...row]);
  let frontier: [number, number][] = [];
  for (let j = 0; j < ny; j += 1)
    for (let i = 0; i < nx; i += 1)
      if (out[j][i] !== null) frontier.push([j, i]);
  while (frontier.length > 0) {
    const next: [number, number][] = [];
    for (const [j, i] of frontier)
      for (const [dj, di] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const jj = j + dj;
        const ii = i + di;
        if (jj < 0 || jj >= ny || ii < 0 || ii >= nx || out[jj][ii] !== null)
          continue;
        out[jj][ii] = out[j][i];
        next.push([jj, ii]);
      }
    frontier = next;
  }
  return out;
}
