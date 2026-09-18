import { describe, expect, test } from "vitest";
import { PacketTimeline } from "./timeline";

const MS_PER_PACKET = (12 / 256) * 1000; // 46.875

describe("PacketTimeline", () => {
  test("places samples on the counter axis and counts lost packets", () => {
    const t = new PacketTimeline();
    expect(t.push(10, 0)).toBe(120);
    expect(t.push(11, 47)).toBe(132);
    expect(t.push(14, 188)).toBe(168); // 12 and 13 lost
    const s = t.stats();
    expect(s.packets).toBe(3);
    expect(s.lostPackets).toBe(2);
    expect(s.lastSampleIndex).toBe(168);
  });

  test("unwraps the 16-bit counter", () => {
    const t = new PacketTimeline();
    t.push(65534, 0);
    t.push(65535, 47);
    expect(t.push(0, 94)).toBe(65536 * 12);
    expect(t.stats().lostPackets).toBe(0);
  });

  test("never moves backwards on a duplicate counter", () => {
    const t = new PacketTimeline();
    t.push(5, 0);
    expect(t.push(5, 47)).toBe(6 * 12);
  });

  test("fits rate, drift and jitter from arrival times", () => {
    const t = new PacketTimeline();
    // Device runs 100 ppm fast; arrivals jitter by +-2 ms in a pattern that is
    // orthogonal to a linear trend, so it must not bias the slope.
    const msPerPacket = MS_PER_PACKET * (1 - 100e-6);
    const pattern = [2, -2, -2, 2];
    for (let i = 0; i < 200; i++) {
      const jitter = pattern[i % 4];
      t.push(i, i * msPerPacket + jitter);
    }
    const s = t.stats();
    expect(s.effectiveRateHz).toBeCloseTo(256 * (1 + 100e-6), 2);
    expect(s.driftPpm).toBeCloseTo(-100, 0);
    expect(s.jitterRmsMs).toBeCloseTo(2, 1);
  });

  test("reports nulls before two anchors", () => {
    const t = new PacketTimeline();
    t.push(1, 0);
    expect(t.stats().msPerSample).toBeNull();
  });
});
