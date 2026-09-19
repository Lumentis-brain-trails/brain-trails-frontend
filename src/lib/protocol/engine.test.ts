import { describe, expect, test } from "vitest";
import {
  type EngineConfig,
  type EngineState,
  buildSchedule,
  createEngine,
  scheduledDurationMs,
  step,
  toTrialRecords,
} from "./engine";
import { mulberry32 } from "./rng";
import {
  type CuedTrial,
  type Trial,
  generateCuedGoNoGo,
  generateGoNoGo,
} from "./trials";

const FRAME_MS = 1000 / 60;

const A_LABELS: EngineConfig = {
  phase: "challenge_a",
  labels: {
    trialStart: "challenge_a_trial_start",
    stimulusOnset: "challenge_a_stimulus_onset",
    response: "challenge_a_response",
    outcome: "challenge_a_outcome",
  },
};

const B_LABELS: EngineConfig = {
  phase: "challenge_b",
  labels: {
    trialStart: "challenge_b_trial_start",
    cueOnset: "challenge_b_cue_onset",
    stimulusOnset: "challenge_b_target_onset",
    response: "challenge_b_response",
    outcome: "challenge_b_outcome",
  },
};

interface RunResult {
  state: EngineState;
  events: { label: string; atMs: number; meta: Record<string, unknown> }[];
}

/**
 * Drive the engine with a synthetic frame clock.
 *
 * `respond` decides, per trial, whether and when to press - expressed as a fraction of
 * the response window so it does not depend on the jittered travel time.
 */
function run(
  state: EngineState,
  options: {
    frameMs?: number;
    respond?: (trial: Trial | CuedTrial) => number | null;
    hitchAtMs?: number;
    hitchMs?: number;
  } = {}
): RunResult {
  const frameMs = options.frameMs ?? FRAME_MS;
  const total = scheduledDurationMs(state) + frameMs * 4;
  const events: RunResult["events"] = [];
  let current = state;
  let now = 0;
  const pressed = new Set<number>();
  let hitchApplied = false;

  while (now <= total && current.phase !== "done") {
    const trial = current.trials[current.trialIndex];
    let pressAtMs: number | undefined;

    if (
      trial &&
      current.phase === "target" &&
      !pressed.has(trial.trialId) &&
      options.respond
    ) {
      const fraction = options.respond(trial);
      if (fraction !== null) {
        const onset = current.actualTargetOnsetMs ?? 0;
        const at = onset + trial.travelMs * fraction;
        if (at <= now) {
          pressAtMs = at;
          pressed.add(trial.trialId);
        }
      }
    }

    const out = step(current, { nowMs: now, pressAtMs });
    current = out.state;
    for (const e of out.events) {
      events.push({
        label: e.label,
        atMs: e.atMs,
        meta: (e.meta ?? {}) as Record<string, unknown>,
      });
    }

    if (
      options.hitchAtMs !== undefined &&
      !hitchApplied &&
      now >= options.hitchAtMs
    ) {
      hitchApplied = true;
      now += options.hitchMs ?? 400;
    } else {
      now += frameMs;
    }
  }
  return { state: current, events };
}

describe("buildSchedule", () => {
  test("lays trials end to end with no gaps or overlaps", () => {
    const trials = generateGoNoGo(
      {
        n: 5,
        goRatio: 0.6,
        maxRun: 3,
        travelMs: [1000, 1000],
        itiMs: [400, 400],
      },
      mulberry32(1)
    );
    const schedule = buildSchedule(trials);
    expect(schedule[0].trialStartMs).toBe(0);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].trialStartMs).toBe(schedule[i - 1].trialEndMs);
    }
    expect(schedule[0].targetEndMs).toBe(1000);
    expect(schedule[0].trialEndMs).toBe(1400);
  });

  test("gives cued trials a cue, a delay, then the target", () => {
    const trials = generateCuedGoNoGo(
      {
        n: 4,
        validGoRatio: 0.5,
        maxCueRun: 2,
        maxOutcomeRun: 2,
        cueMs: [350, 350],
        cueTargetMs: [1000, 1000],
        travelMs: [1100, 1100],
        itiMs: [700, 700],
      },
      mulberry32(1)
    );
    const [first] = buildSchedule(trials);
    expect(first.cueOnsetMs).toBe(0);
    expect(first.cueEndMs).toBe(350);
    expect(first.targetOnsetMs).toBe(1350);
    expect(first.targetEndMs).toBe(2450);
  });
});

describe("step - Challenge A", () => {
  const trials = generateGoNoGo(
    {
      n: 12,
      goRatio: 0.75,
      maxRun: 3,
      travelMs: [900, 900],
      itiMs: [400, 400],
    },
    mulberry32(4)
  );

  test("emits the spec's marker vocabulary, in order, once per trial", () => {
    const { events, state } = run(createEngine(trials, A_LABELS), {
      respond: (t) => (t.requiredAction === "press" ? 0.4 : null),
    });
    expect(state.phase).toBe("done");

    const labels = events.map((e) => e.label);
    expect(new Set(labels)).toEqual(
      new Set([
        "challenge_a_trial_start",
        "challenge_a_stimulus_onset",
        "challenge_a_response",
        "challenge_a_outcome",
      ])
    );
    expect(labels.filter((l) => l === "challenge_a_trial_start")).toHaveLength(
      12
    );
    expect(labels.filter((l) => l === "challenge_a_outcome")).toHaveLength(12);

    // every trial is start -> stimulus -> ... -> outcome
    const perTrial = new Map<number, string[]>();
    for (const e of events) {
      const id = e.meta.trial_id as number;
      perTrial.set(id, [...(perTrial.get(id) ?? []), e.label]);
    }
    for (const sequence of perTrial.values()) {
      expect(sequence[0]).toBe("challenge_a_trial_start");
      expect(sequence[1]).toBe("challenge_a_stimulus_onset");
      expect(sequence[sequence.length - 1]).toBe("challenge_a_outcome");
    }
  });

  test("a perfect responder scores every trial correctly", () => {
    const { state } = run(createEngine(trials, A_LABELS), {
      respond: (t) => (t.requiredAction === "press" ? 0.4 : null),
    });
    const records = toTrialRecords(state, "challenge_a");
    expect(records).toHaveLength(12);
    for (const r of records) {
      expect(["hit", "correct_rejection"]).toContain(r.outcome);
    }
    expect(records.filter((r) => r.outcome === "hit")).toHaveLength(9);
  });

  test("never pressing yields misses on go trials and correct rejections on no-go", () => {
    const { state } = run(createEngine(trials, A_LABELS), {
      respond: () => null,
    });
    const records = toTrialRecords(state, "challenge_a");
    expect(records.filter((r) => r.outcome === "miss")).toHaveLength(9);
    expect(
      records.filter((r) => r.outcome === "correct_rejection")
    ).toHaveLength(3);
    expect(records.every((r) => r.rtMs === null)).toBe(true);
  });

  test("pressing on every trial yields hits and commission errors", () => {
    const { state } = run(createEngine(trials, A_LABELS), {
      respond: () => 0.5,
    });
    const records = toTrialRecords(state, "challenge_a");
    expect(records.filter((r) => r.outcome === "hit")).toHaveLength(9);
    expect(
      records.filter((r) => r.outcome === "commission_error")
    ).toHaveLength(3);
  });

  test("reaction time is measured from the actual target onset", () => {
    const { state } = run(createEngine(trials, A_LABELS), {
      respond: (t) => (t.requiredAction === "press" ? 0.5 : null),
    });
    for (const r of toTrialRecords(state, "challenge_a")) {
      if (r.outcome !== "hit") continue;
      // 50% of a 900 ms window, within one frame of quantization
      expect(r.rtMs).toBeGreaterThan(450 - FRAME_MS);
      expect(r.rtMs).toBeLessThan(450 + FRAME_MS);
    }
  });

  test("records planned and actual onsets, and stays within a frame on a clean clock", () => {
    const { events } = run(createEngine(trials, A_LABELS), {
      respond: () => null,
    });
    const onsets = events.filter(
      (e) => e.label === "challenge_a_stimulus_onset"
    );
    expect(onsets).toHaveLength(12);
    for (const e of onsets) {
      expect(typeof e.meta.planned_onset_ms).toBe("number");
      expect(typeof e.meta.actual_onset_ms).toBe("number");
      expect(Math.abs(e.meta.onset_error_ms as number)).toBeLessThanOrEqual(
        FRAME_MS
      );
      expect(e.meta.late_frame).toBeUndefined();
    }
  });
});

describe("step - Challenge B", () => {
  const trials = generateCuedGoNoGo(
    {
      n: 12,
      validGoRatio: 0.5,
      maxCueRun: 3,
      maxOutcomeRun: 3,
      cueMs: [350, 350],
      cueTargetMs: [1000, 1000],
      travelMs: [1100, 1100],
      itiMs: [700, 700],
    },
    mulberry32(9)
  );

  test("emits a cue before every target", () => {
    const { events, state } = run(createEngine(trials, B_LABELS), {
      respond: () => null,
    });
    expect(state.phase).toBe("done");
    const perTrial = new Map<number, string[]>();
    for (const e of events) {
      const id = e.meta.trial_id as number;
      perTrial.set(id, [...(perTrial.get(id) ?? []), e.label]);
    }
    expect(perTrial.size).toBe(12);
    for (const sequence of perTrial.values()) {
      const cue = sequence.indexOf("challenge_b_cue_onset");
      const target = sequence.indexOf("challenge_b_target_onset");
      expect(cue).toBeGreaterThanOrEqual(0);
      expect(target).toBeGreaterThan(cue);
    }
  });

  test("carries the cue and validity into every marker", () => {
    const { events } = run(createEngine(trials, B_LABELS), {
      respond: () => null,
    });
    for (const e of events) {
      expect(["green", "red"]).toContain(e.meta.cue);
      expect(typeof e.meta.is_valid_go_trial).toBe("boolean");
    }
  });

  test("applying the rule perfectly scores every trial correctly", () => {
    const { state } = run(createEngine(trials, B_LABELS), {
      respond: (t) => ((t as CuedTrial).isValidGo ? 0.4 : null),
    });
    const records = toTrialRecords(state, "challenge_b");
    expect(records).toHaveLength(12);
    expect(records.filter((r) => r.outcome === "hit")).toHaveLength(6);
    expect(
      records.filter((r) => r.outcome === "correct_rejection")
    ).toHaveLength(6);
  });

  test("ignoring the beacon produces commission errors on red-cargo trials", () => {
    const { state } = run(createEngine(trials, B_LABELS), {
      respond: (t) => (t.stimulusClass === "cargo" ? 0.4 : null),
    });
    const records = toTrialRecords(state, "challenge_b");
    const redCargo = trials.filter(
      (t) => t.cue === "red" && t.stimulusClass === "cargo"
    );
    expect(
      records.filter((r) => r.outcome === "commission_error")
    ).toHaveLength(redCargo.length);
  });
});

describe("step - degraded clocks", () => {
  const trials = generateGoNoGo(
    { n: 8, goRatio: 0.75, maxRun: 3, travelMs: [900, 900], itiMs: [400, 400] },
    mulberry32(2)
  );

  test("a long hitch flags the trial it spanned rather than dropping it", () => {
    const { state, events } = run(createEngine(trials, A_LABELS), {
      respond: () => null,
      hitchAtMs: 1200,
      hitchMs: 600,
    });
    expect(state.phase).toBe("done");
    expect(toTrialRecords(state, "challenge_a")).toHaveLength(8);
    expect(toTrialRecords(state, "challenge_a").some((r) => r.invalid)).toBe(
      true
    );
    expect(events.some((e) => e.meta.late_frame === true)).toBe(true);
  });

  test("a slow frame clock still produces every marker in order", () => {
    // 10 fps: far worse than any real display, and the stream must survive it
    const { state, events } = run(createEngine(trials, A_LABELS), {
      frameMs: 100,
      respond: () => null,
    });
    expect(state.phase).toBe("done");
    expect(
      events.filter((e) => e.label === "challenge_a_outcome")
    ).toHaveLength(8);
    expect(
      events.filter((e) => e.label === "challenge_a_trial_start")
    ).toHaveLength(8);
  });

  test("is deterministic: the same seed and frame clock give the same stream", () => {
    const a = run(createEngine(trials, A_LABELS), { respond: () => 0.5 });
    const b = run(createEngine(trials, A_LABELS), { respond: () => 0.5 });
    expect(a.events).toEqual(b.events);
  });
});

describe("step - stray presses", () => {
  const trials = generateGoNoGo(
    { n: 3, goRatio: 0.67, maxRun: 3, travelMs: [900, 900], itiMs: [400, 400] },
    mulberry32(3)
  );

  test("a press outside any response window is recorded but not counted", () => {
    let state = createEngine(trials, A_LABELS);
    // step to the very start, then press during the pending phase before trial 0 ends
    const first = step(state, { nowMs: 0 });
    state = first.state;
    const out = step(state, { nowMs: 950, pressAtMs: 949 }); // past targetEnd, inside the ITI
    const responses = out.events.filter(
      (e) => e.label === "challenge_a_response"
    );
    expect(responses).toHaveLength(1);
    expect(responses[0].meta?.within_window).toBe(false);
    const outcome = out.events.find((e) => e.label === "challenge_a_outcome");
    expect(outcome?.meta?.outcome).not.toBe("hit");
  });
});
