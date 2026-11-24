/**
 * The energy landscape, evaluated in the browser.
 *
 * Two halves. A density from node positions and masses (`densityField`, whose Python
 * reference is `pipeline/neurometrics/landscape.py`). And the potential every view
 * draws its wells with (`potential`, `wellsOf`): `U = -log(p + epsilon)`, shared by the
 * Brain Landscape's energy layers (`landscapeLayers.ts`) and the 3D surfaces' "Wells"
 * relief (`brainLandscape.ts`), so the two read a place the same way.
 *
 * Energy is the negative log of a *relative* density, in arbitrary units. It is not a
 * free energy and nothing here licenses reading it as one.
 */

export interface LandscapeNode {
  x: number;
  y: number;
  mass: number;
}

export interface Field {
  xs: number[];
  ys: number[];
  /** Indexed `[y][x]`, matching Plotly's `z` convention for heatmaps and contours. */
  z: number[][];
}

/**
 * Sum one Gaussian per node, weighted by its mass, over a grid covering the layout.
 *
 * @param nodes - Node positions and masses.
 * @param sigma - Kernel width in layout units; must be positive.
 * @param resolution - Grid points per axis.
 * @param padding - How far past the outermost node to extend, in units of `sigma`.
 */
export function densityField(
  nodes: LandscapeNode[],
  sigma: number,
  resolution = 96,
  padding = 2
): Field {
  if (!(sigma > 0) || nodes.length === 0) {
    return { xs: [], ys: [], z: [] };
  }
  const margin = padding * sigma;
  const xsAll = nodes.map((n) => n.x);
  const ysAll = nodes.map((n) => n.y);
  const xs = linspace(
    Math.min(...xsAll) - margin,
    Math.max(...xsAll) + margin,
    resolution
  );
  const ys = linspace(
    Math.min(...ysAll) - margin,
    Math.max(...ysAll) + margin,
    resolution
  );

  const twoSigmaSquared = 2 * sigma * sigma;
  const scale = 1 / (Math.PI * twoSigmaSquared);
  const z = ys.map((y) =>
    xs.map((x) => {
      let total = 0;
      for (const node of nodes) {
        const dx = x - node.x;
        const dy = y - node.y;
        total += node.mass * Math.exp(-(dx * dx + dy * dy) / twoSigmaSquared);
      }
      return total * scale;
    })
  );
  return { xs, ys, z };
}

/** The floor added under `p` before its log, when a view sets none. */
export const DEFAULT_EPSILON = 0.01;

/**
 * Share of the peak below which ground counts as unexplored: the backend's `VISIBLE`
 * (`pipeline/neurometrics/brain.py`), where the hover stops because nothing happened.
 */
export const EXPLORED_SHARE = 0.02;

/**
 * The potential of a share of time, `U = -log(p + epsilon)`, capped at `cutoff` when one
 * is set. The one definition the Brain Landscape's energy layers and the 3D surfaces'
 * wells both use, so the two never disagree. `epsilon` (> 0, else the default) floors
 * empty ground at a finite height instead of an infinite one; a negative `p` reads as 0.
 * Arbitrary units: not a free energy, and nothing here licenses reading it as one.
 */
export function potential(
  p: number,
  epsilon: number = DEFAULT_EPSILON,
  cutoff: number | null = null
): number {
  const floor = epsilon > 0 ? epsilon : DEFAULT_EPSILON;
  const u = -Math.log(Math.max(0, p) + floor);
  return cutoff === null ? u : Math.min(u, cutoff);
}

/**
 * The highest a potential reaches with these settings: the cutoff, or `-log epsilon`
 * (empty ground) without one. Views draw their energies over it, so two with the same
 * settings share a scale.
 */
export function potentialCeiling(
  epsilon: number = DEFAULT_EPSILON,
  cutoff: number | null = null
): number {
  return cutoff ?? -Math.log(epsilon > 0 ? epsilon : DEFAULT_EPSILON);
}

/** A height grid read as wells; every grid `[row][column]`, like the heights. */
export interface Wells {
  /** 0 at the deepest well, 1 on the plateau of unexplored ground. */
  z: number[][];
  /** `1 - z` on explored ground, 0 on the plateau: how much time, on a log scale. */
  depth: number[][];
  /** Whether the ground reached `explored` of the peak. */
  explored: boolean[][];
}

/**
 * A height grid peaking at 1 (the backend's density over its peak) turned into Andrea's
 * wells: `U = -log max(p, p0)`, where the brain spent its time is a basin and the
 * ground it never reached is floored.
 *
 * The floor is the explored share (`p0`): the potential is capped there, so all the
 * unexplored ground is one flat plateau at height 1 and cannot draw relief of its own
 * (without the cap, the ground between nothing and the explored share would slope over
 * about a quarter of the scale). The deepest well sits at 0. Heights are rescaled by the grid's own peak, so
 * a grid whose peak is not exactly 1 still spans [0, 1]; an empty or flat-zero grid is
 * all plateau.
 */
export function wellsOf(
  height: readonly (readonly number[])[],
  epsilon: number = DEFAULT_EPSILON,
  explored: number = EXPLORED_SHARE
): Wells {
  let peak = 0;
  for (const row of height) for (const v of row) if (v > peak) peak = v;
  const cutoff = potential(explored, epsilon);
  const bottom = potential(1, epsilon);
  const span = cutoff - bottom || 1;
  const z: number[][] = [];
  const depth: number[][] = [];
  const known: boolean[][] = [];
  for (const row of height) {
    const zr: number[] = [];
    const dr: number[] = [];
    const kr: boolean[] = [];
    for (const v of row) {
      const p = peak > 0 ? v / peak : 0;
      const h = (potential(p, epsilon, cutoff) - bottom) / span;
      const reached = p >= explored;
      zr.push(h);
      dr.push(reached ? 1 - h : 0);
      kr.push(reached);
    }
    z.push(zr);
    depth.push(dr);
    known.push(kr);
  }
  return { z, depth, explored: known };
}

/** Read a field at an arbitrary layout coordinate, nearest cell. */
export function sampleField(field: Field, x: number, y: number): number | null {
  if (field.xs.length === 0) return null;
  const ix = nearest(field.xs, x);
  const iy = nearest(field.ys, y);
  return field.z[iy][ix];
}

function linspace(from: number, to: number, count: number): number[] {
  if (count < 2) return [from];
  const step = (to - from) / (count - 1);
  return Array.from({ length: count }, (_, i) => from + i * step);
}

function nearest(values: number[], target: number): number {
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
