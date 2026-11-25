"use client";

import { useTranslations } from "next-intl";
import type { LabResult } from "@console/lib/client";
import { colourOf, dominant, fit, scatter } from "../lib/lab";

const SIZE = 480;

/** The labels and their colours, as the scatter and the graph draw them. */
export function Legend({ labels }: { labels: readonly string[] }) {
  const t = useTranslations("console.pipelineLab.map");
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: colourOf(labels, i) }}
          />
          {label}
        </li>
      ))}
      <li className="flex items-center gap-1.5 text-ink-3">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: colourOf(labels, -1), opacity: 0.5 }}
        />
        {t("noLabel")}
      </li>
    </ul>
  );
}

/**
 * The windows on the 2-D map, one dot each, coloured by label: plain SVG, no chart
 * library (the shell's first-load budget). At most 5 000 dots, the backend's sample.
 */
export function Scatter({ points }: { points: LabResult["points"] }) {
  const t = useTranslations("console.pipelineLab.map");
  const dots = scatter(points, SIZE, SIZE);
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={t("aria")}
      className="aspect-square w-full max-w-[520px] rounded-[var(--radius-control)] bg-surface-2"
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={2.2}
          fill={d.colour}
          fillOpacity={d.labelled ? 0.75 : 0.3}
        />
      ))}
    </svg>
  );
}

/**
 * The Ball Mapper graph in its 2-D layout: edges as hairlines, each ball sized by its
 * windows and coloured by its most frequent label.
 */
export function GraphView({
  graph,
  labels,
}: {
  graph: LabResult["graph"];
  labels: readonly string[];
}) {
  const t = useTranslations("console.pipelineLab.graphView");
  const pad = 14;
  const sx = fit(
    graph.nodes.map((n) => n.x),
    SIZE,
    pad
  );
  const sy = fit(
    graph.nodes.map((n) => n.y),
    SIZE,
    pad
  );
  const most = Math.max(1, ...graph.nodes.map((n) => n.mass));
  const at = (i: number) => ({
    x: sx(graph.nodes[i].x),
    y: SIZE - sy(graph.nodes[i].y),
  });
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={t("aria")}
      className="aspect-square w-full max-w-[520px] rounded-[var(--radius-control)] bg-surface-2"
    >
      {graph.edges.map(([a, b], i) => {
        if (!graph.nodes[a] || !graph.nodes[b]) return null;
        const p = at(a);
        const q = at(b);
        return (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            className="stroke-ink-3"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
        );
      })}
      {graph.nodes.map((n, i) => {
        const p = at(i);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3 + 9 * Math.sqrt(n.mass / most)}
            fill={dominant(n.labels, labels)}
            fillOpacity={0.85}
          />
        );
      })}
    </svg>
  );
}
