import { describe, expect, test } from "vitest";
import {
  DEFAULT_EPSILON,
  densityField,
  potential,
  potentialCeiling,
  sampleField,
  wellsOf,
  type LandscapeNode,
} from "@/lib/landscape";

const TWO_NODES: LandscapeNode[] = [
  { x: 0, y: 0, mass: 100 },
  { x: 10, y: 0, mass: 1 },
];

/** Index of the grid column closest to a layout x. */
function column(xs: number[], x: number): number {
  return xs.reduce(
    (best, value, i) =>
      Math.abs(value - x) < Math.abs(xs[best] - x) ? i : best,
    0
  );
}

describe("densityField", () => {
  test("covers the layout with a margin on every side", () => {
    const field = densityField(TWO_NODES, 1, 32, 2);
    expect(field.xs[0]).toBeCloseTo(-2);
    expect(field.xs[field.xs.length - 1]).toBeCloseTo(12);
    expect(field.z).toHaveLength(32);
    expect(field.z[0]).toHaveLength(32);
  });

  test("is highest where the mass is", () => {
    const field = densityField(TWO_NODES, 1, 64);
    const heavy = Math.max(...field.z.map((row) => row[column(field.xs, 0)]));
    const light = Math.max(...field.z.map((row) => row[column(field.xs, 10)]));
    expect(heavy).toBeGreaterThan(light * 10);
  });

  test("matches the Python reference at a node centre", () => {
    // One node of mass 1 at sigma 1: the peak of a normalized 2-D Gaussian is
    // 1 / (2 * pi * sigma^2), which is what pipeline/neurometrics/landscape.py computes.
    const field = densityField([{ x: 0, y: 0, mass: 1 }], 1, 65, 2);
    const centre = field.z[column(field.ys, 0)][column(field.xs, 0)];
    expect(centre).toBeCloseTo(1 / (2 * Math.PI), 4);
  });

  test("scales linearly with mass", () => {
    const one = densityField([{ x: 0, y: 0, mass: 1 }], 1, 33);
    const ten = densityField([{ x: 0, y: 0, mass: 10 }], 1, 33);
    expect(ten.z[16][16]).toBeCloseTo(one.z[16][16] * 10, 6);
  });

  test("returns an empty field rather than throwing on degenerate input", () => {
    expect(densityField([], 1).z).toEqual([]);
    expect(densityField(TWO_NODES, 0).z).toEqual([]);
    expect(densityField(TWO_NODES, -1).z).toEqual([]);
  });
});

describe("potential", () => {
  test("is -log(p + epsilon), capped at the cutoff", () => {
    expect(potential(1, 0.01)).toBeCloseTo(-Math.log(1.01));
    expect(potential(0, 0.01)).toBeCloseTo(-Math.log(0.01));
    expect(potential(0, 0.01, 2)).toBe(2);
    // a negative share is empty ground, and a bad epsilon falls back to the default
    expect(potential(-1, 0.01)).toBeCloseTo(-Math.log(0.01));
    expect(potential(0, 0)).toBeCloseTo(-Math.log(DEFAULT_EPSILON));
  });

  test("its ceiling is the cutoff, or empty ground's", () => {
    expect(potentialCeiling(0.01, 3)).toBe(3);
    expect(potentialCeiling(0.01)).toBeCloseTo(-Math.log(0.01));
    expect(potentialCeiling(-1)).toBeCloseTo(-Math.log(DEFAULT_EPSILON));
  });
});

describe("wellsOf", () => {
  const grid = [
    [1, 0.5, 0.1],
    [0.02, 0.01, 0],
  ];

  test("the peak is the deepest well, at zero, and less time is higher ground", () => {
    const { z } = wellsOf(grid);
    expect(z[0][0]).toBeCloseTo(0);
    expect(z[0][1]).toBeGreaterThan(z[0][0]);
    expect(z[0][2]).toBeGreaterThan(z[0][1]);
    expect(Math.max(...z.flat())).toBeCloseTo(1);
  });

  test("ground below the explored share is one flat plateau, marked unexplored", () => {
    const { z, depth, explored } = wellsOf(grid);
    expect(z[1][1]).toBe(1);
    expect(z[1][2]).toBe(1);
    expect(explored[1]).toEqual([true, false, false]);
    expect(depth[1].slice(1)).toEqual([0, 0]);
    expect(depth[0][0]).toBeCloseTo(1);
  });

  test("agrees with the energy layers' potential, rescaled to [0, 1]", () => {
    const { z } = wellsOf(grid, 0.01, 0.02);
    const bottom = potential(1, 0.01);
    const top = potential(0.02, 0.01);
    expect(z[0][1]).toBeCloseTo(
      (potential(0.5, 0.01) - bottom) / (top - bottom)
    );
  });

  test("reads a grid by its own peak, and an empty one as all plateau", () => {
    const half = wellsOf([[0.5, 0.25]]);
    const full = wellsOf([[1, 0.5]]);
    expect(half.z).toEqual(full.z);
    expect(wellsOf([[0, 0]]).z).toEqual([[1, 1]]);
    expect(wellsOf([]).z).toEqual([]);
  });
});

describe("sampleField", () => {
  test("reads the nearest cell", () => {
    const field = densityField(TWO_NODES, 1, 64);
    const atPeak = sampleField(field, 0, 0);
    const atEdge = sampleField(field, 10, 0);
    expect(atPeak).not.toBeNull();
    expect(atPeak!).toBeGreaterThan(atEdge!);
  });

  test("is null for a field with no grid", () => {
    expect(sampleField({ xs: [], ys: [], z: [] }, 0, 0)).toBeNull();
  });
});
