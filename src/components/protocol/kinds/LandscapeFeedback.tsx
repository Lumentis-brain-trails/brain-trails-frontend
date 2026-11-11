"use client";

/**
 * Neurofeedback toward places of the person's own landscape (V4-0010): the
 * `neurofeedback` kind with `signal: landscape_region`.
 *
 * The value is where the person is on their map, window by window, from the live
 * service (`ctx.position`); the raw EEG (`ctx.signal`) only gates it, so a window made
 * of a blink or a jaw clench is held. `LandscapeEngine` does the rest as the band engine
 * does: baseline, threshold, the operator's nudges, the picture's level under the
 * luminance limit (H4).
 *
 * Every update is a timeline event, as the band block's are: `nf_update` with the
 * window, the closeness, the averaged position and its distance to the nearest target,
 * and `age_ms` from the worker's lag plus the frame's way here. One a second: a 30
 * minute block is 1,800 of them.
 */

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { FeedbackStage } from "@/components/neurofeedback/FeedbackStage";
import {
  type FeedbackFrame,
  restingFrame,
} from "@/components/neurofeedback/frame";
import {
  LandscapeEngine,
  type LandscapeOutput,
  MAP_SMOOTH,
  STEP_S,
} from "@/lib/neurofeedback/landscape";
import type { NeurofeedbackConfig } from "@/lib/protocol/blocks";
import { FRAME_MS, timingMeta } from "@/lib/protocol/marker";
import type { TaskContext } from "@/lib/protocol/types";
import { Stage, useFinish, useLatest } from "./shared";

/** No window for this long: the live service is gone, the record says so. */
const POSITION_LOST_MS = 10_000;
/**
 * No first window in this long: nobody analyses the room (the live service is full,
 * or off), so the block says so instead of a black stage for the whole plan.
 */
export const FIRST_POSITION_MS = 25_000;
/** A block that never hears enough still ends: its plan plus this much. */
const GRACE_S = 60;
const NOTICE_MS = 4000;

type Notice = "unavailable" | "baseline_failed" | "timeout" | null;

export function LandscapeRenderer(ctx: TaskContext<NeurofeedbackConfig>) {
  const t = useTranslations("kinds");
  const { config, signal, position, adjustments } = ctx;
  const finish = useFinish(ctx, "neurofeedback");
  const emit = useLatest(ctx.emit);
  const engine = useMemo(() => new LandscapeEngine(config), [config]);
  const style = useMemo(
    () => ({
      filter: `brightness(${engine.restingBrightness.toFixed(4)})`,
      // one update a second: each change is drawn over the second it covers
      transition: "filter 1000ms linear",
    }),
    [engine]
  );
  const pictureRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<FeedbackFrame>(
    restingFrame(engine.restingBrightness)
  );
  const [notice, setNotice] = useState<Notice>(position ? null : "unavailable");
  const tally = useRef({
    updates: 0,
    inTarget: 0,
    gated: 0,
    nudges: 0,
    thresholdStart: null as number | null,
  });
  const targets = config.targets!;

  const summary = (extra: Record<string, unknown> = {}) => ({
    signal: config.signal,
    direction: engine.direction,
    targets: targets.points.length,
    preset: targets.preset,
    updates: tally.current.updates,
    in_target_updates: tally.current.inTarget,
    gated_updates: tally.current.gated,
    threshold_start: tally.current.thresholdStart,
    threshold_end: engine.currentThreshold,
    nudges: tally.current.nudges,
    ...extra,
  });
  const summaryRef = useLatest(summary);

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    emit.current({
      label: "nf_start",
      kind: "stage",
      meta: {
        signal: config.signal,
        feedback: config.feedback,
        direction: engine.direction,
        channels: [],
        targets: targets.points,
        radius: targets.radius,
        epoch: targets.epoch,
        preset: targets.preset,
        step_s: STEP_S,
        smooth_windows: MAP_SMOOTH,
        threshold_mode: config.threshold.mode,
        baseline_s: config.baseline_s,
        duration_s: config.duration_s,
        live_signal: Boolean(position),
        eeg_gate: Boolean(signal),
      },
    });
    if (position && config.baseline_s > 0)
      emit.current({ label: "nf_baseline_start", kind: "stage" });
  }, [config, emit, engine, position, signal, targets]);

  // the raw EEG, for the artefact gate only
  useEffect(
    () => signal?.subscribe((packet) => engine.pushEeg(packet)),
    [engine, signal]
  );

  useEffect(() => {
    if (!position) return;
    let last = performance.now();
    let lost = false;
    const handle = (output: LandscapeOutput) => {
      switch (output.type) {
        case "update": {
          const u = output.update;
          tally.current.updates += 1;
          if (u.inTarget) tally.current.inTarget += 1;
          if (u.gated) tally.current.gated += 1;
          frameRef.current = {
            level: u.level,
            brightness: u.brightness,
            blurPx: u.blurPx,
            inTarget: u.inTarget,
            phase: u.phase,
          };
          const el = pictureRef.current;
          if (el)
            el.style.filter = `brightness(${u.brightness.toFixed(4)})${u.blurPx > 0 ? ` blur(${u.blurPx.toFixed(2)}px)` : ""}`;
          requestAnimationFrame((frameMs) =>
            emit.current(
              {
                label: "nf_update",
                kind: "stimulus",
                meta: {
                  nf_phase: u.phase,
                  window: u.window,
                  value: sig(u.value),
                  smoothed: sig(u.smoothed),
                  x: sig(u.x),
                  y: sig(u.y),
                  distance: sig(u.distance),
                  threshold: sig(u.threshold),
                  in_target: u.inTarget,
                  gated: u.gated,
                  brightness: Math.round(u.brightness * 10_000) / 10_000,
                  age_ms: Math.round(frameMs - u.hostMs + (u.lagMs ?? 0)),
                  ...timingMeta("raf", FRAME_MS),
                },
              },
              frameMs
            )
          );
          return;
        }
        case "threshold":
          tally.current.thresholdStart ??= output.threshold;
          emit.current({
            label: "nf_threshold",
            kind: "stage",
            meta: {
              threshold: output.threshold,
              previous: output.previous,
              cause: output.cause,
            },
          });
          return;
        case "baseline_end":
          emit.current({
            label: "nf_baseline_end",
            kind: "stage",
            meta: {
              updates: output.updates,
              clean: output.clean,
              extended: output.extended,
            },
          });
          return;
        case "baseline_extended":
          emit.current({
            label: "nf_baseline_extended",
            kind: "system",
            meta: { updates: output.updates, clean: output.clean },
          });
          return;
        case "baseline_failed":
          emit.current({
            label: "nf_baseline_failed",
            kind: "system",
            meta: {
              updates: output.updates,
              clean: output.clean,
              clean_share: output.updates ? output.clean / output.updates : 0,
            },
          });
          return;
        case "done":
          if (output.reason === "baseline_failed") setNotice("baseline_failed");
          else finish(summaryRef.current({ ended: "duration" }));
      }
    };
    let heard = false;
    const unheard = setTimeout(() => {
      if (heard) return;
      emit.current({ label: "nf_no_position", kind: "system" });
      setNotice("unavailable");
    }, FIRST_POSITION_MS);
    const unsubscribe = position.subscribe((point) => {
      heard = true;
      last = performance.now();
      if (lost) {
        lost = false;
        emit.current({ label: "nf_signal_back", kind: "system" });
      }
      for (const output of engine.push(point)) handle(output);
    });
    const watchdog = setInterval(() => {
      if (lost || performance.now() - last < POSITION_LOST_MS) return;
      lost = true;
      emit.current({ label: "nf_signal_lost", kind: "system" });
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(watchdog);
      clearTimeout(unheard);
    };
  }, [emit, engine, finish, position, summaryRef]);

  useEffect(
    () =>
      adjustments?.subscribe(({ steps, commandId }) => {
        const moved = engine.nudge(steps);
        if (!moved) return false;
        tally.current.nudges += 1;
        emit.current({
          label: "nf_threshold",
          kind: "stage",
          meta: {
            threshold: moved.threshold,
            previous: moved.previous,
            cause: "operator",
            steps,
            command_id: commandId,
          },
        });
        return true;
      }),
    [adjustments, emit, engine]
  );

  useEffect(() => {
    if (!position) return;
    const planned = config.baseline_s * 2 + config.duration_s + GRACE_S;
    const timer = setTimeout(() => setNotice("timeout"), planned * 1000);
    return () => clearTimeout(timer);
  }, [config.baseline_s, config.duration_s, position]);

  useEffect(() => {
    if (notice === null || notice === "unavailable") return;
    const timer = setTimeout(
      () => finish(summaryRef.current({ ended: notice })),
      NOTICE_MS
    );
    return () => clearTimeout(timer);
  }, [finish, notice, summaryRef]);

  if (notice === "unavailable")
    return (
      <Stage>
        <p className="max-w-xl text-xl leading-relaxed text-ink-2">
          {t("neurofeedback.needsLive")}
        </p>
        <Button onClick={() => finish(summary({ ended: "no_signal" }))}>
          {t("common.continue")}
        </Button>
      </Stage>
    );
  if (notice !== null)
    return (
      <Stage>
        <p className="max-w-xl text-xl leading-relaxed text-ink-2">
          {t(
            notice === "timeout"
              ? "neurofeedback.timeout"
              : "neurofeedback.baselineFailedMap"
          )}
        </p>
      </Stage>
    );

  return (
    <FeedbackStage
      feedback={config.feedback}
      src={config.src}
      frameRef={frameRef}
      videoRef={(el) => {
        pictureRef.current = el;
      }}
      videoStyle={style}
    />
  );
}

function sig(value: number | null): number | null {
  return value === null ? null : Number(value.toPrecision(6));
}
