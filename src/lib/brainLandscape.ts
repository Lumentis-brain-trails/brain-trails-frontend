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
import { densityField } from "@/lib/landscape";

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

/**
 * A recording's own terrain in the shape of a brain landscape, so its trail can rest on
 * a 3D surface before the person's map holds it.
 *
 * The session's terrain is the sum of one Gaussian per ball of its own cover, weighted
 * by the windows in it (`lib/landscape.ts`, mirroring the backend); normalised to peak 1
 * and paired with the recording's own trail, it is drawn exactly like the person's map.
 * Null when the analysis was not drawn on a landscape (an older PCA trail).
 */
export function sessionTerrain(analysis: {
  landscape: {
    sigma: number;
    positions: [number, number][];
    masses: number[];
  } | null;
  points: { t_start: number; pc1: number; pc2: number }[];
}): BrainLandscape | null {
  const land = analysis.landscape;
  if (!land || land.positions.length === 0 || !(land.sigma > 0)) return null;
  const field = densityField(
    land.positions.map(([x, y], i) => ({ x, y, mass: land.masses[i] ?? 0 })),
    land.sigma,
    SESSION_GRID,
    SESSION_PADDING
  );
  if (field.xs.length < 2 || field.ys.length < 2) return null;
  const peak = Math.max(1e-12, ...field.z.flat());
  return {
    version: 0,
    built_at: "",
    n_recordings: 1,
    n_windows: analysis.points.length,
    pending: false,
    epoch: 0,
    change: null,
    bounds: [field.xs[0], field.xs.at(-1)!, field.ys[0], field.ys.at(-1)!],
    grid: {
      nx: field.xs.length,
      ny: field.ys.length,
      z: field.z.map((row) => row.map((v) => v / peak)),
    },
    categories: [],
    cells: [],
    trail: {
      t: analysis.points.map((p) => p.t_start),
      x: analysis.points.map((p) => p.pc1),
      y: analysis.points.map((p) => p.pc2),
    },
  };
}

/** Grid points per axis of a session's own terrain: lighter than a person's map. */
const SESSION_GRID = 72;
/** How far past the outermost ball the session terrain reaches, in kernel widths. */
const SESSION_PADDING = 2.5;

let webgl: boolean | undefined;

/** Whether this browser can draw WebGL, which the 3D surfaces need (asked once). */
export function supportsWebGL(): boolean {
  if (webgl !== undefined) return webgl;
  webgl = probeWebGL();
  return webgl;
}

function probeWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
