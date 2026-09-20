/**
 * The two pure stage planners: breathing and timed images.
 *
 * Both exist so a schedule is something a test asserts rather than something a reviewer
 * counts by watching the screen.
 */

import { describe, expect, test } from "vitest";
import {
  type BreathingConfig,
  breathingDurationMs,
  planBreathing,
} from "./breathing";
import {
  type ImageSequenceConfig,
  imageSequenceConfigSchema,
  imageSequenceDurationMs,
  planImageSequence,
  sourcesToPreload,
} from "./imageSequence";
import { mulberry32 } from "./rng";

function breathing(overrides: Partial<BreathingConfig> = {}): BreathingConfig {
  return {
    cycles: 3,
    inhaleMs: 4500,
    holdMs: 0,
    exhaleMs: 4500,
    markers: {
      cycleStart: "breath_cycle_start",
      inhale: "breath_inhale",
      exhale: "breath_exhale",
    },
    lines: [],
    ...overrides,
  };
}

function images(overrides: Partial<ImageSequenceConfig> = {}) {
  return imageSequenceConfigSchema.parse({
    items: [
      { id: "std", src: "/a.png", class: "standard", durationMs: 200 },
      { id: "dev", src: "/b.png", class: "deviant", durationMs: 200 },
    ],
    isiMs: 300,
    ...overrides,
  });
}

describe("planBreathing", () => {
  test("lays out contiguous inhale/exhale segments per cycle", () => {
    const segments = planBreathing(breathing({ cycles: 2 }));

    expect(segments.map((s) => s.phase)).toEqual([
      "inhale",
      "exhale",
      "inhale",
      "exhale",
    ]);
    // Every segment begins where the previous one ended; no gaps, no overlap.
    let cursor = 0;
    for (const segment of segments) {
      expect(segment.atMs).toBe(cursor);
      cursor += segment.durationMs;
    }
    expect(cursor).toBe(2 * (4500 + 4500));
  });

  test("marks the first segment of each cycle and only that one", () => {
    const segments = planBreathing(breathing({ cycles: 3 }));
    const starts = segments.filter((s) => s.cycleStart);

    expect(starts).toHaveLength(3);
    expect(starts.map((s) => s.cycle)).toEqual([0, 1, 2]);
    expect(starts.every((s) => s.phase === "inhale")).toBe(true);
  });

  test("inserts a hold between inhale and exhale only when one is configured", () => {
    expect(
      planBreathing(breathing({ cycles: 1, holdMs: 0 })).map((s) => s.phase)
    ).toEqual(["inhale", "exhale"]);
    expect(
      planBreathing(breathing({ cycles: 1, holdMs: 1000 })).map((s) => s.phase)
    ).toEqual(["inhale", "hold", "exhale"]);
  });

  /** The spec requires the if-then rule to land after the breathing, never during it. */
  test("puts every rule line after the last breath", () => {
    const segments = planBreathing(
      breathing({
        cycles: 3,
        lines: [
          { text: "If a red sign appears", marker: "rule_1", holdMs: 4000 },
          { text: "then I wait", marker: "rule_2", holdMs: 4000 },
        ],
      })
    );

    const lastBreath = [...segments].reverse().find((s) => s.phase !== "rule")!;
    const rules = segments.filter((s) => s.phase === "rule");

    expect(rules).toHaveLength(2);
    expect(rules[0].atMs).toBe(lastBreath.atMs + lastBreath.durationMs);
    expect(rules.map((s) => s.marker)).toEqual(["rule_1", "rule_2"]);
    expect(rules.map((s) => s.text)).toEqual([
      "If a red sign appears",
      "then I wait",
    ]);
  });

  test("duration is the sum of every segment", () => {
    const config = breathing({
      cycles: 3,
      holdMs: 500,
      lines: [{ text: "rule", holdMs: 4000 }],
    });
    expect(breathingDurationMs(config)).toBe(3 * (4500 + 500 + 4500) + 4000);
  });

  test("a plan with nothing in it has zero duration", () => {
    expect(breathingDurationMs(breathing({ cycles: 0 }))).toBe(0);
  });
});

describe("planImageSequence", () => {
  test("spaces onsets by duration plus the inter-stimulus interval", () => {
    const planned = planImageSequence(images(), mulberry32(1));

    expect(planned.map((p) => p.plannedOnsetMs)).toEqual([0, 500]);
    expect(planned.map((p) => p.index)).toEqual([0, 1]);
    expect(planned.map((p) => p.class)).toEqual(["standard", "deviant"]);
  });

  test("repeats the item list once per loop, indexing straight through", () => {
    const planned = planImageSequence(images({ loops: 3 }), mulberry32(1));

    expect(planned).toHaveLength(6);
    expect(planned.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(planned.map((p) => p.plannedOnsetMs)).toEqual([
      0, 500, 1000, 1500, 2000, 2500,
    ]);
  });

  test("is deterministic for a seed and varies across seeds when shuffling", () => {
    const config = images({ loops: 4, shuffle: true });
    const ids = (seed: number) =>
      planImageSequence(config, mulberry32(seed)).map((p) => p.id);

    expect(ids(7)).toEqual(ids(7));
    // Same multiset either way - shuffling reorders, it never invents or drops items.
    expect([...ids(7)].sort()).toEqual([...ids(8)].sort());
  });

  test("jitter stays inside its bounds and leaves the first onset exact", () => {
    const planned = planImageSequence(
      images({ loops: 6, jitterMs: [-50, 50] }),
      mulberry32(3)
    );

    expect(planned[0].plannedOnsetMs).toBe(0);
    for (let i = 1; i < planned.length; i++) {
      const gap = planned[i].plannedOnsetMs - planned[i - 1].plannedOnsetMs;
      expect(gap).toBeGreaterThanOrEqual(500 - 50);
      expect(gap).toBeLessThanOrEqual(500 + 50);
    }
  });

  test("onsets never go backwards", () => {
    const planned = planImageSequence(
      images({ loops: 5, jitterMs: [-100, 100], shuffle: true }),
      mulberry32(11)
    );
    for (let i = 1; i < planned.length; i++) {
      expect(planned[i].plannedOnsetMs).toBeGreaterThan(
        planned[i - 1].plannedOnsetMs
      );
    }
  });

  test("duration runs to the end of the last image, not to its onset", () => {
    const planned = planImageSequence(images(), mulberry32(1));
    expect(imageSequenceDurationMs(planned)).toBe(500 + 200);
    expect(imageSequenceDurationMs([])).toBe(0);
  });

  test("an item with no class carries none rather than an empty one", () => {
    const config = imageSequenceConfigSchema.parse({
      items: [{ id: "plain", src: "/a.png", durationMs: 100 }],
      isiMs: 0,
    });
    expect(planImageSequence(config, mulberry32(1))[0]).not.toHaveProperty(
      "class"
    );
  });
});

describe("sourcesToPreload", () => {
  test("returns each source once, however many items share it", () => {
    const config = imageSequenceConfigSchema.parse({
      items: [
        { id: "a", src: "/same.png", durationMs: 100 },
        { id: "b", src: "/same.png", durationMs: 100 },
        { id: "c", src: "/other.png", durationMs: 100 },
      ],
      isiMs: 0,
    });
    expect(sourcesToPreload(config)).toEqual(["/same.png", "/other.png"]);
  });
});
