/**
 * Behavioral summary metrics for the Go/No-Go challenges.
 *
 * The spec's caution is load-bearing and shapes the API: "fewer false docks alone does
 * not mean better control - it can reflect responding less often overall." So nothing
 * here returns a single verdict, and the summary always carries hits, misses, false
 * alarms, RT, RT variability and criterion together.
 */

import type { Outcome } from "./marker";
import { mad, mean, median, zInverse } from "./stats";

export interface TrialRecord {
  trialId: number;
  phase: string;
  trialType: "go" | "nogo";
  cue?: "green" | "red";
  stimulusClass: "cargo" | "debris";
  outcome: Outcome;
  /** Milliseconds from target onset; null when no response was made. */
  rtMs: number | null;
  practice?: boolean;
  /** Excluded from every rate; set when the trial straddled a hidden tab or a long hitch. */
  invalid?: boolean;
}

export interface RateBlock {
  hitRate: number | null;
  commissionRate: number | null;
  medianRtMs: number | null;
}

export interface PhaseSummary {
  phase: string;
  n: number;
  nGo: number;
  nNogo: number;
  nExcluded: number;
  hitRate: number | null;
  omissionRate: number | null;
  correctRejectionRate: number | null;
  commissionRate: number | null;
  /** Median RT over correct go trials only. */
  medianRtMs: number | null;
  rtMadMs: number | null;
  /** Median RT on commission errors, reported separately - never pooled with hits. */
  commissionRtMs: number | null;
  dPrime: number | null;
  criterion: number | null;
  postErrorSlowingMs: number | null;
  early: RateBlock;
  late: RateBlock;
}

/** Below this many trials per class, signal-detection measures are not reported. */
export const MIN_TRIALS_FOR_SDT = 5;

export type EdgeCorrection = "loglinear" | "half";

/**
 * d' and criterion with an edge correction.
 *
 * Log-linear (Hautus) is the default and is applied unconditionally rather than only at
 * 0 or 1: applying it conditionally biases the estimate and makes the result depend on
 * whether a participant happened to hit a boundary. `half` is the more commonly reported
 * 1/(2N) rule, offered for comparability with published work.
 *
 * Returns nulls below `MIN_TRIALS_FOR_SDT` per class - the spec says to compute these
 * "if trial counts support it", so the threshold is encoded rather than left to the reader.
 */
export function sdt(
  hits: number,
  nGo: number,
  falseAlarms: number,
  nNogo: number,
  correction: EdgeCorrection = "loglinear"
): { dPrime: number | null; criterion: number | null } {
  if (nGo < MIN_TRIALS_FOR_SDT || nNogo < MIN_TRIALS_FOR_SDT) {
    return { dPrime: null, criterion: null };
  }

  let hitRate: number;
  let faRate: number;
  if (correction === "loglinear") {
    hitRate = (hits + 0.5) / (nGo + 1);
    faRate = (falseAlarms + 0.5) / (nNogo + 1);
  } else {
    hitRate = clampRate(hits / nGo, nGo);
    faRate = clampRate(falseAlarms / nNogo, nNogo);
  }

  const zHit = zInverse(hitRate);
  const zFa = zInverse(faRate);
  return { dPrime: zHit - zFa, criterion: -0.5 * (zHit + zFa) };
}

function clampRate(rate: number, n: number): number {
  const edge = 1 / (2 * n);
  return Math.min(1 - edge, Math.max(edge, rate));
}

/**
 * Post-error slowing, as the matched pre/post difference.
 *
 * Mean RT on the correct go trial straight after a commission error, minus mean RT on the
 * correct go trial straight before the same error. Compared against the participant's own
 * neighbouring trials rather than their global mean, which would confound slowing with
 * time-on-task drift. Null below four usable pairs.
 */
export function postErrorSlowing(
  trials: readonly TrialRecord[]
): number | null {
  const usable = trials.filter((t) => !t.practice && !t.invalid);
  const before: number[] = [];
  const after: number[] = [];

  for (let i = 0; i < usable.length; i++) {
    if (usable[i].outcome !== "commission_error") continue;
    const prev = usable[i - 1];
    const next = usable[i + 1];
    if (!prev || !next) continue;
    if (prev.outcome !== "hit" || next.outcome !== "hit") continue;
    if (prev.rtMs === null || next.rtMs === null) continue;
    before.push(prev.rtMs);
    after.push(next.rtMs);
  }

  if (before.length < 4) return null;
  const a = mean(after);
  const b = mean(before);
  return a === null || b === null ? null : a - b;
}

function rates(trials: readonly TrialRecord[]): RateBlock {
  const go = trials.filter((t) => t.trialType === "go");
  const nogo = trials.filter((t) => t.trialType === "nogo");
  const hits = go.filter((t) => t.outcome === "hit");
  return {
    hitRate: go.length > 0 ? hits.length / go.length : null,
    commissionRate:
      nogo.length > 0
        ? nogo.filter((t) => t.outcome === "commission_error").length /
          nogo.length
        : null,
    medianRtMs: median(
      hits.map((t) => t.rtMs).filter((rt): rt is number => rt !== null)
    ),
  };
}

/**
 * Summarize one phase.
 *
 * Practice and invalid trials are dropped before anything is computed; `nExcluded`
 * records how many, so a summary can never quietly rest on a handful of trials.
 */
export function summarizePhase(
  phase: string,
  all: readonly TrialRecord[]
): PhaseSummary {
  const trials = all.filter((t) => !t.practice && !t.invalid);
  const nExcluded = all.length - trials.length;

  const go = trials.filter((t) => t.trialType === "go");
  const nogo = trials.filter((t) => t.trialType === "nogo");
  const hits = go.filter((t) => t.outcome === "hit");
  const falseAlarms = nogo.filter((t) => t.outcome === "commission_error");

  const hitRts = hits
    .map((t) => t.rtMs)
    .filter((rt): rt is number => rt !== null);
  const faRts = falseAlarms
    .map((t) => t.rtMs)
    .filter((rt): rt is number => rt !== null);

  const split = Math.floor(trials.length / 2);
  const { dPrime, criterion } = sdt(
    hits.length,
    go.length,
    falseAlarms.length,
    nogo.length
  );

  return {
    phase,
    n: trials.length,
    nGo: go.length,
    nNogo: nogo.length,
    nExcluded,
    hitRate: go.length > 0 ? hits.length / go.length : null,
    omissionRate:
      go.length > 0
        ? go.filter((t) => t.outcome === "miss").length / go.length
        : null,
    correctRejectionRate:
      nogo.length > 0
        ? nogo.filter((t) => t.outcome === "correct_rejection").length /
          nogo.length
        : null,
    commissionRate: nogo.length > 0 ? falseAlarms.length / nogo.length : null,
    medianRtMs: median(hitRts),
    rtMadMs: mad(hitRts),
    commissionRtMs: median(faRts),
    dPrime,
    criterion,
    postErrorSlowingMs: postErrorSlowing(trials),
    early: rates(trials.slice(0, split)),
    late: rates(trials.slice(split)),
  };
}
