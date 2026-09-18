"use client";

/**
 * The reset stage: a paced breathing exercise, then the if-then rule.
 *
 * The spec is explicit that these are two different things and must read as two different
 * things - breathing is a state transition, the rule is a task instruction - so they are
 * visually separated here and never blended into a per-trial action.
 *
 * Under reduced motion the circle stops scaling but the *pacing* survives: the phase word
 * and a linear progress bar carry it. Removing the pacing would remove the exercise.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BreathingConfig,
  type BreathingSegment,
  breathingConfigSchema,
  breathingDurationMs,
  planBreathing,
} from "@/lib/protocol/breathing";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";

const PHASE_WORD: Record<BreathingSegment["phase"], string> = {
  inhale: "Breathe in",
  hold: "Hold",
  exhale: "Breathe out",
  rule: "",
};

function BreathingRenderer({
  config,
  emit,
  onComplete,
  stepId,
  reducedMotion,
}: TaskContext<BreathingConfig>) {
  const segments = useMemo(() => planBreathing(config), [config]);
  const totalMs = useMemo(() => breathingDurationMs(config), [config]);
  const [index, setIndex] = useState(-1);
  const doneRef = useRef(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    segments.forEach((segment, i) => {
      timers.push(
        setTimeout(() => {
          setIndex(i);
          if (segment.cycleStart) {
            emit({
              label: config.markers.cycleStart,
              kind: "stimulus",
              meta: { cycle: segment.cycle },
            });
          }
          if (segment.marker) {
            emit({
              label: segment.marker,
              kind: segment.phase === "rule" ? "instruction" : "stimulus",
              meta: { cycle: segment.cycle, phase_name: segment.phase },
            });
          }
        }, segment.atMs)
      );
    });

    timers.push(
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onComplete({
          stepId,
          taskKind: "breathing",
          summary: { cycles: config.cycles, duration_ms: totalMs },
        });
      }, totalMs)
    );

    return () => timers.forEach(clearTimeout);
  }, [config, emit, onComplete, segments, stepId, totalMs]);

  const current = index >= 0 ? segments[index] : null;
  const isRule = current?.phase === "rule";
  const scale =
    current?.phase === "inhale" ? 1 : current?.phase === "hold" ? 1 : 0.55;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 px-6 text-center">
      {!isRule && (
        <>
          <div
            data-motion="decor"
            aria-hidden="true"
            className="h-40 w-40 rounded-full bg-indigo-500/25 ring-2 ring-indigo-400/50"
            style={
              reducedMotion
                ? undefined
                : {
                    transform: `scale(${scale})`,
                    transition: `transform ${current?.durationMs ?? 0}ms cubic-bezier(0.65, 0, 0.35, 1)`,
                  }
            }
          />
          <p
            aria-live="polite"
            className="text-2xl font-medium text-neutral-100"
          >
            {current ? PHASE_WORD[current.phase] : "Settle"}
          </p>
          {reducedMotion && current && (
            <div className="h-1 w-40 overflow-hidden rounded bg-neutral-700">
              <div
                data-motion="status"
                className="h-full bg-indigo-400"
                style={{
                  animation: `bt-breath-progress ${current.durationMs}ms linear forwards`,
                }}
              />
            </div>
          )}
        </>
      )}

      {isRule && (
        <p
          aria-live="polite"
          className="max-w-xl text-2xl leading-relaxed whitespace-pre-line text-neutral-100"
        >
          {current?.text}
        </p>
      )}

      <style>{`@keyframes bt-breath-progress { from { width: 0 } to { width: 100% } }`}</style>
    </div>
  );
}

export const breathingTaskKind: TaskKind<BreathingConfig> = {
  name: "breathing",
  configSchema: breathingConfigSchema,
  Renderer: BreathingRenderer,
};
