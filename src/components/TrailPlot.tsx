"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { Analysis } from "@/lib/types";
import { densityField, energyField } from "@/lib/landscape";
import { trailColorscale, useChartTheme } from "@/lib/theme";
import { Segmented } from "./ui";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });
const TerrainScene = dynamic(
  () => import("./TerrainScene").then((m) => m.TerrainScene),
  { ssr: false }
);

/**
 * The trail, drawn on the terrain it moved over.
 *
 * With a landscape projection the background is the session's own energy surface -
 * the negative log of where it spent its time - so a basin is a state it settled
 * into and a ridge is a crossing between two. The axes of an MDS layout carry no
 * meaning of their own, so they are unlabelled; with the older PCA projection they
 * are the components and carry the explained variance instead.
 *
 * A landscape projection can be viewed flat (the original 2D contour) or raised
 * into a 3D terrain (`TerrainScene`) - literally the same energy field, just
 * walked in with a camera instead of read off a heatmap.
 *
 * Exploratory, not diagnostic: energy is in arbitrary units.
 */
export function TrailPlot({
  analysis,
  height = 460,
}: {
  analysis: Analysis;
  height?: number;
}) {
  const theme = useChartTheme();
  const terrain = analysis.landscape;
  const [view, setView] = useState<"flat" | "terrain">("terrain");
  const field = useMemo(() => {
    if (!terrain || terrain.positions.length === 0) return null;
    const nodes = terrain.positions.map(([x, y], i) => ({
      x,
      y,
      mass: terrain.masses[i] ?? 0,
    }));
    return energyField(densityField(nodes, terrain.sigma));
  }, [terrain]);

  const xs = analysis.points.map((p) => p.pc1);
  const ys = analysis.points.map((p) => p.pc2);
  const ts = analysis.points.map((p) => p.t_start);

  if (terrain && field && view === "terrain") {
    return (
      <div>
        <TerrainScene
          field={field}
          trail={analysis.points.map((p) => ({
            x: p.pc1,
            y: p.pc2,
            t: p.t_start,
          }))}
          theme={theme}
          height={height}
        />
        <div className="mt-2 flex justify-end">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "terrain" as const, label: "Terrain" },
              { value: "flat" as const, label: "Flat" },
            ]}
          />
        </div>
      </div>
    );
  }
  const [ev1, ev2] = analysis.projector_meta.ratio ?? [null, null];
  const last = analysis.points.length - 1;
  const axis = {
    gridcolor: theme.hairline,
    zerolinecolor: theme.hairline,
    linecolor: "rgba(0,0,0,0)",
    tickfont: { color: theme.ink3, size: 11 },
    title: { font: { color: theme.ink3, size: 12 } },
  };

  return (
    <div>
      {terrain && field && (
        <div className="mb-2 flex justify-end">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "terrain" as const, label: "Terrain" },
              { value: "flat" as const, label: "Flat" },
            ]}
          />
        </div>
      )}
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
                  opacity: 0.35,
                  contours: { coloring: "fill" as const },
                  line: { width: 0 },
                  showscale: false,
                  hoverinfo: "skip" as const,
                  showlegend: false,
                  name: "Energy",
                },
              ]
            : []),
          {
            x: xs,
            y: ys,
            mode: "lines",
            type: "scatter",
            line: { color: theme.hairline, width: 1.5, shape: "spline" },
            hoverinfo: "skip",
            showlegend: false,
          },
          {
            x: xs,
            y: ys,
            mode: "markers",
            type: "scatter",
            marker: {
              color: ts,
              colorscale: trailColorscale(theme),
              size: 7,
              line: { width: 0 },
              colorbar: {
                title: {
                  text: "seconds",
                  font: { color: theme.ink3, size: 11 },
                },
                thickness: 6,
                len: 0.6,
                outlinewidth: 0,
                tickfont: { color: theme.ink3, size: 10 },
              },
            },
            text: ts.map((t) => `${t.toFixed(0)} s`),
            hoverinfo: "text",
            hoverlabel: {
              bgcolor: theme.ink,
              bordercolor: theme.ink,
              font: { color: theme.canvas },
            },
            showlegend: false,
          },
          {
            x: [xs[0]],
            y: [ys[0]],
            mode: "markers",
            type: "scatter",
            name: "Start",
            marker: { symbol: "circle", size: 12, color: theme.trailStart },
            hoverinfo: "name",
          },
          {
            x: [xs[last]],
            y: [ys[last]],
            mode: "markers",
            type: "scatter",
            name: "End",
            marker: { symbol: "circle", size: 12, color: theme.trailEnd },
            hoverinfo: "name",
          },
        ]}
        layout={{
          autosize: true,
          height,
          margin: { l: 48, r: 16, t: 8, b: 44 },
          xaxis: terrain
            ? {
                ...axis,
                showticklabels: false,
                title: { ...axis.title, text: "" },
              }
            : {
                ...axis,
                title: {
                  ...axis.title,
                  text:
                    ev1 != null ? `PC1 · ${(ev1 * 100).toFixed(0)}%` : "PC1",
                },
              },
          yaxis: terrain
            ? {
                ...axis,
                showticklabels: false,
                title: { ...axis.title, text: "" },
              }
            : {
                ...axis,
                title: {
                  ...axis.title,
                  text:
                    ev2 != null ? `PC2 · ${(ev2 * 100).toFixed(0)}%` : "PC2",
                },
              },
          paper_bgcolor: "rgba(0,0,0,0)",
          modebar: {
            bgcolor: "rgba(0,0,0,0)",
            color: theme.ink3,
            activecolor: theme.ink,
          },
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { family: "-apple-system, BlinkMacSystemFont, system-ui" },
          legend: {
            orientation: "h",
            x: 0,
            y: 1.08,
            font: { color: theme.ink3, size: 11 },
          },
          transition: { duration: 240, easing: "cubic-in-out" },
        }}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
          toImageButtonOptions: { filename: "brain-trail" },
        }}
        style={{ width: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
