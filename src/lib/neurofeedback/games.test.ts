/**
 * The neurofeedback games (V4-0013): what carries between rounds, the hands' staircase,
 * stillness, Lantern's rules, and Lantern's light against the photosensitivity limit.
 */

import { describe, expect, test } from "vitest";
import { neurofeedbackConfigSchema } from "@/lib/protocol/blocks";
import {
  Lantern,
  type LanternEvent,
  forkInterval,
  forkWindow,
  lightFraction,
  lightLuminance,
} from "./lantern";
import {
  GAMMA,
  MAX_LUMINANCE_RATE,
  Picture,
  maxFlashesPerSecond,
} from "./picture";
import {
  LEVEL_DOWN_ACCURACY,
  LEVEL_UP_ACCURACY,
  MIN_CHOICES,
  levelKey,
  memoryCarry,
  nextLevel,
  rememberThreshold,
  startLevel,
  thresholdKey,
} from "./rounds";
import { MIN_LIMIT_DPS, Stillness, gyroMagnitudes } from "./stillness";

const DT = 1 / 60;

function lantern(extra: Record<string, unknown> = {}) {
  return neurofeedbackConfigSchema.parse({
    feedback: "lantern",
    threshold: { mode: "carry", target_fraction: 0.5 },
    ...extra,
  });
}

const STILL = { brightness: 0.7, minLevel: 0.4, moving: false } as const;

/** Play `seconds` of frames; returns every event. */
function play(
  game: Lantern,
  seconds: number,
  input: Partial<Parameters<Lantern["step"]>[1]> = {},
  answer?: (fork: {
    side: "left" | "right";
    age: number;
  }) => "left" | "right" | null
): LanternEvent[] {
  const out: LanternEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    out.push(...game.step(DT, { ...STILL, phase: "training", ...input }));
    const open = game.open;
    if (answer && open) {
      const side = answer({ side: open.side, age: game.now - open.shownAt });
      if (side) out.push(game.press(side));
    }
  }
  return out;
}

describe("what a round hands the next", () => {
  test("a threshold carries under its signal, and a landscape's under its targets", () => {
    const alpha = lantern();
    const map = lantern({
      signal: "landscape_region",
      targets: { points: [[0, 0]], radius: 1, epoch: 3 },
    });
    const elsewhere = lantern({
      signal: "landscape_region",
      targets: { points: [[2, 0]], radius: 1, epoch: 3 },
    });
    expect(thresholdKey(alpha)).toBe("threshold:alpha");
    expect(thresholdKey(map)).not.toBe(thresholdKey(elsewhere));

    const carry = memoryCarry();
    rememberThreshold(carry, alpha, 0.31);
    rememberThreshold(carry, map, null); // never set: nothing to carry
    rememberThreshold(carry, elsewhere, 0);
    expect(carry.get(thresholdKey(alpha))).toBe(0.31);
    expect(carry.get(thresholdKey(map))).toBeUndefined();
    expect(carry.get(thresholdKey(elsewhere))).toBeUndefined();
    rememberThreshold(undefined, alpha, 0.5); // outside a runner: no memory, no error
  });

  test("the level starts from the run's, then the author's, then 1, within 1-10", () => {
    const carry = memoryCarry();
    expect(startLevel(lantern(), carry)).toBe(1);
    expect(startLevel(lantern({ game: { start_level: 4 } }), carry)).toBe(4);
    carry.set(levelKey("lantern"), 7);
    expect(startLevel(lantern({ game: { start_level: 4 } }), carry)).toBe(7);
    carry.set(levelKey("lantern"), 99);
    expect(startLevel(lantern(), carry)).toBe(10);
  });

  test("the staircase reads the hands only: 85% up, under 65% down, few choices stay", () => {
    expect(LEVEL_UP_ACCURACY).toBe(0.85);
    expect(LEVEL_DOWN_ACCURACY).toBe(0.65);
    expect(nextLevel(3, 17, 20)).toBe(4);
    expect(nextLevel(3, 16, 20)).toBe(3);
    expect(nextLevel(3, 13, 20)).toBe(3);
    expect(nextLevel(3, 12, 20)).toBe(2);
    expect(nextLevel(10, 20, 20)).toBe(10);
    expect(nextLevel(1, 0, 20)).toBe(1);
    expect(nextLevel(3, 0, MIN_CHOICES - 1)).toBe(3);
  });
});

describe("stillness", () => {
  const samples = (dps: number, from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ dps, hostMs: from + i * 20 }));

  test("the limit is twice the baseline's p95, never under the floor", () => {
    const calm = new Stillness();
    for (const s of samples(4, 0, 200)) calm.push(s, true);
    expect(calm.settled).toBe(false);
    expect(calm.settle()).toBe(MIN_LIMIT_DPS);

    const fidgety = new Stillness();
    for (const s of samples(12, 0, 200)) fidgety.push(s, true);
    expect(fidgety.settle()).toBeCloseTo(24, 5);
    // a short baseline is the floor
    const short = new Stillness();
    for (const s of samples(30, 0, 5)) short.push(s, true);
    expect(short.settle()).toBe(MIN_LIMIT_DPS);
  });

  test("a nod is moving after a moment, and still again a moment after it stops", () => {
    const head = new Stillness(MIN_LIMIT_DPS);
    expect(head.settled).toBe(true);
    for (const s of samples(2, 0, 100)) head.push(s, false);
    expect(head.moving).toBe(false);
    for (const s of samples(60, 2000, 100)) head.push(s, false); // two seconds of nodding
    expect(head.moving).toBe(true);
    for (const s of samples(2, 4000, 200)) head.push(s, false); // four seconds still
    expect(head.moving).toBe(false);
  });

  test("a carried limit keeps the floor; a bad reading is ignored", () => {
    expect(new Stillness(3).limit).toBe(MIN_LIMIT_DPS);
    const head = new Stillness(20);
    head.push({ dps: Number.NaN, hostMs: 0 }, false);
    expect(head.dps).toBeNull();
    expect(gyroMagnitudes([3, 4, 0, 0, 0, 1, 9])).toEqual([5, 1]);
  });
});

describe("Lantern", () => {
  test("the pace follows the level: a fork every 6 s with 3 s to choose, down to 2.5 and 1.8", () => {
    expect(forkInterval(1)).toBeCloseTo(6);
    expect(forkWindow(1)).toBeCloseTo(3);
    expect(forkInterval(10)).toBeCloseTo(2.5);
    expect(forkWindow(10)).toBeCloseTo(1.8);
    expect(forkInterval(42)).toBeCloseTo(2.5);
  });

  test("the same seed gives the same forks", () => {
    const sides = (seed: number) =>
      play(new Lantern(5, seed), 60)
        .filter((e) => e.event === "prompt")
        .map((e) => e.side);
    expect(sides(7)).toEqual(sides(7));
    expect(sides(7)).not.toEqual(sides(8));
    expect(new Set(sides(7))).toEqual(new Set(["left", "right"]));
  });

  test("a player who answers right after half a second scores every scored fork", () => {
    const game = new Lantern(1, 3);
    const events = play(game, 60, {}, (f) => (f.age >= 0.5 ? f.side : null));
    const responses = events.filter((e) => e.event === "response");
    expect(responses.length).toBe(game.tally.prompts);
    expect(responses.every((e) => e.event === "response" && e.correct)).toBe(
      true
    );
    expect(game.tally).toMatchObject({ wrong: 0, missed: 0, stray: 0 });
    for (const e of responses)
      if (e.event === "response") expect(e.rtMs).toBeGreaterThanOrEqual(500);
  });

  test("an unanswered fork is missed when the walker reaches it; a press with none open strays", () => {
    const game = new Lantern(1, 3);
    const events = play(game, 12.5);
    expect(events.map((e) => e.event)).toEqual(["prompt", "miss", "prompt"]);
    expect(game.tally.missed).toBe(1);
    expect(game.press("left")).toEqual({
      event: "response",
      fork: 2,
      side: "left",
      correct: expect.any(Boolean),
      rtMs: expect.any(Number),
      scored: true,
    });
    expect(game.press("left")).toEqual({ event: "stray", side: "left" });
    expect(game.tally.stray).toBe(1);
  });

  test("forks in the baseline are played but not scored", () => {
    const game = new Lantern(1, 3);
    const events = play(game, 30, { phase: "baseline" }, (f) => f.side);
    expect(events.some((e) => e.event === "prompt")).toBe(true);
    expect(events.every((e) => !("scored" in e) || e.scored === false)).toBe(
      true
    );
    expect(game.tally).toMatchObject({ prompts: 0, correct: 0 });
  });

  test("a moving head holds the next fork back and sways the lantern", () => {
    const still = play(new Lantern(1, 3), 30).filter(
      (e) => e.event === "prompt"
    );
    const moving = new Lantern(1, 3);
    const held = play(moving, 30, { moving: true }).filter(
      (e) => e.event === "prompt"
    );
    expect(held.length).toBe(0);
    expect(still.length).toBeGreaterThan(3);
    expect(Math.abs(moving.sway)).toBeGreaterThan(0);
  });

  test("with reduced motion the walker stays put", () => {
    const game = new Lantern(1, 3, true);
    play(game, 10);
    expect(game.walked).toBe(0);
  });

  test("the light's reach reads the brightness alone", () => {
    expect(lightFraction(0.4, 0.4)).toBe(0);
    expect(lightFraction(1, 0.4)).toBe(1);
    expect(lightFraction(0.7, 0.4)).toBeCloseTo(0.5);
    expect(lightFraction(0.9, 1)).toBe(1);
  });
});

describe("Lantern's light and the photosensitivity limit (H4, WCAG 2.3.1)", () => {
  /**
   * The worst case: the trained signal in and out of target ten times a second at the
   * fastest ramp, the head nodding on and off, a scripted player at every fork. The
   * frame's mean luminance and each cell of a 4 x 4 grid over a 16:9 stage must stay
   * under three flashes a second and change no faster than the picture's own limit.
   */
  const HALF_W = 16 / 9 / 2;
  const HALF_H = 0.5;

  function cellMeans(game: Lantern, brightness: number): number[] {
    const cells: number[] = [];
    for (let cy = 0; cy < 4; cy++)
      for (let cx = 0; cx < 4; cx++) {
        let sum = 0;
        for (let j = 0; j < 8; j++)
          for (let i = 0; i < 8; i++) {
            const x = -HALF_W + ((cx + (i + 0.5) / 8) / 4) * 2 * HALF_W;
            const y = -HALF_H + ((cy + (j + 0.5) / 8) / 4) * 2 * HALF_H;
            sum += lightLuminance(x, y, brightness, game.light, game.sway);
          }
        cells.push(sum / 64);
      }
    return cells;
  }

  test("flips ten times a second never flash anywhere", () => {
    const step = 24 / 256;
    const picture = new Picture(0.4, 1, "brightness");
    const game = new Lantern(10, 1);
    const frame: number[] = [];
    const cells: number[][] = Array.from({ length: 16 }, () => []);
    for (let i = 0; i < 640; i++) {
      picture.step(i % 2 === 0 ? 1 : 0, step);
      const moving = Math.floor((i * step) / 0.5) % 2 === 0;
      game.step(step, {
        brightness: picture.brightness,
        minLevel: 0.4,
        phase: "training",
        moving,
      });
      const open = game.open;
      if (open && game.now - open.shownAt > 0.4) game.press(open.side);
      const means = cellMeans(game, picture.brightness);
      means.forEach((m, c) => cells[c].push(m));
      frame.push(means.reduce((a, b) => a + b, 0) / 16);
    }
    expect(maxFlashesPerSecond(frame, step)).toBeLessThan(3);
    for (const cell of cells) {
      expect(maxFlashesPerSecond(cell, step)).toBeLessThan(3);
      // the strongest change anywhere stays within the picture's luminance rate
      for (let i = 1; i < cell.length; i++)
        expect(Math.abs(cell[i] - cell[i - 1]) / step).toBeLessThanOrEqual(
          MAX_LUMINANCE_RATE + 1e-9
        );
    }
    // and the light did move: a test that measured darkness would prove nothing
    const all = cells.flat();
    expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(0.01);
    expect(picture.brightness ** GAMMA).toBeGreaterThan(0);
  });
});
