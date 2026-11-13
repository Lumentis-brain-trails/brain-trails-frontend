import { describe, expect, test } from "vitest";
import {
  GAMMA,
  MAX_BLUR_PX,
  MAX_LUMINANCE_RATE,
  NEUTRAL_LEVEL,
  Picture,
  maxFlashesPerSecond,
} from "./picture";

const DT = 24 / 256;

describe("Picture", () => {
  test("ramps toward the goal over rampS and holds when gated", () => {
    const picture = new Picture(0.4, 1, "brightness");
    expect(picture.level).toBe(NEUTRAL_LEVEL);
    expect(picture.brightness).toBeCloseTo(0.7, 12);
    picture.step(1, DT);
    expect(picture.level).toBeCloseTo(0.5 + DT, 12);
    const held = picture.brightness;
    picture.step(null, DT);
    expect(picture.brightness).toBe(held);
    for (let i = 0; i < 100; i++) picture.step(1, DT);
    expect(picture.level).toBe(1);
    expect(picture.brightness).toBeCloseTo(1, 12);
    picture.step("neutral", DT);
    expect(picture.level).toBe(NEUTRAL_LEVEL);
  });

  test("clarity blurs out of target and is sharp in target", () => {
    const picture = new Picture(0.4, 1, "clarity");
    for (let i = 0; i < 200; i++) picture.step(0, DT);
    expect(picture.blurPx).toBeCloseTo(MAX_BLUR_PX, 6);
    for (let i = 0; i < 200; i++) picture.step(1, DT);
    expect(picture.blurPx).toBeCloseTo(0, 6);
    expect(new Picture(0.4, 1, "brightness").blurPx).toBe(0);
  });

  test("a target flipping on every update never flashes in the 3-30 Hz band", () => {
    // the worst a signal can do: in, out, in, out... ten times a second, fastest ramp
    const picture = new Picture(0.2, 1, "brightness");
    const luminance: number[] = [];
    for (let i = 0; i < 600; i++) {
      picture.step(i % 2 === 0 ? 1 : 0, DT);
      luminance.push(picture.brightness ** GAMMA);
    }
    for (let i = 1; i < luminance.length; i++)
      expect(
        Math.abs(luminance[i] - luminance[i - 1]) / DT
      ).toBeLessThanOrEqual(MAX_LUMINANCE_RATE + 1e-9);
    expect(maxFlashesPerSecond(luminance, DT)).toBeLessThan(3);
  });

  test("a target that swings every second stays under three flashes too", () => {
    const picture = new Picture(0.2, 1, "brightness");
    const luminance: number[] = [];
    for (let i = 0; i < 600; i++) {
      picture.step(Math.floor((i * DT) / 0.4) % 2 === 0 ? 1 : 0, DT);
      luminance.push(picture.brightness ** GAMMA);
    }
    expect(maxFlashesPerSecond(luminance, DT)).toBeLessThanOrEqual(2);
  });
});

describe("maxFlashesPerSecond", () => {
  test("sees a 10 Hz square wave, which is what the limit prevents", () => {
    const square = Array.from({ length: 200 }, (_, i) =>
      Math.floor(i / 5) % 2 === 0 ? 0.1 : 1
    );
    expect(maxFlashesPerSecond(square, 0.01)).toBeGreaterThanOrEqual(9);
  });

  test("ignores changes smaller than 10% and a single slow swing", () => {
    const small = Array.from({ length: 200 }, (_, i) => 0.5 + (i % 2) * 0.05);
    expect(maxFlashesPerSecond(small, 0.01)).toBe(0);
    const swing = Array.from({ length: 300 }, (_, i) => i / 300);
    expect(maxFlashesPerSecond(swing, 0.01)).toBe(0);
  });
});
