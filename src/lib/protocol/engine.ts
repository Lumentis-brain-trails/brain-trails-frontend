/**
 * The Go/No-Go trial engine, as a pure reducer.
 *
 * The game is deliberately not a component. `step()` takes the frame timestamp and the
 * current input and returns the next state, the markers that fell due, and what to draw -
 * no DOM, no timers, no clock reads. That is what lets a test drive eight minutes of the
 * protocol in milliseconds, assert the entire marker stream against the spec, and replay
 * pathological frame sequences (a 400 ms hitch, a backgrounded tab) that are impossible to
 * reproduce by hand in a browser.
 *
 * Onsets are scheduled, never accumulated from frame deltas: every phase boundary has a
 * planned protocol-relative time computed up front, and the engine records both that and
 * the frame it actually landed on. The spec is explicit that "browser animation-frame
 * timing is not equivalent to verified stimulus onset", so the error is measured rather
 * than assumed away.
 */

import type { MarkerDraft, Outcome } from "./marker";
import type { CuedTrial, Trial } from "./trials";

export type EnginePhase =
  "pending" | "cue" | "cue_delay" | "target" | "iti" | "done";

/** Marker labels for this block; supplied by the protocol so the vocabulary stays data. */
export interface EngineLabels {
  trialStart: string;
  cueOnset?: string;
  stimulusOnset: string;
  response: string;
  outcome: string;
}

export interface EngineConfig {
  phase: string;
  labels: EngineLabels;
  /** A frame later than this past its planned onset is flagged `late_frame`. */
  lateFrameMs?: number;
  /** A gap larger than this invalidates the trial that straddled it. */
  hitchMs?: number;
}

/** Planned, protocol-relative boundaries of one trial. */
export interface TrialSchedule {
  trialStartMs: number;
  cueOnsetMs: number | null;
  cueEndMs: number | null;
  targetOnsetMs: number;
  targetEndMs: number;
  trialEndMs: number;
}

export interface EngineState {
  readonly trials: readonly (Trial | CuedTrial)[];
  readonly schedule: readonly TrialSchedule[];
  readonly config: EngineConfig;
  trialIndex: number;
  phase: EnginePhase;
  /** Frame time at which the target actually appeared, for reaction times. */
  actualTargetOnsetMs: number | null;
  responded: boolean;
  responseRtMs: number | null;
  /** Set when a hitch or hidden tab spanned part of this trial. */
  invalid: boolean;
  lastFrameMs: number | null;
  outcomes: EngineOutcome[];
}

export interface EngineOutcome {
  trialId: number;
  outcome: Outcome;
  rtMs: number | null;
  invalid: boolean;
}

export interface EngineInput {
  /** Protocol-relative frame time, in milliseconds. */
  nowMs: number;
  /** A press observed since the last frame, at its own event timestamp. */
  pressAtMs?: number;
}

/** What the painter should draw. Deliberately free of DOM and of units beyond 0..1. */
export interface Scene {
  phase: EnginePhase;
  beacon: "green" | "red" | null;
  objectClass: "cargo" | "debris" | null;
  /** 0 at entry, 1 at the far edge of the response window. Null when nothing is shown. */
  objectProgress: number | null;
  /** The last resolved outcome, for calm post-trial feedback. */
  feedback: Outcome | null;
  trialIndex: number;
  totalTrials: number;
}

export interface EngineOutput {
  state: EngineState;
  events: (MarkerDraft & { atMs: number })[];
  scene: Scene;
}

const DEFAULT_LATE_FRAME_MS = 34; // two frames at 60 Hz
const DEFAULT_HITCH_MS = 250;

/** Lay out every trial's planned boundaries, cumulatively from protocol time zero. */
export function buildSchedule(
  trials: readonly (Trial | CuedTrial)[],
  startMs = 0
): TrialSchedule[] {
  const schedule: TrialSchedule[] = [];
  let cursor = startMs;

  for (const trial of trials) {
    const cued = "cueMs" in trial;
    const trialStartMs = cursor;
    const cueOnsetMs = cued ? trialStartMs : null;
    const cueEndMs = cued ? trialStartMs + trial.cueMs : null;
    const targetOnsetMs = cued
      ? trialStartMs + trial.cueMs + trial.cueTargetMs
      : trialStartMs;
    const targetEndMs = targetOnsetMs + trial.travelMs;
    const trialEndMs = targetEndMs + trial.itiMs;

    schedule.push({
      trialStartMs,
      cueOnsetMs,
      cueEndMs,
      targetOnsetMs,
      targetEndMs,
      trialEndMs,
    });
    cursor = trialEndMs;
  }
  return schedule;
}

export function createEngine(
  trials: readonly (Trial | CuedTrial)[],
  config: EngineConfig,
  startMs = 0
): EngineState {
  return {
    trials,
    schedule: buildSchedule(trials, startMs),
    config,
    trialIndex: 0,
    phase: "pending",
    actualTargetOnsetMs: null,
    responded: false,
    responseRtMs: null,
    invalid: false,
    lastFrameMs: null,
    outcomes: [],
  };
}

/** Total planned duration of the block, in milliseconds. */
export function scheduledDurationMs(state: EngineState): number {
  const last = state.schedule[state.schedule.length - 1];
  return last ? last.trialEndMs : 0;
}

function onsetMeta(plannedMs: number, actualMs: number, lateFrameMs: number) {
  const error = actualMs - plannedMs;
  return {
    planned_onset_ms: plannedMs,
    actual_onset_ms: actualMs,
    onset_error_ms: error,
    ...(Math.abs(error) > lateFrameMs ? { late_frame: true } : {}),
  };
}

/**
 * A stimulus that appeared this far from its planned time cannot carry an ERP epoch.
 *
 * Checked at the onset itself rather than only on the frame gap: a hitch during one
 * trial's inter-trial interval is harmless, but the same hitch delaying the *next*
 * trial's onset is not, and the trial index has already moved on by then.
 */
function onsetIsUnusable(
  plannedMs: number,
  actualMs: number,
  hitchMs: number
): boolean {
  return Math.abs(actualMs - plannedMs) > hitchMs;
}

function classify(trial: Trial, responded: boolean): Outcome {
  if (trial.requiredAction === "press") return responded ? "hit" : "miss";
  return responded ? "commission_error" : "correct_rejection";
}

function trialMeta(trial: Trial | CuedTrial, phase: string) {
  const cued = "cue" in trial;
  return {
    phase,
    trial_id: trial.trialId,
    stimulus_class: trial.stimulusClass,
    stimulus_id: trial.stimulusId,
    required_action: trial.requiredAction,
    ...(trial.practice ? { practice: true } : {}),
    ...(cued ? { cue: trial.cue, is_valid_go_trial: trial.isValidGo } : {}),
  };
}

/**
 * Advance the engine to `input.nowMs`.
 *
 * Phase boundaries are consumed in a loop rather than one per frame, so a late or dropped
 * frame still produces every marker in the right order - flagged with its true onset error
 * rather than silently skipped.
 */
export function step(state: EngineState, input: EngineInput): EngineOutput {
  const { nowMs, pressAtMs } = input;
  const lateFrameMs = state.config.lateFrameMs ?? DEFAULT_LATE_FRAME_MS;
  const hitchMs = state.config.hitchMs ?? DEFAULT_HITCH_MS;
  const { labels, phase: phaseName } = state.config;
  const events: (MarkerDraft & { atMs: number })[] = [];

  const next: EngineState = { ...state, outcomes: [...state.outcomes] };

  // A long gap between frames means the tab was hidden or the main thread stalled; any
  // trial in flight across it has an unmeasurable onset and must not enter the rates.
  if (
    next.lastFrameMs !== null &&
    nowMs - next.lastFrameMs > hitchMs &&
    next.phase !== "pending"
  ) {
    next.invalid = true;
  }
  next.lastFrameMs = nowMs;

  let pressHandled = pressAtMs === undefined;

  const press = (at: number) => {
    const trial = next.trials[next.trialIndex];
    pressHandled = true;
    if (!trial) return;
    if (next.responded) {
      // Only the first press in a window counts; the spec says "press once".
      events.push({
        label: labels.response,
        kind: "response",
        meta: {
          ...trialMeta(trial, phaseName),
          response_type: "dock_press",
          within_window: false,
        },
        atMs: at,
      });
      return;
    }
    next.responded = true;
    next.responseRtMs =
      next.actualTargetOnsetMs === null ? null : at - next.actualTargetOnsetMs;
    events.push({
      label: labels.response,
      kind: "response",
      meta: {
        ...trialMeta(trial, phaseName),
        response_type: "dock_press",
        within_window: true,
        ...(next.responseRtMs === null
          ? {}
          : { reaction_time_ms: next.responseRtMs }),
      },
      atMs: at,
    });
  };

  let guard = 0;
  for (;;) {
    if (guard++ > 10_000) break; // structural safety net; never reached in practice
    const trial = next.trials[next.trialIndex];
    const plan = next.schedule[next.trialIndex];
    if (!trial || !plan) {
      next.phase = "done";
      break;
    }
    const cued = plan.cueOnsetMs !== null;

    if (next.phase === "pending") {
      if (nowMs < plan.trialStartMs) break;
      events.push({
        label: labels.trialStart,
        kind: "stage",
        meta: {
          ...trialMeta(trial, phaseName),
          ...onsetMeta(plan.trialStartMs, nowMs, lateFrameMs),
        },
        atMs: nowMs,
      });
      next.phase = cued ? "cue" : "target";
      if (!cued) {
        next.actualTargetOnsetMs = nowMs;
        if (onsetIsUnusable(plan.targetOnsetMs, nowMs, hitchMs))
          next.invalid = true;
        events.push({
          label: labels.stimulusOnset,
          kind: "stimulus",
          meta: {
            ...trialMeta(trial, phaseName),
            ...onsetMeta(plan.targetOnsetMs, nowMs, lateFrameMs),
          },
          atMs: nowMs,
        });
      } else if (labels.cueOnset) {
        if (onsetIsUnusable(plan.cueOnsetMs as number, nowMs, hitchMs))
          next.invalid = true;
        events.push({
          label: labels.cueOnset,
          kind: "stimulus",
          meta: {
            ...trialMeta(trial, phaseName),
            ...onsetMeta(plan.cueOnsetMs as number, nowMs, lateFrameMs),
          },
          atMs: nowMs,
        });
      }
      continue;
    }

    if (next.phase === "cue") {
      if (nowMs < (plan.cueEndMs as number)) break;
      next.phase = "cue_delay";
      continue;
    }

    if (next.phase === "cue_delay") {
      if (nowMs < plan.targetOnsetMs) break;
      next.phase = "target";
      next.actualTargetOnsetMs = nowMs;
      if (onsetIsUnusable(plan.targetOnsetMs, nowMs, hitchMs))
        next.invalid = true;
      events.push({
        label: labels.stimulusOnset,
        kind: "stimulus",
        meta: {
          ...trialMeta(trial, phaseName),
          ...onsetMeta(plan.targetOnsetMs, nowMs, lateFrameMs),
        },
        atMs: nowMs,
      });
      continue;
    }

    if (next.phase === "target") {
      // Only presses inside the window this trial actually showed can count. Bounded at
      // both ends: a press after the object has left is a stray press, not a late hit.
      const onset = next.actualTargetOnsetMs ?? plan.targetOnsetMs;
      const at = pressAtMs as number;
      if (!pressHandled && at >= onset && at <= onset + trial.travelMs) {
        press(at);
      }
      if (nowMs < plan.targetEndMs) break;
      const outcome = classify(trial, next.responded);
      next.outcomes.push({
        trialId: trial.trialId,
        outcome,
        rtMs: next.responseRtMs,
        invalid: next.invalid,
      });
      events.push({
        label: labels.outcome,
        kind: "outcome",
        meta: {
          ...trialMeta(trial, phaseName),
          outcome,
          ...(next.responseRtMs === null
            ? {}
            : { reaction_time_ms: next.responseRtMs }),
          ...(next.invalid ? { invalid: true } : {}),
        },
        atMs: nowMs,
      });
      next.phase = "iti";
      continue;
    }

    if (next.phase === "iti") {
      if (nowMs < plan.trialEndMs) break;
      next.trialIndex += 1;
      next.phase = next.trialIndex >= next.trials.length ? "done" : "pending";
      next.actualTargetOnsetMs = null;
      next.responded = false;
      next.responseRtMs = null;
      next.invalid = false;
      if (next.phase === "done") break;
      continue;
    }

    break; // "done"
  }

  // A press that arrived while no target was showing is still recorded, never counted:
  // stray presses are data about the participant, not noise to discard silently.
  if (!pressHandled) {
    const trial =
      next.trials[Math.min(next.trialIndex, next.trials.length - 1)];
    if (trial) {
      events.push({
        label: labels.response,
        kind: "response",
        meta: {
          ...trialMeta(trial, phaseName),
          response_type: "dock_press",
          within_window: false,
        },
        atMs: pressAtMs as number,
      });
    }
  }

  return { state: next, events, scene: buildScene(next, nowMs) };
}

function buildScene(state: EngineState, nowMs: number): Scene {
  const trial = state.trials[state.trialIndex];
  const plan = state.schedule[state.trialIndex];
  const last = state.outcomes[state.outcomes.length - 1] ?? null;

  const base: Scene = {
    phase: state.phase,
    beacon: null,
    objectClass: null,
    objectProgress: null,
    feedback: null,
    trialIndex: state.trialIndex,
    totalTrials: state.trials.length,
  };
  if (!trial || !plan) return base;

  if (state.phase === "cue" && "cue" in trial) {
    return { ...base, beacon: trial.cue };
  }
  if (state.phase === "target") {
    const elapsed = nowMs - (state.actualTargetOnsetMs ?? plan.targetOnsetMs);
    return {
      ...base,
      objectClass: trial.stimulusClass,
      objectProgress: Math.min(1, Math.max(0, elapsed / trial.travelMs)),
    };
  }
  if (state.phase === "iti") {
    return { ...base, feedback: last ? last.outcome : null };
  }
  return base;
}

/** The trial-level rows this block produced, ready for the metrics module. */
export function toTrialRecords(state: EngineState, phase: string) {
  return state.outcomes.map((o) => {
    const trial = state.trials.find((t) => t.trialId === o.trialId);
    return {
      trialId: o.trialId,
      phase,
      trialType: trial?.trialType ?? ("go" as const),
      ...(trial && "cue" in trial ? { cue: trial.cue } : {}),
      stimulusClass: trial?.stimulusClass ?? ("cargo" as const),
      outcome: o.outcome,
      rtMs: o.rtMs,
      ...(trial?.practice ? { practice: true } : {}),
      ...(o.invalid ? { invalid: true } : {}),
    };
  });
}
