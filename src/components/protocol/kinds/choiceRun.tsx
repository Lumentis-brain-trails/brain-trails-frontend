"use client";

/**
 * Runs the choice engine (`lib/protocol/choice.ts`) for a renderer.
 *
 * The engine decides *when*; this hook makes the screen agree. The scene is committed
 * with `flushSync` inside the animation frame that produced it, so the DOM changes before
 * that frame paints: a stimulus marker stamped on frame N is on screen on frame N, not on
 * N+1 after React gets round to it. Frames that change nothing visible do not render.
 *
 * Everything the loop touches lives in refs, like the Go/No-Go renderer's: a re-render
 * (the runner hands new `emit`/`onComplete` identities) must never restart a block.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  type ChoiceConfig,
  type ChoiceScene,
  type ChoiceState,
  type ChoiceTrial,
  choiceDurationMs,
  createChoiceEngine,
  stepChoice,
  summarizeChoice,
} from "@/lib/protocol/choice";
import type { TaskContext } from "@/lib/protocol/types";
import { useLatest } from "./shared";

const IDLE: ChoiceScene = {
  phase: "pending",
  cue: null,
  stimulus: null,
  upcoming: null,
  feedback: null,
  trialIndex: 0,
  totalTrials: 0,
  nowMs: 0,
};

/** What of a scene is visible; two scenes with the same face need no render. */
function face(scene: ChoiceScene, tickMs: number | null): string {
  return [
    scene.phase,
    scene.cue,
    scene.stimulus ? scene.trialIndex : "-",
    scene.feedback,
    scene.trialIndex,
    tickMs === null ? "" : Math.floor(scene.nowMs / tickMs),
  ].join("|");
}

export function useChoiceRun(
  ctx: Pick<TaskContext, "emit" | "onComplete" | "stepId">,
  taskKind: string,
  build: () => { trials: ChoiceTrial[]; config: ChoiceConfig },
  options: {
    /** Re-render at least this often (a countdown); null renders on change only. */
    tickMs?: number | null;
    /** Extra fields for the step's summary, from the finished state. */
    extra?: (state: ChoiceState) => Record<string, unknown>;
  } = {}
) {
  const [scene, setScene] = useState<ChoiceScene>(IDLE);
  const emit = useLatest(ctx.emit);
  const onComplete = useLatest(ctx.onComplete);
  const extra = useLatest(options.extra);
  const pressRef = useRef<{ key: string; atHostMs: number } | null>(null);
  const tickMs = options.tickMs ?? null;
  const { stepId } = ctx;

  const press = useCallback((key: string, atHostMs: number) => {
    if (pressRef.current === null) pressRef.current = { key, atHostMs };
  }, []);

  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") return;
    const { trials, config } = build();
    let state = createChoiceEngine(trials, config);
    const totalMs = choiceDurationMs(trials, config.maxDurationMs);
    let t0: number | null = null;
    let lastFace = "";
    let lastHostMs = 0;
    let done = false;
    let raf = 0;

    const frame = (hostMs: number) => {
      if (t0 === null) t0 = hostMs;
      const nowMs = hostMs - t0;
      const pending = pressRef.current;
      pressRef.current = null;
      // An input event's `timeStamp` shares the frame clock's origin in current
      // browsers, and then falls between the last frame and this one. Where it does not
      // (older WebKit stamped events with the wall clock) the frame is the best time
      // there is: late by under a frame, instead of wrong by decades.
      const pressAt =
        pending === null
          ? null
          : pending.atHostMs > lastHostMs - 1000 && pending.atHostMs <= hostMs
            ? pending.atHostMs
            : hostMs;
      lastHostMs = hostMs;
      const out = stepChoice(state, {
        nowMs,
        ...(pending && pressAt !== null
          ? { press: { key: pending.key, atMs: pressAt - t0 } }
          : {}),
      });
      state = out.state;
      for (const event of out.events) {
        emit.current(
          { label: event.label, kind: event.kind, meta: event.meta },
          event.atMs + t0
        );
      }
      const nextFace = face(out.scene, tickMs);
      if (nextFace !== lastFace) {
        lastFace = nextFace;
        flushSync(() => setScene(out.scene));
      }
      if (state.phase === "done" || nowMs > totalMs + 2000) {
        if (done) return;
        done = true;
        onComplete.current({
          stepId,
          taskKind,
          summary: {
            ...summarizeChoice(config.phase, state.outcomes),
            ...(extra.current ? extra.current(state) : {}),
          },
        });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // Built once per step mount; the runner remounts via `key` between steps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { scene, press };
}

/** Map physical keys to the task's response names; held keys do not repeat. */
export function useResponseKeys(
  keymap: Readonly<Record<string, string>>,
  press: (key: string, atHostMs: number) => void
) {
  const map = useLatest(keymap);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const name = map.current[event.code] ?? map.current[event.key];
      if (name === undefined) return;
      event.preventDefault();
      if (!event.repeat) press(name, event.timeStamp);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, press]);
}

/** The shared look of an on-screen response key. */
export const RESPONSE_BUTTON =
  "pressable rounded-full bg-accent px-8 py-4 text-base font-semibold text-on-accent hover:bg-accent-hover select-none touch-manipulation";
