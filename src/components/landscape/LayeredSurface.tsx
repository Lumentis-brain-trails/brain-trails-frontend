"use client";

/**
 * The Brain Landscape with its layers (backend V3-0016, amended 2026-11-13), two ways.
 *
 * **Map** (the default): the plane seen from above, each layer a coloured shadow that
 * darkens where it is high, ringed by smooth contour lines in its colour. Two shadows
 * blend where they overlap, so "where do these two meet" reads at a glance - which
 * stacked translucent 3D surfaces never managed: WebGL draws them without sorting, so
 * they speckle and seem to float.
 *
 * **Relief**: each layer a see-through 3D surface in one flat colour, lying on the floor
 * where nothing is raised; where the two cross, their colours mix.
 *
 * The map's own height (where all the time went) can show underneath.
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import { DEFAULT_CAMERA } from "@/components/compare/LandscapeSurface";
import { type BrainLandscape, axes } from "@/lib/brainLandscape";
import { type LayerField, rgba } from "@/lib/landscapeLayers";
import { useChartTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export type LayerView = "map" | "relief";

const ASPECT = { x: 1.9, y: 1.9, z: 0.75 };
const LIGHTING = {
  ambient: 0.3,
  diffuse: 1,
  specular: 0.15,
  roughness: 0.55,
  fresnel: 0.1,
};
const LIGHT = { x: -1e4, y: 1e4, z: 2.5e3 };
/** Contour levels: a ring every fifth of the height, smoothed. */
const STEP = 0.2;
const SMOOTHING = 1.3;
/** The densest a shadow gets, so the other shows through it. */
const SHADOW = 0.6;
/** How see-through a relief layer is: low, so the other and the ground show through. */
const RELIEF_OPACITY = 0.25;
/** The second relief layer's lift above the first, in heights. */
const SEPARATION = 0.004;

export interface DrawnLayer {
  id: string;
  name: string;
  color: string;
  field: LayerField;
  /** One hover line per grid point, `[row][column]`. */
  hover: string[][];
}

export function LayeredSurface({
  landscape,
  layers,
  ground,
  view,
  height = 560,
  title,
}: {
  landscape: BrainLandscape;
  layers: readonly DrawnLayer[];
  /** Show the map's own height (where all the time went) underneath. */
  ground: boolean;
  view: LayerView;
  height?: number;
  title: string;
}) {
  const theme = useChartTheme();
  const { xs, ys } = useMemo(() => axes(landscape), [landscape]);
  const [x0, x1, y0, y1] = landscape.bounds;
  const data = useMemo(
    () =>
      view === "map"
        ? mapView(xs, ys, landscape, layers, ground, theme)
        : reliefView(xs, ys, layers),
    [view, xs, ys, landscape, layers, ground, theme]
  );

  const hoverlabel = {
    bgcolor: theme.ink,
    bordercolor: theme.ink,
    font: { color: theme.canvas, size: 12 },
  };
  const layout: Partial<Layout> =
    view === "map"
      ? {
          height,
          margin: { l: 0, r: 0, t: 0, b: 0 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          showlegend: false,
          hoverlabel,
          xaxis: {
            visible: false,
            range: [x0, x1],
            constrain: "domain",
            fixedrange: true,
          },
          yaxis: {
            visible: false,
            range: [y0, y1],
            scaleanchor: "x",
            constrain: "domain",
            fixedrange: true,
          },
        }
      : {
          height,
          margin: { l: 0, r: 0, t: 0, b: 0 },
          paper_bgcolor: "rgba(0,0,0,0)",
          showlegend: false,
          hoverlabel,
          uirevision: "relief",
          scene: {
            xaxis: { visible: false, range: [x0, x1], autorange: false },
            yaxis: { visible: false, range: [y0, y1], autorange: false },
            zaxis: { visible: false, range: [0, 1.05], autorange: false },
            aspectmode: "manual",
            aspectratio: ASPECT,
            camera: DEFAULT_CAMERA,
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
        style={{ width: "100%", height }}
      />
    </div>
  );
}

type Theme = ReturnType<typeof useChartTheme>;

/** The plane from above: the ground faint, each layer a translucent shadow with rings. */
function mapView(
  xs: number[],
  ys: number[],
  landscape: BrainLandscape,
  layers: readonly DrawnLayer[],
  ground: boolean,
  theme: Theme
): Data[] {
  return [
    ...(ground
      ? [
          {
            type: "heatmap",
            x: xs,
            y: ys,
            z: landscape.grid.z,
            zsmooth: "best",
            zmin: 0,
            zmax: 1,
            showscale: false,
            hoverinfo: "skip",
            opacity: 0.35,
            colorscale: theme.landscape.map(([at, c]) => [at, c]),
          } as Data,
        ]
      : []),
    ...layers.map((layer): Data => {
      // an energy's wells are what matter: its shadow is the depth below the ceiling,
      // darkest at the bottom of a well, clear on the high plateau
      const depth =
        layer.field.unit === "energy"
          ? layer.field.z.map((row) => row.map((v) => 1 - v))
          : layer.field.z;
      return {
        type: "contour",
        x: xs,
        y: ys,
        z: depth,
        zmin: 0,
        zmax: 1,
        autocontour: false,
        contours: { coloring: "fill", start: STEP, end: 1, size: STEP },
        line: { color: layer.color, width: 1.4, smoothing: SMOOTHING },
        colorscale: [
          [0, rgba(layer.color, 0)],
          [1, rgba(layer.color, SHADOW)],
        ],
        showscale: false,
        text: layer.hover,
        hovertemplate: "%{text}<extra></extra>",
      } as Data;
    }),
  ];
}

/**
 * One see-through surface per layer, each a single flat colour - no gradient - so where
 * they cross the two colours simply mix. Each is drawn on the whole grid, lying flat on
 * the floor where nothing is raised, so it stands on the ground instead of floating;
 * the second sits a hair above the first so the two flat sheets never flicker together.
 * The map's own height is the map view's floor; here the layers are the ground.
 */
function reliefView(
  xs: number[],
  ys: number[],
  layers: readonly DrawnLayer[]
): Data[] {
  return [
    ...layers.map(
      (layer, k): Data =>
        ({
          type: "surface",
          x: xs,
          y: ys,
          z: layer.field.z.map((row) => row.map((v) => v + k * SEPARATION)),
          surfacecolor: layer.field.z,
          cmin: 0,
          cmax: 1,
          colorscale: [
            [0, layer.color],
            [1, layer.color],
          ],
          opacity: RELIEF_OPACITY,
          showscale: false,
          text: layer.hover,
          hovertemplate: "%{text}<extra></extra>",
          contours: {
            z: {
              show: true,
              start: STEP,
              end: 1,
              size: STEP,
              color: layer.color,
              width: 2,
              highlight: false,
            },
            x: { highlight: false },
            y: { highlight: false },
          },
          lighting: LIGHTING,
          lightposition: LIGHT,
        }) as unknown as Data
    ),
  ];
}
