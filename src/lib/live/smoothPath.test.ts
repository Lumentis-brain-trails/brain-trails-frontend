import { describe, expect, test } from "vitest";
import { curveSegments, ease, interpolate } from "./smoothPath";

describe("the live trail's motion", () => {
  test("a glide moves every point and grows the new one out of the old end", () => {
    const from = [
      [0, 0],
      [1, 0],
    ] as const;
    const to = [
      [0, 2],
      [1, 2],
      [3, 3],
    ] as const;
    expect(interpolate(from, to, 0)).toEqual([
      [0, 0],
      [1, 0],
      [1, 0], // the new point starts where the trail ended
    ]);
    expect(interpolate(from, to, 1)).toEqual(to);
    const half = interpolate(from, to, 0.5);
    expect(half[0][1]).toBeCloseTo(2 * ease(0.5));
    expect(half[2][0]).toBeCloseTo(1 + 2 * ease(0.5));
    // nothing drawn yet: the picture as it is
    expect(interpolate([], to, 0)).toEqual(to);
  });

  test("the curve passes through every point with no corner between segments", () => {
    const points = [
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
    ] as const;
    const segments = curveSegments(points);
    expect(segments).toHaveLength(3);
    segments.forEach(([p0, , , p1], i) => {
      expect(p0).toEqual(points[i]);
      expect(p1).toEqual(points[i + 1]);
    });
    // the tangent at a shared point is the same on both sides
    const [, , inC2, joint] = segments[0];
    const [, outC1] = segments[1];
    expect(joint[0] - inC2[0]).toBeCloseTo(outC1[0] - joint[0]);
    expect(joint[1] - inC2[1]).toBeCloseTo(outC1[1] - joint[1]);
  });
});
