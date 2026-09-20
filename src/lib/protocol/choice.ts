/**
 * The choice-trial engine: one reducer for every task made of discrete trials with keys.
 *
 * Flanker, n-back and symbol coding differ in what they draw and in how a trial is
 * built, not in how a trial runs: an optional cue, a quiet gap, a stimulus, a window in
 * which one of a few keys may be pressed, an outcome, a pause. That loop lives here once,
 * pure like the Go/No-Go engine beside it (`engine.ts`): `stepChoice()` takes the frame
 * time and the press observed since the last frame and returns the next state, the
 * markers that fell due and what to draw. No DOM, no timers, no clock reads, so a test
 * drives a whole block in milliseconds.
 *
 * The marker payloads are the Go/No-Go ones on purpose (backend decision V3-0010: the
 * contract is the payload, not the label): `kind` of `stimulus | response | outcome`,
 * `trial_id`, `required_action`, `outcome`, `reaction_time_ms`, `practice`, `invalid`,
 * `late_frame`. A choice trial adds `condition` (what analysis groups by),
 * `correct_response` and the pressed `response`, and one outcome the Go/No-Go never
 * has: `error`, a press of the wrong key.
 *
 * Unlike the Go/No-Go, a trial may end at the response (`endOnResponse`), so onsets
 * cannot all be planned up front: each trial's plan is laid from the moment the previous
 * one ended. `planned_onset_ms` is still what the engine asked for and
 * `actual_onset_ms` the frame it got, so the onset error is measured, not assumed.
 */

import { FRAME_MS, type MarkerDraft, type Outcome, timingMeta } from "./marker";
import { mad, median } from "./stats";

export interface ChoiceTrial {
  trialId: number;
  /** What analysis groups by: `congruent`, `match`, `2-back`... */
  condition: string;
  /** A warning or orienting cue shown before the stimulus, by name; omitted = none. */
  cue?: string;
  /** What to draw. Opaque to the engine, handed back in the scene. */
  stimulus: Record<string, unknown>;
  /** The key that is right, or null when the right thing is to withhold. */
  correctResponse: string | null;
  /** How long the cue is shown. */
  cueMs?: number;
  /** Quiet gap between cue offset and stimulus onset. */
  cueTargetMs?: number;
  /** How long the stimulus stays on screen (it also goes at the response). */
  stimulusMs: number;
  /** Response window, from stimulus onset. */
  windowMs: number;
  /** Pause after the outcome. */
  itiMs: number;
  practice?: boolean;
  /** Stamped on every marker of the trial: `load`, `lag`, `symbol`... */
  meta?: Record<string, string | number | boolean>;
}

export interface ChoiceLabels {
  trialStart: string;
  cueOnset?: string;
  stimulusOnset: string;
  response: string;
  outcome: string;
}

export interface ChoiceConfig {
  phase: string;
  labels: ChoiceLabels;
  /** The keys this task listens to; any other press is ignored, not an error. */
  keys: readonly string[];
  /** End the trial at the first press instead of at the end of its window. */
  endOnResponse?: boolean;
  /** Stop starting trials after this long (a timed block such as symbol coding). */
  maxDurationMs?: number;
  lateFrameMs?: number;
  hitchMs?: number;
}

export type ChoicePhase =
  "pending" | "cue" | "cue_delay" | "stimulus" | "iti" | "done";

export interface ChoiceOutcome {
  trialId: number;
  condition: string;
  cue?: string;
  outcome: Outcome;
  response: string | null;
  rtMs: number | null;
  invalid: boolean;
  practice: boolean;
}

export interface ChoiceState {
  readonly trials: readonly ChoiceTrial[];
  readonly config: ChoiceConfig;
  trialIndex: number;
  phase: ChoicePhase;
  /** Planned start of the current phase, run-relative. */
  phaseStartMs: number;
  /** Frame the stimulus actually appeared on; reaction times are measured from it. */
  stimulusOnsetMs: number | null;
  response: string | null;
  responseRtMs: number | null;
  invalid: boolean;
  lastFrameMs: number | null;
  outcomes: ChoiceOutcome[];
}

export interface ChoiceInput {
  nowMs: number;
  /** A press observed since the last frame: which key, and its own event time. */
  press?: { key: string; atMs: number };
}

export interface ChoiceScene {
  phase: ChoicePhase;
  cue: string | null;
  /** The stimulus to draw, or null between stimuli. */
  stimulus: Record<string, unknown> | null;
  /**
   * The current trial's stimulus whether or not it is on screen yet: a spatial cue must
   * know where the row it announces will appear.
   */
  upcoming: Record<string, unknown> | null;
  /** The last resolved outcome, for calm feedback during the pause. */
  feedback: Outcome | null;
  trialIndex: number;
  totalTrials: number;
  /** Run-relative time, for a timed block's remaining-time display. */
  nowMs: number;
}

export interface ChoiceOutput {
  state: ChoiceState;
  events: (MarkerDraft & { atMs: number })[];
  scene: ChoiceScene;
}

const DEFAULT_LATE_FRAME_MS = 34;
const DEFAULT_HITCH_MS = 250;

export function createChoiceEngine(
  trials: readonly ChoiceTrial[],
  config: ChoiceConfig
): ChoiceState {
  return {
    trials,
    config,
    trialIndex: 0,
    phase: trials.length === 0 ? "done" : "pending",
    phaseStartMs: 0,
    stimulusOnsetMs: null,
    response: null,
    responseRtMs: null,
    invalid: false,
    lastFrameMs: null,
    outcomes: [],
  };
}

function trialMeta(trial: ChoiceTrial, phase: string) {
  return {
    phase,
    trial_id: trial.trialId,
    condition: trial.condition,
    required_action:
      trial.correctResponse === null
        ? ("withhold" as const)
        : ("press" as const),
    ...(trial.correctResponse === null
      ? {}
      : { correct_response: trial.correctResponse }),
    ...(trial.cue !== undefined ? { cue_type: trial.cue } : {}),
    ...(trial.practice ? { practice: true } : {}),
    ...trial.meta,
  };
}

function onsetMeta(plannedMs: number, actualMs: number, lateFrameMs: number) {
  const error = actualMs - plannedMs;
  return {
    ...timingMeta("raf", FRAME_MS),
    planned_onset_ms: plannedMs,
    actual_onset_ms: actualMs,
    onset_error_ms: error,
    ...(Math.abs(error) > lateFrameMs ? { late_frame: true } : {}),
  };
}

function classify(trial: ChoiceTrial, response: string | null): Outcome {
  if (trial.correctResponse === null)
    return response === null ? "correct_rejection" : "commission_error";
  if (response === null) return "miss";
  return response === trial.correctResponse ? "hit" : "error";
}

/** Advance the engine to `input.nowMs`; consumes every boundary that fell due. */
export function stepChoice(
  state: ChoiceState,
  input: ChoiceInput
): ChoiceOutput {
  const { nowMs, press } = input;
  const { config } = state;
  const lateFrameMs = config.lateFrameMs ?? DEFAULT_LATE_FRAME_MS;
  const hitchMs = config.hitchMs ?? DEFAULT_HITCH_MS;
  const { labels, phase: phaseName } = config;
  const events: (MarkerDraft & { atMs: number })[] = [];
  const next: ChoiceState = { ...state, outcomes: [...state.outcomes] };
  let feedback: Outcome | null = state.outcomes.at(-1)?.outcome ?? null;

  if (
    next.lastFrameMs !== null &&
    nowMs - next.lastFrameMs > hitchMs &&
    next.phase !== "pending" &&
    next.phase !== "iti"
  ) {
    next.invalid = true;
  }
  next.lastFrameMs = nowMs;

  let pendingPress = press && config.keys.includes(press.key) ? press : null;

  let guard = 0;
  for (;;) {
    if (guard++ > 10_000) break;
    const trial = next.trials[next.trialIndex];
    if (!trial) {
      next.phase = "done";
      break;
    }

    if (next.phase === "pending") {
      if (nowMs < next.phaseStartMs) break;
      if (
        config.maxDurationMs !== undefined &&
        next.phaseStartMs >= config.maxDurationMs
      ) {
        next.phase = "done";
        break;
      }
      const planned = next.phaseStartMs;
      events.push({
        label: labels.trialStart,
        kind: "stage",
        meta: {
          ...trialMeta(trial, phaseName),
          ...onsetMeta(planned, nowMs, lateFrameMs),
        },
        atMs: nowMs,
      });
      if (trial.cue !== undefined && trial.cueMs) {
        if (Math.abs(nowMs - planned) > hitchMs) next.invalid = true;
        if (labels.cueOnset) {
          events.push({
            label: labels.cueOnset,
            kind: "stimulus",
            meta: {
              ...trialMeta(trial, phaseName),
              ...onsetMeta(planned, nowMs, lateFrameMs),
            },
            atMs: nowMs,
          });
        }
        next.phase = "cue";
      } else {
        next.phase = "cue_delay";
        // no cue: the "delay" is empty and the stimulus is due now
        next.phaseStartMs = planned;
      }
      continue;
    }

    if (next.phase === "cue") {
      const end = next.phaseStartMs + (trial.cueMs ?? 0);
      if (nowMs < end) break;
      next.phase = "cue_delay";
      next.phaseStartMs = end;
      continue;
    }

    if (next.phase === "cue_delay") {
      const gap =
        trial.cue !== undefined && trial.cueMs ? (trial.cueTargetMs ?? 0) : 0;
      const due = next.phaseStartMs + gap;
      if (nowMs < due) break;
      if (Math.abs(nowMs - due) > hitchMs) next.invalid = true;
      next.phase = "stimulus";
      next.phaseStartMs = due;
      next.stimulusOnsetMs = nowMs;
      events.push({
        label: labels.stimulusOnset,
        kind: "stimulus",
        meta: {
          ...trialMeta(trial, phaseName),
          ...onsetMeta(due, nowMs, lateFrameMs),
        },
        atMs: nowMs,
      });
      continue;
    }

    if (next.phase === "stimulus") {
      const onset = next.stimulusOnsetMs ?? next.phaseStartMs;
      const windowEnd = onset + trial.windowMs;

      // A timed block ends on time even with an item still unanswered; that item was
      // never finished, so it is not scored as a miss.
      if (
        config.maxDurationMs !== undefined &&
        nowMs >= config.maxDurationMs &&
        next.response === null &&
        !pendingPress
      ) {
        next.phase = "done";
        break;
      }

      if (pendingPress && next.response === null) {
        const at = Math.min(Math.max(pendingPress.atMs, onset), windowEnd);
        next.response = pendingPress.key;
        next.responseRtMs = at - onset;
        events.push({
          label: labels.response,
          kind: "response",
          meta: {
            ...trialMeta(trial, phaseName),
            response: pendingPress.key,
            within_window: true,
            reaction_time_ms: next.responseRtMs,
            correct: pendingPress.key === trial.correctResponse,
          },
          atMs: at,
        });
        pendingPress = null;
      }

      const ended =
        next.response !== null && config.endOnResponse
          ? true
          : nowMs >= windowEnd;
      if (!ended) break;

      const outcome = classify(trial, next.response);
      const endMs =
        next.response !== null && config.endOnResponse
          ? onset + (next.responseRtMs ?? 0)
          : windowEnd;
      next.outcomes.push({
        trialId: trial.trialId,
        condition: trial.condition,
        ...(trial.cue !== undefined ? { cue: trial.cue } : {}),
        outcome,
        response: next.response,
        rtMs: next.responseRtMs,
        invalid: next.invalid,
        practice: Boolean(trial.practice),
      });
      events.push({
        label: labels.outcome,
        kind: "outcome",
        meta: {
          ...trialMeta(trial, phaseName),
          outcome,
          ...(next.response !== null ? { response: next.response } : {}),
          ...(next.responseRtMs !== null
            ? { reaction_time_ms: next.responseRtMs }
            : {}),
          ...(next.invalid ? { invalid: true } : {}),
        },
        atMs: Math.max(endMs, Math.min(nowMs, endMs + FRAME_MS)),
      });
      feedback = outcome;
      next.phase = "iti";
      next.phaseStartMs = endMs;
      continue;
    }

    if (next.phase === "iti") {
      const end = next.phaseStartMs + trial.itiMs;
      if (nowMs < end) break;
      next.trialIndex += 1;
      next.phase = next.trialIndex >= next.trials.length ? "done" : "pending";
      next.phaseStartMs = end;
      next.stimulusOnsetMs = null;
      next.response = null;
      next.responseRtMs = null;
      next.invalid = false;
      continue;
    }

    break; // done
  }

  // A press outside any stimulus window is recorded, never scored.
  if (pendingPress && next.phase !== "done") {
    const trial = next.trials[next.trialIndex];
    if (trial) {
      events.push({
        label: labels.response,
        kind: "response",
        meta: {
          ...trialMeta(trial, phaseName),
          response: pendingPress.key,
          within_window: false,
        },
        atMs: pendingPress.atMs,
      });
    }
  }

  const current = next.trials[next.trialIndex];
  const showing =
    next.phase === "stimulus" &&
    current !== undefined &&
    nowMs < (next.stimulusOnsetMs ?? 0) + current.stimulusMs &&
    !(next.response !== null && config.endOnResponse);
  return {
    state: next,
    events,
    scene: {
      phase: next.phase,
      cue: next.phase === "cue" && current ? (current.cue ?? null) : null,
      stimulus: showing && current ? current.stimulus : null,
      upcoming: current ? current.stimulus : null,
      feedback: next.phase === "iti" ? feedback : null,
      trialIndex: Math.min(next.trialIndex, next.trials.length),
      totalTrials: next.trials.length,
      nowMs,
    },
  };
}

/** Upper bound on a block's length when every trial runs its whole window. */
export function choiceDurationMs(
  trials: readonly ChoiceTrial[],
  maxDurationMs?: number
): number {
  const total = trials.reduce(
    (sum, t) =>
      sum +
      (t.cue !== undefined && t.cueMs ? t.cueMs + (t.cueTargetMs ?? 0) : 0) +
      t.windowMs +
      t.itiMs,
    0
  );
  return maxDurationMs === undefined
    ? total
    : Math.min(total, maxDurationMs + 5000);
}

export interface ChoiceConditionSummary {
  n: number;
  accuracy: number | null;
  medianRtMs: number | null;
}

/**
 * The end-of-run summary. The field names the Go/No-Go summary uses (`hitRate`,
 * `omissionRate`, `commissionRate`, `medianRtMs`, `rtMadMs`) are kept so the run page
 * shows any task in the same six figures; `conditions` carries what is specific.
 */
export function summarizeChoice(
  phase: string,
  outcomes: readonly ChoiceOutcome[]
) {
  const scored = outcomes.filter((o) => !o.invalid && !o.practice);
  const press = scored.filter(
    (o) => o.outcome === "hit" || o.outcome === "miss" || o.outcome === "error"
  );
  const withhold = scored.filter(
    (o) => o.outcome === "correct_rejection" || o.outcome === "commission_error"
  );
  const hits = press.filter((o) => o.outcome === "hit");
  const rts = hits.flatMap((o) => (o.rtMs === null ? [] : [o.rtMs]));
  const rate = (count: number, total: number) =>
    total > 0 ? count / total : null;

  const conditions: Record<string, ChoiceConditionSummary> = {};
  for (const name of [...new Set(scored.map((o) => o.condition))].sort()) {
    const rows = scored.filter((o) => o.condition === name);
    const right = rows.filter(
      (o) => o.outcome === "hit" || o.outcome === "correct_rejection"
    );
    const conditionRts = rows.flatMap((o) =>
      o.outcome === "hit" && o.rtMs !== null ? [o.rtMs] : []
    );
    conditions[name] = {
      n: rows.length,
      accuracy: rate(right.length, rows.length),
      medianRtMs: median(conditionRts),
    };
  }

  return {
    phase,
    n: scored.length,
    nExcluded: outcomes.filter((o) => o.invalid && !o.practice).length,
    hitRate: rate(hits.length, press.length),
    omissionRate: rate(
      press.filter((o) => o.outcome === "miss").length,
      press.length
    ),
    errorRate: rate(
      press.filter((o) => o.outcome === "error").length,
      press.length
    ),
    commissionRate: rate(
      withhold.filter((o) => o.outcome === "commission_error").length,
      withhold.length
    ),
    medianRtMs: median(rts),
    rtMadMs: mad(rts),
    criterion: null,
    correct: hits.length,
    conditions,
  };
}
