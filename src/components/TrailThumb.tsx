"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useChartTheme } from "@/lib/theme";
import { downsample, fitToBox } from "@/lib/thumb";
import { TrailRibbon } from "@/components/TrailRibbon";
import type { Analysis, Recording } from "@/lib/types";
import { Spinner } from "@/components/ui";

const W = 260;
const H = 150;
const PAD = 18;
const MAX_POINTS = 120;
/** Thin for a 260x150 box: enough to read the shape, cheap in a long list. */
const SAMPLES = 180;
const WIDTH = 3.4;

/**
 * A recording's own trail in miniature: the terrain's balls as faint rings and the
 * ribbon walked over them, from the first window's colour to the last. At this
 * size the windows themselves are left off the ribbon - they would be noise - but
 * the shape is the same curve the recording's own page draws.
 *
 * Real data only: a recording that has no analysis yet says so instead of showing
 * a stand-in shape.
 */
export function TrailThumb({ recording }: { recording: Recording }) {
  const theme = useChartTheme();
  const ready = recording.status === "done";
  const analysis = useQuery({
    queryKey: ["analysis", recording.id, recording.status],
    queryFn: () => api.get<Analysis>(`recordings/${recording.id}/analysis`),
    enabled: ready,
    staleTime: Infinity,
  });

  const frame =
    "flex h-[150px] items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface";

  if (!ready || analysis.isPending || analysis.isError) {
    const busy =
      recording.status === "uploaded" ||
      recording.status === "processing" ||
      (ready && analysis.isPending);
    return (
      <div className={frame}>
        <span className="type-caption flex items-center gap-2 text-ink-3">
          {busy && <Spinner />}
          {recording.status === "failed"
            ? "No trail: processing failed"
            : recording.status === "empty"
              ? "No trail: no EEG was recorded"
              : recording.status === "capturing"
                ? "Recording in progress"
                : busy
                  ? "Drawing the trail…"
                  : "Trail unavailable"}
        </span>
      </div>
    );
  }

  const data = analysis.data;
  const trail = downsample(
    data.points.map((p) => ({ x: p.pc1, y: p.pc2 })),
    MAX_POINTS
  );
  const nodes = (data.landscape?.positions ?? []).map(([x, y], i) => ({
    x,
    y,
    mass: data.landscape?.masses[i] ?? 0,
  }));
  const map = fitToBox([...trail, ...nodes], W, H, PAD);
  const maxMass = Math.max(1, ...nodes.map((n) => n.mass));
  const pts = trail.map((p, i) => ({
    ...map(p),
    u: i / Math.max(1, trail.length - 1),
  }));

  return (
    <div className={frame}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        role="img"
        aria-label={`Trail of ${recording.title}`}
      >
        {nodes.map((n, i) => {
          const p = map(n);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3 + 9 * Math.sqrt(n.mass / maxMass)}
              fill="none"
              stroke="var(--hairline-strong)"
            />
          );
        })}
        <TrailRibbon
          points={pts}
          stops={theme.trail}
          width={WIDTH}
          samples={SAMPLES}
          casing="var(--surface)"
        />
      </svg>
    </div>
  );
}
