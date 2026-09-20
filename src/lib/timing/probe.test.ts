import { describe, expect, test } from "vitest";
import { TimingProbe, probeOverlayEnabled } from "./probe";

/** Feed `n` frames at a steady 60 Hz starting at `t0`; returns the last timestamp. */
function steady(probe: TimingProbe, n: number, t0 = 0): number {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t += 1000 / 60;
    probe.frame(t);
  }
  return t;
}

describe("TimingProbe", () => {
  test("a steady 60 Hz stream drops nothing", () => {
    const probe = new TimingProbe();
    steady(probe, 120);
    const s = probe.snapshot();
    expect(s.frames).toBe(120);
    expect(s.droppedFrames).toBe(0);
    expect(s.frameIntervalMs).toBeCloseTo(16.67, 1);
  });

  test("a 50 ms gap at 60 Hz counts two dropped frames", () => {
    const probe = new TimingProbe();
    const t = steady(probe, 30);
    probe.frame(t + 50);
    expect(probe.snapshot().droppedFrames).toBe(2);
  });

  test("gaps before the rate is known are not counted", () => {
    const probe = new TimingProbe();
    probe.frame(0);
    probe.frame(100);
    expect(probe.snapshot().droppedFrames).toBe(0);
  });

  test("onset errors report p95 and max of their magnitude", () => {
    const probe = new TimingProbe();
    for (let i = 1; i <= 100; i++) probe.onset(i % 2 ? i : -i);
    const s = probe.snapshot();
    expect(s.onsets).toBe(100);
    expect(s.onsetErrorP95Ms).toBe(95);
    expect(s.maxOnsetErrorMs).toBe(100);
  });

  test("an empty probe reports zeros", () => {
    expect(new TimingProbe().snapshot()).toEqual({
      frames: 0,
      droppedFrames: 0,
      frameIntervalMs: 0,
      onsets: 0,
      onsetErrorP95Ms: 0,
      maxOnsetErrorMs: 0,
    });
  });
});

describe("probeOverlayEnabled", () => {
  test("only outside prod and only when asked", () => {
    expect(probeOverlayEnabled("dev", "?probe=1")).toBe(true);
    expect(probeOverlayEnabled("dev", "")).toBe(false);
    expect(probeOverlayEnabled("prod", "?probe=1")).toBe(false);
  });
});
