import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import type { BrainLandscape } from "@/lib/brainLandscape";
import { LandscapeSurface } from "./LandscapeSurface";

// Plotly needs WebGL: the plot is replaced by what it was given
vi.mock("next/dynamic", () => ({
  default: () => (props: { data: unknown }) => (
    <pre data-testid="plot">{JSON.stringify(props.data)}</pre>
  ),
}));

afterEach(cleanup);

const map = {
  bounds: [0, 10, 0, 10],
  grid: {
    nx: 2,
    ny: 2,
    z: [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
  },
  categories: [],
  cells: [],
} as unknown as BrainLandscape;

type Trace = {
  type: string;
  mode?: string;
  x: number[];
  z: number[];
  marker?: { size?: number | number[]; symbol?: string };
};

function traces(live: boolean): Trace[] {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LandscapeSurface
        landscape={map}
        cursor={{ x: 5, y: 5 }}
        live={live}
        hover={false}
        scheme="dark"
        title="map"
      />
    </NextIntlClientProvider>
  );
  return JSON.parse(screen.getByTestId("plot").textContent ?? "[]");
}

test("a live position stands on a stem above the hills, with a halo", () => {
  const [, stem, halo, dot] = traces(true);
  expect(stem.mode).toBe("lines");
  // from just over the ground (0.5 + 0.025) to well above it: no ridge hides the dot
  expect(stem.z[0]).toBeCloseTo(0.525, 5);
  expect(stem.z[1]).toBeCloseTo(0.875, 5);
  expect(halo.marker?.size).toEqual([6, 22]);
  expect(dot.z[0]).toBeCloseTo(0.875, 5);
  expect(dot.x).toEqual([5]);
});

test("a cursor that is not live is the comparison's open ring", () => {
  const all = traces(false);
  expect(all).toHaveLength(2);
  expect(all[1].marker?.symbol).toBe("circle-open");
});
