"use client";

/**
 * Host for the Go/No-Go engine: a rAF loop, input, and a canvas. No game logic.
 *
 * Both challenges are this one component - Challenge B differs only by `variant: "cued"`
 * in its config, which is what makes the cued block a data change rather than a second
 * game. All the timing and scoring lives in the pure engine; this file only decides when
 * `step()` is called and what gets painted.
 *
 * Responses use `event.timeStamp`, not `performance.now()` inside the handler: both share
 * the same time origin, but the event's own timestamp excludes however long the main
 * thread took to get around to the handler, which is recovered accuracy on every RT.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  type EngineConfig,
  type EngineState,
  createEngine,
  scheduledDurationMs,
  step,
  toTrialRecords,
} from "@/lib/protocol/engine";
import { summarizePhase } from "@/lib/protocol/metrics";
import { mulberry32 } from "@/lib/protocol/rng";
import {
  type CuedTrial,
  type Trial,
  generateCuedGoNoGo,
  generateGoNoGo,
} from "@/lib/protocol/trials";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { SPACE_THEME, paint } from "./render";

const range = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
]);

const markerLabels = z.object({
  trialStart: z.string().max(50),
  cueOnset: z.string().max(50).optional(),
  stimulusOnset: z.string().max(50),
  response: z.string().max(50),
  outcome: z.string().max(50),
});

export const goNoGoConfigSchema = z.discriminatedUnion("variant", [
  z.object({
    variant: z.literal("simple"),
    n: z.number().int().positive(),
    goRatio: z.number().gt(0).lt(1),
    maxRun: z.number().int().positive(),
    maxNogoRun: z.number().int().positive().optional(),
    travelMs: range,
    itiMs: range,
    practice: z.boolean().optional(),
    markers: markerLabels,
  }),
  z.object({
    variant: z.literal("cued"),
    n: z.number().int().positive(),
    validGoRatio: z.number().gt(0).lt(1),
    nogoMix: z
      .object({
        redCargo: z.number().min(0),
        greenDebris: z.number().min(0),
        redDebris: z.number().min(0),
      })
      .optional(),
    maxCueRun: z.number().int().positive(),
    maxOutcomeRun: z.number().int().positive(),
    cueMs: range,
    cueTargetMs: range,
    travelMs: range,
    itiMs: range,
    markers: markerLabels,
  }),
]);

export type GoNoGoConfig = z.infer<typeof goNoGoConfigSchema>;

function buildTrials(
  config: GoNoGoConfig,
  seed: number
): (Trial | CuedTrial)[] {
  const rng = mulberry32(seed);
  if (config.variant === "simple") {
    return generateGoNoGo(
      {
        n: config.n,
        goRatio: config.goRatio,
        maxRun: config.maxRun,
        maxNogoRun: config.maxNogoRun,
        travelMs: config.travelMs as [number, number],
        itiMs: config.itiMs as [number, number],
        practice: config.practice,
      },
      rng
    );
  }
  return generateCuedGoNoGo(
    {
      n: config.n,
      validGoRatio: config.validGoRatio,
      nogoMix: config.nogoMix,
      maxCueRun: config.maxCueRun,
      maxOutcomeRun: config.maxOutcomeRun,
      cueMs: config.cueMs as [number, number],
      cueTargetMs: config.cueTargetMs as [number, number],
      travelMs: config.travelMs as [number, number],
      itiMs: config.itiMs as [number, number],
    },
    rng
  );
}

function GoNoGoRenderer({
  config,
  emit,
  onComplete,
  stepId,
  phase,
  seed,
  reducedMotion,
}: TaskContext<GoNoGoConfig>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState({ index: 0, total: config.n });

  // Everything the loop touches lives in refs: re-rendering must not restart the run.
  const stateRef = useRef<EngineState | null>(null);
  const pressRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const t0Ref = useRef<number | null>(null);

  const onPress = useCallback((atHostMs: number) => {
    if (pressRef.current === null) pressRef.current = atHostMs;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const engineConfig: EngineConfig = { phase, labels: config.markers };
    const trials = buildTrials(config, seed);
    stateRef.current = createEngine(trials, engineConfig);
    const totalMs = scheduledDurationMs(stateRef.current);

    let raf = 0;
    let size = { width: canvas.clientWidth, height: canvas.clientHeight };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = { width: canvas.clientWidth, height: canvas.clientHeight };
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (hostMs: number) => {
      if (t0Ref.current === null) t0Ref.current = hostMs;
      const current = stateRef.current;
      if (!current) return;

      const nowMs = hostMs - t0Ref.current;
      const pressHost = pressRef.current;
      pressRef.current = null;

      const out = step(current, {
        nowMs,
        ...(pressHost === null ? {} : { pressAtMs: pressHost - t0Ref.current }),
      });
      stateRef.current = out.state;

      // The engine reports run-relative times; the runner turns them into host times.
      for (const event of out.events) {
        emit(
          { label: event.label, kind: event.kind, meta: event.meta },
          event.atMs + t0Ref.current
        );
      }

      paint(ctx, size, out.scene, SPACE_THEME, reducedMotion);
      if (out.scene.trialIndex !== progress.index) {
        setProgress({
          index: out.scene.trialIndex,
          total: out.scene.totalTrials,
        });
      }

      if (out.state.phase === "done" || nowMs > totalMs + 2000) {
        if (doneRef.current) return;
        doneRef.current = true;
        const trialRecords = toTrialRecords(out.state, phase);
        onComplete({
          stepId,
          taskKind: "go-no-go",
          summary: { ...summarizePhase(phase, trialRecords) },
          trials: trialRecords,
        });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // The run is built once per step mount; the runner remounts via `key` between steps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard, pointer and the on-screen button all funnel into one response path.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) onPress(event.timeStamp);
    };
    const onPointer = (event: PointerEvent) => onPress(event.timeStamp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onPress]);

  return (
    <div className="flex h-full flex-col">
      <canvas
        ref={canvasRef}
        className="min-h-0 w-full flex-1"
        role="img"
        aria-label="Signal Navigator stimulus area"
      />
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <span className="type-caption text-ink-3" aria-live="off">
          Trial {Math.min(progress.index + 1, progress.total)} of{" "}
          {progress.total}
        </span>
        <button
          type="button"
          onPointerDown={(event) => onPress(event.timeStamp)}
          className="pressable rounded-full bg-accent px-10 py-4 text-base font-semibold text-on-accent hover:bg-accent-hover"
        >
          Dock
        </button>
      </div>
    </div>
  );
}

export const goNoGoTaskKind: TaskKind<GoNoGoConfig> = {
  name: "go-no-go",
  configSchema: goNoGoConfigSchema,
  Renderer: GoNoGoRenderer,
  motionSensitive: true,
};
