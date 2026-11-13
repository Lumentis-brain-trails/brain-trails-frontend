import { describe, expect, test } from "vitest";
import { bandPower, fft, hann, powerSpectrum } from "./spectrum";

describe("fft", () => {
  test("matches a direct DFT", () => {
    const n = 64;
    const x = Array.from(
      { length: n },
      (_, i) => Math.sin(i * 0.7) + (i % 5) * 0.3
    );
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    for (let k = 0; k < n; k++) {
      let r = 0;
      let j = 0;
      for (let t = 0; t < n; t++) {
        r += x[t] * Math.cos((-2 * Math.PI * k * t) / n);
        j += x[t] * Math.sin((-2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(r, 9);
      expect(im[k]).toBeCloseTo(j, 9);
    }
  });

  test("refuses a length that is not a power of two", () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
  });
});

describe("power", () => {
  test("the symmetric Hann window is numpy's", () => {
    const w = hann(5);
    expect(Array.from(w)).toEqual(
      [0, 0.5, 1, 0.5, 0].map((v) => expect.closeTo(v, 12))
    );
  });

  test("a 10 Hz sine puts its power at 10 Hz, and the mean is removed", () => {
    const x = Array.from(
      { length: 256 },
      (_, i) => 500 + Math.sin((2 * Math.PI * 10 * i) / 256)
    );
    const { power, binHz } = powerSpectrum(x, 256);
    expect(binHz).toBe(1);
    const alpha = bandPower(power, binHz, [8, 13]);
    expect(alpha / bandPower(power, binHz, [0, 129])).toBeGreaterThan(0.99);
    expect(power[0]).toBeLessThan(1e-6 * power[10]);
  });
});
