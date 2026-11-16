import { describe, expect, it } from "vitest";
import {
  fillBlanks,
  paintable,
  refineAxis,
  refineContinuous,
  refineGrid,
  refineMasked,
  refineNearest,
  refinedLength,
  unknownOf,
} from "./refine";

describe("refine", () => {
  it("keeps every old point and spreads new ones evenly between", () => {
    expect(refinedLength(4, 3)).toBe(10);
    expect(refineAxis([0, 3, 6], 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(refineAxis([0, 1], 1)).toEqual([0, 1]);
  });

  it("interpolates heights smoothly without inventing bumps or dips", () => {
    const peak = [
      [0, 0, 0, 0],
      [0, 0.5, 1, 0],
      [0, 0.5, 1, 0],
      [0, 0, 0, 0],
    ];
    const fine = refineGrid(peak, 3);
    expect(fine).toHaveLength(10);
    expect(fine[0]).toHaveLength(10);
    // old points kept
    expect(fine[3][6]).toBe(1);
    expect(fine[3][3]).toBe(0.5);
    // never above the highest nor below the lowest sample
    const all = fine.flat();
    expect(Math.max(...all)).toBeLessThanOrEqual(1);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0);
    // between 0.5 and 1 it rises monotonically
    const row = fine[3].slice(3, 7);
    for (let k = 1; k < row.length; k += 1)
      expect(row[k]).toBeGreaterThanOrEqual(row[k - 1]);
  });

  it("places the edge of a known region between its points, values from the known ones", () => {
    const grid = [
      [1, 2, null],
      [1, 2, null],
    ];
    const fine = refineMasked(grid, 2);
    expect(fine[0]).toEqual([1, 1.5, 2, 2, null]);
    expect(fine[1][4]).toBeNull();
  });

  it("takes the nearest point for what does not average", () => {
    expect(
      refineNearest(
        [
          ["a", "b"],
          ["c", "d"],
        ],
        2
      )
    ).toEqual([
      ["a", "b", "b"],
      ["c", "d", "d"],
      ["c", "d", "d"],
    ]);
  });

  it("fills blanks from the nearest known value, and leaves an empty grid alone", () => {
    expect(
      fillBlanks([
        [null, 1, null, null],
        [null, null, null, 4],
      ])
    ).toEqual([
      [1, 1, 1, 4],
      [1, 1, 4, 4],
    ]);
    expect(fillBlanks([[null, null]])).toEqual([[null, null]]);
  });

  it("veils what is unknown, fading over a cell", () => {
    const field = {
      type: "continuous" as const,
      z: [
        [0, 1],
        [0, 1],
      ],
      value: [
        [0.5, null],
        [0.5, null],
      ],
      unit: "band" as const,
    };
    const veil = unknownOf(field, 2);
    expect(veil[0]).toEqual([0, 0.5, 1]);
    const painted = paintable(field, 2);
    if (painted.type !== "continuous") throw new Error("continuous");
    expect(painted.value[0]).toEqual([0.5, 0.5, 0.5]);
    expect(refineContinuous(field, 2).z[0]).toEqual([0, 0.5, 1]);
  });

  it("refines a categorical measure by its nearest category inside its edge", () => {
    const field = {
      type: "categorical" as const,
      category: [
        [0, 1, null],
        [0, 1, null],
      ],
      share: [
        [1, 0.6, null],
        [1, 0.6, null],
      ],
      categories: ["A", "B"],
    };
    const painted = paintable(field, 2);
    if (painted.type !== "categorical") throw new Error("categorical");
    expect(painted.category[0]).toEqual([0, 1, 1, 1, 1]);
    expect(unknownOf(field, 2)[0]).toEqual([0, 0, 0, 0.5, 1]);
  });
});
