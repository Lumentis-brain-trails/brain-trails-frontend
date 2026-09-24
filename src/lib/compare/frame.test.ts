import { describe, expect, test } from "vitest";
import type { WireEvent } from "@/lib/protocol/marker";
import { sceneAt, trialsOf } from "./frame";

function ev(t: number, payload: Record<string, unknown>): WireEvent {
  return { t, type: "marker", payload };
}

/** A cued trial: beacon at t, target at t + 1, outcome at t + 2. */
function cued(
  t: number,
  id: number,
  cue: "green" | "red",
  objectClass: "cargo" | "debris",
  outcome: string
): WireEvent[] {
  return [
    ev(t, { kind: "stimulus", trial_id: id, cue }),
    ev(t + 1, {
      kind: "stimulus",
      trial_id: id,
      cue,
      stimulus_class: objectClass,
    }),
    ev(t + 2, {
      kind: "outcome",
      trial_id: id,
      outcome,
      stimulus_class: objectClass,
      cue,
    }),
  ];
}

describe("trialsOf", () => {
  test("rebuilds cue, target and outcome of each trial", () => {
    const tracks = trialsOf(
      [
        ...cued(10, 1, "green", "cargo", "hit"),
        ...cued(14, 2, "red", "debris", "correct_rejection"),
      ],
      0,
      100
    );
    expect(tracks).toEqual([
      {
        trialId: 1,
        tCue: 10,
        cue: "green",
        tTarget: 11,
        objectClass: "cargo",
        tOutcome: 12,
        outcome: "hit",
      },
      {
        trialId: 2,
        tCue: 14,
        cue: "red",
        tTarget: 15,
        objectClass: "debris",
        tOutcome: 16,
        outcome: "correct_rejection",
      },
    ]);
  });

  test("an uncued trial has one onset and no beacon", () => {
    const [trial] = trialsOf(
      [
        ev(5, { kind: "stimulus", trial_id: 3, stimulus_class: "debris" }),
        ev(6, {
          kind: "outcome",
          trial_id: 3,
          outcome: "commission_error",
          stimulus_class: "debris",
        }),
      ],
      0,
      100
    );
    expect(trial.tCue).toBeNull();
    expect(trial.cue).toBeNull();
    expect(trial.tTarget).toBe(5);
  });

  test("trials outside the block or without an outcome are left out", () => {
    const events = [
      ...cued(10, 1, "green", "cargo", "hit"),
      ev(50, { kind: "stimulus", trial_id: 9, stimulus_class: "cargo" }),
      ...cued(200, 2, "green", "cargo", "hit"),
    ];
    expect(trialsOf(events, 0, 100).map((t) => t.trialId)).toEqual([1]);
  });
});

describe("sceneAt", () => {
  const tracks = trialsOf(
    [
      ...cued(10, 1, "green", "cargo", "hit"),
      ...cued(14, 2, "red", "debris", "correct_rejection"),
    ],
    0,
    100
  );

  test("before the first trial the stage is empty", () => {
    const scene = sceneAt(tracks, 5);
    expect(scene.objectClass).toBeNull();
    expect(scene.beacon).toBeNull();
  });

  test("between the beacon and the target only the beacon shows", () => {
    const scene = sceneAt(tracks, 10.5);
    expect(scene.beacon).toBe("green");
    expect(scene.objectClass).toBeNull();
  });

  test("the object travels between its onset and its outcome", () => {
    const scene = sceneAt(tracks, 11.5);
    expect(scene.phase).toBe("target");
    expect(scene.objectClass).toBe("cargo");
    expect(scene.objectProgress).toBeCloseTo(0.5);
    expect(sceneAt(tracks, 15.25).objectClass).toBe("debris");
  });

  test("the outcome shows briefly, then the stage clears", () => {
    expect(sceneAt(tracks, 12.3).feedback).toBe("hit");
    expect(sceneAt(tracks, 13.5).feedback).toBeNull();
  });

  test("after the last trial the block is done", () => {
    expect(sceneAt(tracks, 30).phase).toBe("done");
  });

  test("a block without trials is pending", () => {
    expect(sceneAt([], 3).phase).toBe("pending");
  });
});
