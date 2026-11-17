"use client";

/**
 * The landscape row of the comparison view: one block's stretch of the run on the
 * person's Brain Landscape (backend V3-0016).
 *
 * The flat trail above draws the run on this session's own terrain; this row puts the
 * same windows on the map of all the person's recordings, so a reader sees where on
 * their usual ground this block went. The rest of the run stays as a faint line, the
 * block's stretch is lit (coloured and marked by its trial labels like the flat trail,
 * else through the trail's time ramp), and a ring follows the column's slider. Both
 * columns share one camera: turning one landscape turns the other.
 *
 * The map is fetched once for the page by `CompareView` (`useRecordingLandscape`) and
 * only while this row is on screen. While the map predates the recording the backend
 * rebuilds it and the row says so, asking again until the trail is there.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  type Camera,
  LandscapeSurface,
  type SurfaceTrail,
} from "@/components/compare/LandscapeSurface";
import { Skeleton, Spinner } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { type BrainLandscape, landscapeProblem } from "@/lib/brainLandscape";
import { groupSlot, markerOf, parseLabel } from "@/lib/compare/labels";
import { blockTrajectory, placeAt, type Span } from "@/lib/compare/trajectory";
import { trailHexAt, useChartTheme } from "@/lib/theme";

/** How often to ask again while the map is being built or this recording added. */
const POLL_MS = 5000;
const HEIGHT = 300;

const SYMBOL = { dot: "circle", ring: "circle-open", diamond: "diamond" };

/** The status and code of a failed request, whatever threw it. */
function problemOf(error: unknown) {
  return error instanceof ApiRequestError
    ? { status: error.status, error: { code: error.error.code } }
    : error
      ? { status: 0 }
      : null;
}

/**
 * The person's landscape with this recording's trail, asked for only when `enabled`
 * (the landscape row is on screen), polled while the map or the trail is still coming.
 */
export function useRecordingLandscape(recordingId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["recording-landscape", recordingId],
    queryFn: () =>
      api.get<BrainLandscape>(`recordings/${recordingId}/landscape`),
    enabled,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data) return data.pending && !data.trail ? POLL_MS : false;
      return landscapeProblem(problemOf(query.state.error)) === "building"
        ? POLL_MS
        : false;
    },
  });
}

export type RecordingLandscape = ReturnType<typeof useRecordingLandscape>;

export function TrajectoryCell({
  landscape,
  block,
  windowT,
  labels,
  groups,
  kept,
  t,
  camera,
  onCamera,
  title,
  onRemove,
}: {
  landscape: RecordingLandscape;
  block: Span;
  /** Start times of the block's windows in the analysis, in order. */
  windowT: readonly number[];
  /** One label (or null) per window of the block, or null for a block without trials. */
  labels: readonly (string | null)[] | null;
  /** The recording's label groups in slot order (`labelGroups`). */
  groups: readonly string[];
  /** One flag per window of the block: whether the column's focus keeps it. */
  kept: readonly boolean[] | null;
  /** Session seconds of this column's cursor. */
  t: number;
  camera: Camera;
  onCamera: (camera: Camera) => void;
  /** The block's name, for the picture's label. */
  title: string;
  onRemove: () => void;
}) {
  const tr = useTranslations("compare");
  const theme = useChartTheme();
  const name = tr("rows.trajectory.name");
  const data = landscape.data;
  const trail = data?.trail ?? null;

  const stretch = useMemo(
    () => (trail ? blockTrajectory(trail, block, windowT) : null),
    [block, trail, windowT]
  );

  const trails = useMemo((): SurfaceTrail[] => {
    if (!trail || !stretch) return [];
    const n = stretch.t.length;
    const colors: string[] = [];
    const symbols: string[] = [];
    stretch.window.forEach((w, i) => {
      const dropped = w !== null && kept !== null && kept[w] === false;
      const label = w !== null && labels ? labels[w] : null;
      if (dropped) {
        colors.push(theme.ink3);
        symbols.push("circle");
      } else if (labels) {
        const parsed = label ? parseLabel(label) : null;
        const slot = parsed ? groupSlot(groups, parsed.group) : null;
        colors.push(slot === null ? theme.ink3 : theme.labels[slot]);
        symbols.push(SYMBOL[markerOf(parsed?.act ?? null)]);
      } else {
        colors.push(trailHexAt(theme.trail, i / Math.max(1, n - 1)));
        symbols.push("circle");
      }
    });
    return [
      {
        x: trail.x,
        y: trail.y,
        colors: trail.x.map(() => theme.ink3),
        faint: true,
      },
      { x: stretch.x, y: stretch.y, colors, symbols },
    ];
  }, [groups, kept, labels, stretch, theme, trail]);

  const problem = data ? null : landscapeProblem(problemOf(landscape.error));

  return (
    <div className="min-w-0 space-y-2 rounded-[var(--radius-control)] border border-hairline p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">{name}</h3>
          <p className="type-caption text-pretty text-ink-3">
            {tr("rows.trajectory.meaning")}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={tr("removeRow", { row: name })}
          className="pressable -mt-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {landscape.isLoading && <Skeleton className="h-[220px]" />}
      {problem && (
        <p className="text-[14px] text-ink-3">{tr(`trajectory.${problem}`)}</p>
      )}
      {data && !trail && (
        <p className="flex items-center gap-2 text-[14px] text-ink-3">
          {data.pending && <Spinner className="h-3 w-3 text-accent" />}
          {tr(data.pending ? "trajectory.adding" : "trajectory.missing")}
        </p>
      )}
      {data && trail && stretch && (
        <>
          <LandscapeSurface
            landscape={data}
            trails={trails}
            cursor={placeAt(stretch, t)}
            height={HEIGHT}
            camera={camera}
            onCamera={onCamera}
            title={tr("trajectory.aria", { block: title })}
          />
          {stretch.t.length === 0 && (
            <p className="type-caption text-ink-3">{tr("trajectory.empty")}</p>
          )}
        </>
      )}
    </div>
  );
}
