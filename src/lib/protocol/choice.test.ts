import { describe, expect, test } from "vitest";
import {
  type ChoiceConfig,
  type ChoiceState,
  type ChoiceTrial,
  choiceDurationMs,
  createChoiceEngine,
  stepChoice,
  summarizeChoice,
} from "./choice";

const LABELS = {
  trialStart: "t_start",
  cueOnset: "t_cue",
  stimulusOnset: "t_stim",
  response: "t_resp",
  outcome: "t_out",
};

const CONFIG: ChoiceConfig = {
  phase: "test",
  labels: LABELS,
  keys: ["left", "right"],
};

function trial(id: number, over: Partial<ChoiceTrial> = {}): ChoiceTrial {
  return {
    trialId: id,
    condition: "congruent",
    stimulus: { direction: "left" },
    correctResponse: "left",
    stimulusMs: 500,
    windowMs: 1000,
    itiMs: 500,
    ...over,
  };
}

/** Drive the engine at 60 Hz until `untilMs`, pressing as scripted. */
function run(
  state: ChoiceState,
  untilMs: number,
  presses: { key: string; atMs: number }[] = []
) {
  const events: {
    label: string;
    atMs: number;
    meta: Record<string, unknown>;
  }[] = [];
  const scenes = [];
  const queue = [...presses].sort((a, b) => a.atMs - b.atMs);
  let current = state;
  for (let now = 0; now <= untilMs; now += 1000 / 60) {
    const due =
      queue.length && queue[0].atMs <= now ? queue.shift() : undefined;
    const out = stepChoice(current, {
      nowMs: now,
      ...(due ? { press: due } : {}),
    });
    current = out.state;
    scenes.push(out.scene);
    for (const e of out.events)
      events.push({ label: e.label, atMs: e.atMs, meta: e.meta ?? {} });
  }
  return { state: current, events, scenes };
}

describe("choice engine", () => {
  test("a correct press is a hit, timed from the stimulus frame to the key event", () => {
    const { state, events } = run(
      createChoiceEngine([trial(0)], CONFIG),
      2000,
      [{ key: "left", atMs: 412 }]
    );
    expect(state.phase).toBe("done");
    expect(events.map((e) => e.label)).toEqual([
      "t_start",
      "t_stim",
      "t_resp",
      "t_out",
    ]);
    const outcome = events.at(-1)!.meta;
    expect(outcome).toMatchObject({
      outcome: "hit",
      response: "left",
      required_action: "press",
      correct_response: "left",
      condition: "congruent",
      trial_id: 0,
      reaction_time_ms: 412,
    });
    expect(events[1].meta).toMatchObject({
      timing_source: "raf",
      planned_onset_ms: 0,
    });
  });

  test("the wrong key is an error, no key a miss", () => {
    const wrong = run(createChoiceEngine([trial(0)], CONFIG), 2000, [
      { key: "right", atMs: 300 },
    ]);
    expect(wrong.state.outcomes[0].outcome).toBe("error");
    const none = run(createChoiceEngine([trial(0)], CONFIG), 2000);
    expect(none.state.outcomes[0]).toMatchObject({
      outcome: "miss",
      rtMs: null,
    });
  });

  test("a withhold trial is a correct rejection unless a key is pressed", () => {
    const nogo = trial(0, { correctResponse: null, condition: "nonmatch" });
    const held = run(createChoiceEngine([nogo], CONFIG), 2000);
    expect(held.state.outcomes[0].outcome).toBe("correct_rejection");
    expect(held.events.at(-1)!.meta.required_action).toBe("withhold");
    const pressed = run(createChoiceEngine([nogo], CONFIG), 2000, [
      { key: "left", atMs: 200 },
    ]);
    expect(pressed.state.outcomes[0].outcome).toBe("commission_error");
  });

  test("only the first press counts, and unknown keys are ignored", () => {
    const { state, events } = run(
      createChoiceEngine([trial(0)], CONFIG),
      2000,
      [
        { key: "x", atMs: 100 },
        { key: "right", atMs: 300 },
        { key: "left", atMs: 500 },
      ]
    );
    expect(state.outcomes[0]).toMatchObject({ outcome: "error", rtMs: 300 });
    // the second press is kept in the stream, flagged, and never scored
    const responses = events.filter((e) => e.label === "t_resp");
    expect(responses.map((e) => e.meta.within_window)).toEqual([true, false]);
  });

  test("a cue comes first, stays for cueMs, and the stimulus follows the gap", () => {
    const cued = trial(0, { cue: "spatial", cueMs: 100, cueTargetMs: 400 });
    const { events, scenes } = run(createChoiceEngine([cued], CONFIG), 2500);
    const cue = events.find((e) => e.label === "t_cue")!;
    const stim = events.find((e) => e.label === "t_stim")!;
    expect(cue.meta.cue_type).toBe("spatial");
    expect(stim.meta.planned_onset_ms).toBe(500);
    expect(stim.atMs - cue.atMs).toBeGreaterThanOrEqual(500);
    expect(stim.atMs - cue.atMs).toBeLessThan(500 + 17);
    expect(scenes.some((s) => s.cue === "spatial")).toBe(true);
    expect(scenes.filter((s) => s.cue !== null && s.stimulus !== null)).toEqual(
      []
    );
  });

  test("endOnResponse moves the next trial up to the press", () => {
    const trials = [trial(0), trial(1)];
    const fixed = run(createChoiceEngine(trials, CONFIG), 4000, [
      { key: "left", atMs: 300 },
    ]);
    const early = run(
      createChoiceEngine(trials, { ...CONFIG, endOnResponse: true }),
      4000,
      [{ key: "left", atMs: 300 }]
    );
    const second = (r: typeof fixed) =>
      r.events.filter((e) => e.label === "t_stim")[1].meta.planned_onset_ms;
    expect(second(fixed)).toBe(1500);
    expect(second(early)).toBe(800);
  });

  test("the stimulus leaves the screen after stimulusMs while the window stays open", () => {
    const { scenes, state } = run(
      createChoiceEngine([trial(0)], CONFIG),
      2000,
      [{ key: "left", atMs: 800 }]
    );
    const shown = scenes.filter((s) => s.stimulus !== null);
    expect(shown.length).toBeGreaterThan(25);
    expect(shown.length).toBeLessThan(33);
    expect(state.outcomes[0]).toMatchObject({ outcome: "hit", rtMs: 800 });
  });

  test("a hitch during a trial invalidates it, one during the pause does not", () => {
    let state = createChoiceEngine([trial(0), trial(1)], CONFIG);
    state = stepChoice(state, { nowMs: 0 }).state;
    state = stepChoice(state, { nowMs: 600 }).state; // 600 ms without a frame
    state = stepChoice(state, { nowMs: 1010 }).state; // outcome
    expect(state.outcomes[0].invalid).toBe(true);
    // 480 ms without a frame, but inside the pause: nothing was on screen to mistime
    state = stepChoice(state, { nowMs: 1490 }).state;
    for (let now = 1500; now <= 2600; now += 16) {
      state = stepChoice(state, { nowMs: now }).state;
    }
    expect(state.outcomes[1]).toMatchObject({ trialId: 1, invalid: false });
  });

  test("a timed block stops dealing trials, and does not score the item left open", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      trial(i, { windowMs: 60_000, stimulusMs: 60_000, itiMs: 100 })
    );
    const config = { ...CONFIG, endOnResponse: true, maxDurationMs: 3000 };
    const presses = Array.from({ length: 5 }, (_, i) => ({
      key: "left",
      atMs: 400 + i * 500,
    }));
    const { state } = run(createChoiceEngine(many, config), 5000, presses);
    expect(state.phase).toBe("done");
    expect(state.outcomes).toHaveLength(5);
    expect(state.outcomes.every((o) => o.outcome === "hit")).toBe(true);
  });

  test("practice is stamped on every marker of the trial", () => {
    const { events } = run(
      createChoiceEngine(
        [trial(0, { practice: true, meta: { load: 2 } })],
        CONFIG
      ),
      2000
    );
    expect(events.every((e) => e.meta.practice === true)).toBe(true);
    expect(events.every((e) => e.meta.load === 2)).toBe(true);
  });

  test("an empty block is done at once", () => {
    expect(createChoiceEngine([], CONFIG).phase).toBe("done");
    expect(choiceDurationMs([trial(0), trial(1)])).toBe(3000);
    expect(choiceDurationMs([trial(0)], 100)).toBe(1500);
  });
});

describe("self-paced (advanceKey)", () => {
  const SELF: ChoiceConfig = {
    phase: "test",
    labels: LABELS,
    keys: ["press"],
    advanceKey: "continue",
  };
  const letter = (id: number, match: boolean) =>
    trial(id, {
      condition: match ? "match" : "nonmatch",
      stimulus: { letter: "K" },
      correctResponse: match ? "press" : null,
      stimulusMs: 0,
      windowMs: 0,
      itiMs: 500,
    });

  test("the letter stays, however long, until the participant moves on", () => {
    const { state, scenes, events } = run(
      createChoiceEngine([letter(0, false), letter(1, false)], SELF),
      9000
    );
    expect(state.phase).toBe("stimulus");
    expect(state.trialIndex).toBe(0);
    expect(scenes.at(-1)!.stimulus).toEqual({ letter: "K" });
    expect(events.map((e) => e.label)).toEqual(["t_start", "t_stim"]);
    expect(choiceDurationMs(state.trials, undefined, "continue")).toBe(
      Infinity
    );
  });

  test("Match before Continue is the answer; Continue ends the letter", () => {
    const { state, events, scenes } = run(
      createChoiceEngine([letter(0, true), letter(1, false)], SELF),
      6000,
      [
        { key: "press", atMs: 1200 },
        { key: "continue", atMs: 2000 },
        { key: "continue", atMs: 3000 },
      ]
    );
    expect(state.phase).toBe("done");
    expect(state.outcomes.map((o) => o.outcome)).toEqual([
      "hit",
      "correct_rejection",
    ]);
    const [first, second] = state.outcomes;
    expect(first.rtMs).toBeCloseTo(1200, -1);
    expect(first.advanceMs).toBeCloseTo(2000, -1);
    // the next letter comes after the blank (on the next frame), and waits in turn
    expect(Math.abs(second.advanceMs! - (3000 - 2500))).toBeLessThan(17);
    const outcomes = events.filter((e) => e.label === "t_out");
    expect(outcomes[0].meta).toMatchObject({ outcome: "hit" });
    expect(outcomes[0].atMs).toBeCloseTo(2000, -1);
    expect(outcomes[0].meta.advance_ms).toBeCloseTo(2000, -1);
    // Continue is not an answer: it never appears as a response marker
    expect(
      events.filter((e) => e.label === "t_resp").map((e) => e.meta.response)
    ).toEqual(["press"]);
    // the pressed Match shows while its letter is up
    expect(scenes.some((scene) => scene.response === "press")).toBe(true);
  });

  test("no Match before Continue on a match is a miss", () => {
    const { state } = run(createChoiceEngine([letter(0, true)], SELF), 2000, [
      { key: "continue", atMs: 700 },
    ]);
    expect(state.outcomes[0].outcome).toBe("miss");
    expect(state.outcomes[0].rtMs).toBeNull();
  });

  test("Continue between letters does nothing", () => {
    const { state } = run(
      createChoiceEngine([letter(0, false), letter(1, false)], SELF),
      4000,
      [
        { key: "continue", atMs: 1000 },
        { key: "continue", atMs: 1200 },
      ]
    );
    // the second press fell in the blank: the second letter is still waiting
    expect(state.outcomes).toHaveLength(1);
    expect(state.phase).toBe("stimulus");
  });
});

describe("summarizeChoice", () => {
  test("rates over scored trials, medians over hits, one row per condition", () => {
    const base = { invalid: false, practice: false, response: "left" };
    const summary = summarizeChoice("flanker", [
      {
        ...base,
        trialId: 0,
        condition: "congruent",
        outcome: "hit",
        rtMs: 400,
      },
      {
        ...base,
        trialId: 1,
        condition: "congruent",
        outcome: "hit",
        rtMs: 420,
      },
      {
        ...base,
        trialId: 2,
        condition: "incongruent",
        outcome: "hit",
        rtMs: 520,
      },
      {
        ...base,
        trialId: 3,
        condition: "incongruent",
        outcome: "error",
        rtMs: 300,
      },
      {
        ...base,
        trialId: 4,
        condition: "incongruent",
        outcome: "miss",
        rtMs: null,
      },
      {
        ...base,
        trialId: 5,
        condition: "congruent",
        outcome: "hit",
        rtMs: 90,
        invalid: true,
      },
      {
        ...base,
        trialId: 6,
        condition: "congruent",
        outcome: "hit",
        rtMs: 90,
        practice: true,
      },
    ]);
    expect(summary).toMatchObject({
      n: 5,
      nExcluded: 1,
      hitRate: 0.6,
      omissionRate: 0.2,
      errorRate: 0.2,
      commissionRate: null,
      medianRtMs: 420,
      correct: 3,
    });
    expect(summary.conditions.congruent).toEqual({
      n: 2,
      accuracy: 1,
      medianRtMs: 410,
    });
    expect(summary.conditions.incongruent.accuracy).toBeCloseTo(1 / 3);
  });
});
