import { describe, expect, test } from "vitest";
import "@/components/protocol/kinds"; // registers the built-in kinds
import { planBreathing } from "./breathing";
import { SIGNAL_NAVIGATOR } from "./__fixtures__/signalNavigator";
import { eegAnchor, runAnchor } from "./clock";
import {
  MAX_PAYLOAD_BYTES,
  type Marker,
  toWireEvent,
  wireEventBytes,
} from "./marker";
import { knownKinds } from "./registry";
import { parseProtocol, safeParseProtocol } from "./schema";

describe("registry", () => {
  test("registers the built-in kinds", () => {
    expect(knownKinds()).toEqual([
      "audio",
      "baseline",
      "breathing",
      "coding",
      "countdown",
      "fixation",
      "flanker",
      "go-no-go",
      "heartbeat",
      "image-sequence",
      "instructions",
      "n-back",
      "prompt",
      "questionnaire",
      "quiz",
      "rest",
      "text",
      "video",
    ]);
  });
});

describe("parseProtocol", () => {
  test("Signal Navigator is a valid protocol", () => {
    const protocol = parseProtocol(SIGNAL_NAVIGATOR);
    expect(protocol.id).toBe("signal-navigator");
    expect(protocol.steps.map((s) => s.kind)).toEqual([
      "prompt",
      "go-no-go",
      "breathing",
      "go-no-go",
      "prompt",
    ]);
  });

  test("covers the spec's full marker vocabulary across its steps", () => {
    const declared = new Set<string>();
    if (SIGNAL_NAVIGATOR.startMarker)
      declared.add(SIGNAL_NAVIGATOR.startMarker);
    if (SIGNAL_NAVIGATOR.endMarker) declared.add(SIGNAL_NAVIGATOR.endMarker);
    for (const step of SIGNAL_NAVIGATOR.steps) {
      if (step.startMarker) declared.add(step.startMarker);
      if (step.endMarker) declared.add(step.endMarker);
      const config = step.config as {
        markers?: Record<string, string>;
        lines?: { marker?: string }[];
      };
      for (const label of Object.values(config.markers ?? {}))
        declared.add(label);
      for (const line of config.lines ?? [])
        if (line.marker) declared.add(line.marker);
    }

    // The reference stream from attention-task-spec.md, minus `practice_trial`, which is
    // an optional extra step rather than part of the default run.
    for (const expected of [
      "session_start",
      "arrival_start",
      "arrival_end",
      "challenge_a_start",
      "challenge_a_trial_start",
      "challenge_a_stimulus_onset",
      "challenge_a_response",
      "challenge_a_outcome",
      "challenge_a_end",
      "coping_start",
      "breath_cycle_start",
      "breath_inhale",
      "breath_exhale",
      "rule_instruction_shown",
      "coping_end",
      "challenge_b_start",
      "challenge_b_cue_onset",
      "challenge_b_target_onset",
      "challenge_b_response",
      "challenge_b_outcome",
      "challenge_b_end",
      "outro_start",
      "session_end",
    ]) {
      expect(declared).toContain(expected);
    }
  });

  test("runs exactly three breathing cycles before the rule is shown", () => {
    const reset = SIGNAL_NAVIGATOR.steps.find((s) => s.id === "reset");
    const segments = planBreathing(
      // the schema fills the marker defaults
      parseProtocol(SIGNAL_NAVIGATOR).steps.find((s) => s.id === "reset")!
        .config as never
    );
    expect(reset).toBeDefined();
    const firstRule = segments.findIndex(
      (s) => s.marker === "rule_instruction_shown"
    );
    const cyclesBefore = new Set(
      segments
        .slice(0, firstRule)
        .filter((s) => s.cycleStart)
        .map((s) => s.cycle)
    );
    expect(cyclesBefore.size).toBe(3);
  });

  test("rejects an unknown kind and names the registered ones", () => {
    const result = safeParseProtocol({
      ...SIGNAL_NAVIGATOR,
      steps: [{ id: "x", kind: "teleport", label: "X", config: {} }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unknown kind "teleport"/);
      expect(result.error).toMatch(
        /breathing, coding, countdown, fixation, flanker, go-no-go, heartbeat/
      );
    }
  });

  test("reports a bad step config with the step index and the field", () => {
    const broken = structuredClone(SIGNAL_NAVIGATOR);
    (broken.steps[1].config as { goRatio: number }).goRatio = 4;
    const result = safeParseProtocol(broken);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatch(
        /steps\[1\] \("challenge_a"\): config\.goRatio/
      );
  });

  test("rejects duplicate step ids", () => {
    const broken = structuredClone(SIGNAL_NAVIGATOR);
    broken.steps[1].id = "arrival";
    const result = safeParseProtocol(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicate step id/);
  });
});

describe("clock anchors", () => {
  test("the run anchor is linear and reports no session time", () => {
    const anchor = runAnchor(1000);
    expect(anchor.toRunMs(1500)).toBe(500);
    expect(anchor.toSessionS(1500)).toBeNull();
    expect(anchor.kind).toBe("run");
  });

  test("the eeg anchor maps host time onto session seconds", () => {
    // sample 0 at host 1000 ms, 256 Hz => 3.90625 ms per sample
    const fit = { hostMsAtIndex0: 1000, msPerSample: 1000 / 256 };
    const anchor = eegAnchor(1000, () => fit, 256); // recording kept from sample 256 = t 1 s
    // host 2000 ms is sample 256, which is the first kept sample, so session t = 0
    expect(anchor.toSessionS(2000)).toBeCloseTo(0, 9);
    expect(anchor.toSessionS(3000)).toBeCloseTo(1, 9);
  });

  test("reports null until a fit exists", () => {
    expect(eegAnchor(0, () => null, 0).toSessionS(500)).toBeNull();
  });
});

describe("toWireEvent", () => {
  const marker: Marker = {
    label: "challenge_b_target_onset",
    kind: "stimulus",
    tSessionS: null,
    tMonotonicMs: 12_345.6,
    tRunMs: 2_345.6,
    meta: { phase: "challenge_b", trial_id: 7, cue: "green" },
  };

  test("falls back to the run clock and says so", () => {
    const event = toWireEvent(marker);
    expect(event.type).toBe("challenge_b_target_onset");
    expect(event.t).toBeCloseTo(2.3456, 9);
    expect(event.payload.t_session_estimated).toBe(true);
    expect(event.payload.trial_id).toBe(7);
  });

  test("prefers the session clock when one exists", () => {
    const event = toWireEvent({ ...marker, tSessionS: 9.5 });
    expect(event.t).toBe(9.5);
    expect(event.payload.t_session_estimated).toBe(false);
  });

  test("never emits a negative t, which the endpoint rejects", () => {
    expect(toWireEvent({ ...marker, tSessionS: -0.4 }).t).toBe(0);
  });

  test("a fully populated marker stays inside the per-event size cap", () => {
    const fat: Marker = {
      ...marker,
      meta: {
        protocol_id: "signal-navigator",
        protocol_version: 1,
        step_id: "challenge_b",
        task_kind: "go-no-go",
        phase: "challenge_b",
        trial_id: 43,
        cue: "red",
        stimulus_class: "cargo",
        stimulus_id: "cargo_03",
        required_action: "withhold",
        outcome: "commission_error",
        reaction_time_ms: 412.5,
        planned_onset_ms: 123_456.7,
        actual_onset_ms: 123_461.2,
        onset_error_ms: 4.5,
        motion_profile: "full",
      },
    };
    expect(wireEventBytes(toWireEvent(fat))).toBeLessThan(MAX_PAYLOAD_BYTES);
  });
});
