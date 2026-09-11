"use client";

import dynamic from "next/dynamic";
import type { Analysis } from "@/lib/types";
import { useChartTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/**
 * The trail: one path through the per-session PCA plane, coloured by time from
 * grey (start) to the accent (now). Axes carry the explained variance so the
 * reader knows how much of the session the plane actually holds.
 */
export function TrailPlot({
  analysis,
  height = 460,
}: {
  analysis: Analysis;
  height?: number;
}) {
  const theme = useChartTheme();
  const xs = analysis.points.map((p) => p.pc1);
  const ys = analysis.points.map((p) => p.pc2);
  const ts = analysis.points.map((p) => p.t_start);
  const [ev1, ev2] = analysis.explained_variance.ratio ?? [null, null];
  const last = analysis.points.length - 1;
  const axis = {
    gridcolor: theme.hairline,
    zerolinecolor: theme.hairline,
    linecolor: "rgba(0,0,0,0)",
    tickfont: { color: theme.ink3, size: 11 },
    title: { font: { color: theme.ink3, size: 12 } },
  };

  return (
    <Plot
      data={[
        {
          x: xs,
          y: ys,
          mode: "lines",
          type: "scatter",
          line: { color: theme.trail0, width: 1.5, shape: "spline" },
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
            colorscale: [
              [0, theme.trail0],
              [1, theme.trail1],
            ],
            size: 7,
            line: { width: 0 },
            colorbar: {
              title: { text: "seconds", font: { color: theme.ink3, size: 11 } },
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
            font: { color: theme.trail0 === "#d2d2d7" ? "#fff" : "#000" },
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
        xaxis: {
          ...axis,
          title: {
            ...axis.title,
            text: ev1 != null ? `PC1 · ${(ev1 * 100).toFixed(0)}%` : "PC1",
          },
        },
        yaxis: {
          ...axis,
          title: {
            ...axis.title,
            text: ev2 != null ? `PC2 · ${(ev2 * 100).toFixed(0)}%` : "PC2",
          },
        },
        paper_bgcolor: "rgba(0,0,0,0)",
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
  );
}
