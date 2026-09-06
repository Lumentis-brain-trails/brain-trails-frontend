"use client";

import dynamic from "next/dynamic";
import type { Analysis } from "@/lib/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export function TrailPlot({ analysis }: { analysis: Analysis }) {
  const xs = analysis.points.map((p) => p.pc1);
  const ys = analysis.points.map((p) => p.pc2);
  const ts = analysis.points.map((p) => p.t_start);
  const ratio = analysis.explained_variance.ratio;
  const [ev1, ev2] = ratio ?? [null, null];
  const last = analysis.points.length - 1;

  return (
    <Plot
      data={[
        {
          x: xs,
          y: ys,
          mode: "lines",
          type: "scatter",
          line: { color: "rgba(160,160,160,0.4)", width: 1 },
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
            colorscale: "Viridis",
            size: 8,
            colorbar: { title: { text: "time (s)" }, thickness: 12 },
          },
          text: ts.map((t) => `t = ${t.toFixed(0)} s`),
          hoverinfo: "text",
          showlegend: false,
        },
        {
          x: [xs[0]],
          y: [ys[0]],
          mode: "markers",
          type: "scatter",
          name: "start",
          marker: { symbol: "triangle-up", size: 16, color: "#16a34a" },
        },
        {
          x: [xs[last]],
          y: [ys[last]],
          mode: "markers",
          type: "scatter",
          name: "end",
          marker: { symbol: "square", size: 13, color: "#dc2626" },
        },
      ]}
      layout={{
        autosize: true,
        height: 480,
        margin: { l: 60, r: 20, t: 20, b: 50 },
        xaxis: {
          title: {
            text: ev1 != null ? `PC1 (${(ev1 * 100).toFixed(0)}% var)` : "PC1",
          },
        },
        yaxis: {
          title: {
            text: ev2 != null ? `PC2 (${(ev2 * 100).toFixed(0)}% var)` : "PC2",
          },
        },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        legend: { orientation: "h" },
      }}
      config={{
        displaylogo: false,
        responsive: true,
        toImageButtonOptions: { filename: "brain-trail" },
      }}
      style={{ width: "100%" }}
      useResizeHandler
    />
  );
}
