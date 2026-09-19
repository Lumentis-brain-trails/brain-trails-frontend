"use client";

/**
 * Band power over the session, under the timeline (sprint S20).
 *
 * One line per band, averaged over the channels, on the session clock - the same axis as
 * the scrubber above it, so a bump in alpha and the clip that was playing line up
 * vertically without anyone having to compare two time scales. Relative power (each
 * band's share of the total) rather than absolute microvolts squared: it is what a
 * reader can compare across sessions and across people.
 *
 * Artefact load is drawn as a grey wash: where it is high, the lines above it mean
 * little, and saying so on the picture beats a caveat in a caption.
 */

import { useMemo } from "react";

export interface FeatureSeries {
  t: number[];
  bands: Record<string, number[][]>;
  artefact?: number[];
}

const BAND_COLOR: Record<string, string> = {
  delta: "var(--chart-1, #7c8cff)",
  theta: "var(--chart-2, #49c2a8)",
  alpha: "var(--chart-3, #f2a33c)",
  beta: "var(--chart-4, #e9668a)",
  gamma: "var(--chart-5, #9b8cff)",
};

const W = 800;
const H = 120;

export function BandStrip({
  features,
  t,
  duration,
  onSeek,
}: {
  features: FeatureSeries;
  t: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const bands = useMemo(() => {
    const names = Object.keys(features.bands);
    const perBand = names.map((name) => ({
      name,
      values: features.bands[name].map(mean),
    }));
    // Relative power: each band's share of the total at that window.
    const totals = features.t.map((_, i) =>
      perBand.reduce((sum, band) => sum + (band.values[i] ?? 0), 0)
    );
    return perBand.map((band) => ({
      name: band.name,
      points: band.values.map((value, i) => ({
        x: (features.t[i] / Math.max(1, duration)) * W,
        y: H - (totals[i] > 0 ? value / totals[i] : 0) * H,
      })),
    }));
  }, [duration, features]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[120px] w-full cursor-pointer"
      role="img"
      aria-label="Relative band power over the session"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientX - box.left) / box.width) * duration);
      }}
    >
      {(features.artefact ?? []).map((load, i) =>
        load > 0.2 ? (
          <rect
            key={i}
            x={(features.t[i] / Math.max(1, duration)) * W}
            y={0}
            width={Math.max(
              1,
              ((features.t[1] ?? 1) - (features.t[0] ?? 0)) / Math.max(1, duration) * W
            )}
            height={H}
            fill="var(--ink-3)"
            opacity={Math.min(0.35, load * 0.35)}
          />
        ) : null
      )}
      {bands.map((band) => (
        <polyline
          key={band.name}
          points={band.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={BAND_COLOR[band.name] ?? "var(--ink-2)"}
          strokeWidth={1.6}
        />
      ))}
      <line
        x1={(t / Math.max(1, duration)) * W}
        x2={(t / Math.max(1, duration)) * W}
        y1={0}
        y2={H}
        stroke="var(--danger)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** The legend, next to the strip; kept here so the colours have one home. */
export function BandLegend({ bands }: { bands: string[] }) {
  return (
    <ul className="type-caption flex flex-wrap gap-3 text-ink-3">
      {bands.map((band) => (
        <li key={band} className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: BAND_COLOR[band] ?? "var(--ink-2)" }}
          />
          {band}
        </li>
      ))}
    </ul>
  );
}
