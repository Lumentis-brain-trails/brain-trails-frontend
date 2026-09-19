import { describe, expect, test } from "vitest";
import { mulberry32 } from "./rng";
import {
  type CuedTrial,
  type Trial,
  generateCuedGoNoGo,
  generateGoNoGo,
  sequenceDurationMs,
} from "./trials";

const A_OPTIONS = {
  n: 100,
  goRatio: 0.72,
  maxRun: 4,
  maxNogoRun: 2,
  travelMs: [800, 1200] as const,
  itiMs: [300, 500] as const,
};

const B_OPTIONS = {
  n: 44,
  validGoRatio: 0.45,
  maxCueRun: 3,
  maxOutcomeRun: 3,
  cueMs: [300, 400] as const,
  cueTargetMs: [800, 1200] as const,
  travelMs: [900, 1300] as const,
  itiMs: [500, 900] as const,
};

/** Longest run of consecutive items whose key equals `value`. */
function longestRunOf<T>(
  items: readonly T[],
  key: (t: T) => string,
  value: string
): number {
  let best = 0;
  let run = 0;
  for (const item of items) {
    run = key(item) === value ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

function longestRun<T>(items: readonly T[], key: (t: T) => string): number {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const item of items) {
    const k = key(item);
    run = k === previous ? run + 1 : 1;
    previous = k;
    if (run > best) best = run;
  }
  return best;
}

describe("generateGoNoGo", () => {
  test("hits the go ratio exactly, not on average", () => {
    const trials = generateGoNoGo(A_OPTIONS, mulberry32(1));
    expect(trials).toHaveLength(100);
    expect(trials.filter((t) => t.trialType === "go")).toHaveLength(72);
  });

  test("respects the run-length caps, including the tighter no-go cap", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const trials = generateGoNoGo(A_OPTIONS, mulberry32(seed));
      expect(longestRun(trials, (t) => t.trialType)).toBeLessThanOrEqual(4);
      expect(
        longestRunOf(trials, (t) => t.trialType, "nogo")
      ).toBeLessThanOrEqual(2);
    }
  });

  test("is reproducible from the seed and differs across seeds", () => {
    const a = generateGoNoGo(A_OPTIONS, mulberry32(7));
    const b = generateGoNoGo(A_OPTIONS, mulberry32(7));
    const c = generateGoNoGo(A_OPTIONS, mulberry32(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  test("maps trial type onto stimulus class and required action", () => {
    for (const t of generateGoNoGo(A_OPTIONS, mulberry32(3))) {
      expect(t.stimulusClass).toBe(t.trialType === "go" ? "cargo" : "debris");
      expect(t.requiredAction).toBe(
        t.trialType === "go" ? "press" : "withhold"
      );
      expect(t.travelMs).toBeGreaterThanOrEqual(800);
      expect(t.travelMs).toBeLessThanOrEqual(1200);
    }
  });

  test("rejects parameters that cannot produce a sequence", () => {
    expect(() => generateGoNoGo({ ...A_OPTIONS, n: 0 }, mulberry32(1))).toThrow(
      /n must be/
    );
    expect(() =>
      generateGoNoGo({ ...A_OPTIONS, goRatio: 1 }, mulberry32(1))
    ).toThrow(/goRatio/);
  });

  test("throws rather than silently degrading when the run cap is unsatisfiable", () => {
    // 95% go trials cannot be broken up by the 5 remaining no-go trials at maxRun 2.
    expect(() =>
      generateGoNoGo(
        { ...A_OPTIONS, goRatio: 0.95, maxRun: 2, maxNogoRun: 2 },
        mulberry32(1)
      )
    ).toThrow(/cannot satisfy run-length constraints/);
  });
});

describe("generateCuedGoNoGo", () => {
  test("covers all four cue x object cells with the configured mix", () => {
    const trials = generateCuedGoNoGo(B_OPTIONS, mulberry32(2));
    const cells = new Map<string, number>();
    for (const t of trials) {
      const key = `${t.cue}_${t.stimulusClass}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    expect([...cells.keys()].sort()).toEqual([
      "green_cargo",
      "green_debris",
      "red_cargo",
      "red_debris",
    ]);
    expect(cells.get("green_cargo")).toBe(20); // round(44 * 0.45)
    expect(trials.filter((t) => t.isValidGo)).toHaveLength(20);
  });

  test("only green + cargo requires a press", () => {
    for (const t of generateCuedGoNoGo(B_OPTIONS, mulberry32(5))) {
      const shouldPress = t.cue === "green" && t.stimulusClass === "cargo";
      expect(t.requiredAction).toBe(shouldPress ? "press" : "withhold");
      expect(t.isValidGo).toBe(shouldPress);
    }
  });

  test("caps runs of the same cue colour and the same required outcome", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const trials = generateCuedGoNoGo(B_OPTIONS, mulberry32(seed));
      expect(longestRun(trials, (t) => t.cue)).toBeLessThanOrEqual(3);
      expect(longestRun(trials, (t) => t.requiredAction)).toBeLessThanOrEqual(
        3
      );
    }
  });

  test("gives every trial a 2-3 second cue-to-response-window span", () => {
    // This is the spec's central correction from v1; assert it rather than trust it.
    for (const t of generateCuedGoNoGo(B_OPTIONS, mulberry32(11))) {
      const span = t.cueMs + t.cueTargetMs + t.travelMs;
      expect(span).toBeGreaterThanOrEqual(2000);
      expect(span).toBeLessThanOrEqual(3000);
    }
  });

  test("rejects a no-go mix that does not sum to one", () => {
    expect(() =>
      generateCuedGoNoGo(
        {
          ...B_OPTIONS,
          nogoMix: { redCargo: 0.5, greenDebris: 0.3, redDebris: 0.3 },
        },
        mulberry32(1)
      )
    ).toThrow(/must sum to 1/);
  });
});

describe("sequenceDurationMs", () => {
  test("keeps both challenges inside the spec's 2-2.5 minute budget", () => {
    const a: Trial[] = generateGoNoGo(A_OPTIONS, mulberry32(1));
    const b: CuedTrial[] = generateCuedGoNoGo(B_OPTIONS, mulberry32(2));
    for (const duration of [sequenceDurationMs(a), sequenceDurationMs(b)]) {
      expect(duration).toBeGreaterThan(110_000);
      expect(duration).toBeLessThan(160_000);
    }
  });
});
