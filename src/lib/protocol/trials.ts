/**
 * Trial sequence generation for the Go/No-Go challenges.
 *
 * Counts are exact rather than sampled per trial: the spec fixes proportions ("~70-75%
 * blue cargo"), and a sampled sequence hits them only on average, which makes two runs of
 * the same block differ in a way no seed records. Run-length constraints ("avoid
 * excessively long runs of one trial type") are enforced during construction - see
 * `buildSequence` for why not by shuffle-and-repair.
 *
 * If the constraints cannot be met the generator throws. A protocol whose parameters are
 * unsatisfiable must fail in a unit test, not silently degrade at run time.
 */

import { type Rng, jitter } from "./rng";

export type TrialType = "go" | "nogo";
export type StimulusClass = "cargo" | "debris";
export type Cue = "green" | "red";

export interface Trial {
  trialId: number;
  trialType: TrialType;
  stimulusClass: StimulusClass;
  stimulusId: string;
  requiredAction: "press" | "withhold";
  /** Response window: how long the object is dockable. */
  travelMs: number;
  /** Gap after the response window, before the next trial. */
  itiMs: number;
  practice?: boolean;
}

export interface CuedTrial extends Trial {
  cue: Cue;
  /** How long the beacon itself is shown. */
  cueMs: number;
  /** Quiet interval between beacon offset and target onset. */
  cueTargetMs: number;
  isValidGo: boolean;
}

export type Range = readonly [number, number];

export interface GoNoGoOptions {
  n: number;
  /** Share of go trials, e.g. 0.72. */
  goRatio: number;
  /** Longest permitted run of the same trial type. */
  maxRun: number;
  /** Tighter cap on consecutive no-go trials; defaults to `maxRun`. */
  maxNogoRun?: number;
  travelMs: Range;
  itiMs: Range;
  practice?: boolean;
}

export interface CuedOptions {
  n: number;
  /** Share of green-beacon + cargo trials, the only press condition. */
  validGoRatio: number;
  /** How the remaining no-go trials split across the three invalid cells. */
  nogoMix?: { redCargo: number; greenDebris: number; redDebris: number };
  maxCueRun: number;
  maxOutcomeRun: number;
  cueMs: Range;
  cueTargetMs: Range;
  travelMs: Range;
  itiMs: Range;
}

interface RunLimit<T> {
  key: (t: T) => string;
  /** Cap per key value; a key absent from the map falls back to `fallback`. */
  caps: Record<string, number>;
  fallback: number;
}

/** Would appending `next` push any limit's trailing run past its cap? */
function allowed<T>(
  placed: readonly T[],
  next: T,
  limits: readonly RunLimit<T>[]
): boolean {
  return limits.every((limit) => {
    const key = limit.key(next);
    const cap = limit.caps[key] ?? limit.fallback;
    let run = 0;
    for (let i = placed.length - 1; i >= 0 && limit.key(placed[i]) === key; i--)
      run++;
    return run + 1 <= cap;
  });
}

/** Pick one candidate with probability proportional to `weight`. */
function weightedPick<T>(
  candidates: readonly T[],
  weight: (t: T) => number,
  rng: Rng
): T {
  const total = candidates.reduce((sum, c) => sum + weight(c), 0);
  let threshold = rng() * total;
  for (const candidate of candidates) {
    threshold -= weight(candidate);
    if (threshold <= 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

/**
 * Build a sequence with exact per-key counts that never exceeds a run cap.
 *
 * Constructed left to right rather than shuffled-then-repaired: a repair pass that swaps
 * elements around consumes the very items it needs to break up later runs, and starves on
 * the skewed ratios this task uses (72/28). Here each step only considers keys that are
 * still legal, and weights them by how many remain, which keeps the classes balanced and
 * makes dead ends rare.
 *
 * A dead end is still possible, so the whole draw is retried - deterministically, since
 * `rng` is seeded and consumed in order. Exhausting the attempts means the parameters are
 * infeasible, which is an error worth raising rather than a sequence worth degrading.
 */
function buildSequence<T extends string>(
  counts: Readonly<Record<T, number>>,
  limits: readonly RunLimit<T>[],
  rng: Rng,
  what: string,
  maxAttempts = 200
): T[] {
  const keys = Object.keys(counts) as T[];
  const total = keys.reduce((sum, k) => sum + counts[k], 0);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = { ...counts } as Record<T, number>;
    const out: T[] = [];
    let stuck = false;

    for (let i = 0; i < total; i++) {
      const candidates = keys.filter(
        (k) => remaining[k] > 0 && allowed(out, k, limits)
      );
      if (candidates.length === 0) {
        stuck = true;
        break;
      }
      const pick = weightedPick(candidates, (k) => remaining[k], rng);
      out.push(pick);
      remaining[pick]--;
    }
    if (!stuck) return out;
  }
  throw new Error(
    `${what}: cannot satisfy run-length constraints after ${maxAttempts} attempts - ` +
      `check the ratio against the run caps`
  );
}

/** Challenge A: press for cargo, withhold for debris, no beacon. */
export function generateGoNoGo(options: GoNoGoOptions, rng: Rng): Trial[] {
  const { n, goRatio, maxRun, travelMs, itiMs } = options;
  if (n <= 0) throw new Error("generateGoNoGo: n must be positive");
  if (goRatio <= 0 || goRatio >= 1)
    throw new Error("generateGoNoGo: goRatio must be in (0, 1)");

  const nGo = Math.round(n * goRatio);
  const limits: RunLimit<TrialType>[] = [
    {
      key: (t) => t,
      caps: { nogo: options.maxNogoRun ?? maxRun, go: maxRun },
      fallback: maxRun,
    },
  ];
  const types = buildSequence<TrialType>(
    { go: nGo, nogo: n - nGo },
    limits,
    rng,
    "generateGoNoGo"
  );

  return types.map((trialType, i) => {
    const stimulusClass: StimulusClass =
      trialType === "go" ? "cargo" : "debris";
    return {
      trialId: i,
      trialType,
      stimulusClass,
      stimulusId: `${stimulusClass}_${String(i % 4).padStart(2, "0")}`,
      requiredAction: trialType === "go" ? "press" : "withhold",
      travelMs: jitter(rng, travelMs),
      itiMs: jitter(rng, itiMs),
      ...(options.practice ? { practice: true } : {}),
    };
  });
}

type Cell = "green_cargo" | "red_cargo" | "green_debris" | "red_debris";

/** Challenge B: press only for a green beacon followed by cargo. */
export function generateCuedGoNoGo(
  options: CuedOptions,
  rng: Rng
): CuedTrial[] {
  const { n, validGoRatio, maxCueRun, maxOutcomeRun } = options;
  if (n <= 0) throw new Error("generateCuedGoNoGo: n must be positive");
  if (validGoRatio <= 0 || validGoRatio >= 1) {
    throw new Error("generateCuedGoNoGo: validGoRatio must be in (0, 1)");
  }
  const mix = options.nogoMix ?? {
    redCargo: 0.4,
    greenDebris: 0.3,
    redDebris: 0.3,
  };
  const mixTotal = mix.redCargo + mix.greenDebris + mix.redDebris;
  if (Math.abs(mixTotal - 1) > 1e-6) {
    throw new Error(
      `generateCuedGoNoGo: nogoMix must sum to 1, got ${mixTotal}`
    );
  }

  const nValid = Math.round(n * validGoRatio);
  const nNogo = n - nValid;
  const nRedCargo = Math.round(nNogo * mix.redCargo);
  const nGreenDebris = Math.round(nNogo * mix.greenDebris);
  const nRedDebris = nNogo - nRedCargo - nGreenDebris;
  if (nRedDebris < 0)
    throw new Error("generateCuedGoNoGo: nogoMix rounds past the trial count");

  const limits: RunLimit<Cell>[] = [
    { key: (c) => c.split("_")[0], caps: {}, fallback: maxCueRun },
    {
      key: (c) => (c === "green_cargo" ? "press" : "withhold"),
      caps: {},
      fallback: maxOutcomeRun,
    },
  ];
  const cells = buildSequence<Cell>(
    {
      green_cargo: nValid,
      red_cargo: nRedCargo,
      green_debris: nGreenDebris,
      red_debris: nRedDebris,
    },
    limits,
    rng,
    "generateCuedGoNoGo"
  );

  return cells.map((cell, i) => {
    const [cue, stimulusClass] = cell.split("_") as [Cue, StimulusClass];
    const isValidGo = cell === "green_cargo";
    return {
      trialId: i,
      trialType: isValidGo ? "go" : "nogo",
      stimulusClass,
      stimulusId: `${stimulusClass}_${String(i % 4).padStart(2, "0")}`,
      requiredAction: isValidGo ? "press" : "withhold",
      cue,
      isValidGo,
      cueMs: jitter(rng, options.cueMs),
      cueTargetMs: jitter(rng, options.cueTargetMs),
      travelMs: jitter(rng, options.travelMs),
      itiMs: jitter(rng, options.itiMs),
    };
  });
}

/** Total scheduled duration of a trial list, in milliseconds. */
export function sequenceDurationMs(
  trials: readonly (Trial | CuedTrial)[]
): number {
  return trials.reduce((total, t) => {
    const cued = "cueMs" in t ? t.cueMs + t.cueTargetMs : 0;
    return total + cued + t.travelMs + t.itiMs;
  }, 0);
}
