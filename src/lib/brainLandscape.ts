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
