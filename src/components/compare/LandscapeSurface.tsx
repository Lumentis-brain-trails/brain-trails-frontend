"use client";

/**
 * A person's brain landscape in 3D, with trails resting on it (backend V3-0013).
 *
 * Height is where the person's windows landed, blurred at the map's own fixed scale:
 * peaks are where they spent the most time, shaded from one side so the relief reads. Hovering the ground says what was happening
 * there, from every recording that went there. A trail is drawn **on** the surface - each
 * window lifted to the ground's height at its place - so it rides over the peaks it
 * visited instead of floating above a flat drawing.
 *
 * The vertical axis is kept low (`ASPECT`) so ridges hide as little of a trail as
 * possible, and the camera can be shared: the comparison view hands both columns one
 * camera, so turning one landscape turns the other and the two blocks stay comparable.
 */
import dynamic from "next/dynamic";
import { useMemo, useSyncExternalStore } from "react";
import type { Data, Layout } from "plotly.js";
import { useLabelNamer } from "@/components/compare/useLabelNamer";
import {
  type BrainLandscape,
  axes,
  framedTrail,
  heightAt,
  hoverMatrix,
  onMap,
} from "@/lib/brainLandscape";
import { useChartTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/**
 * The scene box: low (height two fifths of the width) so ridges hide little, and as large as
 * the plot can hold - which on a phone, where a comparison column is a few hundred pixels
 * wide, is much less.
 */
const ASPECT = { x: 1.9, y: 1.9, z: 0.75 };
const ASPECT_NARROW = { x: 0.85, y: 0.85, z: 0.34 };
const NARROW = "(max-width: 640px)";
/** A narrow scene is small; a tall plot around it would only add empty space. */
const NARROW_MAX_HEIGHT = 220;

function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia?.(NARROW);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia?.(NARROW).matches ?? false,
    () => false
  );
}
/**
 * Low ambient light and a strong light from one side, low over the ground, so every slope
 * facing away falls into shade and the relief reads at a glance; a little gloss on the
 * slopes facing it. The surface is opaque: a translucent one washes the shading out.
 */
const LIGHTING = {
  ambient: 0.3,
  diffuse: 1,
  specular: 0.15,
  roughness: 0.55,
  fresnel: 0.1,
};
const LIGHT = { x: -1e4, y: 1e4, z: 2.5e3 };
const CONTOUR_STEP = 0.05;
/** How far above the ground a trail rides, in landscape heights. */
const LIFT = 0.025;

export type Camera = NonNullable<NonNullable<Layout["scene"]>["camera"]>;

export const DEFAULT_CAMERA: Camera = {
  eye: { x: 1.05, y: -1.25, z: 1.0 },
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: -0.2 },
};

export interface SurfaceTrail {
  x: readonly number[];
  y: readonly number[];
  /** One colour per window. */
  colors: readonly string[];
  /** Plotly marker symbols, one per window: what the person did. */
  symbols?: readonly string[];
  /** One hover line per window. */
  text?: readonly string[];
  /** Draw the line only, no markers: a recording's context, not the lit block. */
  faint?: boolean;
}

export function LandscapeSurface({
  landscape,
  trails = [],
  cursor = null,
  height = 420,
  camera = DEFAULT_CAMERA,
  onCamera,
  hover = true,
  title,
}: {
  landscape: BrainLandscape;
  trails?: readonly SurfaceTrail[];
  /** The window under a column's slider. */
  cursor?: { x: number; y: number } | null;
  height?: number;
  camera?: Camera;
  onCamera?: (camera: Camera) => void;
  /** Hover the ground; off where a page has its own way to read it. */
  hover?: boolean;
  title: string;
}) {
  const theme = useChartTheme();
  const namer = useLabelNamer();
  const narrow = useNarrow();
  const plotHeight = narrow ? Math.min(height, NARROW_MAX_HEIGHT) : height;
  const ground = useMemo(() => {
    const { xs, ys } = axes(landscape);
    return {
      xs,
      ys,
      text: hover ? hoverMatrix(landscape, namer.category) : undefined,
    };
  }, [hover, landscape, namer.category]);

  const lift = (x: number, y: number) => heightAt(landscape, x, y) + LIFT;

  const data: Data[] = [
    {
      type: "surface",
      x: ground.xs,
      y: ground.ys,
      z: landscape.grid.z,
      ...(hover && ground.text
        ? {
            text: ground.text as unknown as string[],
            hovertemplate: "%{text}<extra></extra>",
          }
        : { hoverinfo: "skip" as const }),
      showscale: false,
      colorscale: theme.landscape.map(([at, colour]) => [at, colour]) as [
        number,
        string,
      ][],
      // contour lines every twentieth of the peak: the landscape read as a topographic
      // map, fine enough that two close hills keep their own rings
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
    // Optional keys are left out, never set to undefined: Plotly's data cleaning reads
    // `"line" in trace.marker` and throws on a marker that is present but undefined.
    ...trails.map((trail): Data => {
      const { x, y } = framedTrail(landscape, trail.x, trail.y);
      return {
        type: "scatter3d",
        mode: trail.faint ? "lines" : "lines+markers",
        x,
        y,
        z: x.map((xi, i) => {
          const yi = y[i];
          return xi === null || yi === null ? null : lift(xi, yi);
        }),
        connectgaps: false,
        line: {
          color: trail.faint ? theme.ink3 : theme.ink,
          width: trail.faint ? 2 : 3,
        },
        opacity: trail.faint ? 0.45 : 1,
        ...(trail.text
          ? { text: [...trail.text], hovertemplate: "%{text}<extra></extra>" }
          : { hoverinfo: "skip" as const }),
        ...(trail.faint
          ? {}
          : {
              marker: {
                size: 4,
                color: [...trail.colors],
                symbol: trail.symbols
                  ? ([...trail.symbols] as never)
                  : "circle",
                line: { color: theme.canvas, width: 0.5 },
              },
            }),
      } as Data;
    }),
    ...(cursor && onMap(landscape, cursor.x, cursor.y)
      ? [
          {
            type: "scatter3d",
            mode: "markers",
            x: [cursor.x],
            y: [cursor.y],
            z: [lift(cursor.x, cursor.y) + LIFT],
            hoverinfo: "skip",
            marker: {
              size: 9,
              color: theme.canvas,
              symbol: "circle-open",
              line: { color: theme.ink, width: 3 },
            },
          } as Data,
        ]
      : []),
  ];

  const hidden = { visible: false, showspikes: false } as const;
  // the scene is the map's frame, not every point's: the backend frames 90% of the
  // windows, and a trail's outliers fall outside it rather than zooming the map out
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
    // a new camera from the other column replaces this one; the reader's own turning is
    // kept between renders otherwise
    uirevision: JSON.stringify(camera),
    scene: {
      xaxis: { ...hidden, range: [x0, x1], autorange: false },
      yaxis: { ...hidden, range: [y0, y1], autorange: false },
      zaxis: hidden,
      aspectmode: "manual",
      aspectratio: narrow ? ASPECT_NARROW : ASPECT,
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
          if (next && onCamera) onCamera(next as Camera);
        }}
      />
    </div>
  );
}
