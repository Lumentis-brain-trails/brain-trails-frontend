import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CHART_THEMES } from "@/lib/theme";
import type { BrainLandscape } from "@/lib/brainLandscape";
import { LandscapeMini, rampAt } from "./LandscapeMini";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const map = {
  bounds: [0, 10, 0, 10],
  grid: {
    nx: 2,
    ny: 2,
    z: [
      [0, 0.5],
      [0.5, 1],
    ],
  },
} as unknown as BrainLandscape;

test("the ramp starts and ends on the landscape's own colours", () => {
  const stops = CHART_THEMES.dark.landscape;
  expect(rampAt(stops, 0)).toEqual([0x10, 0x13, 0x1a]);
  expect(rampAt(stops, 1)).toEqual([0xff, 0x9c, 0xce]);
  expect(rampAt(stops, 2)).toEqual(rampAt(stops, 1));
});

test("the newest window is the dot, on the map's own frame", () => {
  const arcs: number[][] = [];
  const ctx = {
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: (x: number, y: number) => arcs.push([x, y]),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D
  );
  render(
    <LandscapeMini
      landscape={map}
      x={[1, 5]}
      y={[1, 2.5]}
      width={200}
      height={100}
      label="here"
    />
  );
  expect(screen.getByRole("img", { name: "here" })).toBeTruthy();
  // x 5 of 0-10 is the middle; y 2.5 is a quarter up, so three quarters down the canvas
  expect(arcs).toEqual([[100, 75]]);
});
