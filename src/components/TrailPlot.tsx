"use client";

import { useMemo } from "react";
import { useChartTheme } from "@/lib/theme";
import { fitToBox } from "@/lib/thumb";
import type { Analysis } from "@/lib/types";
import { TrailRibbon } from "./TrailRibbon";

const W = 720;
const H = 440;
const PAD = 34;
/** Stroke width of the ribbon, in viewBox units. */
const WIDTH = 6;
/** How far a region's blur reaches, in multiples of the cover's radius. */
const REACH = 2.2;
/** Ink a single region can lay down; they stack, so basins darken. */
const REGION_INK = 0.28;
const GRADIENT_ID = "trail-region";

/**
 * The trail, drawn on the terrain it moved over.
 *
 * The ground is the session's own energy landscape: one soft blob per region of
 * the Ball Mapper cover, wide as the cover's own radius and as dark as the time
 * spent there. Where the session settled, blobs overlap and the ground darkens
 * into a basin; a pale corridor between two of them is a crossing. That is the
 * same sum of Gaussians `lib/landscape.ts` integrates for the contour on the
 * NeuroMetrics page, drawn declaratively instead of sampled onto a grid.
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

  const { points, regions, reach } = useMemo(() => {
    const nodes = (landscape?.positions ?? []).map(([x, y], i) => ({
      x,
      y,
      mass: landscape?.masses[i] ?? 0,
    }));
    const trail = analysis.points.map((p) => ({ x: p.pc1, y: p.pc2 }));
    const map = fitToBox([...trail, ...nodes], W, H, PAD);
    // fitToBox scales both axes alike, so one unit of the layout is this many
    // viewBox units - which is what turns the cover's radius into a blur radius.
    const unit = map({ x: 1, y: 0 }).x - map({ x: 0, y: 0 }).x;
    const heaviest = Math.max(1, ...nodes.map((n) => n.mass));
    return {
      points: analysis.points.map((p, i) => ({
        ...map({ x: p.pc1, y: p.pc2 }),
        u: i / Math.max(1, analysis.points.length - 1),
        t: p.t_start,
      })),
      regions: nodes.map((n) => ({ ...map(n), weight: n.mass / heaviest })),
      reach: (landscape?.sigma ?? 0) * unit * REACH,
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
      {reach > 0 &&
        regions.map((region, i) => (
          <circle
            key={i}
            cx={region.x}
            cy={region.y}
            r={reach}
            fill={`url(#${GRADIENT_ID})`}
            opacity={REGION_INK * (0.35 + 0.65 * region.weight)}
          />
        ))}
      <TrailRibbon
        points={points}
        stops={theme.trail}
        width={WIDTH}
        casing="var(--surface)"
        showWindows
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
