import { describe, expect, test } from "vitest";
import { isSpring, neurofeedbackConfigSchema } from "@/lib/protocol/blocks";
import type { EegPacket } from "./engine";
import {
  LandscapeEngine,
  type LandscapeOutput,
  type LandscapePoint,
  MIN_THRESHOLD,
  ON_TARGET_SHARE,
  STILL_SHARE,
  closeness,
  directionCos,
  rewardAt,
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

test("a burst of windows moves the picture by the clock, not by the windows (H4)", () => {
  const fixed = {
    baseline_s: 0,
    ramp_s: 10,
    threshold: { mode: "fixed", value: 0.5 },
  };
  // one window a second: ten seconds of training on the target
  const spaced = new LandscapeEngine(config(fixed));
  let spacedLevel = 0;
  for (let i = 0; i < 10; i++)
    spacedLevel = updates(spaced.push(at(i, 0))).at(-1)!.level;
  // the same ten windows arriving together after the first (a reconnect's backlog)
  const burst = new LandscapeEngine(config(fixed));
  const first = updates(burst.push(at(0, 0, 0, { arrivalMs: 0 })))[0].level;
  let burstLevel = first;
  for (let i = 1; i < 10; i++)
    burstLevel = updates(
      burst.push(at(i, 0, 0, { hostMs: 1000 * i, arrivalMs: 1000 }))
    ).at(-1)!.level;
  const oneStep = new LandscapeEngine(config(fixed));
  oneStep.push(at(0, 0, 0, { arrivalMs: 0 }));
  const afterOneSecond = updates(
    oneStep.push(at(1, 0, 0, { arrivalMs: 1000 }))
  ).at(-1)!.level;
  expect(burstLevel).toBeCloseTo(afterOneSecond);
  expect(burstLevel).toBeLessThan(spacedLevel);
});

describe("the direction reward", () => {
  const one = { points: [[0, 0]], radius: 1, spring: undefined };
  const p = (x: number, y: number) => ({ x, y });

  test("heading straight for the target is 1, straight away 0, sideways a half", () => {
    const towards = rewardAt("direction", p(4, 0), p(3, 0), one);
    expect(towards.cos).toBeCloseTo(1);
    expect(towards.value).toBeCloseTo(1);
    const away = rewardAt("direction", p(3, 0), p(4, 0), one);
    expect(away.cos).toBeCloseTo(-1);
    expect(away.value).toBeCloseTo(0);
    const sideways = rewardAt("direction", p(3, 0), p(3, 1), one);
    expect(sideways.cos).toBeCloseTo(0);
    expect(sideways.value).toBeCloseTo(0.5);
    // the closeness is recorded alongside, whichever the reward
    expect(towards.closeness).toBeCloseTo(2 ** -9);
    expect(towards.distance).toBeCloseTo(3);
  });

  test("standing still has no direction: the closeness stands in", () => {
    const step = (STILL_SHARE / 2) * one.radius;
    const still = rewardAt("direction", p(1, 0), p(1 + step, 0), one);
    expect(still.cos).toBeNull();
    expect(still.value).toBeCloseTo(closeness(1 + step, 0, one).closeness);
    // nor has the first position, with nothing before it
    const first = rewardAt("direction", null, p(1, 0), one);
    expect(first.cos).toBeNull();
    expect(first.value).toBeCloseTo(0.5);
  });

  test("on the target the direction is 1, whatever the step", () => {
    const on = (ON_TARGET_SHARE / 2) * one.radius;
    const there = rewardAt("direction", p(-1, 0), p(on, 0), one);
    expect(there.value).toBe(1);
    expect(there.cos).toBeNull();
  });

  test("the pull is towards the target nearest to where the step starts", () => {
    const two = {
      points: [
        [0, 0],
        [10, 0],
      ],
      radius: 1,
      spring: undefined,
    };
    // from 8, the nearest is 10: heading to 9 is towards it
    expect(directionCos(p(8, 0), p(9, 0), two)).toBeCloseTo(1);
    expect(directionCos(p(2, 0), p(1, 0), two)).toBeCloseTo(1);
    // no step, or a start on the target itself: no cosine
    expect(directionCos(p(2, 0), p(2, 0), two)).toBeNull();
    expect(directionCos(p(0, 0), p(1, 0), two)).toBeNull();
  });

  test("a spring pulls harder along its stiff axis", () => {
    const loose = { points: [[0, 0]], radius: 1, spring: undefined };
    const stiffY = {
      points: [[0, 0]],
      radius: 1,
      spring: [
        [1, 0],
        [0, 4],
      ] as [[number, number], [number, number]],
    };
    // from (3, 3), moving straight down in y
    const down = [p(3, 3), p(3, 2)] as const;
    const isotropic = directionCos(...down, loose)!;
    const anisotropic = directionCos(...down, stiffY)!;
    expect(isotropic).toBeCloseTo(Math.SQRT1_2);
    expect(anisotropic).toBeCloseTo(12 / Math.hypot(3, 12));
    expect(anisotropic).toBeGreaterThan(isotropic);
    // and the diagonal, best with no spring, is no longer the best
    expect(directionCos(p(3, 3), p(2, 2), loose)).toBeCloseTo(1);
    const diagonal = directionCos(p(3, 3), p(2, 2), stiffY)!;
    expect(diagonal).toBeCloseTo(15 / (Math.hypot(3, 12) * Math.SQRT2));
    expect(diagonal).toBeLessThan(anisotropic);
  });

  test("the blend follows the direction far away and the closeness near", () => {
    // far: the closeness is ~0, so the blend is the direction
    const far = rewardAt("blend", p(6, 0), p(5, 0), one);
    expect(far.value).toBeCloseTo(1, 4);
    // at the radius, heading straight in: half the direction, half the closeness
    const edge = rewardAt("blend", p(2, 0), p(1, 0), one);
    expect(edge.closeness).toBeCloseTo(0.5);
    expect(edge.value).toBeCloseTo(0.5 * 1 + 0.5 * 0.5);
    // the closeness reward ignores the step
    expect(rewardAt("closeness", p(0, 5), p(1, 0), one)).toEqual({
      value: 0.5,
      closeness: 0.5,
      distance: 1,
      cos: null,
    });
  });
});

describe("the reward's settings", () => {
  test("a protocol without them keeps the closeness, and no spring", () => {
    const parsed = config();
    expect(parsed.targets?.reward).toBe("closeness");
    expect(parsed.targets?.spring).toBeUndefined();
    expect(
      config({ targets: { ...TARGETS, reward: "direction" } }).targets?.reward
    ).toBe("direction");
    expect(() =>
      config({ targets: { ...TARGETS, reward: "nearness" } })
    ).toThrow();
  });

  test("a spring must be symmetric positive definite", () => {
    const spring = (k: number[][]) =>
      config({ targets: { ...TARGETS, reward: "direction", spring: k } });
    expect(
      spring([
        [2, 0.5],
        [0.5, 1],
      ]).targets?.spring
    ).toEqual([
      [2, 0.5],
      [0.5, 1],
    ]);
    for (const bad of [
      [
        [1, 2],
        [2, 1],
      ], // indefinite: ac - b² < 0
      [
        [1, 0.5],
        [0.4, 1],
      ], // not symmetric
      [
        [-1, 0],
        [0, 1],
      ], // a <= 0
      [
        [0, 0],
        [0, 1],
      ], // only semi-definite
      [[1, 0]], // not 2 x 2
    ])
      expect(() => spring(bad), JSON.stringify(bad)).toThrow();
    expect(
      isSpring([
        [1, 0],
        [0, 1],
      ])
    ).toBe(true);
    expect(
      isSpring([
        [1, Number.NaN],
        [Number.NaN, 1],
      ])
    ).toBe(false);
  });
});

test("closeness updates are as before, and say so", () => {
  const engine = new LandscapeEngine(
    config({ baseline_s: 0, threshold: { mode: "fixed", value: 0.5 } })
  );
  const [first, second] = [at(0, 2), at(1, 1)].flatMap((w) =>
    updates(engine.push(w))
  );
  expect(first.reward).toBe("closeness");
  expect(first.smoothed).toBe(first.closeness);
  expect(second.smoothed).toBeCloseTo(closeness(1.5, 0, TARGETS).closeness);
  expect(second.cos).toBeNull();
});

test("the direction rewards approaching from far away, where the closeness gives nothing", () => {
  const train = (reward: string) => {
    const engine = new LandscapeEngine(
      config({
        targets: { ...TARGETS, reward },
        baseline_s: 0,
        threshold: { mode: "fixed", value: 0.6 },
      })
    );
    // from 20 radii away, one radius closer a second
    return Array.from({ length: 8 }, (_, i) => at(i, 20 - i)).flatMap((w) =>
      updates(engine.push(w))
    );
  };
  const near = train("closeness");
  expect(near.every((u) => u.inTarget === false)).toBe(true);
  const heading = train("direction");
  // the first position has no step before it: the closeness, ~0
  expect(heading[0].inTarget).toBe(false);
  expect(heading[0].cos).toBeNull();
  expect(heading.slice(1).every((u) => u.inTarget === true)).toBe(true);
  expect(heading.at(-1)).toMatchObject({ reward: "direction" });
  expect(heading.at(-1)!.cos).toBeCloseTo(1);
  expect(heading.at(-1)!.closeness).toBeLessThan(0.01);
  // turning back is no longer rewarded
  const blended = train("blend");
  expect(blended.at(-1)!.smoothed).toBeGreaterThan(0.99);
});

test("the direction's baseline sets its threshold from the direction values", () => {
  const engine = new LandscapeEngine(
    config({ targets: { ...TARGETS, reward: "direction" }, baseline_s: 10 })
  );
  const out: LandscapeOutput[] = [];
  // wandering back and forth, far away: directions of 0 and 1 by turns
  for (let i = 0; i < 10; i++)
    out.push(...engine.push(at(i, 10 + 4 * (i % 2))));
  const threshold = out.find((o) => o.type === "threshold");
  expect(threshold).toMatchObject({ cause: "baseline" });
  const values = updates(out).map((u) => u.smoothed!);
  expect(Math.max(...values)).toBeGreaterThan(0.5);
  expect(Math.min(...values)).toBeLessThan(0.5);
});
