import { describe, expect, test } from "vitest";
import {
  polylinePath,
  trailBands,
  trailCurve,
  type CurvePoint,
  smoothPath,
} from "./trailPath";

/** `count` windows on a circle: curvature everywhere, no repeated point. */
function arc(count: number): CurvePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / (count - 1)) * Math.PI;
    return { x: Math.cos(a), y: Math.sin(a), u: i / (count - 1) };
  });
}

describe("trailCurve", () => {
  test("too short to smooth comes back unchanged", () => {
    expect(trailCurve([])).toEqual([]);
    const one = [{ x: 1, y: 2, u: 0 }];
    expect(trailCurve(one)).toEqual(one);
  });

  test("passes through every window it was given", () => {
    const points = arc(6);
    const curve = trailCurve(points, 120);
    for (const p of points) {
      expect(
        curve.some(
          (c) => Math.abs(c.x - p.x) < 1e-9 && Math.abs(c.y - p.y) < 1e-9
        )
      ).toBe(true);
    }
    expect(curve[0]).toEqual(points[0]);
    expect(curve[curve.length - 1]).toEqual(points[points.length - 1]);
  });

  test("time only ever moves forward, from 0 to 1", () => {
    const curve = trailCurve(arc(8), 200);
    expect(curve[0].u).toBe(0);
    expect(curve[curve.length - 1].u).toBe(1);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].u).toBeGreaterThanOrEqual(curve[i - 1].u);
    }
  });

  test("a straight run stays straight instead of bulging", () => {
    const points: CurvePoint[] = [0, 1, 2, 3].map((i) => ({
      x: i,
      y: 0,
      u: i / 3,
    }));
    for (const p of trailCurve(points, 60)) expect(p.y).toBeCloseTo(0, 12);
  });

  test("windows that repeat do not produce NaN", () => {
    // A session that settles gives windows a hair apart, which is what makes the
    // uniform parameterisation blow up; centripetal must survive the exact tie.
    const points: CurvePoint[] = [
      { x: 0, y: 0, u: 0 },
      { x: 1, y: 1, u: 0.25 },
      { x: 1, y: 1, u: 0.5 },
      { x: 1, y: 1, u: 0.75 },
      { x: 2, y: 0, u: 1 },
    ];
    for (const p of trailCurve(points, 80)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  test("asking for more samples never moves the curve off the windows", () => {
    const points = arc(5);
    const coarse = trailCurve(points, 40);
    const fine = trailCurve(points, 400);
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(fine[0]).toEqual(coarse[0]);
    expect(fine[fine.length - 1]).toEqual(coarse[coarse.length - 1]);
  });
});

describe("trailBands", () => {
  test("nothing to stroke below two points", () => {
    expect(trailBands([{ x: 0, y: 0, u: 0 }])).toEqual([]);
  });

  test("the bands cover the curve and meet without a gap", () => {
    const curve = trailCurve(arc(6), 240);
    const bands = trailBands(curve, 12);
    expect(bands.length).toBeGreaterThan(1);
    expect(bands[0].points[0]).toEqual(curve[0]);
    expect(bands[bands.length - 1].points.at(-1)).toEqual(curve.at(-1));
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].points[0]).toEqual(bands[i - 1].points.at(-1));
    }
    for (const band of bands) expect(band.inRange).toBe(true);
  });

  test("a range splits the ribbon into emphasised and dimmed runs", () => {
    const curve = trailCurve(arc(6), 240);
    const bands = trailBands(curve, 12, [0.4, 0.6]);
    expect(bands.some((b) => b.inRange)).toBe(true);
    expect(bands.some((b) => !b.inRange)).toBe(true);
    for (const band of bands.filter((b) => b.inRange)) {
      expect(band.u).toBeGreaterThanOrEqual(0.4);
      expect(band.u).toBeLessThanOrEqual(0.6);
    }
  });

  test("an empty range dims the whole ribbon", () => {
    const bands = trailBands(trailCurve(arc(4), 80), 8, [1, 0]);
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) expect(band.inRange).toBe(false);
  });
});

describe("polylinePath", () => {
  test("one move, then a line per point, at two decimals", () => {
    expect(
      polylinePath([
        { x: 1.234, y: 2, u: 0 },
        { x: 3, y: 4.567, u: 1 },
      ])
    ).toBe("M1.23 2.00L3.00 4.57");
  });
});

describe("smoothPath", () => {
  test("takes the zigzag off a straight course", () => {
    const zigzag = Array.from({ length: 20 }, (_, i) => ({
      x: i,
      y: i % 2 === 0 ? 1 : -1,
      t: i,
    }));
    const smooth = smoothPath(zigzag);
    const swing = (ps: { y: number }[]) =>
      Math.max(...ps.slice(5, 15).map((p) => Math.abs(p.y)));
    expect(swing(smooth)).toBeLessThan(0.3 * swing(zigzag));
    // the course and everything else a point carries are kept
    expect(smooth[10].x).toBeCloseTo(10);
    expect(smooth[3].t).toBe(3);
  });

  test("leaves short trails and a zero width alone", () => {
    const two = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(smoothPath(two)).toEqual(two);
    expect(smoothPath(two.concat({ x: 2, y: 0 }), 0)).toHaveLength(3);
  });
});
