"use client";

/**
 * The person's landscape seen from above, to choose where a neurofeedback session leads
 * (V4-0010). The hills are where they spent most time; each target is drawn with its
 * radius, the distance at which the reward is half. A click adds a point (up to
 * `NF_MAX_TARGETS`) or, on an existing one, removes it - only when `editable`: a preset
 * is shown as it is.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Data, Layout } from "plotly.js";
import { type BrainLandscape, axes } from "@/lib/brainLandscape";
import { NF_MAX_TARGETS } from "@/lib/protocol/blocks";
import { useChartTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Point = [number, number];

export function TargetPicker({
  landscape,
  points,
  radius,
  editable,
  onChange,
  title,
  height = 420,
}: {
  landscape: BrainLandscape;
  points: readonly Point[];
  radius: number;
  editable: boolean;
  onChange: (points: Point[]) => void;
  title: string;
  height?: number;
}) {
  const theme = useChartTheme();
  const { xs, ys } = useMemo(() => axes(landscape), [landscape]);
  const data = useMemo<Data[]>(
    () => [
      {
        type: "heatmap",
        x: xs,
        y: ys,
        z: landscape.grid.z as number[][],
        colorscale: theme.landscape as [number, string][],
        showscale: false,
        hoverinfo: "none",
        zsmooth: "best",
      },
      {
        type: "scatter",
        mode: "markers",
        x: points.map((p) => p[0]),
        y: points.map((p) => p[1]),
        marker: {
          size: 10,
          color: "#ffffff",
          line: { color: "#000", width: 1.5 },
        },
        hoverinfo: "none",
      },
    ],
    [landscape, points, theme, xs, ys]
  );
  const layout = useMemo(
    () =>
      ({
        height,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        xaxis: { visible: false, fixedrange: true },
        yaxis: { visible: false, fixedrange: true, scaleanchor: "x" },
        showlegend: false,
        dragmode: false,
        shapes: points.map(([x, y]) => ({
          type: "circle",
          xref: "x",
          yref: "y",
          x0: x - radius,
          x1: x + radius,
          y0: y - radius,
          y1: y + radius,
          line: { color: "#ffffff", width: 2, dash: "dot" },
        })),
        // plotly's types spell axis ids as patterns; "x" and "y" are what it takes
      }) as unknown as Partial<Layout>,
    [height, points, radius]
  );

  const click = (x: number, y: number) => {
    if (!editable) return;
    const hit = points.findIndex(
      ([px, py]) => Math.hypot(px - x, py - y) <= radius
    );
    if (hit >= 0) onChange(points.filter((_, i) => i !== hit));
    else if (points.length < NF_MAX_TARGETS)
      onChange([...points, [round(x), round(y)]]);
  };

  return (
    <figure aria-label={title} className={editable ? "cursor-crosshair" : ""}>
      <Plot
        data={data}
        layout={layout}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%" }}
        onClick={(event) => {
          const p = event.points?.[0];
          if (p && typeof p.x === "number" && typeof p.y === "number")
            click(p.x, p.y);
        }}
      />
    </figure>
  );
}

function round(v: number): number {
  return Math.round(v * 1e5) / 1e5;
}
