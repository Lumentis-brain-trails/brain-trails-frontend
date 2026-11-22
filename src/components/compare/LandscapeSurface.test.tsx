import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import type { BrainLandscape } from "@/lib/brainLandscape";
import { LandscapeSurface } from "./LandscapeSurface";

// Plotly needs WebGL: the plot is replaced by what it was given, and every figure it
// was handed is kept, to see when it would have been redrawn
const figures = vi.hoisted(() => [] as { data: unknown; layout: unknown }[]);
vi.mock("next/dynamic", () => ({
  default: () => (props: { data: unknown; layout: unknown }) => {
    figures.push({ data: props.data, layout: props.layout });
    return <pre data-testid="plot">{JSON.stringify(props.data)}</pre>;
  },
}));

afterEach(() => {
  cleanup();
  figures.length = 0;
});

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
  visible?: boolean;
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

test("a live position off the map hides its traces instead of dropping them", () => {
  // a figure with fewer traces is rebuilt from scratch: a flash at every crossing
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LandscapeSurface
        landscape={map}
        cursor={{ x: 50, y: 50 }}
        live
        hover={false}
        scheme="dark"
        title="map"
      />
    </NextIntlClientProvider>
  );
  const all: Trace[] = JSON.parse(screen.getByTestId("plot").textContent ?? "[]");
  expect(all).toHaveLength(4);
  expect(all.slice(1).map((t) => t.visible)).toEqual([false, false, false]);
});

test("a render that changes nothing on the map hands Plotly the same figure", () => {
  const trails = [{ x: [1, 2], y: [1, 2], colors: ["#fff", "#fff"] }];
  const view = (cursor: { x: number; y: number }) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <LandscapeSurface
        landscape={map}
        trails={trails}
        cursor={cursor}
        live
        hover={false}
        scheme="dark"
        title="map"
      />
    </NextIntlClientProvider>
  );
  const { rerender } = render(view({ x: 5, y: 5 }));
  // a live room re-renders on every frame with a new cursor object at the same place
  rerender(view({ x: 5, y: 5 }));
  const [first, second] = figures.slice(-2);
  expect(second.data).toBe(first.data);
  expect(second.layout).toBe(first.layout);
  // the dot moved: a new figure
  rerender(view({ x: 6, y: 5 }));
  expect(figures.at(-1)?.data).not.toBe(first.data);
});
