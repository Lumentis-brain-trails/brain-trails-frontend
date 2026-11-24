/**
 * A person's brain landscape, as the browser reads it (backend V3-0013).
 *
 * The backend fits one map on all of a person's recordings, blurs where their windows
 * landed into a height grid peaking at 1, and says what was happening around each grid
 * point. This module turns that into what a 3D surface needs - axes, a height anywhere
 * on the map so a trail can rest on the ground, and one hover line per grid point - and
 * nothing else: no re-fitting, no re-blurring, the scale is the backend's.
 */
import type { components } from "@/lib/api-types";
import { wellsOf } from "@/lib/landscape";

export type BrainLandscape = components["schemas"]["BrainLandscapeOut"];
export type LandscapeCategory =
  components["schemas"]["BrainLandscapeCategoryOut"];

/** The grid's x and y coordinates, evenly spread over `bounds`. */
export function axes(landscape: BrainLandscape): {
  xs: number[];
  ys: number[];
} {
  const [x0, x1, y0, y1] = landscape.bounds;
  const { nx, ny } = landscape.grid;
  const spread = (a: number, b: number, n: number) =>
    Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
  return { xs: spread(x0, x1, nx), ys: spread(y0, y1, ny) };
}

/** Whether `(x, y)` lies on the map (the backend frames 90% of the windows). */
export function onMap(
  landscape: BrainLandscape,
  x: number,
  y: number
): boolean {
  const [x0, x1, y0, y1] = landscape.bounds;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/**
 * A trail's coordinates with every window off the map blanked (null), index for index:
 * a 3D line breaks at a null, so a trail stops at the edge of the map instead of
 * running off it towards an outlier, and colours, symbols and hover lines stay aligned.
 */
export function framedTrail(
  landscape: BrainLandscape,
  xs: readonly number[],
  ys: readonly number[]
): { x: (number | null)[]; y: (number | null)[] } {
  const inside = xs.map((x, i) => onMap(landscape, x, ys[i]));
  return {
    x: xs.map((x, i) => (inside[i] ? x : null)),
    y: ys.map((y, i) => (inside[i] ? y : null)),
  };
}

/**
 * The landscape's height at `(x, y)`, bilinear between grid points, 0 off the map.
 * What lifts a trail onto the surface instead of leaving it under a hill.
 */
export function heightAt(
  landscape: BrainLandscape,
  x: number,
  y: number
): number {
  const [x0, x1, y0, y1] = landscape.bounds;
  const { nx, ny, z } = landscape.grid;
  if (!onMap(landscape, x, y) || nx < 2 || ny < 2) return 0;
  const fx = ((x - x0) / (x1 - x0 || 1)) * (nx - 1);
  const fy = ((y - y0) / (y1 - y0 || 1)) * (ny - 1);
  const i = Math.min(nx - 2, Math.floor(fx));
  const j = Math.min(ny - 2, Math.floor(fy));
  const dx = fx - i;
  const dy = fy - j;
  const at = (jj: number, ii: number) => z[jj]?.[ii] ?? 0;
  return (
    at(j, i) * (1 - dx) * (1 - dy) +
    at(j, i + 1) * dx * (1 - dy) +
    at(j + 1, i) * (1 - dx) * dy +
    at(j + 1, i + 1) * dx * dy
  );
}

/**
 * One hover line per grid point, `[row][column]` like the heights: the few things that
 * were happening there, with their shares ("Dock the cargo · Cargo hit 62%"). Empty
 * where the backend kept nothing - the ground nobody went to.
 */
export function hoverMatrix(
  landscape: BrainLandscape,
  name: (category: LandscapeCategory) => string
): string[][] {
  const { nx, ny } = landscape.grid;
  const text = Array.from({ length: ny }, () => Array<string>(nx).fill(""));
  for (const [i, j, top] of landscape.cells) {
    if (j < 0 || j >= ny || i < 0 || i >= nx) continue;
    text[j][i] = top
      .map(([c, share]) => {
        const category = landscape.categories[c];
        return category
          ? `${name(category)} ${Math.round(share * 100)}%`
          : null;
      })
      .filter(Boolean)
      .join("<br>");
  }
  return text;
}

/**
 * How the height is drawn: `hills` (the backend's density over its peak: peaks are where
 * the time was spent) or `wells` (the same map as a potential, `U = -log p`: where the
 * time was spent is a basin, the ground never reached a flat plateau; Andrea's
 * "mountains that become wells").
 */
export type Relief = "hills" | "wells";
export const RELIEFS: readonly Relief[] = ["hills", "wells"];

/**
 * The share of the colour scale kept for the plateau of unexplored ground in the wells
 * relief: colour values below it are the faded plateau, the landscape's own ramp is
 * spread over the rest.
 */
export const PLATEAU_BAND = 0.04;

/** A map's ground, drawn with one relief. */
export interface Ground {
  /** The map with its heights replaced: every height lookup (`heightAt`) reads these. */
  landscape: BrainLandscape;
  /**
   * The colour of each grid point, `[row][column]`, in [0, 1], for the wells: below
   * `PLATEAU_BAND` the faded plateau, above it how deep the well is (the most time the
   * most saturated, as on the hills). Null for the hills, which are coloured by height.
   */
  colour: number[][] | null;
}

/**
 * The map's ground with `relief` applied. The heights themselves are replaced, not only
 * drawn differently, so a trail, a cursor or a target lifted with `heightAt` on the
 * returned map sits on the drawn surface whichever the relief. The hills are the map as
 * it came.
 */
export function groundOf(landscape: BrainLandscape, relief: Relief): Ground {
  if (relief === "hills") return { landscape, colour: null };
  const wells = wellsOf(landscape.grid.z);
  return {
    landscape: { ...landscape, grid: { ...landscape.grid, z: wells.z } },
    colour: wells.depth.map((row, j) =>
      row.map((d, i) =>
        wells.explored[j][i] ? PLATEAU_BAND + d * (1 - PLATEAU_BAND) : 0
      )
    ),
  };
}

/**
 * A colour scale for `Ground.colour`: the faded plateau under `PLATEAU_BAND`, the
 * landscape's own ramp (`stops`, low to high) over the rest.
 */
export function wellsColorscale(
  stops: readonly (readonly [number, string])[],
  faded: string
): [number, string][] {
  return [
    [0, faded],
    [PLATEAU_BAND / 2, faded],
    ...stops.map(([at, colour]): [number, string] => [
      PLATEAU_BAND + at * (1 - PLATEAU_BAND),
      colour,
    ]),
  ];
}

/** Why there is no landscape to draw: still being built, not on this server, or broken. */
export type LandscapeProblem = "building" | "unavailable" | "error";

/**
 * Read a failed landscape request: 409 `not_ready` is a map still being built (asking
 * queued it, so it is worth asking again), 404 a server that has no landscapes at all
 * (an older backend), anything else an error. A page must say which - a blank one says
 * nothing.
 */
export function landscapeProblem(
  error: { status?: number; error?: { code?: string } } | null | undefined
): LandscapeProblem | null {
  if (!error) return null;
  if (error.status === 409 || error.error?.code === "not_ready")
    return "building";
  if (error.status === 404) return "unavailable";
  return "error";
}
