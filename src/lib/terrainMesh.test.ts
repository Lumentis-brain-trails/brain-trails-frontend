import { describe, expect, it } from "vitest";
import { terrainGeometry, trailOnTerrain } from "./terrainMesh";
import type { Field } from "./landscape";

function makeField(): Field {
  // A simple 3x3 grid: one basin at the centre (z=0), a ridge at the corners.
  return {
    xs: [-1, 0, 1],
    ys: [-1, 0, 1],
    z: [
      [2, 1, 2],
      [1, 0, 1],
      [2, 1, 2],
    ],
  };
}

describe("terrainGeometry", () => {
  it("returns one vertex per field cell, row-major", () => {
    const geo = terrainGeometry(makeField(), 1);
    expect(geo.resolution).toEqual({ x: 3, y: 3 });
    expect(geo.vertices).toHaveLength(9);
    expect(geo.vertices[0]).toEqual({ x: -1, z: -1, y: 2 });
    expect(geo.vertices[4]).toEqual({ x: 0, z: 0, y: 0 });
  });

  it("scales height by heightScale and tracks min/max", () => {
    const geo = terrainGeometry(makeField(), 3);
    expect(geo.minHeight).toBe(0);
    expect(geo.maxHeight).toBe(6);
    expect(geo.vertices[4].y).toBe(0);
    expect(geo.vertices[0].y).toBe(6);
  });

  it("is empty for an empty field", () => {
    const geo = terrainGeometry({ xs: [], ys: [], z: [] }, 1);
    expect(geo.vertices).toEqual([]);
    expect(geo.resolution).toEqual({ x: 0, y: 0 });
  });
});

describe("trailOnTerrain", () => {
  it("maps (x, y) to (x, z) and samples the field for height, plus hover", () => {
    const points = [
      { x: 0, y: 0, t: 0 },
      { x: -1, y: -1, t: 1 },
    ];
    const out = trailOnTerrain(points, makeField(), 2, 0.1);
    expect(out).toEqual([
      { x: 0, z: 0, y: 0 * 2 + 0.1, t: 0 },
      { x: -1, z: -1, y: 2 * 2 + 0.1, t: 1 },
    ]);
  });

  it("snaps to the nearest grid cell for points between vertices", () => {
    const out = trailOnTerrain([{ x: 0.4, y: -0.4, t: 0 }], makeField(), 1, 0);
    // nearest to x=0.4 is x=0 (col 1): |0.4-0|=0.4 < |0.4-1|=0.6.
    // nearest to y=-0.4 is y=0 (row 1): |-0.4-0|=0.4 < |-0.4-(-1)|=0.6.
    // z[row=1][col=1] = 0.
    expect(out[0]).toEqual({ x: 0.4, z: -0.4, y: 0, t: 0 });
  });

  it("is empty for an empty field", () => {
    expect(
      trailOnTerrain([{ x: 0, y: 0, t: 0 }], { xs: [], ys: [], z: [] }, 1)
    ).toEqual([]);
  });
});
