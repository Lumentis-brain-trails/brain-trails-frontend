"use client";

/**
 * The trail, drawn for review: the whole path, the block it is in, the cursor's window
 * (sprint S20).
 *
 * The recording's trail already exists as a picture (`TrailPlot`); this is the reading
 * version of it - flat, small, and tied to the session clock. Clicking a window is a
 * seek, which is what makes "where was I when the trail went there?" answerable in one
 * gesture.
 */

import { useMemo } from "react";
import { trailHexAt, useChartTheme } from "@/lib/theme";
import { fitToBox } from "@/lib/thumb";
import type { Analysis } from "@/lib/types";

const W = 520;
const H = 320;
const PAD = 22;

export function ReviewTrail({
  analysis,
  t,
  range,
  onSeek,
  height = 320,
}: {
  analysis: Analysis;
  /** Session seconds the cursor sits at. */
  t: number;
  range?: [number, number] | null;
  onSeek: (t: number) => void;
  height?: number;
}) {
  const theme = useChartTheme();
  const { points } = analysis;

  const { mapped, map } = useMemo(() => {
    const nodes = (analysis.landscape?.positions ?? []).map(([x, y], i) => ({
      x,
      y,
      mass: analysis.landscape?.masses[i] ?? 0,
    }));
    const map = fitToBox(
      [...points.map((p) => ({ x: p.pc1, y: p.pc2 })), ...nodes],
      W,
      H,
      PAD
    );
    return {
      mapped: points.map((p) => ({ ...map({ x: p.pc1, y: p.pc2 }), point: p })),
      map,
    };
  }, [analysis.landscape, points]);

  const nodes = (analysis.landscape?.positions ?? []).map(([x, y], i) => ({
    ...map({ x, y }),
    mass: analysis.landscape?.masses[i] ?? 0,
  }));
  const maxMass = Math.max(1, ...nodes.map((n) => n.mass));

  const currentIndex = nearestIndex(points, t);
  const current = mapped[currentIndex];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ height }}
      className="w-full touch-none"
      role="img"
      aria-label="Trail of the session, with the cursor's window marked"
    >
      {nodes.map((node, i) => (
        <circle
          key={i}
          cx={node.x}
          cy={node.y}
          r={3 + 9 * Math.sqrt(node.mass / maxMass)}
          fill="none"
          stroke="var(--hairline-strong)"
        />
      ))}
      {mapped.slice(1).map((p, i) => {
        const previous = mapped[i];
        const inRange =
          !range ||
          (p.point.t_start >= range[0] && p.point.t_end <= range[1]);
        return (
          <line
            key={i}
            x1={previous.x}
            y1={previous.y}
            x2={p.x}
            y2={p.y}
            stroke={trailHexAt(theme.trail, (i + 1) / Math.max(1, mapped.length - 1))}
            strokeWidth={inRange ? 2.4 : 1.2}
            strokeOpacity={inRange ? 1 : 0.35}
            strokeLinecap="round"
          />
        );
      })}
      {mapped.map((p, i) => (
        <circle
          key={`hit-${i}`}
          cx={p.x}
          cy={p.y}
          r={7}
          fill="transparent"
          className="cursor-pointer"
          onClick={() => onSeek(p.point.t_start)}
        >
          <title>{`${Math.round(p.point.t_start)} s`}</title>
        </circle>
      ))}
      {current && (
        <>
          <circle
            cx={current.x}
            cy={current.y}
            r={9}
            fill="none"
            stroke={theme.trailEnd}
            strokeWidth={2}
          />
          <circle cx={current.x} cy={current.y} r={4} fill={theme.trailEnd} />
        </>
      )}
    </svg>
  );
}

/** The window whose span contains `t`, or the nearest one before it. */
function nearestIndex(
  points: { t_start: number; t_end: number }[],
  t: number
): number {
  let best = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].t_start <= t) best = i;
    else break;
  }
  return best;
}
