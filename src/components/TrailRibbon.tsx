"use client";

import { useMemo } from "react";
import { trailHexAt } from "@/lib/theme";
import {
  polylinePath,
  trailBands,
  trailCurve,
  type CurvePoint,
} from "@/lib/trailPath";

/** Decimals kept on a coordinate: enough to place it, few enough that the number
 * is written the same way on the server and in the browser. */
const PRECISION = 2;
/** Colour buckets along the ramp: past this, the banding is below the eye. */
const COLOUR_STEPS = 48;
/** How much of the full width a dimmed stretch keeps. */
const DIM_WIDTH = 0.45;
const DIM_OPACITY = 0.38;

/**
 * The trail as one flowing ribbon: a thick, smooth stroke that runs through the
 * time ramp, with the windows it was sampled from marked fine enough to stay
 * quiet.
 *
 * Every surface that draws a trail - the recording's own picture, the review, the
 * thumbnail in a list - shares this, so a trail is recognisably the same object
 * wherever it appears.
 *
 * Takes points already mapped into the drawing box (see `fitToBox`), because only
 * the caller knows what else has to fit in it.
 */
export function TrailRibbon({
  points,
  stops,
  width = 5,
  samples = 320,
  casing = null,
  range = null,
  showWindows = false,
  windowFill = "var(--surface)",
  showEnds = true,
}: {
  /** The windows, in order, mapped to the drawing box. */
  points: CurvePoint[];
  /** The time ramp, first window to last. */
  stops: readonly string[];
  /** Stroke width of the ribbon at full weight. */
  width?: number;
  /** Roughly how many points the curve is drawn with. */
  samples?: number;
  /** Colour of the under-stroke that lifts the ribbon off what is behind it. */
  casing?: string | null;
  /** Time fractions to keep at full weight; everything else is dimmed. */
  range?: [number, number] | null;
  /** Mark where the real windows fall, as fine dots on the ribbon. */
  showWindows?: boolean;
  /** Colour of those dots: the ground the ribbon is drawn on. */
  windowFill?: string;
  /** Mark where the trail starts and where it ends. */
  showEnds?: boolean;
}) {
  const curve = useMemo(() => trailCurve(points, samples), [points, samples]);
  const bands = useMemo(
    () => trailBands(curve, COLOUR_STEPS, range),
    [curve, range]
  );

  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <g>
      {casing && (
        <path
          d={polylinePath(curve)}
          fill="none"
          stroke={casing}
          strokeWidth={width + 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {bands.map((band, i) => (
        <path
          key={i}
          d={polylinePath(band.points)}
          fill="none"
          stroke={trailHexAt(stops, band.u)}
          strokeWidth={band.inRange ? width : width * DIM_WIDTH}
          strokeOpacity={band.inRange ? 1 : DIM_OPACITY}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {showWindows &&
        points
          .slice(1, -1)
          .map((p, i) => (
            <circle
              key={i}
              cx={round(p.x)}
              cy={round(p.y)}
              r={round(width * 0.22)}
              fill={windowFill}
              fillOpacity={0.7}
            />
          ))}
      {showEnds && (
        <>
          <circle
            cx={round(first.x)}
            cy={round(first.y)}
            r={round(width * 0.95)}
            fill="none"
            stroke={stops[0]}
            strokeWidth={width * 0.42}
          />
          <circle
            cx={round(last.x)}
            cy={round(last.y)}
            r={round(width * 1.9)}
            fill={stops[stops.length - 1]}
            fillOpacity={0.18}
          />
          <circle
            cx={round(last.x)}
            cy={round(last.y)}
            r={round(width * 0.85)}
            fill={stops[stops.length - 1]}
          />
        </>
      )}
    </g>
  );
}

/** A coordinate, rounded so server and client write the same attribute. */
function round(value: number): number {
  return Number(value.toFixed(PRECISION));
}
