"use client";

/**
 * Drives a protocol: one step at a time, stamping every marker.
 *
 * The runner is the only thing that reads a clock. A task describes what happened and may
 * offer the host timestamp it observed; the runner converts that to the run clock and,
 * when a headband is streaming, to the EEG session clock. That split is decision V2-0002's
 * rule, and it is what keeps timing trustworthy across a paused tab.
 *
 * The stop control and the motion notice live here rather than in any task, because the
 * spec requires them to be reachable at all times - including mid-frame inside a canvas.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { TimingProbeOverlay } from "@/components/TimingProbeOverlay";
import { Button } from "@/components/ui";
import { type ClockAnchor, runAnchor } from "@/lib/protocol/clock";
import {
  type Marker,
  type MarkerDraft,
  UI_UNCERTAINTY_MS,
  timingMeta,
} from "@/lib/protocol/marker";
import { getTaskKind } from "@/lib/protocol/registry";
import { hash32 } from "@/lib/protocol/rng";
import { useLatest } from "./kinds/shared";
import { useSoundtrack } from "./useSoundtrack";
import type { MarkerSink } from "@/lib/protocol/sink";
import { pageProbe } from "@/lib/timing/probe";
import {
  type ProtocolDefinition,
  type TaskResult,
  protocolMeta,
} from "@/lib/protocol/types";

/** One empty soundtrack for every plan without one, so `stopAll` keeps its identity. */
const NO_CUES: NonNullable<ProtocolDefinition["soundtrack"]> = [];

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the OS asks for reduced motion; false during SSR. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The OS preference, read without a hydration mismatch.
 *
 * `useSyncExternalStore` gives the server `false` and the client the real value, which is
 * what keeps this out of an effect - setting state in one would cascade a render on every
 * mount of the runner.
 */
function useOsReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => false
  );
}

export interface ProtocolRunnerProps {
  protocol: ProtocolDefinition;
  seed: number;
  sink: MarkerSink;
  anchor?: ClockAnchor;
  /**
   * The host already showed the content warning (the run page's consent gate, S18), so
   * the runner does not show it a second time. It still opens with the motion notice
   * when a step moves things on screen, because that choice is made here.
   */
  warningShown?: boolean;
  onFinish: (results: TaskResult[], markers: readonly Marker[]) => void;
  onExit: (reason: "user" | "error") => void;
}

type Screen = "warning" | "running" | "confirm-exit";

export function ProtocolRunner({
  protocol,
  seed,
  sink,
  anchor,
  warningShown = false,
  onFinish,
  onExit,
}: ProtocolRunnerProps) {
  // Something to say before the first block: a warning nobody has shown yet, or the
  // motion choice for a protocol that moves things on screen.
  const movesOnScreen = useMemo(
    () => protocol.steps.some((s) => getTaskKind(s.kind).motionSensitive),
    [protocol.steps]
  );
  const [screen, setScreen] = useState<Screen>(
    (protocol.contentWarning && !warningShown) || movesOnScreen
      ? "warning"
      : "running"
  );
  const [stepIndex, setStepIndex] = useState(0);
  // The participant can override the OS preference on the notice screen.
  const osReducedMotion = useOsReducedMotion();
  const [motionOverride, setMotionOverride] = useState<boolean | null>(null);
  const reducedMotion = motionOverride ?? osReducedMotion;

  /*
   * The host's callbacks are read through refs. The run page re-renders every second
   * while a headband streams (quality, battery), each time with a new `onFinish`; a
   * dependency on it would hand every kind a new `onComplete` once a second, and a kind
   * whose timer depends on it (a timed instruction, a fixed-duration video) would
   * restart that timer forever and never end.
   */
  const onFinishRef = useLatest(onFinish);
  const onExitRef = useLatest(onExit);

  const resultsRef = useRef<TaskResult[]>([]);
  const finishedRef = useRef(false);
  const t0Ref = useRef<number>(0);
  const anchorRef = useRef<ClockAnchor | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  const step = protocol.steps[stepIndex];

  /*
   * The run clock starts when the participant actually begins, not when the page mounts.
   *
   * This and the start markers below are layout effects so they run before any kind's
   * (passive) mount effect: a kind that emits on mount - a first-frame onset, a
   * questionnaire's first render - must land after `session_start` and `block_start`,
   * not before them. React runs children's passive effects before their parent's.
   */
  useLayoutEffect(() => {
    if (screen !== "running" || anchorRef.current) return;
    t0Ref.current = performance.now();
    anchorRef.current = anchor ?? runAnchor(t0Ref.current);
  }, [anchor, screen]);

  const seqRef = useRef(0);
  const stamp = useCallback(
    (
      draft: MarkerDraft,
      atHostMs?: number,
      extraMeta?: Record<string, unknown>
    ): Marker => {
      const host = atHostMs ?? performance.now();
      const clock = anchorRef.current ?? runAnchor(t0Ref.current);
      return {
        label: draft.label,
        kind: draft.kind,
        tMonotonicMs: host,
        tRunMs: clock.toRunMs(host),
        tSessionS: clock.toSessionS(host),
        seq: seqRef.current++,
        meta: {
          protocol_id: protocol.id,
          protocol_version: protocol.version,
          motion_profile: reducedMotion ? "reduced" : "full",
          ...extraMeta,
          ...draft.meta,
        },
      };
    },
    [protocol.id, protocol.version, reducedMotion]
  );

  // Nothing is recorded once the run has closed: a block still mounted behind the ending
  // must not add trials after `run_aborted` or `session_end`.
  const closedRef = useRef(false);

  /*
   * The stop prompt does not pause the block under it: a trial keeps running behind the
   * scrim and would be scored as a miss. The runner brackets the prompt on the timeline
   * and marks `invalid` every trial it overlapped - the one on screen when it opened and
   * any that marked while it was open - so analysis leaves them out, as it does a trial
   * that straddled a hidden tab.
   */
  const promptOpenRef = useRef(false);
  const lastTrialRef = useRef<number | null>(null);
  const overlappedRef = useRef(new Set<number>());

  const emitRun = useCallback(
    (draft: MarkerDraft, atHostMs?: number) => {
      if (closedRef.current) return;
      sink.push(stamp(draft, atHostMs));
    },
    [sink, stamp]
  );

  const emitForStep = useCallback(
    (draft: MarkerDraft, atHostMs?: number) => {
      if (!step || closedRef.current) return;
      const trial = draft.meta?.trial_id;
      if (typeof trial === "number") {
        lastTrialRef.current = trial;
        if (promptOpenRef.current) overlappedRef.current.add(trial);
        if (draft.kind === "outcome" && overlappedRef.current.has(trial))
          draft = {
            ...draft,
            meta: {
              ...draft.meta,
              invalid: true,
              invalid_reason: "exit_prompt",
            },
          };
      }
      const onsetError = draft.meta?.onset_error_ms;
      if (typeof onsetError === "number") pageProbe.onset(onsetError);
      // A stimulus that did not say how its onset was observed was a timer or a
      // handler (V3-0004): say so, rather than let it pass for frame-accurate.
      const timing =
        draft.kind === "stimulus" && draft.meta?.timing_source === undefined
          ? timingMeta("ui", UI_UNCERTAINTY_MS)
          : {};
      sink.push(
        stamp(draft, atHostMs, { ...protocolMeta(protocol, step), ...timing })
      );
    },
    [protocol, sink, stamp, step]
  );

  // session_start, then each step's own start marker as it mounts - once each: closing
  // the stop prompt returns to `running` and must not start the run or the step again.
  const sessionStartedRef = useRef(false);
  const startedStepRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (screen !== "running" || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    if (protocol.startMarker) {
      emitRun({
        label: protocol.startMarker,
        kind: "system",
        meta: {
          wall_clock_iso: new Date().toISOString(),
          host_ms: t0Ref.current,
          anchor_kind: (anchorRef.current ?? runAnchor(0)).kind,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /*
   * A step resolved from a tree block is bracketed by `block_start`/`block_end` (backend
   * V3-0004); `emitForStep` adds the block fields. `blockStartRef` gives `block_end` its
   * `duration` in seconds, the BIDS `events.tsv` column.
   */
  const blockStartRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (screen !== "running" || !step || startedStepRef.current === stepIndex)
      return;
    startedStepRef.current = stepIndex;
    // trial ids restart with each block
    lastTrialRef.current = null;
    overlappedRef.current.clear();
    if (step.block && blockStartRef.current === null) {
      const now = performance.now();
      blockStartRef.current = now;
      emitForStep({ label: "block_start", kind: "stage" }, now);
    }
    if (step.startMarker)
      emitForStep({ label: step.startMarker, kind: "stage" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, stepIndex]);

  /**
   * A backgrounded tab throttles rAF to nothing, so a protocol that kept counting would
   * report onsets that never happened. Record both edges and how long it lasted; the
   * engine independently invalidates any trial whose onset landed outside its plan.
   */
  useEffect(() => {
    if (screen === "warning") return;
    const onVisibility = () => {
      const now = performance.now();
      if (document.hidden) {
        hiddenAtRef.current = now;
        emitRun({ label: "visibility_hidden", kind: "system" }, now);
      } else {
        const hiddenMs =
          hiddenAtRef.current === null ? null : now - hiddenAtRef.current;
        hiddenAtRef.current = null;
        emitRun(
          {
            label: "visibility_visible",
            kind: "system",
            meta: { hidden_ms: hiddenMs },
          },
          now
        );
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [emitRun, screen]);

  // A browser closed mid-run would otherwise lose everything since the last flush.
  useEffect(() => {
    const onHide = () => sink.flushBeacon();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [sink]);

  const { stopAll: stopSounds } = useSoundtrack({
    cues: protocol.soundtrack ?? NO_CUES,
    stepIndex,
    running: screen === "running",
    emit: emitRun,
  });

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopSounds();
    if (protocol.endMarker)
      emitRun({ label: protocol.endMarker, kind: "system" });
    closedRef.current = true;
    void sink
      .flush()
      .finally(() => onFinishRef.current(resultsRef.current, sink.all()));
  }, [emitRun, onFinishRef, protocol.endMarker, sink, stopSounds]);

  const onComplete = useCallback(
    (result: TaskResult) => {
      resultsRef.current = [...resultsRef.current, result];
      if (step?.endMarker)
        emitForStep({ label: step.endMarker, kind: "stage" });
      if (step?.block && blockStartRef.current !== null) {
        const now = performance.now();
        emitForStep(
          {
            label: "block_end",
            kind: "stage",
            meta: {
              duration: Math.round(now - blockStartRef.current) / 1000,
            },
          },
          now
        );
        blockStartRef.current = null;
      }
      void sink.flush();

      if (stepIndex + 1 >= protocol.steps.length) finish();
      else setStepIndex((i) => i + 1);
    },
    [emitForStep, finish, protocol.steps.length, sink, step, stepIndex]
  );

  const abort = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopSounds();
    emitRun({
      label: "run_aborted",
      kind: "system",
      meta: {
        step_id: step?.id ?? null,
        step_index: stepIndex,
        reason: "user",
      },
    });
    closedRef.current = true;
    void sink.flush().finally(() => onExitRef.current("user"));
  }, [emitRun, onExitRef, sink, stopSounds, step, stepIndex]);

  // The prompt's edges, on the run's timeline. An abort leaves it open: the run closes
  // with `run_aborted`, not a dismissal.
  useLayoutEffect(() => {
    const open = screen === "confirm-exit";
    if (open === promptOpenRef.current) return;
    promptOpenRef.current = open;
    if (open && lastTrialRef.current !== null)
      overlappedRef.current.add(lastTrialRef.current);
    emitRun({
      label: open ? "exit_prompt_shown" : "exit_prompt_dismissed",
      kind: "system",
      meta: step ? { step_id: step.id } : {},
    });
  }, [emitRun, screen, step]);

  // Escape opens the confirmation rather than stopping: a stray key must not end an
  // eight-minute session, but the way out must always be one keystroke away.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      // not from the notice: the run has not begun, there is nothing to stop yet
      setScreen((s) =>
        s === "confirm-exit" ? "running" : s === "running" ? "confirm-exit" : s
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stepSeed = useMemo(
    () => (step ? hash32(seed, step.id) : seed),
    [seed, step]
  );

  if (screen === "warning") {
    return (
      <Shell onStop={() => onExit("user")}>
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="type-title">{protocol.title}</h1>
          {protocol.contentWarning && !warningShown && (
            <p className="max-w-xl text-ink-2">{protocol.contentWarning}</p>
          )}
          {movesOnScreen && (
            <label className="flex items-center gap-2 text-[14px] text-ink-2">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setMotionOverride(event.target.checked)}
              />
              Reduce motion
            </label>
          )}
          <Button onClick={() => setScreen("running")}>Begin</Button>
          <p className="type-caption text-ink-3">
            This is not a medical assessment or diagnosis. You can stop at any
            time.
          </p>
        </div>
      </Shell>
    );
  }

  if (!step) return null;

  const kind = getTaskKind(step.kind);
  const Renderer = kind.Renderer;

  return (
    <Shell onStop={() => setScreen("confirm-exit")} label={step.label}>
      <Renderer
        key={step.id}
        config={step.config as never}
        stepId={step.id}
        phase={step.phase ?? step.id}
        seed={stepSeed}
        emit={emitForStep}
        onComplete={onComplete}
        reducedMotion={reducedMotion}
      />
      {screen === "confirm-exit" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-(--scrim)">
          <div className="enter-pop max-w-sm rounded-[var(--radius-sheet)] border border-hairline bg-surface p-6 text-center shadow-(--shadow-sheet)">
            <h2 className="type-heading mb-2">Stop this session?</h2>
            <p className="mb-5 text-[14px] text-ink-2">
              What you have done so far is kept. You cannot resume this run.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="ghost" onClick={() => setScreen("running")}>
                Keep going
              </Button>
              <Button variant="danger" onClick={abort}>
                Stop session
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({
  children,
  onStop,
  label,
}: {
  children: React.ReactNode;
  onStop: () => void;
  label?: string;
}) {
  return (
    <div
      data-theme="dark"
      className="relative flex h-dvh flex-col bg-black text-ink"
    >
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-[14px] text-ink-2">{label ?? ""}</span>
        <Button variant="ghost" onClick={onStop}>
          Stop
        </Button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <TimingProbeOverlay />
    </div>
  );
}
