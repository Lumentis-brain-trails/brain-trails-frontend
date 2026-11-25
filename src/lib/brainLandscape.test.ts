import { describe, expect, test } from "vitest";
import {
  type BrainLandscape,
  axes,
  PLATEAU_BAND,
  framedTrail,
  groundOf,
  heightAt,
  hoverMatrix,
  landscapeProblem,
  wellsColorscale,
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

describe("framedTrail", () => {
  test("blanks the windows off the map, index for index", () => {
    expect(framedTrail(landscape, [0.5, 3, 2, -1], [0.5, 0.5, 1, 0])).toEqual({
      x: [0.5, null, 2, null],
      y: [0.5, null, 1, null],
    });
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

describe("groundOf", () => {
  test("the hills are the map as it came", () => {
    const ground = groundOf(landscape, "hills");
    expect(ground.landscape).toBe(landscape);
    expect(ground.colour).toBeNull();
  });

  test("the wells turn the peak into the deepest point and lift everything on them", () => {
    const { landscape: wells, colour } = groundOf(landscape, "wells");
    expect(wells.grid.z[0][2]).toBeCloseTo(0);
    expect(wells.grid.z[0][0]).toBe(1);
    // a trail lifted on the returned map rides the drawn surface
    expect(heightAt(wells, 2, 0)).toBeCloseTo(0);
    expect(heightAt(wells, 0, 1)).toBe(1);
    expect(heightAt(wells, 1, 0)).toBeGreaterThan(0);
    expect(heightAt(wells, 1, 0)).toBeLessThan(1);
    // the plateau is coloured below the band, the deepest well at the top of the ramp
    expect(colour![1]).toEqual([0, 0, 0]);
    expect(colour![0][2]).toBeCloseTo(1);
    expect(colour![0][1]).toBeGreaterThan(PLATEAU_BAND);
    // the map's other fields are untouched
    expect(wells.bounds).toBe(landscape.bounds);
    expect(landscape.grid.z[0][2]).toBe(1);
  });

  test("the wells' colour scale keeps the faded plateau under the band", () => {
    const scale = wellsColorscale(
      [
        [0, "#000"],
        [1, "#fff"],
      ],
      "#888"
    );
    expect(scale[0]).toEqual([0, "#888"]);
    expect(scale[2]).toEqual([PLATEAU_BAND, "#000"]);
    expect(scale.at(-1)).toEqual([1, "#fff"]);
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
