import { describe, expect, test } from "vitest";
import { downsample, fitToBox } from "./thumb";

describe("downsample", () => {
  test("returns a copy when already short enough", () => {
    const pts = [1, 2, 3];
    const out = downsample(pts, 5);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
  });

  test("keeps the first and the last point", () => {
    const pts = Array.from({ length: 101 }, (_, i) => i);
    const out = downsample(pts, 11);
    expect(out).toHaveLength(11);
    expect(out[0]).toBe(0);
    expect(out[10]).toBe(100);
    expect(out[5]).toBe(50);
  });
});

describe("fitToBox", () => {
  test("centres and scales uniformly, flipping y", () => {
    const map = fitToBox(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
      120,
      100,
      10
    );
    // the wider axis sets the scale: 100 px for 10 units
    expect(map({ x: 0, y: 0 })).toEqual({ x: 10, y: 75 });
    expect(map({ x: 10, y: 5 })).toEqual({ x: 110, y: 25 });
  });

  test("puts a single point (or nothing) in the middle", () => {
    expect(fitToBox([{ x: 3, y: 3 }], 40, 20, 2)({ x: 3, y: 3 })).toEqual({
      x: 20,
      y: 10,
    });
    expect(fitToBox([], 40, 20, 2)({ x: 9, y: 9 })).toEqual({ x: 20, y: 10 });
  });
});
