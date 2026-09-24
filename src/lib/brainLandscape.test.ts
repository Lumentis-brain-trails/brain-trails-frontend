import { describe, expect, test } from "vitest";
import {
  type BrainLandscape,
  axes,
  heightAt,
  hoverMatrix,
  landscapeProblem,
  sessionTerrain,
} from "./brainLandscape";

const landscape = {
  version: 1,
  built_at: "2026-09-23T20:00:00Z",
  n_recordings: 2,
  n_windows: 80,
  pending: false,
  bounds: [0, 2, 0, 1],
  grid: {
    nx: 3,
    ny: 2,
    z: [
      [0, 0.5, 1],
      [0, 0, 0],
    ],
  },
  categories: [
    { task: "Dock the cargo", label: "cargo_pressed" },
    { task: "Settle", label: null },
  ],
  cells: [
    [
      2,
      0,
      [
        [0, 0.62],
        [1, 0.3],
      ],
    ],
    [1, 0, [[1, 1]]],
  ],
  trail: null,
} as unknown as BrainLandscape;

describe("axes", () => {
  test("spread evenly over the bounds", () => {
    expect(axes(landscape)).toEqual({ xs: [0, 1, 2], ys: [0, 1] });
  });
});

describe("heightAt", () => {
  test("is the grid's own height on a grid point", () => {
    expect(heightAt(landscape, 2, 0)).toBeCloseTo(1);
    expect(heightAt(landscape, 1, 0)).toBeCloseTo(0.5);
  });

  test("blends between grid points", () => {
    expect(heightAt(landscape, 1.5, 0)).toBeCloseTo(0.75);
    expect(heightAt(landscape, 2, 0.5)).toBeCloseTo(0.5);
  });

  test("is zero off the map", () => {
    expect(heightAt(landscape, -1, 0)).toBe(0);
    expect(heightAt(landscape, 1, 3)).toBe(0);
  });
});

describe("hoverMatrix", () => {
  test("says what happened at each point, in the reader's words", () => {
    const text = hoverMatrix(landscape, (c) =>
      c.label
        ? `${c.task} · ${c.label === "cargo_pressed" ? "Cargo hit" : c.label}`
        : c.task
    );
    expect(text[0][2]).toBe("Dock the cargo · Cargo hit 62%<br>Settle 30%");
    expect(text[0][1]).toBe("Settle 100%");
    expect(text[1][0]).toBe("");
  });
});

describe("landscapeProblem", () => {
  test("tells a map being built from a server without maps from a failure", () => {
    expect(landscapeProblem(null)).toBeNull();
    expect(
      landscapeProblem({ status: 409, error: { code: "not_ready" } })
    ).toBe("building");
    expect(
      landscapeProblem({ status: 404, error: { code: "http_error" } })
    ).toBe("unavailable");
    expect(landscapeProblem({ status: 500 })).toBe("error");
  });
});

describe("sessionTerrain", () => {
  const analysis = {
    landscape: {
      sigma: 0.5,
      positions: [
        [0, 0],
        [2, 0],
      ] as [number, number][],
      masses: [30, 10],
    },
    points: [
      { t_start: 0, pc1: 0, pc2: 0 },
      { t_start: 1, pc1: 1, pc2: 0 },
    ],
  };

  test("draws the session's own terrain like a person's map, peaking at 1", () => {
    const terrain = sessionTerrain(analysis)!;
    const peak = Math.max(...terrain.grid.z.flat());
    expect(peak).toBeCloseTo(1);
    expect(terrain.grid.z).toHaveLength(terrain.grid.ny);
    // the heavier ball is the higher ground
    expect(heightAt(terrain, 0, 0)).toBeGreaterThan(heightAt(terrain, 2, 0));
    expect(terrain.trail).toEqual({ t: [0, 1], x: [0, 1], y: [0, 0] });
  });

  test("has nothing to draw for a trail that was not laid on a landscape", () => {
    expect(sessionTerrain({ ...analysis, landscape: null })).toBeNull();
  });
});
