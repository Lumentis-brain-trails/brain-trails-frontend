"use client";

/**
 * What was on screen at the cursor, for one column of the comparison view.
 *
 * Three cases, by what the session can give back:
 *
 * - **a go/no-go block** is repainted by the task's own painter from a scene rebuilt out
 *   of the timeline (`lib/compare/frame.ts`) - the same drawing the person saw;
 * - **a video block** shows the video, paused and seeked to the moment through the
 *   mapping the run recorded (`review/timeline.ts`);
 * - **anything else** says in words what the screen held: the instruction on screen, eyes
 *   closed, a breathing guide. Nothing is invented where nothing was recorded.
 */
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { paint } from "@/components/protocol/kinds/render";
import { sceneAt, trialsOf } from "@/lib/compare/frame";
import type { WireEvent } from "@/lib/protocol/marker";

const ASPECT = 16 / 9;

export interface FrameVideo {
  url: string;
  poster?: string | null;
  /** Seconds into the video at the cursor. */
  time: number;
}

export function BlockFrame({
  kind,
  label,
  config,
  events,
  block,
  t,
  video,
}: {
  kind: string | null | undefined;
  label: string;
  /** The block's config from the plan the browser ran, when known. */
  config: Record<string, unknown> | null;
  events: readonly WireEvent[];
  block: { t_start_s: number; t_end_s: number };
  t: number;
  video: FrameVideo | null;
}) {
  if (kind === "go-no-go")
    return <TaskFrame events={events} block={block} t={t} label={label} />;
  if (video) return <VideoFrame video={video} label={label} />;
  return <DescribedFrame kind={kind} config={config} label={label} />;
}

function TaskFrame({
  events,
  block,
  t,
  label,
}: {
  events: readonly WireEvent[];
  block: { t_start_s: number; t_end_s: number };
  t: number;
  label: string;
}) {
  const t_ = useTranslations("compare.frame");
  const canvas = useRef<HTMLCanvasElement>(null);
  const tracks = useMemo(
    () => trialsOf(events, block.t_start_s, block.t_end_s),
    [block.t_end_s, block.t_start_s, events]
  );
  const scene = useMemo(() => sceneAt(tracks, t), [t, tracks]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const width = element.clientWidth || 320;
    const height = width / ASPECT;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(context, { width, height }, scene);
  }, [scene]);

  return (
    <figure className="space-y-1">
      <canvas
        ref={canvas}
        className="aspect-video w-full rounded-[var(--radius-control)]"
        role="img"
        aria-label={t_("taskAria", { block: label })}
      />
      <figcaption className="type-caption text-ink-3">
        {scene.totalTrials > 0
          ? t_("trial", {
              n: scene.trialIndex + 1,
              total: scene.totalTrials,
            })
          : t_("noTrials")}
      </figcaption>
    </figure>
  );
}

function VideoFrame({ video, label }: { video: FrameVideo; label: string }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const node = element.current;
    if (node && Math.abs(node.currentTime - video.time) > 0.2)
      node.currentTime = video.time;
  }, [video.time]);
  return (
    <video
      ref={element}
      src={video.url}
      poster={video.poster ?? undefined}
      muted
      playsInline
      preload="auto"
      aria-label={label}
      className="aspect-video w-full rounded-[var(--radius-control)] bg-black"
    />
  );
}

function DescribedFrame({
  kind,
  config,
  label,
}: {
  kind: string | null | undefined;
  config: Record<string, unknown> | null;
  label: string;
}) {
  const t = useTranslations("compare.frame");
  const lines = instructionLines(config);
  const eyes = config?.eyes === "closed" ? "closed" : "open";
  let text: string;
  if (lines.length > 0) text = lines.join(" · ");
  else if (kind === "baseline") text = t(`baseline.${eyes}`);
  else if (kind === "breathing") text = t("breathing");
  else if (kind === "rest" || kind === "fixation") text = t("rest");
  else text = t("nothing");
  return (
    <div
      role="img"
      aria-label={label}
      className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-control)] bg-surface-2 p-4 text-center"
    >
      <p className="text-[14px] text-pretty whitespace-pre-line text-ink-2">
        {text}
      </p>
    </div>
  );
}

/** The text lines an instructions or text block put on screen, from its config. */
function instructionLines(config: Record<string, unknown> | null): string[] {
  const lines = config?.lines;
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) =>
      typeof line === "object" && line !== null && "text" in line
        ? String((line as { text: unknown }).text)
        : null
    )
    .filter((line): line is string => Boolean(line));
}
