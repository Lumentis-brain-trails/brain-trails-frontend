import { describe, expect, test } from "vitest";
import {
  CODING_SYMBOLS,
  type FlankerOptions,
  type FixedNBackOptions,
  generateCoding,
  generateFlanker,
  generateNBack,
} from "./choiceTrials";
import { mulberry32 } from "./rng";

const FLANKER: FlankerOptions = {
  n: 96,
  congruentRatio: 0.5,
  cues: [],
  maxRun: 4,
  cueMs: 100,
  cueTargetMs: 400,
  stimulusMs: 1700,
  itiMs: [400, 1200],
};

const NBACK: FixedNBackOptions = {
  n: 60,
  load: 2,
  matchRatio: 0.3,
  lureRatio: 0.1,
  stimulusMs: 500,
  isiMs: 2000,
};

function longestRun(values: string[]): number {
  let best = 0;
  let run = 0;
  values.forEach((v, i) => {
    run = i > 0 && values[i - 1] === v ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

describe("generateFlanker", () => {
  test("exact congruency counts, capped runs, balanced directions, same seed same block", () => {
    for (let seed = 0; seed < 20; seed++) {
      const trials = generateFlanker(FLANKER, mulberry32(seed));
      const congruent = trials.filter((t) => t.condition === "congruent");
      expect(trials).toHaveLength(96);
      expect(congruent).toHaveLength(48);
      expect(longestRun(trials.map((t) => t.condition))).toBeLessThanOrEqual(4);
      for (const condition of ["congruent", "incongruent"]) {
        const left = trials.filter(
          (t) => t.condition === condition && t.correctResponse === "left"
        );
        expect(left).toHaveLength(24);
      }
    }
    expect(generateFlanker(FLANKER, mulberry32(7))).toEqual(
      generateFlanker(FLANKER, mulberry32(7))
    );
  });

  test("flankers agree with the target only when congruent; a plain task sits at fixation", () => {
    for (const t of generateFlanker(FLANKER, mulberry32(3))) {
      const same = t.stimulus.flankers === t.stimulus.direction;
      expect(same).toBe(t.condition === "congruent");
      expect(t.correctResponse).toBe(t.stimulus.direction);
      expect(t.stimulus.position).toBe("center");
      expect(t.cue).toBeUndefined();
      expect(t.itiMs).toBeGreaterThanOrEqual(400);
      expect(t.itiMs).toBeLessThanOrEqual(1200);
    }
  });

  test("with cues every cue x congruency cell is filled equally, and rows leave fixation", () => {
    const trials = generateFlanker(
      { ...FLANKER, cues: ["none", "center", "double", "spatial"] },
      mulberry32(11)
    );
    for (const cue of ["none", "center", "double", "spatial"]) {
      for (const condition of ["congruent", "incongruent"]) {
        const cell = trials.filter(
          (t) => t.cue === cue && t.condition === condition
        );
        expect(cell).toHaveLength(12);
      }
    }
    expect(new Set(trials.map((t) => t.stimulus.position))).toEqual(
      new Set(["up", "down"])
    );
    expect(trials.every((t) => t.cueMs === 100 && t.cueTargetMs === 400)).toBe(
      true
    );
  });

  test("impossible parameters throw", () => {
    expect(() =>
      generateFlanker({ ...FLANKER, n: 0 }, mulberry32(1))
    ).toThrow();
    expect(() =>
      generateFlanker({ ...FLANKER, congruentRatio: 1 }, mulberry32(1))
    ).toThrow();
    expect(() =>
      generateFlanker(
        { ...FLANKER, congruentRatio: 0.9, maxRun: 1 },
        mulberry32(1)
      )
    ).toThrow(/run-length/);
  });
});

describe("generateNBack", () => {
  test.each([1, 2, 3])(
    "load %i: every match repeats the letter `load` back, and only matches do",
    (load) => {
      for (let seed = 0; seed < 20; seed++) {
        const trials = generateNBack({ ...NBACK, load }, mulberry32(seed));
        const letters = trials.map((t) => t.stimulus.letter as string);
        expect(trials).toHaveLength(60);
        expect(trials.filter((t) => t.condition === "match")).toHaveLength(18);
        trials.forEach((t, i) => {
          const isRepeat = i >= load && letters[i] === letters[i - load];
          expect(isRepeat).toBe(t.condition === "match");
          expect(t.correctResponse).toBe(
            t.condition === "match" ? "press" : null
          );
          expect(t.meta).toMatchObject({ load, letter: letters[i] });
        });
      }
    }
  );

  test("lures repeat the letter one step off and must be withheld", () => {
    const trials = generateNBack(NBACK, mulberry32(5));
    const letters = trials.map((t) => t.stimulus.letter as string);
    const lures = trials.filter((t) => t.condition === "lure");
    expect(lures.length).toBeGreaterThan(0);
    expect(lures.length).toBeLessThanOrEqual(6);
    for (const lure of lures) {
      expect(letters[lure.trialId]).toBe(letters[lure.trialId - 1]);
      expect(lure.correctResponse).toBeNull();
    }
  });

  test("the pace is fixed: window is letter plus blank, no extra pause", () => {
    const [first] = generateNBack(NBACK, mulberry32(1));
    expect(first).toMatchObject({ stimulusMs: 500, windowMs: 2500, itiMs: 0 });
  });

  test("self-paced: the same letters, no window, a blank after each, marked", () => {
    const { n, load, matchRatio, lureRatio } = NBACK;
    const selfPaced = generateNBack(
      { n, load, matchRatio, lureRatio, pace: "self", gapMs: 500 },
      mulberry32(3)
    );
    const fixed = generateNBack(NBACK, mulberry32(3));
    expect(selfPaced.map((t) => t.stimulus)).toEqual(
      fixed.map((t) => t.stimulus)
    );
    expect(selfPaced[0]).toMatchObject({ itiMs: 500, meta: { pace: "self" } });
    expect(fixed[0].meta).not.toHaveProperty("pace");
  });

  test("impossible parameters throw", () => {
    expect(() => generateNBack({ ...NBACK, load: 4 }, mulberry32(1))).toThrow();
    expect(() => generateNBack({ ...NBACK, n: 3 }, mulberry32(1))).toThrow();
    expect(() =>
      generateNBack({ ...NBACK, matchRatio: 0.95 }, mulberry32(1))
    ).toThrow();
  });
});

describe("generateCoding", () => {
  test("a key drawn per session, digits that match it, no symbol twice in a row", () => {
    const a = generateCoding(
      { durationS: 90, pairs: 9, itiMs: 150 },
      mulberry32(1)
    );
    const b = generateCoding(
      { durationS: 90, pairs: 9, itiMs: 150 },
      mulberry32(2)
    );
    expect(new Set(a.key).size).toBe(9);
    expect(
      a.key.every((s) => (CODING_SYMBOLS as readonly string[]).includes(s))
    ).toBe(true);
    expect(a.key).not.toEqual(b.key);
    expect(a.trials.length).toBeGreaterThanOrEqual(225);
    a.trials.forEach((t, i) => {
      expect(a.key[Number(t.correctResponse) - 1]).toBe(t.stimulus.symbol);
      if (i > 0)
        expect(t.stimulus.symbol).not.toBe(a.trials[i - 1].stimulus.symbol);
    });
  });

  test("fewer pairs make a smaller key; out-of-range sizes throw", () => {
    const { key, trials } = generateCoding(
      { durationS: 30, pairs: 4, itiMs: 100 },
      mulberry32(3)
    );
    expect(key).toHaveLength(4);
    expect(trials.every((t) => Number(t.correctResponse) <= 4)).toBe(true);
    expect(() =>
      generateCoding({ durationS: 30, pairs: 1, itiMs: 0 }, mulberry32(1))
    ).toThrow();
    expect(() =>
      generateCoding({ durationS: 0, pairs: 4, itiMs: 0 }, mulberry32(1))
    ).toThrow();
  });
});
