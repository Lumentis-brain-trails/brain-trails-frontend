import { describe, expect, test } from "vitest";
import { blockTrajectory, placeAt } from "./trajectory";

const trail = {
  t: [0, 1, 2, 3, 4, 5],
  x: [10, 11, 12, 13, 14, 15],
  y: [20, 21, 22, 23, 24, 25],
};

describe("blockTrajectory", () => {
  test("keeps the windows starting inside the block, matched to its own windows", () => {
    const stretch = blockTrajectory(
      trail,
      { t_start_s: 2, t_end_s: 5 },
      [2, 3.0004, 4]
    );
    expect(stretch.t).toEqual([2, 3, 4]);
    expect(stretch.x).toEqual([12, 13, 14]);
    expect(stretch.y).toEqual([22, 23, 24]);
    expect(stretch.window).toEqual([0, 1, 2]);
  });

  test("a window the analysis does not list has no index", () => {
    const stretch = blockTrajectory(trail, { t_start_s: 0, t_end_s: 2 }, [1]);
    expect(stretch.window).toEqual([null, 0]);
  });

  test("ragged lists are cut to the shortest", () => {
    const stretch = blockTrajectory(
      { t: [0, 1, 2], x: [1, 2], y: [1, 2, 3] },
      { t_start_s: 0, t_end_s: 10 },
      []
    );
    expect(stretch.t).toEqual([0, 1]);
  });
});

describe("placeAt", () => {
  const stretch = blockTrajectory(trail, { t_start_s: 2, t_end_s: 5 }, []);

  test("the last window starting at or before the moment", () => {
    expect(placeAt(stretch, 3.5)).toEqual({ x: 13, y: 23 });
    expect(placeAt(stretch, 99)).toEqual({ x: 14, y: 24 });
  });

  test("before the stretch, its first window; nothing for an empty one", () => {
    expect(placeAt(stretch, 0)).toEqual({ x: 12, y: 22 });
    expect(placeAt({ t: [], x: [], y: [], window: [] }, 1)).toBeNull();
  });
});
