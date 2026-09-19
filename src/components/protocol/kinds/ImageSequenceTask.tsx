"use client";

/**
 * Timed images at scheduled onsets.
 *
 * Driven by rAF against a precomputed schedule rather than by `setTimeout`, for the same
 * reason the game is: a timer fires when the event loop gets to it, while a frame
 * timestamp is when the browser actually intends to paint. Both the planned and the actual
 * onset are recorded.
 *
 * Every image is decoded before the first onset. A first-paint decode is a 30-80 ms onset
 * error that no amount of careful scheduling can recover.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ImageSequenceConfig,
  imageSequenceConfigSchema,
  imageSequenceDurationMs,
  planImageSequence,
  sourcesToPreload,
} from "@/lib/protocol/imageSequence";
import { mulberry32 } from "@/lib/protocol/rng";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";

const LATE_FRAME_MS = 34;

function ImageSequenceRenderer({
  config,
  emit,
  onComplete,
  stepId,
  seed,
}: TaskContext<ImageSequenceConfig>) {
  const planned = useMemo(
    () => planImageSequence(config, mulberry32(seed)),
    [config, seed]
  );
  const totalMs = useMemo(() => imageSequenceDurationMs(planned), [planned]);
  const [visible, setVisible] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const sources = sourcesToPreload(config);
    Promise.all(
      sources.map(
        (src) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => resolve(); // a missing asset must not wedge the run
            image.src = src;
          })
      )
    ).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let t0: number | null = null;
    let next = 0;

    const frame = (hostMs: number) => {
      if (t0 === null) t0 = hostMs;
      const nowMs = hostMs - t0;

      while (next < planned.length && nowMs >= planned[next].plannedOnsetMs) {
        const item = planned[next];
        const error = nowMs - item.plannedOnsetMs;
        setVisible(next);
        emit(
          {
            label: config.markers.onset,
            kind: "stimulus",
            meta: {
              stimulus_id: item.id,
              ...(item.class ? { stimulus_class_name: item.class } : {}),
              item_index: item.index,
              planned_onset_ms: item.plannedOnsetMs,
              actual_onset_ms: nowMs,
              onset_error_ms: error,
              ...(Math.abs(error) > LATE_FRAME_MS ? { late_frame: true } : {}),
            },
          },
          hostMs
        );
        next++;
      }

      const current = planned[next - 1];
      if (current && nowMs >= current.plannedOnsetMs + current.durationMs)
        setVisible(null);

      if (nowMs >= totalMs) {
        if (doneRef.current) return;
        doneRef.current = true;
        onComplete({
          stepId,
          taskKind: "image-sequence",
          summary: { images_shown: planned.length, duration_ms: totalMs },
        });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const item = visible === null ? null : planned[visible];

  return (
    <div className="flex h-full items-center justify-center bg-[#080b14]">
      {!ready && <p className="text-sm text-neutral-400">Loading&hellip;</p>}
      {ready && item && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt=""
          aria-hidden="true"
          className="max-h-full max-w-full object-contain"
        />
      )}
    </div>
  );
}

export const imageSequenceTaskKind: TaskKind<ImageSequenceConfig> = {
  name: "image-sequence",
  configSchema: imageSequenceConfigSchema,
  Renderer: ImageSequenceRenderer,
  motionSensitive: true,
};
