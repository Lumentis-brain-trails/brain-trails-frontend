import { describe, expect, it } from "vitest";
import type { CategoricalField, ContinuousField } from "./landscapeLayers";
import {
  hexToRgb,
  knownOf,
  measureRamp,
  paint,
  rampAt,
  smoothstep,
  triangulate,
} from "./landscapePaint";

const RAMP = [
  [0, "#ffffff"],
  [0.5, "#0000ff"],
  [1, "#ff0000"],
] as const;
const GREY = "#808080";

describe("landscapePaint", () => {
  it("reads hex colours and walks a ramp linearly", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(hexToRgb("#f00")).toEqual([255, 0, 0]);
    expect(hexToRgb("nope")).toEqual([128, 128, 128]);
    const stops = RAMP.map(([at, c]) => [at, hexToRgb(c)] as const);
    expect(rampAt(stops, 0)).toEqual([255, 255, 255]);
    expect(rampAt(stops, 0.25)).toEqual([127.5, 127.5, 255]);
    expect(rampAt(stops, 0.75)).toEqual([127.5, 0, 127.5]);
    expect(rampAt(stops, 2)).toEqual([255, 0, 0]);
    expect(measureRamp(RAMP)).toEqual([
      [0, "#0000ff"],
      [1, "#ff0000"],
    ]);
  });

  it("eases between its edges", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it("paints the map by its height without a measure", () => {
    const { colors, key } = paint(null, [[0, 1]], RAMP, GREY, 1);
    expect(colors).toEqual(["rgb(255,255,255)", "rgb(255,0,0)"]);
    expect(key).toEqual({ type: "ramp", low: 0, high: 1 });
  });

  it("paints a value on the ramp and fades it into grey where few windows went", () => {
    const field: ContinuousField = {
      type: "continuous",
      z: [[0, 0, 0]],
      value: [[2, 4, null]],
      unit: "band",
      support: [[5, 5, 0]],
    };
    const { colors, key } = paint(field, [[0, 0, 0]], RAMP, GREY, 1);
    expect(key).toEqual({ type: "ramp", low: 2, high: 4 });
    expect(colors).toEqual([
      "rgb(0,0,255)",
      "rgb(255,0,0)",
      "rgb(128,128,128)",
    ]);
    // refined, the grey comes in smoothly, never in one step
    const known = knownOf(
      {
        ...field,
        value: [
          [2, 4],
          [2, 4],
        ],
        support: [
          [1, 0],
          [1, 0],
        ],
      },
      4
    )[0];
    for (let i = 1; i < known.length; i += 1)
      expect(known[i]).toBeLessThanOrEqual(known[i - 1]);
    expect(known.some((k) => k > 0 && k < 1)).toBe(true);
  });

  it("without support, greys where the value is blank", () => {
    const field: ContinuousField = {
      type: "continuous",
      z: [[0, 0]],
      value: [[1, null]],
      unit: "seconds",
    };
    expect(knownOf(field, 1)).toEqual([[1, 0]]);
  });

  it("blends the main task's colours by their shares, the larger sharply favoured", () => {
    const field: CategoricalField = {
      type: "categorical",
      category: [[0, 0, null]],
      share: [[1, 0.5, null]],
      weights: [[[1, 0.5, 0]], [[0, 0.5, 0]], [[0, 0, 0]]],
      support: [[5, 5, 0]],
      categories: ["A", "B", "C"],
      shown: [0, 1],
    };
    const { colors, key } = paint(field, [[0, 0, 0]], RAMP, GREY, 1);
    const [a, even, none] = colors;
    expect(a).toBe("rgb(42,120,214)");
    expect(even).toBe("rgb(134,103,185)");
    expect(none).toBe("rgb(128,128,128)");
    expect(key).toEqual({
      type: "categories",
      entries: [
        { name: "A", color: "#2a78d6" },
        { name: "B", color: "#e2569c" },
      ],
    });
  });

  it("cuts a grid into two triangles a cell", () => {
    const { i, j, k } = triangulate(3, 2);
    expect(i.length).toBe(4);
    expect([i[0], j[0], k[0]]).toEqual([0, 1, 4]);
    expect([i[1], j[1], k[1]]).toEqual([0, 4, 3]);
    expect([i[3], j[3], k[3]]).toEqual([1, 5, 4]);
  });
});
