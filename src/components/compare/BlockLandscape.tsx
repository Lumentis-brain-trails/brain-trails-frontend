"use client";

/**
 * One block's stretch of a recording, resting on the person's brain landscape.
 *
 * The recording's windows were placed on the map by the backend (`trail`); this picks
 * the block's own - start inside `[t_start_s, t_end_s)`, the rule the block's labels were
 * cut with, so label `i` belongs to window `i` - and colours them the way the flat trail
 * does (`lib/compare/labels.ts`): colour for what was on screen, marker for what was
 * done, the time ramp for a block without trials. The rest of the recording stays as a
 * faint line on the same ground.
 */
import { useMemo } from "react";
import {
  type Camera,
  LandscapeSurface,
} from "@/components/compare/LandscapeSurface";
import { useLabelNamer } from "@/components/compare/useLabelNamer";
import { formatClock } from "@/lib/builder/draft";
import type { BrainLandscape } from "@/lib/brainLandscape";
import { groupSlot, markerOf, parseLabel } from "@/lib/compare/labels";
import { trailHexAt, useChartTheme } from "@/lib/theme";

const SYMBOL = {
  dot: "circle",
  ring: "circle-open",
  diamond: "diamond",
} as const;

export function BlockLandscape({
  landscape,
  block,
  labels,
  groups,
  t,
  camera,
  onCamera,
  title,
}: {
  landscape: BrainLandscape;
  block: { t_start_s: number; t_end_s: number };
  labels: readonly (string | null)[] | null | undefined;
  groups: readonly string[];
  /** Session seconds of this column's cursor. */
  t: number;
  camera: Camera;
  onCamera: (camera: Camera) => void;
  title: string;
}) {
  const theme = useChartTheme();
  const namer = useLabelNamer();
  const trail = landscape.trail;

  const drawn = useMemo(() => {
    if (!trail) return null;
    const rows = trail.t
      .map((time, i) => ({ time, i }))
      .filter(({ time }) => time >= block.t_start_s && time < block.t_end_s);
    const last = Math.max(1, rows.length - 1);
    const lit = {
      x: rows.map(({ i }) => trail.x[i]),
      y: rows.map(({ i }) => trail.y[i]),
      time: rows.map(({ time }) => time),
      colors: rows.map((_, k) => {
        const label = labels?.[k];
        if (!labels) return trailHexAt(theme.trail, k / last);
        if (!label) return theme.ink3;
        const slot = groupSlot(groups, parseLabel(label).group);
        return slot === null ? theme.ink3 : theme.labels[slot];
      }),
      symbols: rows.map((_, k) => {
        const label = labels?.[k];
        return label ? SYMBOL[markerOf(parseLabel(label).act)] : "circle";
      }),
      text: rows.map(({ time }, k) => {
        const label = labels?.[k];
        const clock = formatClock(time - block.t_start_s);
        return label ? `${clock} · ${namer.label(label)}` : clock;
      }),
    };
    return { context: { x: trail.x, y: trail.y }, lit };
  }, [block, groups, labels, namer, theme, trail]);

  if (!drawn) return null;
  // the window under the slider: the last one starting at or before it
  const at = Math.max(
    0,
    drawn.lit.time.findLastIndex((time) => time <= t)
  );
  const cursor =
    drawn.lit.x.length > 0 ? { x: drawn.lit.x[at], y: drawn.lit.y[at] } : null;

  return (
    <LandscapeSurface
      landscape={landscape}
      trails={[{ ...drawn.context, colors: [], faint: true }, drawn.lit]}
      cursor={cursor}
      height={300}
      camera={camera}
      onCamera={onCamera}
      title={title}
    />
  );
}
