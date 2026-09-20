/**
 * Trial sequences for the choice tasks: flanker (and with cues, the Attention Network
 * Test), n-back and symbol coding.
 *
 * Same rules as the Go/No-Go generator (`trials.ts`): counts are exact rather than
 * sampled, run lengths are capped during construction, everything random comes from the
 * seeded `rng`, and parameters that cannot be satisfied throw in a unit test instead of
 * degrading in front of a participant.
 */

import type { ChoiceTrial } from "./choice";
import { type Rng, jitter } from "./rng";
import { type Range, buildSequence } from "./trials";

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Split `n` over `parts` cells as evenly as integers allow, remainder to the first. */
function spread(n: number, parts: number): number[] {
  const base = Math.floor(n / parts);
  return Array.from({ length: parts }, (_, i) =>
    i < n - base * parts ? base + 1 : base
  );
}

// -- flanker ------------------------------------------------------------------------------

export const FLANKER_CUES = ["none", "center", "double", "spatial"] as const;
export type FlankerCue = (typeof FLANKER_CUES)[number];

export interface FlankerOptions {
  n: number;
  /** Share of trials whose flankers point the same way as the target. */
  congruentRatio: number;
  /**
   * Cue types to mix, in equal shares. Empty means a plain flanker task at fixation;
   * with cues the row appears above or below fixation, which is what gives `spatial`
   * something to announce (Fan et al. 2002).
   */
  cues: readonly FlankerCue[];
  /** Longest run of the same congruency. */
  maxRun: number;
  cueMs: number;
  cueTargetMs: number;
  /** Longest a row stays up, and the response window. */
  stimulusMs: number;
  itiMs: Range;
  practice?: boolean;
}

/**
 * Flanker trials: press the side the middle arrow points to.
 *
 * Congruency counts are exact; within each congruency the cue types and the target's
 * direction are dealt in equal shares, so no cell of the design is empty by chance.
 */
export function generateFlanker(
  options: FlankerOptions,
  rng: Rng
): ChoiceTrial[] {
  const { n, congruentRatio, cues, maxRun } = options;
  if (n <= 0) throw new Error("generateFlanker: n must be positive");
  if (congruentRatio <= 0 || congruentRatio >= 1)
    throw new Error("generateFlanker: congruentRatio must be in (0, 1)");

  const nCongruent = Math.round(n * congruentRatio);
  const order = buildSequence<"congruent" | "incongruent">(
    { congruent: nCongruent, incongruent: n - nCongruent },
    [{ key: (c) => c, caps: {}, fallback: maxRun }],
    rng,
    "generateFlanker"
  );

  const cueTypes: readonly (FlankerCue | null)[] = cues.length ? cues : [null];
  // One shuffled deck of (cue, direction) per congruency keeps the cells balanced.
  const decks = new Map<string, { cue: FlankerCue | null; dir: string }[]>();
  for (const condition of ["congruent", "incongruent"] as const) {
    const count = order.filter((c) => c === condition).length;
    const deck: { cue: FlankerCue | null; dir: string }[] = [];
    spread(count, cueTypes.length).forEach((share, i) => {
      spread(share, 2).forEach((m, d) => {
        for (let k = 0; k < m; k++)
          deck.push({ cue: cueTypes[i], dir: d === 0 ? "left" : "right" });
      });
    });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    decks.set(condition, deck);
  }

  return order.map((condition, i) => {
    const { cue, dir } = decks.get(condition)!.pop()!;
    const position = cues.length ? pick(rng, ["up", "down"]) : "center";
    return {
      trialId: i,
      condition,
      ...(cue !== null ? { cue } : {}),
      stimulus: {
        direction: dir,
        flankers:
          condition === "congruent" ? dir : dir === "left" ? "right" : "left",
        position,
      },
      correctResponse: dir,
      ...(cue !== null
        ? { cueMs: options.cueMs, cueTargetMs: options.cueTargetMs }
        : {}),
      stimulusMs: options.stimulusMs,
      windowMs: options.stimulusMs,
      itiMs: jitter(rng, options.itiMs),
      ...(options.practice ? { practice: true } : {}),
      meta: { direction: dir, position },
    };
  });
}

// -- n-back -------------------------------------------------------------------------------

/** Consonants that do not rhyme much with each other; no vowels, so no words form. */
export const NBACK_LETTERS = ["B", "F", "H", "K", "M", "Q", "R", "X"] as const;

export interface NBackOptions {
  n: number;
  /** How many items back the match is: 1, 2 or 3. */
  load: number;
  /** Share of trials that repeat the item `load` back (press). */
  matchRatio: number;
  /**
   * Share of trials that repeat the item one step off (`load` ± 1): they look like a
   * match to a fuzzy memory and must be withheld, which is what separates remembering
   * the order from recognising a recent letter.
   */
  lureRatio: number;
  stimulusMs: number;
  /** Blank time after the letter; the response window is letter plus blank. */
  isiMs: number;
  practice?: boolean;
}

type NBackCell = "match" | "lure" | "nonmatch";

/** N-back letters: press when the letter is the one shown `load` items ago. */
export function generateNBack(options: NBackOptions, rng: Rng): ChoiceTrial[] {
  const { n, load, matchRatio, lureRatio } = options;
  if (!Number.isInteger(load) || load < 1 || load > 3)
    throw new Error("generateNBack: load must be 1, 2 or 3");
  if (n <= load + 2) throw new Error("generateNBack: n is too small for load");
  if (matchRatio <= 0 || matchRatio + lureRatio >= 1)
    throw new Error("generateNBack: matchRatio + lureRatio must stay under 1");

  // The first `load + 1` items can be neither a match nor a lure: nothing to repeat yet.
  const free = n - (load + 1);
  const nMatch = Math.round(n * matchRatio);
  const nLure = Math.round(n * lureRatio);
  if (nMatch + nLure > free)
    throw new Error("generateNBack: too many matches for the sequence length");

  const cells = buildSequence<NBackCell>(
    { match: nMatch, lure: nLure, nonmatch: free - nMatch - nLure },
    [{ key: (c) => c, caps: { match: 2, lure: 1 }, fallback: 6 }],
    rng,
    "generateNBack"
  );
  const kinds: NBackCell[] = [
    ...Array.from({ length: load + 1 }, () => "nonmatch" as const),
    ...cells,
  ];

  const letters: string[] = [];
  kinds.forEach((kind, i) => {
    const target = letters[i - load];
    const lureFrom = load === 1 ? letters[i - 2] : letters[i - load + 1];
    if (kind === "match" && target !== undefined) {
      letters.push(target);
      return;
    }
    if (kind === "lure" && lureFrom !== undefined && lureFrom !== target) {
      letters.push(lureFrom);
      return;
    }
    // A non-match (or a lure that would have been a match) avoids every near repeat.
    const banned = new Set(
      [letters[i - load], letters[i - load - 1], letters[i - load + 1]].filter(
        (l): l is string => l !== undefined
      )
    );
    const open = NBACK_LETTERS.filter((l) => !banned.has(l));
    letters.push(pick(rng, open));
    kinds[i] = "nonmatch";
  });

  return kinds.map((kind, i) => ({
    trialId: i,
    condition: kind,
    stimulus: { letter: letters[i] },
    correctResponse: kind === "match" ? "press" : null,
    stimulusMs: options.stimulusMs,
    windowMs: options.stimulusMs + options.isiMs,
    itiMs: 0,
    ...(options.practice ? { practice: true } : {}),
    meta: { load, letter: letters[i] },
  }));
}

// -- symbol coding ------------------------------------------------------------------------

/**
 * Nine abstract marks nobody has a ready name for, so the key cannot be rehearsed in
 * words. They are names here and drawings in the renderer (`CodingGlyph`): typed
 * symbols differ in weight from font to font, and go missing on some devices, and a
 * mark that stands out from the others is a different test.
 */
export const CODING_SYMBOLS = [
  "cup",
  "tee",
  "bow",
  "peak",
  "kite",
  "cross",
  "dots",
  "wave",
  "arc",
] as const;

export interface CodingOptions {
  /** How long the block runs; the score is how many items fit in it. */
  durationS: number;
  /** How many symbol-digit pairs the key holds (2-9). */
  pairs: number;
  /** Pause between an answer and the next symbol. */
  itiMs: number;
  practice?: boolean;
}

export interface CodingPlan {
  /** `key[i]` is the symbol paired with digit `i + 1`. */
  key: string[];
  trials: ChoiceTrial[];
}

/**
 * Symbol coding (after the Symbol Digit Modalities Test): a key of symbol-digit pairs
 * stays on screen, one symbol is shown, the participant presses its digit. The pairing
 * is drawn per session so nobody carries a learned key from one run to the next; the
 * same symbol never comes twice in a row. More trials are dealt than anyone can answer
 * in `durationS`; the engine's `maxDurationMs` ends the block.
 */
export function generateCoding(options: CodingOptions, rng: Rng): CodingPlan {
  const { durationS, pairs, itiMs } = options;
  if (!Number.isInteger(pairs) || pairs < 2 || pairs > CODING_SYMBOLS.length)
    throw new Error("generateCoding: pairs must be between 2 and 9");
  if (durationS <= 0)
    throw new Error("generateCoding: durationS must be positive");

  const key = [...CODING_SYMBOLS];
  for (let i = key.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [key[i], key[j]] = [key[j], key[i]];
  }
  key.length = pairs;

  // Nobody sustains more than about two items a second.
  const n = Math.ceil(durationS * 2.5);
  const trials: ChoiceTrial[] = [];
  let last = -1;
  for (let i = 0; i < n; i++) {
    let index = Math.floor(rng() * pairs);
    if (index === last) index = (index + 1) % pairs;
    last = index;
    trials.push({
      trialId: i,
      condition: "item",
      stimulus: { symbol: key[index] },
      correctResponse: String(index + 1),
      stimulusMs: 60_000,
      windowMs: 60_000,
      itiMs,
      ...(options.practice ? { practice: true } : {}),
      meta: { digit: index + 1 },
    });
  }
  return { key, trials };
}
