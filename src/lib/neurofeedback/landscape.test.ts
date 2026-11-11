import { expect, test } from "vitest";
import { neurofeedbackConfigSchema } from "@/lib/protocol/blocks";
import type { EegPacket } from "./engine";
import {
  LandscapeEngine,
  type LandscapeOutput,
  type LandscapePoint,
  MIN_THRESHOLD,
  closeness,
} from "./landscape";

const TARGETS = { points: [[0, 0]], radius: 1, epoch: 3, preset: "focus" };

function config(extra: Record<string, unknown> = {}) {
  return neurofeedbackConfigSchema.parse({
    signal: "landscape_region",
    feedback: "plane",
    targets: TARGETS,
    baseline_s: 10,
    duration_s: 30,
    ...extra,
  });
}

function at(i: number, x: number, y = 0, extra: Partial<LandscapePoint> = {}) {
  return {
    i,
    x,
    y,
    hostMs: 1000 * i,
    lagMs: 0,
    ownMap: true,
    epoch: null,
    ...extra,
  };
}

function updates(out: LandscapeOutput[]) {
  return out.flatMap((o) => (o.type === "update" ? [o.update] : []));
}

test("closeness is one on a point, a half at the radius, and the nearest point counts", () => {
  const two = {
    points: [
      [0, 0],
      [10, 0],
    ],
    radius: 2,
  };
  expect(closeness(0, 0, two).closeness).toBe(1);
  expect(closeness(2, 0, two).closeness).toBeCloseTo(0.5);
  expect(closeness(9, 0, two).distance).toBeCloseTo(1);
  expect(closeness(5, 0, two).closeness).toBeLessThan(0.02);
});

test("the schema wants targets for a landscape signal, and no video for an animation", () => {
  expect(config().feedback).toBe("plane");
  expect(() =>
    neurofeedbackConfigSchema.parse({
      signal: "landscape_region",
      feedback: "plane",
    })
  ).toThrow();
  expect(() =>
    neurofeedbackConfigSchema.parse({
      signal: "alpha",
      feedback: "plane",
      targets: TARGETS,
    })
  ).toThrow();
  // the video stays the default, and still needs its media
  expect(() => neurofeedbackConfigSchema.parse({ signal: "alpha" })).toThrow();
  expect(
    neurofeedbackConfigSchema.parse({ signal: "alpha", feedback: "ribbons" })
      .feedback
  ).toBe("ribbons");
});

test("the baseline sets the threshold from the person's own closeness, then the training rewards coming closer", () => {
  const engine = new LandscapeEngine(config());
  const out: LandscapeOutput[] = [];
  // the baseline wanders at distance 1 to 2 from the target
  for (let i = 0; i < 10; i++) out.push(...engine.push(at(i, 1 + (i % 2))));
  const threshold = out.find((o) => o.type === "threshold");
  expect(threshold).toMatchObject({ type: "threshold", cause: "baseline" });
  expect(out.some((o) => o.type === "baseline_end")).toBe(true);
  expect(
    updates(out).every((u) => u.phase === "baseline" && u.inTarget === null)
  ).toBe(true);

  // then the person moves onto the target, and the picture rises
  const training: LandscapeOutput[] = [];
  for (let i = 10; i < 20; i++) training.push(...engine.push(at(i, 0)));
  const ups = updates(training);
  expect(ups.at(-1)!.inTarget).toBe(true);
  expect(ups.at(-1)!.level).toBeGreaterThan(ups[0].level);
  expect(ups.at(-1)!.distance).toBeCloseTo(0);
});

test("the position is the mean of the last four windows, as the live dot is", () => {
  const engine = new LandscapeEngine(
    config({ baseline_s: 0, threshold: { mode: "fixed", value: 0.5 } })
  );
  const xs = [4, 0, 0, 0];
  const ups = xs.flatMap((x, i) => updates(engine.push(at(i, x))));
  expect(ups[1].x).toBeCloseTo(2);
  expect(ups[3].x).toBeCloseTo(1);
  // on the radius the closeness is the threshold itself: on the edge, not yet in
  expect(ups[3].smoothed).toBeCloseTo(0.5);
  expect(ups[3].inTarget).toBe(false);
});

test("a fixed threshold is announced first, and the training ends after its duration", () => {
  const engine = new LandscapeEngine(
    config({ baseline_s: 0, threshold: { mode: "fixed", value: 0.5 } })
  );
  const first = engine.push(at(0, 0));
  expect(first[0]).toMatchObject({
    type: "threshold",
    cause: "fixed",
    threshold: 0.5,
  });
  const all = [...first];
  for (let i = 1; i < 40 && !engine.done; i++)
    all.push(...engine.push(at(i, 0)));
  expect(updates(all)).toHaveLength(30);
  expect(all.at(-1)).toEqual({ type: "done", reason: "duration" });
  expect(engine.push(at(99, 0))).toEqual([]);
});

test("a window made of noisy EEG, or one on a map of its own, holds the picture", () => {
  const engine = new LandscapeEngine(
    config({ baseline_s: 0, threshold: { mode: "fixed", value: 0.5 } })
  );
  // a second of huge swings on every electrode, arriving before the window at t = 2 s
  for (let p = 0; p < 22; p++)
    for (const channel of ["TP9", "AF7", "AF8", "TP10"] as const) {
      const packet: EegPacket = {
        channel,
        sampleIndex: p * 12,
        samples: Array.from({ length: 12 }, (_, k) =>
          (p * 12 + k) % 2 ? 400 : -400
        ),
        hostMs: 1000 + p * 47,
      };
      engine.pushEeg(packet);
    }
  const [first] = updates(engine.push(at(1, 3)));
  const [noisy] = updates(engine.push(at(2, 0)));
  expect(noisy.gated).toBe("amplitude");
  expect(noisy.value).toBeNull();
  expect(noisy.level).toBe(first.level);
  const [alone] = updates(
    engine.push(at(3, 0, 0, { hostMs: 9000, ownMap: false }))
  );
  expect(alone.gated).toBe("no_map");
  const [redrawn] = updates(
    engine.push(at(4, 0, 0, { hostMs: 9500, epoch: 4 }))
  );
  expect(redrawn.gated).toBe("no_map");
  const [same] = updates(engine.push(at(5, 0, 0, { hostMs: 9900, epoch: 3 })));
  expect(same.gated).toBeNull();
});

test("a baseline that never saw the person's map fails, once extended", () => {
  const engine = new LandscapeEngine(config({ baseline_s: 10 }));
  const out: LandscapeOutput[] = [];
  for (let i = 0; i < 30 && !engine.done; i++)
    out.push(...engine.push(at(i, 0, 0, { ownMap: false })));
  expect(out.some((o) => o.type === "baseline_extended")).toBe(true);
  expect(out.at(-1)).toEqual({ type: "done", reason: "baseline_failed" });
});

test("a baseline far from every target still leaves a threshold worth reaching", () => {
  const engine = new LandscapeEngine(config());
  const out: LandscapeOutput[] = [];
  for (let i = 0; i < 10; i++) out.push(...engine.push(at(i, 20)));
  const threshold = out.find((o) => o.type === "threshold");
  expect(threshold).toMatchObject({ threshold: MIN_THRESHOLD });
  expect(engine.nudge(2)!.threshold).toBeCloseTo(MIN_THRESHOLD * 1.05 ** 2);
});

test("a tree is known to need the live service when any of its blocks trains on the map", async () => {
  const { hasLandscapeBlock } = await import("./landscape");
  const block = (signal: string) => ({
    type: "block",
    kind: "neurofeedback",
    config: { signal },
  });
  expect(hasLandscapeBlock({ root: { children: [block("alpha")] } })).toBe(
    false
  );
  expect(
    hasLandscapeBlock({
      root: { children: [{ children: [block("landscape_region")] }] },
    })
  ).toBe(true);
  expect(hasLandscapeBlock(null)).toBe(false);
});
