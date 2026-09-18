"use client";

import dynamic from "next/dynamic";
import { useChartTheme } from "@/lib/theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/**
 * One metric against the ball radius, with the selected radius marked.
 *
 * This is the whole reason the backend sweeps instead of picking: several of these
 * numbers are not stable in the radius, so a single value would be an arbitrary
 * choice dressed as a measurement. The curve makes the dependence visible, and the
 * marker says where the rest of the page is standing.
 *
 * Gaps are real: a null is a radius at which the quantity is undefined (no spectral
 * gap, no interval), and the line breaks rather than interpolating across it.
 */
export function MetricCurve({
  label,
  epsilons,
  values,
  selected,
  onSelect,
  height = 150,
}: {
  label: string;
  epsilons: number[];
  values: (number | null)[];
  selected: number;
  onSelect?: (index: number) => void;
  height?: number;
}) {
  const theme = useChartTheme();
  const marked = values[selected];

  return (
    <Plot
      data={[
        {
          x: epsilons,
          y: values,
          mode: "lines+markers",
          type: "scatter",
          line: { color: theme.trail1, width: 2, shape: "spline" },
          marker: { color: theme.trail1, size: 5 },
          connectgaps: false,
          hovertemplate: `radius %{x:.2f}<br>${label} %{y}<extra></extra>`,
          showlegend: false,
        },
        ...(marked != null
          ? [
              {
                x: [epsilons[selected]],
                y: [marked],
                mode: "markers" as const,
                type: "scatter" as const,
                marker: {
                  color: theme.trailEnd,
                  size: 11,
                  line: { width: 0 },
                },
                hoverinfo: "skip" as const,
                showlegend: false,
              },
            ]
          : []),
      ]}
      layout={{
        autosize: true,
        height,
        title: {
          text: label,
          font: { color: theme.ink3, size: 12 },
          x: 0,
          xanchor: "left",
        },
        margin: { l: 44, r: 12, t: 28, b: 30 },
        xaxis: {
          gridcolor: theme.hairline,
          zerolinecolor: theme.hairline,
          linecolor: "rgba(0,0,0,0)",
          tickfont: { color: theme.ink3, size: 10 },
        },
        yaxis: {
          gridcolor: theme.hairline,
          zerolinecolor: theme.hairline,
          linecolor: "rgba(0,0,0,0)",
          tickfont: { color: theme.ink3, size: 10 },
        },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { family: "-apple-system, BlinkMacSystemFont, system-ui" },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
      useResizeHandler
      onClick={(event) => {
        const index = event.points?.[0]?.pointIndex;
        if (onSelect && typeof index === "number") onSelect(index);
      }}
    />
  );
}
