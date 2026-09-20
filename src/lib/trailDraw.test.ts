import { describe, expect, it } from "vitest";
import { trailSamples, visitedRegions } from "@/lib/trailDraw";
import type { TrailPoint } from "@/lib/types";

const at = (i: number, x: number, y: number): TrailPoint => ({
  idx: i,
  t_start: i,
  t_end: i + 1,
  pc1: x,
  pc2: y,
});

/** `count` windows marching along x, one per second. */
const line = (count: number): TrailPoint[] =>
  Array.from({ length: count }, (_, i) => at(i, i, 0));

describe("trailSamples", () => {
  it("leaves a short recording exactly as it was measured", () => {
    const out = trailSamples(line(5), 90);
    expect(out).toHaveLength(5);
    expect(out.map((s) => s.x)).toEqual([0, 1, 2, 3, 4]);
    expect(out.every((s) => s.n === 1)).toBe(true);
  });

  it("averages a long one down to about the target", () => {
    const out = trailSamples(line(1000), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(90);
    // the first sample is the mean of the first run, not its first window
    expect(out[0].x).toBeCloseTo(4.5);
    expect(out[0].n).toBe(10);
  });

  it("keeps the time of the first window of each run", () => {
    const out = trailSamples(line(100), 10);
    expect(out[0].t).toBe(0);
    expect(out[1].t).toBe(10);
  });

  it("lets an excursion bend the path instead of dropping it", () => {
    const points = line(20);
    points[7] = at(7, 7, 100);
    const [first, second] = trailSamples(points, 4);
    expect(second.y).toBeGreaterThan(0);
    expect(first.y).toBe(0);
  });

  it("covers every window even when the count does not divide", () => {
    const out = trailSamples(line(7), 3);
    expect(out.reduce((acc, s) => acc + s.n, 0)).toBe(7);
  });
});

describe("visitedRegions", () => {
  const regions = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 50, y: 0 },
  ];

  it("keeps the regions the path came near and drops the rest", () => {
    expect(visitedRegions(regions, [{ x: 0, y: 0 }], 6)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
  });

  it("draws nothing when there is no path", () => {
    expect(visitedRegions(regions, [], 100)).toEqual([]);
  });

  it("measures the distance from the nearest sample, not the first", () => {
    const samples = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ];
    expect(visitedRegions(regions, samples, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
  });
});
