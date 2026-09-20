import { describe, expect, test } from "vitest";
import { assessChannel, MIN_SAMPLES } from "./quality";

const sine = (amplitude: number, n = 512) =>
  Float32Array.from(
    { length: n },
    (_, i) => amplitude * Math.sin((2 * Math.PI * 10 * i) / 256)
  );

describe("assessChannel", () => {
  test("unknown until one second of data", () => {
    expect(assessChannel(sine(20, MIN_SAMPLES - 1)).level).toBe("unknown");
  });
  test("flat when the trace does not move", () => {
    expect(assessChannel(new Float32Array(512).fill(0)).level).toBe("flat");
  });
  test("saturated when many samples sit at the rail", () => {
    const s = sine(20);
    for (let i = 0; i < 60; i++) s[i] = 1000;
    expect(assessChannel(s).level).toBe("saturated");
  });
  test("noisy on a very large spread", () => {
    expect(assessChannel(sine(400)).level).toBe("noisy");
  });
  test("good on a plausible EEG amplitude, with the std reported", () => {
    const q = assessChannel(sine(20));
    expect(q.level).toBe("good");
    expect(q.stdUv).toBeCloseTo(20 / Math.SQRT2, 0);
  });
});
