/**
 * Turns an energy {@link Field} into the vertex grid and trail path a 3D terrain
 * scene draws, without depending on Three.js so this stays unit-testable in jsdom.
 *
 * Height is the field's own energy, not a decorative noise octave: a basin (heavily
 * visited, low energy) is a valley, a ridge (a crossing between basins) is a peak.
 * That is the whole point of building this from `landscape.ts`'s Gaussians instead
 * of the band-power noise the topography-system prototype used.
 */

import type { Field } from "./landscape";

export interface TerrainVertex {
  /** World-space X, Z (Y is height) and the source grid position. */
  x: number;
  z: number;
  y: number;
}

export interface TerrainGeometry {
  /** `resolution.x * resolution.y` vertices, row-major (matches `Field.z`). */
  vertices: TerrainVertex[];
  resolution: { x: number; y: number };
  minHeight: number;
  maxHeight: number;
}

/**
 * Builds the terrain mesh's vertices directly from the field's own grid, so no
 * resampling or interpolation is needed: one field cell is one mesh vertex.
 *
 * @param field - The energy field (low = basin, high = ridge).
 * @param heightScale - World units per unit of energy.
 */
export function terrainGeometry(
  field: Field,
  heightScale: number
): TerrainGeometry {
  if (field.xs.length === 0 || field.ys.length === 0) {
    return {
      vertices: [],
      resolution: { x: 0, y: 0 },
      minHeight: 0,
      maxHeight: 0,
    };
  }
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const vertices: TerrainVertex[] = [];
  for (let row = 0; row < field.ys.length; row += 1) {
    for (let col = 0; col < field.xs.length; col += 1) {
      const height = field.z[row][col] * heightScale;
      if (height < minHeight) minHeight = height;
      if (height > maxHeight) maxHeight = height;
      vertices.push({ x: field.xs[col], z: field.ys[row], y: height });
    }
  }
  return {
    vertices,
    resolution: { x: field.xs.length, y: field.ys.length },
    minHeight,
    maxHeight,
  };
}

export interface TrailVertex3D {
  x: number;
  y: number;
  z: number;
  t: number;
}

/**
 * Places each 2D trail point onto the terrain: (pc1, pc2) become (x, z) and the
 * field is sampled for height, plus a small hover so the line and its markers
 * never z-fight with the surface.
 *
 * @param points - `{ x, y, t }` in layout units (a session's `pc1`/`pc2`/`t_start`).
 * @param field - The same energy field the terrain mesh was built from.
 * @param heightScale - Must match the value passed to {@link terrainGeometry}.
 * @param hover - World units the trail floats above the surface.
 */
export function trailOnTerrain(
  points: { x: number; y: number; t: number }[],
  field: Field,
  heightScale: number,
  hover = 0.08
): TrailVertex3D[] {
  if (field.xs.length === 0) return [];
  return points.map((p) => ({
    x: p.x,
    z: p.y,
    y: sampleHeight(field, p.x, p.y) * heightScale + hover,
    t: p.t,
  }));
}

function sampleHeight(field: Field, x: number, y: number): number {
  const ix = nearestIndex(field.xs, x);
  const iy = nearestIndex(field.ys, y);
  return field.z[iy][ix];
}

function nearestIndex(values: number[], target: number): number {
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const gap = Math.abs(values[i] - target);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}
