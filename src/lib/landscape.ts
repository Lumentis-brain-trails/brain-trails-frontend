/**
 * The energy landscape, evaluated in the browser.
 *
 * The backend sends node positions, masses and a kernel width rather than a rendered
 * grid: a few dozen Gaussians cost microseconds to sum here, the payload stays small,
 * and the bandwidth can be a slider instead of a job. The Python reference these must
 * agree with is `pipeline/neurometrics/landscape.py`.
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

/**
 * Turn a density into `-log` energy, floored so empty ground does not diverge and
 * shifted so the deepest basin sits at zero.
 *
 * @param density - Output of {@link densityField}.
 * @param floorQuantile - Quantile of the positive density used as the floor.
 */
export function energyField(density: Field, floorQuantile = 0.02): Field {
  const positive = density.z.flat().filter((v) => v > 0);
  if (positive.length === 0) return density;

  const sorted = [...positive].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.floor(floorQuantile * sorted.length)
  );
  const floor = Math.max(sorted[index], Number.MIN_VALUE);

  let lowest = Infinity;
  const raw = density.z.map((row) =>
    row.map((value) => {
      const energy = -Math.log(Math.max(value, floor));
      if (energy < lowest) lowest = energy;
      return energy;
    })
  );
  return {
    xs: density.xs,
    ys: density.ys,
    z: raw.map((row) => row.map((v) => v - lowest)),
  };
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
