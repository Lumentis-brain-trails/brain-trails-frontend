"use client";

/**
 * Reading a session back (sprint S20): the video, the trail and the EEG on one clock.
 *
 * Everything on this page is drawn against the session clock (V1-0001), and one cursor
 * moves all of it: scrub the timeline and the video seeks, the trail marks the window
 * that was being recorded, the band powers show where you are. Playing the video moves
 * the cursor the other way, through the mapping the run itself recorded (`media_time_ms`
 * on every onset), so a paused or stalled video cannot drift the picture.
 *
 * The block bands come from the run's own `block_start`/`block_end` markers and the
 * plan the browser stored before the first block (V3-0004): what is shown is what was
 * shown, not what the protocol says today.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BandLegend, BandStrip } from "@/components/review/BandStrip";
import { Notes } from "@/components/review/Notes";
import { ReviewTrail } from "@/components/review/ReviewTrail";
import { Scrubber } from "@/components/review/Scrubber";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Button,
  Card,
  ErrorBanner,
  Icon,
  Skeleton,
  buttonClass,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatClock } from "@/lib/builder/draft";
import type { WireEvent } from "@/lib/protocol/marker";
import {
  blockAt,
  mediaTimeAt,
  mediaWindows,
  parseTimeline,
  runBlocks,
  sessionTimeAt,
  ticks as ticksOf,
} from "@/lib/review/timeline";
import type { Analysis, Recording } from "@/lib/types";

interface SessionDetail {
  id: string;
  title: string;
  protocol_id: string | null;
  protocol_version: number | null;
  resolved_plan: {
    steps?: { id: string; label?: string; kind?: string }[];
  } | null;
  events_url: string | null;
}

interface MediaLinks {
  media: Record<
    string,
    { url: string | null; kind: string; poster_url: string | null }
  >;
}

interface BlockMetrics {
  block_id: string;
  label: string;
  kind: string;
  condition?: string | null;
  t_start_s: number;
  t_end_s: number;
  bands?: Record<string, number>;
  ratios?: Record<string, number>;
  asymmetry?: number | null;
  artefact?: number | null;
  good_contact?: number | null;
  distance_from_baseline?: number | null;
}

interface Features {
  t: number[];
  channels: string[];
  bands: Record<string, number[][]>;
  artefact?: number[];
}

export default function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [t, setT] = useState(0);
  const [range, setRange] = useState<[number, number] | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const following = useRef(false);

  const recording = useQuery({
    queryKey: ["recording", id],
    queryFn: () =>
      api.get<
        Recording & {
          session_id?: string | null;
          quality?: { verdict?: string } | null;
        }
      >(`recordings/${id}`),
  });
  const sessionId = recording.data?.session_id ?? null;

  const analysis = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => api.get<Analysis>(`recordings/${id}/analysis`),
    enabled: recording.data?.status === "done",
  });
  const session = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.get<SessionDetail>(`sessions/${sessionId}`),
    enabled: sessionId !== null,
  });
  const links = useQuery({
    queryKey: ["session", sessionId, "media"],
    queryFn: () => api.get<MediaLinks>(`sessions/${sessionId}/media-urls`),
    enabled: sessionId !== null,
  });
  const features = useQuery({
    queryKey: ["features", id],
    queryFn: () =>
      api.get<Features>(`recordings/${id}/features?downsample=600`),
    enabled: recording.data?.status === "done",
    retry: false,
  });
  const blockMetrics = useQuery({
    queryKey: ["blocks", id],
    queryFn: () => api.get<BlockMetrics[]>(`recordings/${id}/blocks`),
    enabled: sessionId !== null,
    retry: false,
  });

  // The stored timeline is a presigned object, not an API route: fetch it directly.
  const timeline = useQuery({
    queryKey: ["timeline", session.data?.events_url],
    queryFn: async () => {
      const url = session.data?.events_url;
      if (!url) return [] as WireEvent[];
      const response = await fetch(url);
      return parseTimeline(await response.text());
    },
    enabled: Boolean(session.data?.events_url),
    staleTime: Infinity,
  });

  const events = useMemo(() => timeline.data ?? [], [timeline.data]);
  const blocks = useMemo(
    () => runBlocks(events, session.data?.resolved_plan),
    [events, session.data?.resolved_plan]
  );
  const windows = useMemo(() => mediaWindows(events, blocks), [blocks, events]);
  const ticks = useMemo(() => ticksOf(events), [events]);
  const duration =
    recording.data?.duration_s ??
    analysis.data?.points.at(-1)?.t_end ??
    blocks.at(-1)?.tEnd ??
    0;
  const currentBlock = blockAt(blocks, t);
  const at = mediaTimeAt(windows, t);
  const currentMedia = at?.mediaId ? links.data?.media[at.mediaId] : undefined;

  /** Seek everything: the cursor is the page's single source of position. */
  const seek = useCallback((next: number) => {
    following.current = false;
    setT(Math.max(0, next));
  }, []);

  // The video follows the cursor, unless the video itself is driving it (play).
  useEffect(() => {
    const element = video.current;
    if (!element || !at || following.current) return;
    if (Math.abs(element.currentTime - at.mediaTime) > 0.25)
      element.currentTime = at.mediaTime;
  }, [at]);

  if (recording.isPending)
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Skeleton className="h-72 w-full" />
      </main>
    );
  if (recording.isError || !recording.data)
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <ErrorBanner message="This recording is not yours to read." />
      </main>
    );

  const rec = recording.data;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href={`/recordings/${id}`}
        className="type-caption inline-flex items-center gap-1 font-medium text-accent hover:underline"
      >
        <Icon name="back" className="h-3.5 w-3.5" /> Recording
      </Link>
      <header className="mt-3 mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="type-title">{rec.title}</h1>
          <p className="type-caption mt-1 text-ink-3">
            {session.data?.title ?? "No protocol"}
            {" · "}
            {formatClock(duration)}
            {rec.quality?.verdict ? ` · signal ${rec.quality.verdict}` : ""}
          </p>
        </div>
        <StatusBadge status={rec.status} />
      </header>

      {rec.status !== "done" && (
        <div className="mb-6">
          <ErrorBanner message="The analysis is not ready yet: the trail and the metrics appear when the worker finishes." />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-black">
            {currentMedia?.url ? (
              <video
                ref={video}
                src={currentMedia.url}
                poster={currentMedia.poster_url ?? undefined}
                controls
                className="aspect-video w-full"
                onPlay={() => {
                  following.current = true;
                }}
                onPause={() => {
                  following.current = false;
                }}
                onTimeUpdate={(event) => {
                  if (!following.current || !at) return;
                  const back = sessionTimeAt(
                    windows,
                    at.blockId,
                    event.currentTarget.currentTime
                  );
                  if (back !== null) setT(back);
                }}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-ink-3">
                <p className="type-caption">
                  {currentBlock
                    ? `${currentBlock.label} — nothing on screen to replay`
                    : "No video at this moment"}
                </p>
              </div>
            )}
          </div>

          <Scrubber
            duration={duration}
            t={t}
            blocks={blocks}
            ticks={ticks}
            range={range}
            onSeek={seek}
            onRange={setRange}
          />

          {features.data && (
            <Card className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Band power</h2>
                <BandLegend bands={Object.keys(features.data.bands)} />
              </div>
              <BandStrip
                features={features.data}
                t={t}
                duration={duration}
                onSeek={seek}
              />
            </Card>
          )}

          {analysis.data && analysis.data.points.length > 1 && (
            <Card>
              <h2 className="mb-2 text-[15px] font-semibold">Trail</h2>
              <ReviewTrail
                analysis={analysis.data}
                t={t}
                range={range}
                onSeek={seek}
              />
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <Card className="space-y-2">
            <h2 className="text-[15px] font-semibold">At {formatClock(t)}</h2>
            <p className="text-ink-2">
              {currentBlock ? currentBlock.label : "Between blocks"}
              {currentBlock?.condition ? ` · ${currentBlock.condition}` : ""}
            </p>
            {range && (
              <div className="flex items-center gap-2">
                <p className="type-caption text-ink-3">
                  Selected {formatClock(range[0])}–{formatClock(range[1])}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRange(null)}
                >
                  Clear
                </Button>
              </div>
            )}
          </Card>

          {blockMetrics.data && blockMetrics.data.length > 0 && (
            <Card className="space-y-2">
              <h2 className="text-[15px] font-semibold">Per block</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="text-ink-3">
                    <tr>
                      <th className="text-left font-medium">Block</th>
                      <th className="text-right font-medium">Alpha</th>
                      <th className="text-right font-medium">Theta/beta</th>
                      <th className="text-right font-medium">Asym.</th>
                      <th className="text-right font-medium">From baseline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockMetrics.data.map((block) => (
                      <tr
                        key={`${block.block_id}-${block.t_start_s}`}
                        className="cursor-pointer border-t border-hairline hover:bg-surface-2"
                        onClick={() => seek(block.t_start_s)}
                      >
                        <td className="py-1">{block.label}</td>
                        <td className="text-right tabular-nums">
                          {fmt(block.bands?.alpha)}
                        </td>
                        <td className="text-right tabular-nums">
                          {fmt(block.ratios?.theta_beta)}
                        </td>
                        <td className="text-right tabular-nums">
                          {fmt(block.asymmetry)}
                        </td>
                        <td className="text-right tabular-nums">
                          {fmt(block.distance_from_baseline)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="type-caption text-ink-3">
                Relative power, averaged over the block. Distance from baseline
                is measured in the embedding space, so it compares across
                sessions.
              </p>
            </Card>
          )}

          <Notes
            recordingId={id}
            t={t}
            range={range}
            block={currentBlock}
            onSeek={seek}
          />

          <Link href={`/recordings/${id}`} className={buttonClass("secondary")}>
            Back to the recording
          </Link>
        </section>
      </div>
    </main>
  );
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}
