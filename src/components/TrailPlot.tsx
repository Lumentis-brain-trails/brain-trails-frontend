"use client";

import { useMemo } from "react";
import { useChartTheme } from "@/lib/theme";
import { fitToBox } from "@/lib/thumb";
import { trailSamples, visitedRegions } from "@/lib/trailDraw";
import type { Analysis } from "@/lib/types";
import { TrailRibbon } from "./TrailRibbon";

const W = 720;
const H = 440;
const PAD = 28;
/** Stroke width of the ribbon, in viewBox units. */
const WIDTH = 6;
/** About this many samples make a path you can still follow with your eye. */
const SAMPLES = 70;
/** How far a region's blur reaches, in multiples of the cover's kernel width. */
const REACH = 1.5;
/** How close to the path a region must come to be part of the ground. */
const VISITED = 0.8;
/** Ink the whole ground may lay down. One value for the group: regions union. */
const GROUND_INK = 0.18;
/** Above this many samples the per-window dots stop being readable. */
const DOTS_UP_TO = 200;
const GRADIENT_ID = "trail-region";

/**
 * The trail, drawn on the ground it moved over.
 *
 * Three decisions make this picture legible, and all three are about drawing, never
 * about what was measured:
 *
 * - **It is framed on the path**, not on the cover. A drawn position is a weighted
 *   mean of region centres, so the trail always sits well inside the layout; framing
 *   both together spent two thirds of the picture on empty landscape.
 * - **A long session is summarised in time** (`trailSamples`): one sample per run of
 *   windows rather than one per window. Every window still pulls on the sample that
 *   covers it.
 * - **The ground is only where the session went** (`visitedRegions`), and the whole
 *   of it carries a single opacity, so overlapping regions union instead of
 *   compounding. They used to stack without a ceiling and a busy cover turned into
 *   grey fog that said nothing.
 *
 * A region is wide as the time spent in it and the ground darkens where they meet:
 * that is the same sum of Gaussians `lib/landscape.ts` integrates for the contour on
 * the NeuroMetrics page, drawn declaratively instead of sampled onto a grid.
 *
 * There used to be a second view of the same data - the field raised into a 3D
 * terrain you walked with a camera. It was a beautiful demo and a poor instrument:
 * height is `-log` of a relative density in arbitrary units, so the mountains
 * invited a reading the numbers do not support, and half of the trail was hidden
 * behind a ridge at any one camera angle. One flat picture, read at a glance, says
 * what there is to say.
 *
 * Exploratory, not diagnostic: the ground is a relative density, in arbitrary
 * units, and the axes of an MDS layout carry no meaning of their own, which is why
 * they are not drawn.
 */
export function TrailPlot({
  analysis,
  height = 460,
}: {
  analysis: Analysis;
  height?: number;
}) {
  const theme = useChartTheme();
  const landscape = analysis.landscape;

  const { points, regions, reach, dots } = useMemo(() => {
    const samples = trailSamples(analysis.points, SAMPLES);
    const sigma = landscape?.sigma ?? 0;
    const nodes = visitedRegions(
      (landscape?.positions ?? []).map(([x, y], i) => ({
        x,
        y,
        mass: landscape?.masses[i] ?? 0,
      })),
      samples,
      sigma * REACH * VISITED
    );
    const map = fitToBox(samples, W, H, PAD);
    // fitToBox scales both axes alike, so one unit of the layout is this many
    // viewBox units - which is what turns the kernel width into a blur radius.
    const unit = map({ x: 1, y: 0 }).x - map({ x: 0, y: 0 }).x;
    const heaviest = Math.max(1, ...nodes.map((n) => n.mass));
    return {
      points: samples.map((s, i) => ({
        ...map(s),
        u: i / Math.max(1, samples.length - 1),
        t: s.t,
      })),
      regions: nodes.map((n) => ({ ...map(n), weight: n.mass / heaviest })),
      reach: sigma * unit * REACH,
      dots: samples.length <= DOTS_UP_TO,
    };
  }, [analysis.points, landscape]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ height }}
      className="w-full"
      role="img"
      aria-label="Trail of the recording, from the first window to the last, on the session's energy landscape"
    >
      <defs>
        <radialGradient id={GRADIENT_ID}>
          {/* A Gaussian sampled out to REACH sigmas, with its tail subtracted so
              the blob fades to nothing at the rim instead of ending on a step. */}
          <stop offset="0%" stopColor={theme.ink} stopOpacity={1} />
          <stop offset="20%" stopColor={theme.ink} stopOpacity={0.9} />
          <stop offset="35%" stopColor={theme.ink} stopOpacity={0.718} />
          <stop offset="50%" stopColor={theme.ink} stopOpacity={0.502} />
          <stop offset="65%" stopColor={theme.ink} stopOpacity={0.298} />
          <stop offset="80%" stopColor={theme.ink} stopOpacity={0.135} />
          <stop offset="90%" stopColor={theme.ink} stopOpacity={0.057} />
          <stop offset="100%" stopColor={theme.ink} stopOpacity={0} />
        </radialGradient>
      </defs>
      {reach > 0 && (
        <g opacity={GROUND_INK}>
          {regions.map((region, i) => (
            <circle
              key={i}
              cx={region.x}
              cy={region.y}
              r={reach * (0.5 + 0.9 * Math.sqrt(region.weight))}
              fill={`url(#${GRADIENT_ID})`}
            />
          ))}
        </g>
      )}
      <TrailRibbon
        points={points}
        stops={theme.trail}
        width={WIDTH}
        casing="var(--surface)"
        showWindows={dots}
        windowFill="var(--surface)"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={9} fill="transparent">
          <title>{`${Math.round(p.t)} s`}</title>
        </circle>
      ))}
    </svg>
  );
}
