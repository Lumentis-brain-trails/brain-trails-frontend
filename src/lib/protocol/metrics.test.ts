import { describe, expect, test } from "vitest";
import {
  MIN_TRIALS_FOR_SDT,
  type TrialRecord,
  postErrorSlowing,
  sdt,
  summarizePhase,
} from "./metrics";
import { mad, median, zInverse } from "./stats";

describe("stats", () => {
  test("median handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  test("mad is the median of absolute deviations", () => {
    // median is 3; deviations are 2,1,0,1,2; their median is 1
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
    expect(mad([])).toBeNull();
  });

  test("zInverse matches known standard-normal quantiles", () => {
    expect(zInverse(0.5)).toBeCloseTo(0, 9);
    expect(zInverse(0.975)).toBeCloseTo(1.959964, 5);
    expect(zInverse(0.025)).toBeCloseTo(-1.959964, 5);
    expect(zInverse(0.99)).toBeCloseTo(2.326348, 5);
    expect(zInverse(0.001)).toBeCloseTo(-3.090232, 4);
    expect(() => zInverse(0)).toThrow();
    expect(() => zInverse(1)).toThrow();
  });
});

describe("sdt", () => {
  test("computes d' and criterion from hand-checked rates", () => {
    // log-linear: hit = 18.5/21 = 0.880952, fa = 2.5/11 = 0.227273
    const { dPrime, criterion } = sdt(18, 20, 2, 10);
    const zHit = zInverse(18.5 / 21);
    const zFa = zInverse(2.5 / 11);
    expect(dPrime).toBeCloseTo(zHit - zFa, 10);
    expect(criterion).toBeCloseTo(-0.5 * (zHit + zFa), 10);
    expect(dPrime).toBeGreaterThan(1.9);
  });

  test("survives perfect and floor performance without infinities", () => {
    const perfect = sdt(20, 20, 0, 10);
    expect(Number.isFinite(perfect.dPrime as number)).toBe(true);
    const floor = sdt(0, 20, 10, 10);
    expect(Number.isFinite(floor.dPrime as number)).toBe(true);
    expect(floor.dPrime).toBeLessThan(0);
  });

  test("the half correction differs from log-linear but stays finite", () => {
    const ll = sdt(20, 20, 0, 10, "loglinear");
    const half = sdt(20, 20, 0, 10, "half");
    expect(half.dPrime).not.toBeCloseTo(ll.dPrime as number, 6);
    expect(Number.isFinite(half.dPrime as number)).toBe(true);
  });

  test("reports nothing below the trial-count threshold", () => {
    expect(sdt(3, MIN_TRIALS_FOR_SDT - 1, 1, 20)).toEqual({
      dPrime: null,
      criterion: null,
    });
    expect(sdt(3, 20, 1, MIN_TRIALS_FOR_SDT - 1)).toEqual({
      dPrime: null,
      criterion: null,
    });
  });
});

function go(
  trialId: number,
  outcome: "hit" | "miss",
  rtMs: number | null
): TrialRecord {
  return {
    trialId,
    phase: "challenge_a",
    trialType: "go",
    stimulusClass: "cargo",
    outcome,
    rtMs,
  };
}

function nogo(
  trialId: number,
  outcome: "correct_rejection" | "commission_error",
  rtMs: number | null = null
): TrialRecord {
  return {
    trialId,
    phase: "challenge_a",
    trialType: "nogo",
    stimulusClass: "debris",
    outcome,
    rtMs,
  };
}

describe("postErrorSlowing", () => {
  test("compares each error against its own neighbours", () => {
    const trials: TrialRecord[] = [];
    let id = 0;
    // four error episodes: before = 300, after = 360 -> slowing of 60 ms
    for (let i = 0; i < 4; i++) {
      trials.push(go(id++, "hit", 300));
      trials.push(nogo(id++, "commission_error", 220));
      trials.push(go(id++, "hit", 360));
    }
    expect(postErrorSlowing(trials)).toBeCloseTo(60, 10);
  });

  test("is not reported with too few usable pairs", () => {
    const trials = [
      go(0, "hit", 300),
      nogo(1, "commission_error", 200),
      go(2, "hit", 380),
    ];
    expect(postErrorSlowing(trials)).toBeNull();
  });
});

describe("summarizePhase", () => {
  const trials: TrialRecord[] = [
    go(0, "hit", 400),
    go(1, "hit", 420),
    go(2, "miss", null),
    go(3, "hit", 380),
    go(4, "hit", 440),
    go(5, "hit", 460),
    nogo(6, "correct_rejection"),
    nogo(7, "commission_error", 250),
    nogo(8, "correct_rejection"),
    nogo(9, "correct_rejection"),
    nogo(10, "correct_rejection"),
    nogo(11, "correct_rejection"),
  ];

  test("reports each rate against its own denominator", () => {
    const s = summarizePhase("challenge_a", trials);
    expect(s.nGo).toBe(6);
    expect(s.nNogo).toBe(6);
    expect(s.hitRate).toBeCloseTo(5 / 6, 10);
    expect(s.omissionRate).toBeCloseTo(1 / 6, 10);
    expect(s.commissionRate).toBeCloseTo(1 / 6, 10);
    expect(s.correctRejectionRate).toBeCloseTo(5 / 6, 10);
  });

  test("keeps commission-error RTs out of the median RT", () => {
    const s = summarizePhase("challenge_a", trials);
    // hits are 400, 420, 380, 440, 460 -> median 420; the 250 ms false dock is separate
    expect(s.medianRtMs).toBe(420);
    expect(s.commissionRtMs).toBe(250);
  });

  test("excludes practice and invalid trials and counts them", () => {
    const withNoise: TrialRecord[] = [
      ...trials,
      { ...go(12, "hit", 100), practice: true },
      { ...go(13, "hit", 100), invalid: true },
    ];
    const s = summarizePhase("challenge_a", withNoise);
    expect(s.n).toBe(12);
    expect(s.nExcluded).toBe(2);
    expect(s.medianRtMs).toBe(420);
  });

  test("splits early and late halves", () => {
    const s = summarizePhase("challenge_a", trials);
    expect(s.early.hitRate).toBeCloseTo(5 / 6, 10); // first six are all go trials
    expect(s.late.hitRate).toBeNull(); // last six are all no-go
    expect(s.late.commissionRate).toBeCloseTo(1 / 6, 10);
  });

  test("returns nulls rather than NaN for an empty phase", () => {
    const s = summarizePhase("challenge_b", []);
    expect(s.n).toBe(0);
    expect(s.hitRate).toBeNull();
    expect(s.medianRtMs).toBeNull();
    expect(s.dPrime).toBeNull();
  });
});
