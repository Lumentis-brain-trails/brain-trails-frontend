"use client";

/**
 * A video, emitting the transport events decision V2-0002 names: play, pause, seek, ended.
 *
 * It never leaves the participant stuck. Playback is started explicitly rather than
 * through `autoplay`, which fails silently: when the browser refuses to start a video
 * with sound (Safari, an iOS web view) the step says so (`autoplay_blocked`) and offers a
 * Play button, whose tap is the gesture the browser wants. A file that cannot be played
 * marks `video_error` and offers Continue, instead of an error with no way forward.
 *
 * Frame-accurate onsets use `requestVideoFrameCallback`, whose `presentationTime` is on the
 * same time origin as `performance.now()`. Where it is unavailable the fallback is
 * `timeupdate`, which fires about four times a second - fine for "roughly where were they
 * in the video", useless for an ERP epoch - so those markers say so with
 * `onset_precision: "coarse"` rather than quietly implying a precision they do not have.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  MEDIA_REF_JSON,
  MEDIA_REF_MESSAGE,
  hasMediaRef,
  mediaRefShape,
} from "@/lib/protocol/blocks";
import { Button } from "@/components/ui";
import { FRAME_MS, UI_UNCERTAINTY_MS, timingMeta } from "@/lib/protocol/marker";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { useLatest } from "./shared";

/**
 * `src` or a library `media_id` (bound to `src` by `bindMedia` before the run); a
 * definition written as code may still give only `src`.
 */
export const videoConfigSchema = z
  .object({
    ...mediaRefShape,
    poster: z.string().optional(),
    allowPause: z.boolean().default(true),
    /** Marker offsets within the video, in seconds, e.g. scene boundaries. */
    cues: z
      .array(
        z.object({
          atS: z.number().min(0),
          label: z.string().max(50),
          note: z.string().optional(),
        })
      )
      .default([]),
    endOn: z.enum(["ended", "duration"]).default("ended"),
    durationMs: z.number().int().positive().optional(),
    /**
     * Play only a stretch of the file, in media seconds. This is what splitting a clip
     * on the builder's timeline writes: two blocks over one file, each with its part.
     */
    start_s: z.number().min(0).optional(),
    end_s: z.number().positive().optional(),
  })
  .refine((c) => c.end_s === undefined || c.end_s > (c.start_s ?? 0), {
    message: "The video must stop after it starts.",
    path: ["end_s"],
  })
  .refine(hasMediaRef, { message: MEDIA_REF_MESSAGE, path: ["src"] })
  .meta(MEDIA_REF_JSON);

export type VideoConfig = z.infer<typeof videoConfigSchema>;

/** How far before a trimmed start a frame may be and still count as the clip's first. */
const SEEK_SLACK_S = 0.1;

interface VideoFrameMetadata {
  presentationTime: number;
  expectedDisplayTime?: number;
  mediaTime: number;
}
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: VideoFrameMetadata) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function VideoRenderer({
  config,
  emit,
  onComplete,
  stepId,
}: TaskContext<VideoConfig>) {
  const videoRef = useRef<VideoWithFrameCallback>(null);
  const firedRef = useRef(new Set<number>());
  const doneRef = useRef(false);
  const onsetRef = useRef(false);
  const [error, setError] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(false);
  const startS = config.start_s ?? 0;
  // Through refs, so `finish` - and every timer and listener built on it - keeps its
  // identity whatever the runner passes.
  const emitRef = useLatest(emit);
  const onCompleteRef = useLatest(onComplete);

  const finish = useCallback(
    (extra: Record<string, unknown> = {}) => {
      if (doneRef.current) return;
      doneRef.current = true;
      const video = videoRef.current;
      if (onsetRef.current)
        emitRef.current({
          label: "stimulus_offset",
          kind: "stimulus",
          meta: {
            media_time_ms: video ? video.currentTime * 1000 : null,
            ...timingMeta("ui", UI_UNCERTAINTY_MS),
          },
        });
      onCompleteRef.current({
        stepId,
        taskKind: "video",
        summary: {
          watched_s: video ? video.currentTime : 0,
          duration_s:
            video && Number.isFinite(video.duration) ? video.duration : null,
          ...extra,
        },
      });
    },
    [emitRef, onCompleteRef, stepId]
  );

  /** Start playback; a refusal to autoplay turns into a Play button, not a still frame. */
  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    let attempt: Promise<void> | undefined;
    try {
      attempt = video.play();
    } catch {
      return; // no media support at all: the `error` event says the rest
    }
    attempt
      ?.then(() => {
        blockedRef.current = false;
        setBlocked(false);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string } | null)?.name !== "NotAllowedError")
          return; // an interrupted load (AbortError) retries on its own
        if (!blockedRef.current)
          emitRef.current({
            label: "autoplay_blocked",
            kind: "system",
            meta: { media_time_ms: video.currentTime * 1000 },
          });
        blockedRef.current = true;
        setBlocked(true);
      });
  }, [emitRef]);

  useEffect(() => {
    play();
  }, [play]);

  /*
   * Stimulus onset: the first presented frame. `requestVideoFrameCallback` reports that
   * frame's presentation time on the `performance.now()` origin, so the onset is the
   * frame itself (uncertain by the gap to its expected display time, at most a frame).
   * Without it, `playing` is the best the browser says, and the marker admits it.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onset = (hostMs: number, meta: Record<string, unknown>) => {
      if (onsetRef.current) return;
      onsetRef.current = true;
      emit(
        {
          label: "stimulus_onset",
          kind: "stimulus",
          meta: {
            ...meta,
            ...(config.media_id ? { media_id: config.media_id } : {}),
          },
        },
        hostMs
      );
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      let handle = 0;
      const onFrame = (_now: number, metadata: VideoFrameMetadata) => {
        // a trimmed clip may present a frame from before its start while it seeks there
        if (metadata.mediaTime < startS - SEEK_SLACK_S) {
          handle = video.requestVideoFrameCallback!(onFrame);
          return;
        }
        const gap =
          metadata.expectedDisplayTime === undefined
            ? FRAME_MS
            : Math.abs(
                metadata.expectedDisplayTime - metadata.presentationTime
              );
        onset(metadata.presentationTime, {
          media_time_ms: metadata.mediaTime * 1000,
          ...timingMeta("rvfc", Math.min(gap, FRAME_MS)),
        });
      };
      handle = video.requestVideoFrameCallback(onFrame);
      return () => video.cancelVideoFrameCallback?.(handle);
    }
    const onPlaying = () =>
      onset(performance.now(), {
        media_time_ms: video.currentTime * 1000,
        ...timingMeta("ui", UI_UNCERTAINTY_MS),
      });
    video.addEventListener("playing", onPlaying);
    return () => video.removeEventListener("playing", onPlaying);
  }, [config.media_id, emit, startS]);

  // Cue markers, at frame precision where the browser offers it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || config.cues.length === 0) return;

    const fireDue = (mediaTimeS: number, hostMs: number, precise: boolean) => {
      config.cues.forEach((cue, index) => {
        if (firedRef.current.has(index) || mediaTimeS < cue.atS) return;
        firedRef.current.add(index);
        emit(
          {
            label: cue.label,
            kind: "stimulus",
            meta: {
              planned_onset_ms: cue.atS * 1000,
              media_time_ms: mediaTimeS * 1000,
              onset_precision: precise ? "frame" : "coarse",
              ...(precise
                ? timingMeta("rvfc", FRAME_MS)
                : timingMeta("ui", 250)),
              ...(cue.note ? { note: cue.note } : {}),
            },
          },
          hostMs
        );
      });
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      let handle = 0;
      const onFrame = (_now: number, metadata: VideoFrameMetadata) => {
        fireDue(metadata.mediaTime, metadata.presentationTime, true);
        handle = video.requestVideoFrameCallback!(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
      return () => video.cancelVideoFrameCallback?.(handle);
    }

    const onTimeUpdate = () =>
      fireDue(video.currentTime, performance.now(), false);
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [config.cues, emit]);

  // Transport events.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const transport = (label: string) => () =>
      emit({
        label,
        kind: "stimulus",
        meta: { media_time_ms: video.currentTime * 1000 },
      });

    const onPlay = transport("play");
    const onPause = transport("pause");
    const seek = transport("seek");
    // the jump to a trimmed clip's start is the player's doing, not a seek to report
    const onSeek = () => {
      if (onsetRef.current) seek();
    };
    const onStall = transport("stall");
    const onEnded = () => {
      emit({
        label: "ended",
        kind: "stimulus",
        meta: { media_time_ms: video.currentTime * 1000 },
      });
      if (config.endOn === "ended") finish();
    };
    const onError = () => {
      const code = video.error?.code ?? null;
      emit({
        label: "video_error",
        kind: "system",
        meta: {
          media_error_code: code,
          media_time_ms: video.currentTime * 1000,
        },
      });
      setError(code ?? 0);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("stalled", onStall);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("stalled", onStall);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [config.endOn, emit, finish]);

  // A trimmed clip ends where its stretch ends, at frame precision where there is one.
  useEffect(() => {
    const video = videoRef.current;
    const endS = config.end_s;
    if (!video || endS === undefined || config.endOn !== "ended") return;
    const check = (mediaTimeS: number) => {
      if (mediaTimeS < endS) return false;
      video.pause();
      finish();
      return true;
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      let handle = 0;
      const onFrame = (_now: number, metadata: VideoFrameMetadata) => {
        if (!check(metadata.mediaTime))
          handle = video.requestVideoFrameCallback!(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
      return () => video.cancelVideoFrameCallback?.(handle);
    }
    const onTimeUpdate = () => check(video.currentTime);
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [config.end_s, config.endOn, finish]);

  // A fixed-duration step ends on its own clock, whatever the video does.
  useEffect(() => {
    if (config.endOn !== "duration" || !config.durationMs) return;
    const timer = setTimeout(() => finish(), config.durationMs);
    return () => clearTimeout(timer);
  }, [config.durationMs, config.endOn, finish]);

  return (
    <div className="relative flex h-full items-center justify-center bg-black">
      {error !== null ? (
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <p className="text-sm text-red-400">
            This video could not be played.
          </p>
          <Button
            onClick={() =>
              finish({ error: "media", media_error_code: error || null })
            }
          >
            Continue
          </Button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            // a media fragment: the browser opens the file at the stretch's first frame
            src={
              config.src
                ? startS > 0
                  ? `${config.src}#t=${startS}`
                  : config.src
                : undefined
            }
            poster={config.poster}
            playsInline
            // a refused autoplay needs a way to start, whatever the step allows
            controls={config.allowPause || blocked}
            className="max-h-full max-w-full"
          />
          {blocked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button onClick={play} aria-label="Play the video">
                Play
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const videoTaskKind: TaskKind<VideoConfig> = {
  name: "video",
  configSchema: videoConfigSchema,
  Renderer: VideoRenderer,
};
