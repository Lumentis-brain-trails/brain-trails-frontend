"use client";

/**
 * One Brain Landscape drawn with two measures: one is the height, the other the colour
 * (backend V3-0016, amended 2026-11-16).
 *
 * The ground is a triangle mesh painted point by point (`lib/landscapePaint.ts`), not a
 * Plotly surface: a surface can only look colours up in a scale, which steps between
 * categories and needs a second, translucent surface for "unknown here"; painted per
 * point, tasks blend into each other and colour fades into grey without an edge. The
 * height's contour lines are drawn by a surface with its ground hidden.
 *
 * Several landscapes on a page share one camera, like the comparison view's columns:
 * turning one turns the others, so the same place is in the same spot on each.
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import { type Camera } from "@/components/compare/LandscapeSurface";
import { type BrainLandscape } from "@/lib/brainLandscape";
import { triangulate } from "@/lib/landscapePaint";
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
/** How far above the ground the contour lines float, in heights, so none is buried. */
const CONTOUR_LIFT = 0.002;
/** "Nothing known here", per theme: a grey with no hue of the ramp in it. */
export const NO_DATA = { light: "#e4e4e8", dark: "#2a2d35" } as const;

export function MeasureSurface({
  landscape,
  xs,
  ys,
  z,
  colors,
  hover,
  camera,
  onCamera,
  plotHeight = 520,
  title,
}: {
  landscape: BrainLandscape;
  /** The grid everything below is on: the map's, or finer (`lib/refine.ts`). */
  xs: number[];
  ys: number[];
  /** The height at each point, `[row][column]`, about 0..1. */
  z: number[][];
  /** Each point's colour, row by row, from `paint`. */
  colors: string[];
  /** One hover line per grid point, `[row][column]`. */
  hover: string[][];
  camera: Camera;
  onCamera: (camera: Camera) => void;
  plotHeight?: number;
  title: string;
}) {
  const theme = useChartTheme();

  const ground = useMemo(() => {
    const columns = xs.length;
    const n = columns * ys.length;
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const pz = new Float32Array(n);
    const text: string[] = new Array(n);
    ys.forEach((y, j) =>
      xs.forEach((x, i) => {
        const c = j * columns + i;
        px[c] = x;
        py[c] = y;
        pz[c] = z[j]?.[i] ?? 0;
        text[c] = hover[j]?.[i] ?? "";
      })
    );
    return { px, py, pz, text, ...triangulate(columns, ys.length) };
  }, [xs, ys, z, hover]);
  const lifted = useMemo(
    () => z.map((row) => row.map((v) => v + CONTOUR_LIFT)),
    [z]
  );

  const data: Data[] = [
    {
      type: "mesh3d",
      x: ground.px,
      y: ground.py,
      z: ground.pz,
      i: ground.i,
      j: ground.j,
      k: ground.k,
      vertexcolor: colors,
      flatshading: false,
      text: ground.text,
      hovertemplate: "%{text}<extra></extra>",
      lighting: LIGHTING,
      lightposition: LIGHT,
    } as unknown as Data,
    {
      type: "surface",
      x: xs,
      y: ys,
      z: lifted,
      hidesurface: true,
      showscale: false,
      hoverinfo: "skip",
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
      },
    } as unknown as Data,
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
