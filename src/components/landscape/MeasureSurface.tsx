"use client";

/**
 * One Brain Landscape drawn with two measures: one is the height, the other the colour
 * (backend V3-0016, amended 2026-11-16). With no colour measure it is the map as it
 * always was, coloured by its own height.
 *
 * The colour runs along the map's own ramp, low to high, scaled to the measure's range on
 * this map; a categorical measure (the main task) gets one colour per category. Where too
 * few windows went to say anything, the colour is a neutral grey rather than the ramp's
 * low end, so "nothing known here" never reads as "low here".
 *
 * Several landscapes on a page share one camera, like the comparison view's columns:
 * turning one turns the others, so the same place is in the same spot on each.
 */
import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";
import { type Camera } from "@/components/compare/LandscapeSurface";
import { type BrainLandscape, axes } from "@/lib/brainLandscape";
import {
  CATEGORY_COLORS,
  type ContinuousField,
  type MeasureField,
} from "@/lib/landscapeLayers";
import { useChartTheme, useTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const ASPECT = { x: 1.9, y: 1.9, z: 0.75 };
const LIGHTING = {
  ambient: 0.3,
  diffuse: 1,
  specular: 0.15,
  roughness: 0.55,
  fresnel: 0.1,
};
const LIGHT = { x: -1e4, y: 1e4, z: 2.5e3 };
const CONTOUR_STEP = 0.05;
/** The bottom of the colour scale kept for "too few windows here". */
const GAP = 0.04;
/** "Nothing known here", per theme: a grey with no hue of the ramp in it. */
export const NO_DATA = { light: "#e4e4e8", dark: "#2a2d35" } as const;

export type ColorScale = [number, string][];

/** What the colour means, for the key under the plot. */
export type ColorKey =
  | { type: "ramp"; low: number; high: number }
  | { type: "categories"; entries: { name: string; color: string }[] };

/**
 * The map's ramp as a colour measure uses it: from its first tinted stop up, since the
 * ramp's near-white foot would read as "nothing here" next to the no-data grey.
 */
export function measureRamp(
  ramp: readonly (readonly [number, string])[]
): [number, string][] {
  const from = ramp.find(([at]) => at > 0)?.[0] ?? 0;
  return ramp
    .filter(([at]) => at >= from)
    .map(([at, c]): [number, string] => [(at - from) / (1 - from || 1), c]);
}

/** The colour of the `k`-th category. */
export function categoryColor(k: number): string {
  return CATEGORY_COLORS[k % CATEGORY_COLORS.length];
}

/**
 * A measure as Plotly surface colours: one number per grid point in `[0, 1]`, the scale
 * that turns it into a colour (its bottom `GAP` is the no-data grey), and the key that
 * explains it.
 */
export function colorOf(
  field: MeasureField,
  ramp: readonly (readonly [number, string])[],
  noData: string
): { surface: number[][]; scale: ColorScale; key: ColorKey } {
  if (field.type === "categorical") {
    const k = Math.max(1, field.categories.length);
    const width = (1 - GAP) / k;
    const scale: ColorScale = [
      [0, noData],
      [GAP, noData],
    ];
    field.categories.forEach((_, i) => {
      scale.push([GAP + i * width, categoryColor(i)]);
      scale.push([Math.min(1, GAP + (i + 1) * width), categoryColor(i)]);
    });
    return {
      surface: field.category.map((row) =>
        row.map((c) => (c === null ? 0 : GAP + (c + 0.5) * width))
      ),
      scale,
      key: {
        type: "categories",
        entries: field.categories.map((name, i) => ({
          name,
          color: categoryColor(i),
        })),
      },
    };
  }
  let low = Infinity;
  let high = -Infinity;
  for (const row of field.value)
    for (const v of row) {
      if (v === null) continue;
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
  if (!Number.isFinite(low)) {
    low = 0;
    high = 1;
  }
  const span = high - low || 1;
  return {
    surface: field.value.map((row) =>
      row.map((v) => (v === null ? 0 : GAP + (1 - GAP) * ((v - low) / span)))
    ),
    scale: [
      [0, noData],
      [GAP, noData],
      ...measureRamp(ramp).map(([at, c]): [number, string] => [
        GAP + (1 - GAP) * at,
        c,
      ]),
    ],
    key: { type: "ramp", low, high },
  };
}

export function MeasureSurface({
  landscape,
  height: heightField,
  color,
  hover,
  camera,
  onCamera,
  plotHeight = 520,
  title,
}: {
  landscape: BrainLandscape;
  /** What the height draws. */
  height: ContinuousField;
  /** What the colour draws, from `colorOf`; null colours the surface by its height. */
  color: { surface: number[][]; scale: ColorScale } | null;
  /** One hover line per grid point, `[row][column]`. */
  hover: string[][];
  camera: Camera;
  onCamera: (camera: Camera) => void;
  plotHeight?: number;
  title: string;
}) {
  const theme = useChartTheme();
  const { xs, ys } = axes(landscape);

  const data: Data[] = [
    {
      type: "surface",
      x: xs,
      y: ys,
      z: heightField.z,
      ...(color
        ? { surfacecolor: color.surface, colorscale: color.scale }
        : {
            colorscale: theme.landscape.map(([at, c]) => [at, c]) as [
              number,
              string,
            ][],
          }),
      cmin: 0,
      cmax: 1,
      showscale: false,
      text: hover as unknown as string[],
      hovertemplate: "%{text}<extra></extra>",
      contours: {
        z: {
          show: true,
          start: CONTOUR_STEP,
          end: 1,
          size: CONTOUR_STEP,
          color: theme.contour,
          width: 1,
          highlight: false,
        },
        x: { highlight: false },
        y: { highlight: false },
      } as never,
      lighting: LIGHTING,
      lightposition: LIGHT,
    } as Data,
  ];

  const hidden = { visible: false, showspikes: false } as const;
  const [x0, x1, y0, y1] = landscape.bounds;
  const layout: Partial<Layout> = {
    height: plotHeight,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: "rgba(0,0,0,0)",
    showlegend: false,
    hoverlabel: {
      bgcolor: theme.ink,
      bordercolor: theme.ink,
      font: { color: theme.canvas, size: 12 },
    },
    // the shared camera replaces this one's; the reader's own turning is kept otherwise
    uirevision: JSON.stringify(camera),
    scene: {
      xaxis: { ...hidden, range: [x0, x1], autorange: false },
      yaxis: { ...hidden, range: [y0, y1], autorange: false },
      zaxis: hidden,
      aspectmode: "manual",
      aspectratio: ASPECT,
      camera,
      bgcolor: "rgba(0,0,0,0)",
    },
  };

  return (
    <div role="img" aria-label={title} className="w-full">
      <Plot
        data={data}
        layout={layout}
        config={{ displayModeBar: false, responsive: true }}
        useResizeHandler
        style={{ width: "100%", height: plotHeight }}
        onRelayout={(event) => {
          const next = (event as Record<string, unknown>)["scene.camera"];
          if (next) onCamera(next as Camera);
        }}
      />
    </div>
  );
}

/** The no-data grey of the current theme. */
export function useNoData(): string {
  return NO_DATA[useTheme()];
}
