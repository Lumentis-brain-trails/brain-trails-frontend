import { describe, expect, test } from "vitest";
import {
  densityField,
  energyField,
  sampleField,
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

describe("energyField", () => {
  test("puts the deepest basin at zero and the empty ground above it", () => {
    const energy = energyField(densityField(TWO_NODES, 1, 64));
    const flat = energy.z.flat();
    expect(Math.min(...flat)).toBeCloseTo(0);
    expect(Math.max(...flat)).toBeGreaterThan(0);
  });

  test("a well sits below a lighter one", () => {
    const density = densityField(TWO_NODES, 1, 64);
    const energy = energyField(density);
    const heavy = Math.min(...energy.z.map((row) => row[column(energy.xs, 0)]));
    const light = Math.min(
      ...energy.z.map((row) => row[column(energy.xs, 10)])
    );
    expect(heavy).toBeLessThan(light);
  });

  test("stays finite far from every node, where the density underflows", () => {
    const energy = energyField(
      densityField([{ x: 0, y: 0, mass: 5 }], 0.2, 64, 20)
    );
    expect(energy.z.flat().every((v) => Number.isFinite(v))).toBe(true);
  });

  test("passes an empty field straight through", () => {
    const empty = { xs: [], ys: [], z: [] };
    expect(energyField(empty)).toEqual(empty);
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
