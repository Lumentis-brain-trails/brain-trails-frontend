import { describe, expect, test } from "vitest";
import { PacketTimeline } from "./timeline";

const MS_PER_PACKET = (12 / 256) * 1000; // 46.875

describe("PacketTimeline", () => {
  test("counts lost packets from the holes in the sample indices", () => {
    const t = new PacketTimeline();
    t.push(120, 0, 12);
    t.push(132, 47, 12);
    t.push(168, 188, 12); // the two packets in between never arrived
    const s = t.stats();
    expect(s.packets).toBe(3);
    expect(s.lostPackets).toBe(2);
    expect(s.lastSampleIndex).toBe(168);
  });

  test("counts in the packet size it is given, whatever the band sends", () => {
    const t = new PacketTimeline();
    t.push(0, 0, 4);
    t.push(4, 15.6, 4);
    t.push(16, 62.5, 4); // two four-sample packets lost, as on an Athena
    expect(t.stats().lostPackets).toBe(2);
  });

  test("tolerates an index rounded off its nominal step", () => {
    const t = new PacketTimeline();
    t.push(0, 0, 4);
    t.push(5, 15.6, 4); // a clock-derived index may land a sample out
    expect(t.stats().lostPackets).toBe(0);
  });

  test("fits rate, drift and jitter from arrival times", () => {
    const t = new PacketTimeline();
    // Device runs 100 ppm fast; arrivals jitter by +-2 ms in a pattern that is
    // orthogonal to a linear trend, so it must not bias the slope.
    const msPerPacket = MS_PER_PACKET * (1 - 100e-6);
    const pattern = [2, -2, -2, 2];
    for (let i = 0; i < 200; i++) {
      const jitter = pattern[i % 4];
      t.push(i * 12, i * msPerPacket + jitter, 12);
    }
    const s = t.stats();
    expect(s.effectiveRateHz).toBeCloseTo(256 * (1 + 100e-6), 2);
    expect(s.driftPpm).toBeCloseTo(-100, 0);
    expect(s.jitterRmsMs).toBeCloseTo(2, 1);
  });

  test("reports nulls before two anchors", () => {
    const t = new PacketTimeline();
    t.push(12, 0, 12);
    expect(t.stats().msPerSample).toBeNull();
  });
});
