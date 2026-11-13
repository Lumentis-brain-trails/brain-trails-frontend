"use client";

/**
 * The Brain Landscape with its other layers raised over the same plane (backend
 * V3-0016, amended 2026-11-13).
 *
 * Each layer is a translucent surface in the reader's colour, shaded from that colour
 * down to a dark version of it, so the light on its slopes still reads and several can
 * be seen through each other: where two layers' hills sit on the same ground, the
 * colours mix. The map's own height (where all the time went) can stay underneath,
 * faint, as the ground everything stands on.
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import { DEFAULT_CAMERA } from "@/components/compare/LandscapeSurface";
import { type BrainLandscape, axes } from "@/lib/brainLandscape";
import { type LayerField, shade } from "@/lib/landscapeLayers";
import { useChartTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const ASPECT = { x: 1.9, y: 1.9, z: 0.75 };
const LIGHTING = {
  ambient: 0.45,
  diffuse: 0.9,
  specular: 0.1,
  roughness: 0.6,
  fresnel: 0.2,
};
const LIGHT = { x: -1e4, y: 1e4, z: 2.5e3 };
/** Translucent enough to see the layers behind, solid enough to keep the shading. */
const LAYER_OPACITY = 0.55;
const GROUND_OPACITY = 0.3;

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
  height = 560,
  title,
}: {
  landscape: BrainLandscape;
  layers: readonly DrawnLayer[];
  /** Keep the map's own height underneath, faint. */
  ground: boolean;
  height?: number;
  title: string;
}) {
  const theme = useChartTheme();
  const { xs, ys } = useMemo(() => axes(landscape), [landscape]);

  const data: Data[] = [
    ...(ground
      ? [
          {
            type: "surface",
            x: xs,
            y: ys,
            z: landscape.grid.z,
            hoverinfo: "skip",
            showscale: false,
            opacity: GROUND_OPACITY,
            colorscale: theme.landscape.map(([at, c]) => [at, c]),
            lighting: LIGHTING,
            lightposition: LIGHT,
          } as Data,
        ]
      : []),
    ...layers.map(
      (layer): Data =>
        ({
          type: "surface",
          name: layer.name,
          x: xs,
          y: ys,
          z: layer.field.z,
          text: layer.hover as unknown as string[],
          hovertemplate: "%{text}<extra></extra>",
          showscale: false,
          opacity: LAYER_OPACITY,
          colorscale: [
            [0, shade(layer.color, 0.6)],
            [1, layer.color],
          ],
          cmin: 0,
          cmax: 1,
          contours: {
            z: {
              show: true,
              start: 0.1,
              end: 1,
              size: 0.1,
              color: layer.color,
              width: 1,
              highlight: false,
            },
            x: { highlight: false },
            y: { highlight: false },
          } as never,
          lighting: LIGHTING,
          lightposition: LIGHT,
        }) as Data
    ),
  ];

  const hidden = { visible: false, showspikes: false } as const;
  const [x0, x1, y0, y1] = landscape.bounds;
  const layout: Partial<Layout> = {
    height,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: "rgba(0,0,0,0)",
    showlegend: false,
    hoverlabel: {
      bgcolor: theme.ink,
      bordercolor: theme.ink,
      font: { color: theme.canvas, size: 12 },
    },
    // the reader's own turning survives a change of layers
    uirevision: "layers",
    scene: {
      xaxis: { ...hidden, range: [x0, x1], autorange: false },
      yaxis: { ...hidden, range: [y0, y1], autorange: false },
      zaxis: { ...hidden, range: [0, 1.05], autorange: false },
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
