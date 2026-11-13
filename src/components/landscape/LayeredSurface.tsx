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
 * **Relief**: one solid surface, standing on the ground everywhere, whose height is the
 * higher of the layers and whose colour leans to the higher one's: the first layer's
 * colour where it dominates, the second's where that one does, the ground's where
 * neither rises (or both rise alike - the map view shows that overlap best).
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
/** Height over which the relief's colour goes from the ground's to a layer's. */
const RAMP = 0.3;

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
        : reliefView(xs, ys, landscape, layers, ground, theme),
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
 * One solid relief: the higher layer's height, coloured from the first layer's colour
 * to the second's by their shares; the ground's colour where both are low.
 */
function reliefView(
  xs: number[],
  ys: number[],
  landscape: BrainLandscape,
  layers: readonly DrawnLayer[],
  ground: boolean,
  theme: Theme
): Data[] {
  const [a, b] = layers;
  const floor = theme.landscape[0][1];
  const at = (layer: DrawnLayer | undefined, j: number, i: number) =>
    layer?.field.z[j]?.[i] ?? 0;
  const z = landscape.grid.z.map((row, j) =>
    row.map((base, i) => {
      const top = Math.max(0, at(a, j, i), at(b, j, i));
      // where nothing is raised, the ground's own relief, kept low, shows where time went
      return ground ? Math.max(top, base * 0.12) : top;
    })
  );
  // colour runs continuously, so no boundary is drawn in steps: the ground's colour
  // where nothing is raised, ramping to a layer's colour as it rises; with two layers,
  // towards whichever is higher (where both stand equally high it stays between them)
  const color = landscape.grid.z.map((row, j) =>
    row.map((_, i) => {
      const za = at(a, j, i);
      const zb = at(b, j, i);
      const strength = Math.min(1, Math.max(za, zb) / RAMP);
      if (!b) return strength;
      const lean = zb / (za + zb || 1); // 0: all a, 1: all b
      return 0.5 + 0.5 * strength * (2 * lean - 1);
    })
  );
  const hover = landscape.grid.z.map((row, j) =>
    row.map((_, i) =>
      layers
        .map((l) => l.hover[j]?.[i])
        .filter(Boolean)
        .join("<br>")
    )
  );
  const colorscale = b
    ? [
        [0, a.color],
        [0.5, floor],
        [1, b.color],
      ]
    : [
        [0, floor],
        [1, a.color],
      ];
  return [
    {
      type: "surface",
      x: xs,
      y: ys,
      z,
      surfacecolor: color,
      cmin: 0,
      cmax: 1,
      colorscale,
      showscale: false,
      text: hover,
      hovertemplate: "%{text}<extra></extra>",
      contours: {
        z: {
          show: true,
          start: STEP,
          end: 1,
          size: STEP,
          color: theme.contour,
          width: 1,
          highlight: false,
        },
        x: { highlight: false },
        y: { highlight: false },
      },
      lighting: LIGHTING,
      lightposition: LIGHT,
    } as unknown as Data,
  ];
}
