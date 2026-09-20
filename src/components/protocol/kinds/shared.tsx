"use client";

/**
 * Small pieces the S18 block kinds share: a completion guard, a first-frame hook, the
 * fixation cross, the end tone and the layout every text-first kind uses.
 *
 * The runner passes new `emit`/`onComplete` identities when it re-renders; timers in a
 * kind must not restart because of that (a 60 s baseline would never end), so the hooks
 * here read the latest callbacks through refs.
 */

import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { audioContextCtor, audioTimeToHost } from "@/lib/protocol/audioClock";
import type { TaskContext, TaskResult } from "@/lib/protocol/types";

/** The latest value, readable from effects that must not re-run when it changes. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * `finish(summary)` completes the step once; later calls (a timer racing a click, a
 * media `ended` after Continue) are ignored.
 */
export function useFinish(
  ctx: Pick<TaskContext, "onComplete" | "stepId">,
  taskKind: string
) {
  const onComplete = useLatest(ctx.onComplete);
  const done = useRef(false);
  const { stepId } = ctx;
  return useCallback(
    (summary: TaskResult["summary"] = {}) => {
      if (done.current) return;
      done.current = true;
      onComplete.current({ stepId, taskKind, summary });
    },
    [onComplete, stepId, taskKind]
  );
}

/** Complete after `seconds`, once, measured from mount. */
export function useTimedFinish(seconds: number | null, finish: () => void) {
  const latest = useLatest(finish);
  useEffect(() => {
    if (seconds === null) return;
    const timer = setTimeout(() => latest.current(), seconds * 1000);
    return () => clearTimeout(timer);
  }, [latest, seconds]);
}

/**
 * Call `onFrame(hostMs)` on the first animation frame after `ready` turns true (and
 * again whenever `key` changes while ready): the frame that carries what the kind just
 * rendered, which is the honest onset for a `raf`-timed stimulus.
 */
export function useFirstFrame(
  ready: boolean,
  onFrame: (hostMs: number) => void,
  key: string | number = 0
) {
  const latest = useLatest(onFrame);
  useEffect(() => {
    if (!ready || typeof requestAnimationFrame !== "function") return;
    const handle = requestAnimationFrame((hostMs) => latest.current(hostMs));
    return () => cancelAnimationFrame(handle);
  }, [latest, ready, key]);
}

/** Centred column for the kinds that are mostly words. */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      {children}
    </div>
  );
}

/** The fixation cross: two strokes, no colour cue, centred on the stage. */
export function FixationCross({ label }: { label: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      width="48"
      height="48"
      viewBox="0 0 48 48"
      className="text-ink"
    >
      <path
        d="M24 6v36M6 24h36"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Play a short sine tone now; returns its onset on the host clock, or null where Web
 * Audio is unavailable (the step still ends on time, only silently).
 */
export async function playTone(
  frequencyHz = 660,
  durationS = 0.35
): Promise<{ hostMs: number; uncertaintyMs: number } | null> {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  const ctx = new Ctor();
  try {
    await ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = frequencyHz;
    const at = ctx.currentTime + 0.02;
    // A 10 ms ramp at each end: a hard-edged tone clicks, and the click is an artefact.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.3, at + 0.01);
    gain.gain.setValueAtTime(0.3, at + durationS - 0.01);
    gain.gain.linearRampToValueAtTime(0, at + durationS);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + durationS);
    oscillator.onended = () => void ctx.close();
    return audioTimeToHost(ctx, at, performance.now());
  } catch {
    void ctx.close();
    return null;
  }
}
