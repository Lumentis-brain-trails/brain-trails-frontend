"use client";

/**
 * One block's stretch of the trail, on the session's terrain, for the comparison view.
 *
 * Both columns frame the **whole session** the same way and draw the same ground, so a
 * place on the left picture is the same place on the right one: the only thing that
 * changes between them is which stretch of the path is lit. The rest of the session
 * stays as a faint line, for context.
 *
 * The ground uses one fixed kernel reach (`REACH`) - there is no smoothing control any
 * more: a scale that looks right was chosen once, so two readers never compare two
 * pictures drawn at different settings.
 *
 * A task block's stretch is coloured by its windows' trial labels (colour: what was on
 * screen; marker: what was done - see `lib/compare/labels.ts`); any other block runs
 * through the trail's time ramp, first window to last.
 */
import { useMemo } from "react";
import { TrailRibbon } from "@/components/TrailRibbon";
import { groupSlot, markerOf, parseLabel } from "@/lib/compare/labels";
import { useChartTheme } from "@/lib/theme";
import { fitToBox } from "@/lib/thumb";
import { type CurvePoint, polylinePath, trailCurve } from "@/lib/trailPath";
import type { Analysis } from "@/lib/types";

const W = 520;
const H = 340;
const PAD = 22;
const WIDTH = 5;
/** How far a region's blur reaches, in multiples of the cover's kernel width. */
const REACH = 1.5;
const GROUND_INK = 0.16;
const MARKER_R = 4.2;
const GRADIENT_ID = "block-trail-region";

export interface BlockSpan {
  t_start_s: number;
  t_end_s: number;
}

/** The windows of a block: start inside `[t_start_s, t_end_s)`, as the backend cuts them. */
export function blockWindows<T extends { t_start: number }>(
  points: readonly T[],
  block: BlockSpan
): T[] {
  return points.filter(
    (p) => p.t_start >= block.t_start_s && p.t_start < block.t_end_s
  );
}

export function BlockTrail({
  analysis,
  block,
  labels,
  groups,
  t,
  onSeek,
  height,
  title,
}: {
  analysis: Analysis;
  block: BlockSpan;
  /** One label (or null) per window of the block, or null for a block without trials. */
  labels: readonly (string | null)[] | null | undefined;
  /** The recording's label groups in slot order (`labelGroups`). */
  groups: readonly string[];
  /** Session seconds of the cursor. */
  t: number;
  onSeek: (t: number) => void;
  /** Fixed height; by default the picture keeps its own aspect at any width. */
  height?: number;
  title: string;
}) {
  const theme = useChartTheme();
  const { points, landscape } = analysis;

  const drawing = useMemo(() => {
    const map = fitToBox(
      points.map((p) => ({ x: p.pc1, y: p.pc2 })),
      W,
      H,
      PAD
    );
    const unit = map({ x: 1, y: 0 }).x - map({ x: 0, y: 0 }).x;
    const masses = landscape?.masses ?? [];
    const heaviest = Math.max(1, ...masses);
    const regions = (landscape?.positions ?? []).map(([x, y], i) => ({
      ...map({ x, y }),
      weight: (masses[i] ?? 0) / heaviest,
    }));
    const whole = points.map((p) => map({ x: p.pc1, y: p.pc2 }));
    const inside = blockWindows(points, block);
    const lit: (CurvePoint & { t: number })[] = inside.map((p, i) => ({
      ...map({ x: p.pc1, y: p.pc2 }),
      u: i / Math.max(1, inside.length - 1),
      t: p.t_start,
    }));
    return {
      regions,
      reach: (landscape?.sigma ?? 0) * unit * REACH,
      context: whole.map((p) => ({ ...p, u: 0 })),
      lit,
    };
  }, [block, landscape, points]);

  const colourOf = (label: string | null | undefined): string => {
    if (!label) return theme.ink3;
    const slot = groupSlot(groups, parseLabel(label).group);
    return slot === null ? theme.ink3 : theme.labels[slot];
  };

  const segments = useMemo(
    () => (labels ? labelledSegments(drawing.lit, labels) : []),
    [drawing.lit, labels]
  );

  const current = nearest(drawing.lit, t);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={height ? { height } : undefined}
      className="block h-auto w-full touch-none"
      role="img"
      aria-label={title}
    >
      <defs>
        <radialGradient id={GRADIENT_ID}>
          <stop offset="0%" stopColor={theme.ink} stopOpacity={1} />
          <stop offset="35%" stopColor={theme.ink} stopOpacity={0.72} />
          <stop offset="65%" stopColor={theme.ink} stopOpacity={0.3} />
          <stop offset="90%" stopColor={theme.ink} stopOpacity={0.06} />
          <stop offset="100%" stopColor={theme.ink} stopOpacity={0} />
        </radialGradient>
      </defs>
      {drawing.reach > 0 && (
        <g opacity={GROUND_INK}>
          {drawing.regions.map((region, i) => (
            <circle
              key={i}
              cx={region.x}
              cy={region.y}
              r={drawing.reach * (0.5 + 0.9 * Math.sqrt(region.weight))}
              fill={`url(#${GRADIENT_ID})`}
            />
          ))}
        </g>
      )}
      <path
        d={polylinePath(drawing.context)}
        fill="none"
        stroke={theme.ink3}
        strokeOpacity={0.35}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {labels ? (
        <g>
          {segments.map((segment, i) => (
            <path
              key={i}
              d={polylinePath(segment.points)}
              fill="none"
              stroke={colourOf(segment.label)}
              strokeOpacity={segment.label ? 1 : 0.6}
              strokeWidth={WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {drawing.lit.map((p, i) => {
            const label = labels[i];
            if (!label) return null;
            const colour = colourOf(label);
            const marker = markerOf(parseLabel(label).act);
            if (marker === "ring")
              return (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={MARKER_R}
                  fill="var(--surface)"
                  stroke={colour}
                  strokeWidth={2}
                />
              );
            if (marker === "diamond")
              return (
                <rect
                  key={i}
                  x={p.x - MARKER_R}
                  y={p.y - MARKER_R}
                  width={MARKER_R * 2}
                  height={MARKER_R * 2}
                  transform={`rotate(45 ${p.x} ${p.y})`}
                  fill={colour}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              );
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={MARKER_R}
                fill={colour}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      ) : (
        <TrailRibbon
          points={drawing.lit}
          stops={theme.trail}
          width={WIDTH}
          casing="var(--surface)"
          showWindows
        />
      )}
      {drawing.lit.map((p, i) => (
        <circle
          key={`hit-${i}`}
          cx={p.x}
          cy={p.y}
          r={7}
          fill="transparent"
          className="cursor-pointer"
          onClick={() => onSeek(p.t)}
        >
          <title>{`${Math.round(p.t - block.t_start_s)} s`}</title>
        </circle>
      ))}
      {current && (
        <circle
          cx={current.x}
          cy={current.y}
          r={9}
          fill="none"
          stroke={theme.ink}
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

/**
 * The block's curve cut into runs of one label, so each run is stroked in one colour.
 * The gap from window i to window i + 1 takes window i's label; each run repeats its
 * last point as the next run's first, so the colours meet without a gap.
 */
function labelledSegments(
  lit: readonly CurvePoint[],
  labels: readonly (string | null)[]
): { label: string | null; points: CurvePoint[] }[] {
  if (lit.length < 2) return [];
  const gaps = lit.length - 1;
  const curve = trailCurve([...lit]);
  const runs: { label: string | null; points: CurvePoint[] }[] = [];
  for (const point of curve) {
    const gap = Math.min(gaps - 1, Math.floor(point.u * gaps + 1e-9));
    const label = labels[gap] ?? null;
    const last = runs.at(-1);
    if (last && last.label === label) last.points.push(point);
    else {
      const bridge = last?.points.at(-1);
      runs.push({ label, points: bridge ? [bridge, point] : [point] });
    }
  }
  return runs;
}

/** The window whose start is the last one at or before `t`. */
function nearest<T extends { t: number }>(
  points: readonly T[],
  t: number
): T | null {
  let best: T | null = points[0] ?? null;
  for (const p of points) {
    if (p.t <= t) best = p;
    else break;
  }
  return best;
}
