"use client";

/**
 * Live neurofeedback (backend V4-0009): a looped, muted video that brightens -
 * and, with `clarity`, sharpens - while the person's EEG is in the target zone.
 *
 * The only kind that reads the live signal (`ctx.signal`). Everything is computed here,
 * in the participant's window, by `NeurofeedbackEngine`: the window's band power, the
 * artefact gate, the smoothing, the threshold the baseline sets, the operator's nudges
 * (`ctx.adjustments`) and the picture's level under the luminance limit (H4). The
 * picture is written straight to the element's style, not through React state, so an
 * update reaches the screen on the next frame (the latency target is 250 ms); a short
 * linear transition draws each change so nothing is ever stepped.
 *
 * Every update, threshold change and baseline edge is a timeline event (`nf_*`), so the
 * session can be analysed and audited afterwards and the backend can replay the
 * computation from the uploaded EEG. `nf_update` is stamped at the frame that shows it,
 * with its `age_ms`: from the arrival of the oldest packet it is the first to include.
 */

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type NeurofeedbackConfig,
  neurofeedbackConfigSchema,
} from "@/lib/protocol/blocks";
import { Button } from "@/components/ui";
import { FRAME_MS, timingMeta } from "@/lib/protocol/marker";
import {
  HOP_SAMPLES,
  NeurofeedbackEngine,
  type NfOutput,
  SFREQ,
} from "@/lib/neurofeedback/engine";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { Stage, useFinish, useLatest } from "./shared";

/** No packet for this long: the headband is gone, the operator is told. */
const SIGNAL_LOST_MS = 5000;

/** A block that never hears enough signal still ends: its plan plus this much. */
const GRACE_S = 30;

/** How long the participant reads why the block stops, before it does. */
const NOTICE_MS = 4000;

type Notice = "unavailable" | "baseline_failed" | "timeout" | null;

function NeurofeedbackRenderer(ctx: TaskContext<NeurofeedbackConfig>) {
  const t = useTranslations("kinds");
  const { config, signal, adjustments } = ctx;
  const finish = useFinish(ctx, "neurofeedback");
  const emit = useLatest(ctx.emit);
  const engine = useMemo(() => new NeurofeedbackEngine(config), [config]);
  // The picture at rest, once: later updates write the element's style directly, and a
  // style prop that changed would overwrite them on the next render.
  const style = useMemo(
    () => ({
      filter: `brightness(${engine.restingBrightness.toFixed(4)})`,
      transition: "filter 90ms linear",
    }),
    [engine]
  );
  const pictureRef = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState<Notice>(signal ? null : "unavailable");
  const tally = useRef({
    updates: 0,
    inTarget: 0,
    gated: 0,
    nudges: 0,
    thresholdStart: null as number | null,
  });

  const summary = (extra: Record<string, unknown> = {}) => ({
    signal: config.signal,
    direction: engine.direction,
    channels: [...engine.channels],
    updates: tally.current.updates,
    in_target_updates: tally.current.inTarget,
    gated_updates: tally.current.gated,
    threshold_start: tally.current.thresholdStart,
    threshold_end: engine.currentThreshold,
    nudges: tally.current.nudges,
    ...extra,
  });
  const summaryRef = useLatest(summary);

  // What the block resolved for itself, before anything else: the defaults that came
  // from the signal are on the record, not only in this code.
  useEffect(() => {
    emit.current({
      label: "nf_start",
      kind: "stage",
      meta: {
        signal: config.signal,
        direction: engine.direction,
        channels: [...engine.channels],
        window_s: config.window_s,
        hop_samples: HOP_SAMPLES,
        sfreq: SFREQ,
        threshold_mode: config.threshold.mode,
        baseline_s: config.baseline_s,
        duration_s: config.duration_s,
        live_signal: Boolean(signal),
      },
    });
    if (signal && config.baseline_s > 0)
      emit.current({ label: "nf_baseline_start", kind: "stage" });
  }, [config, emit, engine, signal]);

  // The signal, packet by packet, through the engine.
  useEffect(() => {
    if (!signal) return;
    let lastPacket = performance.now();
    let lost = false;
    const handle = (output: NfOutput) => {
      switch (output.type) {
        case "update": {
          const u = output.update;
          tally.current.updates += 1;
          if (u.inTarget) tally.current.inTarget += 1;
          if (u.gated) tally.current.gated += 1;
          const el = pictureRef.current;
          if (el)
            el.style.filter = `brightness(${u.brightness.toFixed(4)})${u.blurPx > 0 ? ` blur(${u.blurPx.toFixed(2)}px)` : ""}`;
          requestAnimationFrame((frameMs) =>
            emit.current(
              {
                label: "nf_update",
                kind: "stimulus",
                meta: {
                  phase: u.phase,
                  value: u.value,
                  smoothed: u.smoothed,
                  threshold: u.threshold,
                  in_target: u.inTarget,
                  gated: u.gated,
                  level: round(u.level),
                  brightness: round(u.brightness),
                  sample_end: u.sampleEnd,
                  age_ms: u.firstArrivalMs
                    ? Math.round(frameMs - u.firstArrivalMs)
                    : null,
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
    const unsubscribe = signal.subscribe((packet) => {
      lastPacket = performance.now();
      if (lost) {
        lost = false;
        emit.current({ label: "nf_signal_back", kind: "system" });
      }
      for (const output of engine.push(packet)) handle(output);
    });
    const watchdog = setInterval(() => {
      if (lost || performance.now() - lastPacket < SIGNAL_LOST_MS) return;
      lost = true;
      emit.current({ label: "nf_signal_lost", kind: "system" });
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(watchdog);
    };
  }, [emit, engine, finish, signal, summaryRef]);

  // The operator's nudges (V4-0009): logged here with the command they came from.
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

  // A block that never hears enough signal still ends.
  useEffect(() => {
    if (!signal) return;
    const planned = config.baseline_s * 2 + config.duration_s + GRACE_S;
    const timer = setTimeout(() => setNotice("timeout"), planned * 1000);
    return () => clearTimeout(timer);
  }, [config.baseline_s, config.duration_s, signal]);

  // Why the block stops early, read for a moment, then the run goes on.
  useEffect(() => {
    if (notice === null || notice === "unavailable") return;
    const timer = setTimeout(
      () => finish(summaryRef.current({ ended: notice })),
      NOTICE_MS
    );
    return () => clearTimeout(timer);
  }, [finish, notice, summaryRef]);

  if (notice === "unavailable") {
    return (
      <Stage>
        <p className="max-w-xl text-xl leading-relaxed text-ink-2">
          {t("neurofeedback.needsHeadband")}
        </p>
        <Button onClick={() => finish(summary({ ended: "no_signal" }))}>
          {t("common.continue")}
        </Button>
      </Stage>
    );
  }
  if (notice !== null) {
    return (
      <Stage>
        <p className="max-w-xl text-xl leading-relaxed text-ink-2">
          {t(
            notice === "timeout"
              ? "neurofeedback.timeout"
              : "neurofeedback.baselineFailed"
          )}
        </p>
      </Stage>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-black">
      <video
        ref={(el) => {
          pictureRef.current = el;
        }}
        src={config.src}
        autoPlay
        loop
        muted
        playsInline
        style={style}
        className="max-h-full max-w-full"
      />
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export const neurofeedbackTaskKind: TaskKind<NeurofeedbackConfig> = {
  name: "neurofeedback",
  configSchema: neurofeedbackConfigSchema,
  Renderer: NeurofeedbackRenderer,
};
