import { describe, expect, test } from "vitest";
import { audioContextCtor, audioTimeToHost } from "./audioClock";
import { FRAME_MS } from "./marker";

describe("audioTimeToHost", () => {
  test("maps through the output timestamp, uncertain by one render quantum", () => {
    const clock = {
      currentTime: 10,
      sampleRate: 48000,
      getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 5000 }),
    };
    const { hostMs, uncertaintyMs } = audioTimeToHost(clock, 10.1, 4990);
    expect(hostMs).toBeCloseTo(5100);
    expect(uncertaintyMs).toBeCloseTo((128 / 48000) * 1000);
  });

  test("falls back to now + remaining time + latency before the first render", () => {
    const clock = {
      currentTime: 2,
      sampleRate: 44100,
      outputLatency: 0.02,
      getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }),
    };
    const { hostMs, uncertaintyMs } = audioTimeToHost(clock, 2.1, 1000);
    expect(hostMs).toBeCloseTo(1120);
    expect(uncertaintyMs).toBe(FRAME_MS);
    expect(
      audioTimeToHost(
        { currentTime: 0, sampleRate: 1, baseLatency: 0.01 },
        0,
        0
      ).hostMs
    ).toBeCloseTo(10);
  });

  test("jsdom has no Web Audio", () => {
    expect(audioContextCtor()).toBeNull();
  });
});
