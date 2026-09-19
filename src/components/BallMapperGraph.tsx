"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { densityField, energyField } from "@/lib/landscape";
import { trailColorscale, useChartTheme } from "@/lib/theme";
import type { NeuroLevel } from "@/lib/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/** What a node's colour can mean. Mass and dwell are the same ordering, so only one. */
export type NodeColouring =
  | "dwell"
  | "flux_normalized"
  | "betweenness"
  | "bottleneck_score"
  | `band:${number}`;

const COLOURING_LABELS: Record<string, string> = {
  dwell: "Time spent",
  flux_normalized: "Speed through",
  betweenness: "Traffic carried",
  bottleneck_score: "Crossing-ness",
};

/** Human label for a colouring, including the band ones the recording may not have. */
export function colouringLabel(key: NodeColouring, bands: string[]): string {
  if (key.startsWith("band:")) {
    const band = bands[Number(key.slice(5))];
    return band
      ? `${band[0].toUpperCase()}${band.slice(1)} power`
      : "Band power";
  }
  return COLOURING_LABELS[key] ?? key;
}

function valueOf(
  node: NeuroLevel["nodes"][number],
  key: NodeColouring
): number {
  if (key.startsWith("band:")) return node.bands[Number(key.slice(5))] ?? 0;
  const value = node[key as keyof typeof node];
  return typeof value === "number" ? value : 0;
}

/**
 * The cover as a graph, standing on its own energy landscape.
 *
 * Nodes sit where MDS put them, sized by how much of the session they hold and
 * coloured by whichever reading is selected; edges fade with how many windows the two
 * balls actually share. The terrain underneath is the same density read as `-log`, so
 * the heavy nodes sit in basins and the crossings on ridges - if they ever stop doing
 * that, the layout is wrong, not merely ugly.
 *
 * Energy is in arbitrary units and the axes of an MDS layout mean nothing on their
 * own, so neither is labelled.
 */
export function BallMapperGraph({
  level,
  bands,
  colouring,
  sigmaScale = 1,
  height = 460,
}: {
  level: NeuroLevel;
  bands: string[];
  colouring: NodeColouring;
  sigmaScale?: number;
  height?: number;
}) {
  const theme = useChartTheme();
  const sigma = (level.sigma ?? 1) * sigmaScale;

  const field = useMemo(() => {
    if (!level.nodes.length || !(sigma > 0)) return null;
    return energyField(densityField(level.nodes, sigma));
  }, [level.nodes, sigma]);

  const xs = level.nodes.map((n) => n.x);
  const ys = level.nodes.map((n) => n.y);
  const values = level.nodes.map((n) => valueOf(n, colouring));
  const maxMass = Math.max(1, ...level.nodes.map((n) => n.mass));

  // One trace per edge would be hundreds of traces; a single trace with null breaks
  // draws the whole graph at once, at the cost of a shared opacity.
  const edgeX: (number | null)[] = [];
  const edgeY: (number | null)[] = [];
  for (const [i, j] of level.edges) {
    edgeX.push(xs[i], xs[j], null);
    edgeY.push(ys[i], ys[j], null);
  }

  const bottleneck = new Set(level.bottlenecks.slice(0, 3));

  return (
    <Plot
      data={[
        ...(field
          ? [
              {
                x: field.xs,
                y: field.ys,
                z: field.z,
                type: "contour" as const,
                colorscale: [
                  [0, theme.terrain.fill],
                  [0.5, theme.hairline],
                  [1, "rgba(0,0,0,0)"],
                ] as [number, string][],
                opacity: 0.3,
                contours: { coloring: "fill" as const },
                line: { width: 0 },
                showscale: false,
                hoverinfo: "skip" as const,
                showlegend: false,
              },
            ]
          : []),
        {
          x: edgeX,
          y: edgeY,
          mode: "lines" as const,
          type: "scatter" as const,
          line: { color: theme.ink3, width: 1 },
          opacity: 0.6,
          hoverinfo: "skip" as const,
          showlegend: false,
        },
        {
          x: xs,
          y: ys,
          mode: "markers" as const,
          type: "scatter" as const,
          marker: {
            color: values,
            colorscale: trailColorscale(theme),
            size: level.nodes.map((n) => 8 + 26 * Math.sqrt(n.mass / maxMass)),
            line: {
              width: level.nodes.map((_, i) => (bottleneck.has(i) ? 2.5 : 0)),
              color: theme.trailEnd,
            },
            colorbar: {
              title: {
                text: colouringLabel(colouring, bands),
                font: { color: theme.ink3, size: 11 },
              },
              thickness: 6,
              len: 0.6,
              outlinewidth: 0,
              tickfont: { color: theme.ink3, size: 10 },
            },
          },
          text: level.nodes.map(
            (n, i) =>
              `${n.mass} window${n.mass === 1 ? "" : "s"} · ${(n.dwell * 100).toFixed(1)}% of the session` +
              `<br>${colouringLabel(colouring, bands)}: ${valueOf(n, colouring).toFixed(3)}` +
              `<br>${n.n_visits} visit${n.n_visits === 1 ? "" : "s"}` +
              (bottleneck.has(i) ? "<br><b>a crossing</b>" : "")
          ),
          hoverinfo: "text" as const,
          hoverlabel: {
            bgcolor: theme.ink,
            bordercolor: theme.ink,
            font: { color: theme.canvas },
          },
          showlegend: false,
        },
      ]}
      layout={{
        autosize: true,
        height,
        margin: { l: 16, r: 16, t: 8, b: 16 },
        xaxis: {
          showgrid: false,
          zeroline: false,
          showticklabels: false,
          linecolor: "rgba(0,0,0,0)",
        },
        yaxis: {
          showgrid: false,
          zeroline: false,
          showticklabels: false,
          linecolor: "rgba(0,0,0,0)",
          scaleanchor: "x" as const,
        },
        paper_bgcolor: "rgba(0,0,0,0)",
        modebar: {
          bgcolor: "rgba(0,0,0,0)",
          color: theme.ink3,
          activecolor: theme.ink,
        },
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { family: "-apple-system, BlinkMacSystemFont, system-ui" },
      }}
      config={{
        displaylogo: false,
        responsive: true,
        modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
        toImageButtonOptions: { filename: "neurometrics-graph" },
      }}
      style={{ width: "100%" }}
      useResizeHandler
    />
  );
}
