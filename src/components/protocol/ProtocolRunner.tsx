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
 *
 * An official protocol is read in the participant's language (`officialSlug`): the
 * runner hands each task a copy of its step with the catalogue's words, and shows the
 * label and the notice from the same source. Only what is rendered is a copy - the
 * step that names markers and the plan the host posted are the stored ones.
 *
 * An operator's console drives the run through `commands` (backend V3-0007): the runner
 * applies each command at its safe point (`SAFE_POINTS`) and logs every one, applied or
 * not, as an `operator_command` event. A pause holds the run between blocks; ending or
 * skipping a block closes it now, with `ended_by: "operator"` on its `block_end`.
 */

import { useTranslations } from "next-intl";
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
  type CommandOutcome,
  type CommandPort,
  EXTEND_REST_S,
  MESSAGE_SHOWN_MS,
  OPERATOR_COMMAND_EVENT,
  type OperatorCommand,
  type RunResume,
  type RunnerState,
  SAFE_POINTS,
} from "@/lib/protocol/commands";
import {
  type Marker,
  type MarkerDraft,
  UI_UNCERTAINTY_MS,
  timingMeta,
} from "@/lib/protocol/marker";
import { useOfficialTexts } from "@/lib/protocol/official";
import { getTaskKind } from "@/lib/protocol/registry";
import { hash32 } from "@/lib/protocol/rng";
import { useLatest } from "./kinds/shared";
import { useSoundtrack } from "./useSoundtrack";
import type { MarkerSink } from "@/lib/protocol/sink";
import { pageProbe } from "@/lib/timing/probe";
import {
  type ProtocolDefinition,
  type ProtocolStep,
  type TaskResult,
  protocolMeta,
} from "@/lib/protocol/types";

/** One empty soundtrack for every plan without one, so `stopAll` keeps its identity. */
const NO_CUES: NonNullable<ProtocolDefinition["soundtrack"]> = [];

/** A rest that counts down a fixed time: the only step `extend_rest` lengthens. */
function isTimedRest(step: ProtocolStep): boolean {
  const config = step.config as { mode?: unknown; duration_s?: unknown };
  return (
    step.kind === "rest" &&
    (config.mode ?? "timed") === "timed" &&
    typeof config.duration_s === "number"
  );
}

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
   * The protocol's slug when it is an official one (`officialSlug(detail)`); absent or
   * null for a protocol somebody wrote, whose words are shown as stored.
   */
  officialSlug?: string | null;
  /**
   * The host already showed the content warning (the run page's consent gate, S18), so
   * the runner does not show it a second time. It still opens with the motion notice
   * when a step moves things on screen, because that choice is made here.
   */
  warningShown?: boolean;
  /** Commands from an operator's console (V3-0007); absent for a self-run session. */
  commands?: CommandPort;
  /** Told the runner's state after every change, for a console to show. */
  onState?: (state: RunnerState) => void;
  /**
   * Pick up a console run whose participant window reloaded (T1): start at `stepIndex`
   * with no notice screen, number markers from `seqFrom` so none collides with what the
   * lost window sent, log `run_reloaded`, and - when `interrupted` - close the block that
   * was on screen with `block_end` (`ended_by: "reload"`) before running it again.
   */
  resume?: RunResume;
  onFinish: (results: TaskResult[], markers: readonly Marker[]) => void;
  onExit: (reason: "user" | "operator" | "error") => void;
}

type Screen = "warning" | "running" | "confirm-exit";

export function ProtocolRunner({
  protocol,
  seed,
  sink,
  anchor,
  officialSlug = null,
  warningShown = false,
  commands,
  onState,
  resume,
  onFinish,
  onExit,
}: ProtocolRunnerProps) {
  const t = useTranslations("run.runner");
  const official = useOfficialTexts();
  // Something to say before the first block: a warning nobody has shown yet, or the
  // motion choice for a protocol that moves things on screen.
  const movesOnScreen = useMemo(
    () => protocol.steps.some((s) => getTaskKind(s.kind).motionSensitive),
    [protocol.steps]
  );
  const [screen, setScreen] = useState<Screen>(
    !resume && ((protocol.contentWarning && !warningShown) || movesOnScreen)
      ? "warning"
      : "running"
  );
  const [stepIndex, setStepIndex] = useState(resume?.stepIndex ?? 0);
  // A repeated block runs again under a new key; `attemptRef` lets a kind's timer from
  // the attempt the operator cut short see that it is no longer the one on screen.
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(0);
  // Seconds `extend_rest` added to the step on screen, and which step that was.
  const [extension, setExtension] = useState({ step: -1, s: 0 });
  const extraS = extension.step === stepIndex ? extension.s : 0;
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
  const onStateRef = useLatest(onState);

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

  const seqRef = useRef(resume?.seqFrom ?? 0);
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
  const startedStepRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (screen !== "running" || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    if (resume) {
      // the run began in a window that is gone: this one continues it
      emitRun({
        label: "run_reloaded",
        kind: "system",
        meta: {
          step_index: resume.stepIndex,
          step_id: protocol.steps[resume.stepIndex]?.id ?? null,
          wall_clock_iso: new Date().toISOString(),
        },
      });
    } else if (protocol.startMarker) {
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
  const reloadedBlockRef = useRef(resume?.interrupted ?? false);
  useLayoutEffect(() => {
    const key = `${stepIndex}#${attempt}`;
    if (screen !== "running" || !step || startedStepRef.current === key) return;
    startedStepRef.current = key;
    // trial ids restart with each block
    lastTrialRef.current = null;
    overlappedRef.current.clear();
    if (step.block && reloadedBlockRef.current) {
      // the lost window started this block and never ended it
      emitForStep({
        label: "block_end",
        kind: "stage",
        meta: { duration: null, ended_by: "reload" },
      });
    }
    reloadedBlockRef.current = false;
    if (step.block && blockStartRef.current === null) {
      const now = performance.now();
      blockStartRef.current = now;
      emitForStep(
        {
          label: "block_start",
          kind: "stage",
          meta: attempt > 0 ? { attempt } : undefined,
        },
        now
      );
    }
    if (step.startMarker)
      emitForStep({ label: step.startMarker, kind: "stage" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, stepIndex, attempt]);

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

  /*
   * Operator commands (V3-0007). A pause asked for mid-block waits for the block to end
   * (`pausePendingRef`); the run then holds before the next block (`hold`) until
   * `resume`. Refs mirror the state so two commands in the same tick see each other.
   */
  const [hold, setHold] = useState<{ next: number; since: number } | null>(
    null
  );
  const holdRef = useRef(hold);
  const [pausePending, setPausePending] = useState(false);
  const pausePendingRef = useRef(false);
  const [message, setMessage] = useState<{ id: string; text: string } | null>(
    null
  );
  const seenCommandsRef = useRef(new Set<string>());
  // The step already completed: a kind's own timer may fire in the tick between an
  // operator ending its block and the block unmounting, and must not advance twice.
  const doneStepRef = useRef<number | null>(null);

  const holdBefore = useCallback(
    (next: number) => {
      const now = performance.now();
      emitRun(
        {
          label: "run_paused",
          kind: "system",
          meta: { next_step_id: protocol.steps[next]?.id ?? null },
        },
        now
      );
      holdRef.current = { next, since: now };
      setHold(holdRef.current);
    },
    [emitRun, protocol.steps]
  );

  const completeStep = useCallback(
    (result: TaskResult, endMeta: Record<string, unknown> = {}) => {
      if (doneStepRef.current === stepIndex) return;
      doneStepRef.current = stepIndex;
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
              ...endMeta,
            },
          },
          now
        );
        blockStartRef.current = null;
      }
      void sink.flush();

      const next = stepIndex + 1;
      if (next >= protocol.steps.length) finish();
      else if (pausePendingRef.current) {
        pausePendingRef.current = false;
        setPausePending(false);
        holdBefore(next);
      } else setStepIndex(next);
    },
    [
      emitForStep,
      finish,
      holdBefore,
      protocol.steps.length,
      sink,
      step,
      stepIndex,
    ]
  );

  // Bound to the attempt it was rendered for: a repeated block's first attempt may
  // still fire its own timer in the tick before it unmounts.
  const onComplete = useCallback(
    (result: TaskResult) => {
      if (attempt !== attemptRef.current) return;
      completeStep(result);
    },
    [attempt, completeStep]
  );

  const abort = useCallback(
    (reason: "user" | "operator") => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      stopSounds();
      emitRun({
        label: "run_aborted",
        kind: "system",
        meta: {
          step_id: step?.id ?? null,
          step_index: stepIndex,
          reason,
        },
      });
      closedRef.current = true;
      void sink.flush().finally(() => onExitRef.current(reason));
    },
    [emitRun, onExitRef, sink, stopSounds, step, stepIndex]
  );

  /**
   * Apply one command and log it. Read through a ref by the subscription, so it always
   * sees the current step without resubscribing on every render.
   */
  const handleCommand = (command: OperatorCommand) => {
    if (finishedRef.current || seenCommandsRef.current.has(command.id)) return;
    seenCommandsRef.current.add(command.id);
    if (!anchorRef.current) {
      // Not begun: there is no run clock to log on, and only stopping means anything.
      if (command.type === "abort") {
        finishedRef.current = true;
        onExitRef.current("operator");
      }
      return;
    }
    const log = (
      outcome: CommandOutcome,
      extra: Record<string, unknown> = {}
    ) =>
      emitRun({
        label: OPERATOR_COMMAND_EVENT,
        kind: "system",
        meta: {
          command: command.type,
          command_id: command.id,
          source: command.source,
          // not `outcome`: on a marker that word is a trial's score
          effect: outcome,
          safe_point: SAFE_POINTS[command.type],
          step_id: step?.id ?? null,
          step_index: stepIndex,
          ...(command.text ? { text: command.text } : {}),
          ...extra,
        },
      });
    const held = holdRef.current;
    switch (command.type) {
      case "pause":
        if (held || pausePendingRef.current || !step) return log("ignored");
        pausePendingRef.current = true;
        setPausePending(true);
        return log("deferred");
      case "resume": {
        if (held) {
          log("applied");
          const now = performance.now();
          emitRun(
            {
              label: "run_resumed",
              kind: "system",
              meta: { paused_ms: Math.round(now - held.since) },
            },
            now
          );
          holdRef.current = null;
          setHold(null);
          setStepIndex(held.next);
          return;
        }
        if (pausePendingRef.current) {
          // asked again before the block ended: the pause never happens
          pausePendingRef.current = false;
          setPausePending(false);
          return log("applied", { cancelled: "pause" });
        }
        return log("ignored");
      }
      case "end_block":
      case "skip_block": {
        // already ended, by its own timer or an earlier command, in this same tick
        if (held || !step || doneStepRef.current === stepIndex)
          return log("ignored");
        const how = {
          ended_by: "operator",
          ...(command.type === "skip_block" ? { skipped: true } : {}),
        };
        log(
          "applied",
          lastTrialRef.current === null
            ? {}
            : { trial_in_flight: lastTrialRef.current }
        );
        completeStep(
          { stepId: step.id, taskKind: step.kind, summary: how },
          how
        );
        return;
      }
      case "repeat_block": {
        if (held || !step || doneStepRef.current === stepIndex)
          return log("ignored");
        log(
          "applied",
          lastTrialRef.current === null
            ? {}
            : { trial_in_flight: lastTrialRef.current }
        );
        // the attempt cut short is closed on the timeline, then the block runs again
        if (step.block && blockStartRef.current !== null) {
          const now = performance.now();
          emitForStep(
            {
              label: "block_end",
              kind: "stage",
              meta: {
                duration: Math.round(now - blockStartRef.current) / 1000,
                ended_by: "operator",
                repeated: true,
              },
            },
            now
          );
          blockStartRef.current = null;
        }
        attemptRef.current += 1;
        setAttempt(attemptRef.current);
        setExtension({ step: -1, s: 0 });
        return;
      }
      case "extend_rest": {
        if (held || !step || !isTimedRest(step)) return log("ignored");
        const added = extraS + EXTEND_REST_S;
        setExtension({ step: stepIndex, s: added });
        return log("applied", {
          extended_s: EXTEND_REST_S,
          total_s:
            Number((step.config as { duration_s?: unknown }).duration_s) +
            added,
        });
      }
      case "message":
        if (!command.text) return log("ignored");
        setMessage({ id: command.id, text: command.text });
        return log("applied");
      case "flag":
        return log("applied");
      case "abort":
        log("applied");
        abort("operator");
        return;
    }
  };
  const handleCommandRef = useLatest(handleCommand);
  useEffect(
    () => commands?.subscribe((command) => handleCommandRef.current(command)),
    [commands, handleCommandRef]
  );

  // An operator's message stays a short while, then leaves the stage to the block.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const status: RunnerState["status"] =
    screen === "warning" ? "warning" : hold ? "paused" : "running";
  const messageText = message?.text ?? null;
  const extendable = step ? isTimedRest(step) : false;
  useEffect(() => {
    onStateRef.current?.({
      status,
      stepIndex,
      stepId: protocol.steps[stepIndex]?.id ?? null,
      pausePending,
      extendable,
      attempt,
      message: messageText,
    });
  }, [
    attempt,
    extendable,
    messageText,
    onStateRef,
    pausePending,
    protocol.steps,
    status,
    stepIndex,
  ]);

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

  /*
   * What the participant reads of this step: its label and config in their language
   * when the protocol is official, the step itself otherwise. Made once per step, here
   * and nowhere else - a kind keeps timers on its config (an instruction's lines), so a
   * copy made on every render would restart them each time the host re-renders. `step`
   * stays the stored one for everything that is recorded: `protocolMeta`, the start and
   * end markers, the results.
   */
  const shownStep = useMemo(() => {
    if (!step) return step;
    const shown = official.step(officialSlug, step);
    // `extend_rest` lengthens what the rest counts down, never the stored step
    return extraS > 0
      ? {
          ...shown,
          config: {
            ...(shown.config as Record<string, unknown>),
            duration_s:
              Number((shown.config as { duration_s?: unknown }).duration_s) +
              extraS,
          },
        }
      : shown;
  }, [extraS, official, officialSlug, step]);

  if (screen === "warning") {
    return (
      <Shell onStop={() => onExit("user")}>
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="type-title">
            {official.title(officialSlug, protocol.title)}
          </h1>
          {protocol.contentWarning && !warningShown && (
            <p className="max-w-xl text-ink-2">
              {
                official.manifest(officialSlug, {
                  content_warning: protocol.contentWarning,
                  consent_text: null,
                }).content_warning
              }
            </p>
          )}
          {movesOnScreen && (
            <label className="flex items-center gap-2 text-[14px] text-ink-2">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setMotionOverride(event.target.checked)}
              />
              {t("reduceMotion")}
            </label>
          )}
          <Button onClick={() => setScreen("running")}>{t("begin")}</Button>
          <p className="type-caption text-ink-3">{t("disclaimer")}</p>
        </div>
      </Shell>
    );
  }

  if (!step || !shownStep) return null;

  const kind = getTaskKind(step.kind);
  const Renderer = kind.Renderer;

  return (
    <Shell
      onStop={() => setScreen("confirm-exit")}
      label={hold ? undefined : shownStep.label}
    >
      {hold ? (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <p className="type-heading text-ink-2">{t("paused")}</p>
        </div>
      ) : (
        <Renderer
          key={`${step.id}#${attempt}`}
          config={shownStep.config as never}
          stepId={step.id}
          phase={step.phase ?? step.id}
          seed={stepSeed}
          emit={emitForStep}
          onComplete={onComplete}
          reducedMotion={reducedMotion}
        />
      )}
      {message && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-16 z-40 flex justify-center px-6"
        >
          <p className="max-w-xl rounded-[var(--radius-card)] bg-surface-2/90 px-5 py-3 text-center text-[16px] text-ink">
            {message.text}
          </p>
        </div>
      )}
      {screen === "confirm-exit" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-(--scrim)">
          <div className="enter-pop max-w-sm rounded-[var(--radius-sheet)] border border-hairline bg-surface p-6 text-center shadow-(--shadow-sheet)">
            <h2 className="type-heading mb-2">{t("stopTitle")}</h2>
            <p className="mb-5 text-[14px] text-ink-2">{t("stopBody")}</p>
            <div className="flex justify-center gap-3">
              <Button variant="ghost" onClick={() => setScreen("running")}>
                {t("keepGoing")}
              </Button>
              <Button variant="danger" onClick={() => abort("user")}>
                {t("stopSession")}
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
  const t = useTranslations("run.runner");
  return (
    <div
      data-theme="dark"
      className="relative flex h-dvh flex-col bg-black text-ink"
    >
      <div className="flex items-center justify-between px-6 py-3">
        <span className="text-[14px] text-ink-2">{label ?? ""}</span>
        <Button variant="ghost" onClick={onStop}>
          {t("stop")}
        </Button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <TimingProbeOverlay />
    </div>
  );
}
