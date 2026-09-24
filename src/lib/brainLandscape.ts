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
  if (x < x0 || x > x1 || y < y0 || y > y1 || nx < 2 || ny < 2) return 0;
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
