import { describe, expect, it } from "vitest";
import { EEG_CHANNELS } from "./muse/protocol";
import {
  DEFAULT_SIGMA,
  NOISE_BY_LEVEL,
  RIBBON_POSITIONS,
  buildStrands,
  centreOffset,
  kernelWeights,
  noiseAt,
  noiseFromQuality,
  spreadFraction,
  strandOffset,
} from "./signalRibbon";

const quality = (...levels: (keyof typeof NOISE_BY_LEVEL)[]) =>
  Object.fromEntries(
    EEG_CHANNELS.map((c, i) => [c, { level: levels[i] }])
  ) as Record<
    (typeof EEG_CHANNELS)[number],
    { level: keyof typeof NOISE_BY_LEVEL }
  >;

describe("kernelWeights", () => {
  it("is a partition of unity everywhere, at any blend radius", () => {
    for (const sigma of [0.06, DEFAULT_SIGMA, 0.45]) {
      for (let i = 0; i <= 40; i++) {
        const total = kernelWeights(i / 40, sigma).reduce((a, b) => a + b, 0);
        expect(total).toBeCloseTo(1, 10);
      }
    }
  });

  it("gives an electrode the largest share at its own position", () => {
    EEG_CHANNELS.forEach((channel, i) => {
      const w = kernelWeights(RIBBON_POSITIONS[channel]);
      expect(Math.max(...w)).toBe(w[i]);
    });
  });

  it("places the electrodes on the centres of four equal columns", () => {
    // The lamp grid relies on this: four equal columns line up with the band.
    expect(EEG_CHANNELS.map((c) => RIBBON_POSITIONS[c])).toEqual([
      0.125, 0.375, 0.625, 0.875,
    ]);
  });
});

describe("noiseAt", () => {
  it("never leaves the range spanned by the electrodes", () => {
    const noise = [0.06, 0.95, 0.06, 0.45];
    for (let i = 0; i <= 60; i++) {
      const n = noiseAt(i / 60, noise);
      expect(n).toBeGreaterThanOrEqual(Math.min(...noise) - 1e-12);
      expect(n).toBeLessThanOrEqual(Math.max(...noise) + 1e-12);
    }
  });

  it("stays continuous: no jump between two neighbouring samples", () => {
    const noise = [0.06, 0.95, 0.06, 0.95];
    let previous = noiseAt(0, noise);
    for (let i = 1; i <= 400; i++) {
      const n = noiseAt(i / 400, noise);
      expect(Math.abs(n - previous)).toBeLessThan(0.05);
      previous = n;
    }
  });

  it("peaks over the bad electrode and settles over the good ones", () => {
    const noise = noiseFromQuality(quality("good", "good", "flat", "good"));
    expect(noiseAt(RIBBON_POSITIONS.AF8, noise)).toBeGreaterThan(
      noiseAt(RIBBON_POSITIONS.TP9, noise)
    );
    expect(noiseAt(RIBBON_POSITIONS.TP9, noise)).toBeLessThan(0.3);
  });

  it("lets a lone bad electrode reach the hot end under its own lamp", () => {
    // Without this the band tops out mid-ramp and can never point at a sensor.
    const noise = noiseFromQuality(quality("good", "good", "flat", "good"));
    expect(noiseAt(RIBBON_POSITIONS.AF8, noise)).toBeGreaterThan(0.8);
  });

  it("a wider kernel spreads one bad electrode over the whole band", () => {
    const noise = noiseFromQuality(quality("good", "good", "good", "flat"));
    const far = RIBBON_POSITIONS.TP9;
    expect(noiseAt(far, noise, 0.45)).toBeGreaterThan(
      noiseAt(far, noise, 0.08)
    );
  });
});

describe("buildStrands", () => {
  it("is deterministic", () => {
    expect(buildStrands(8)).toEqual(buildStrands(8));
  });

  it("keeps the first strands identical when the count grows", () => {
    // The bundle must not reshuffle when the caller asks for more strands.
    expect(buildStrands(20).slice(0, 8)).toEqual(buildStrands(8));
  });

  it("gives every strand its own wavelength, drift and phase", () => {
    const strands = buildStrands(16);
    for (const key of ["k", "w", "phase", "swing"] as const) {
      expect(new Set(strands.map((s) => s[key])).size).toBe(strands.length);
    }
    expect(new Set(strands.map((s) => s.sign)).size).toBe(2);
  });
});

describe("strandOffset", () => {
  const strand = buildStrands(4)[2];

  it("stays inside the bundle", () => {
    for (let i = 0; i <= 50; i++) {
      const value = strandOffset(strand, i / 50, 1, i * 0.37);
      expect(Math.abs(value)).toBeLessThanOrEqual(1.4);
    }
  });

  it("is the interference term that a dirty contact adds, not a displacement", () => {
    // Same strand, same instant: only the disturbance differs.
    const clean = strandOffset(strand, 0.4, 0, 3);
    const dirty = strandOffset(strand, 0.4, 0.95, 3);
    expect(dirty).not.toBeCloseTo(clean, 2);
    // With interference off, a dirty contact barely moves the strand: what is
    // left is only the tremor, which is small.
    const muted = strandOffset(strand, 0.4, 0.95, 3, 0);
    expect(Math.abs(muted - clean)).toBeLessThan(0.45);
  });

  it("opens the bundle with the disturbance, but only a little", () => {
    expect(spreadFraction(1) / spreadFraction(0)).toBeLessThan(2);
    expect(spreadFraction(1)).toBeGreaterThan(spreadFraction(0));
  });
});

describe("centreOffset", () => {
  it("keeps the shared centre line inside the band", () => {
    for (let i = 0; i <= 100; i++) {
      expect(Math.abs(centreOffset(i / 100, i * 0.23))).toBeLessThan(0.09);
    }
  });
});

describe("noiseFromQuality", () => {
  it("orders the levels from a clean contact to no contact at all", () => {
    const [good, , , flat] = noiseFromQuality(
      quality("good", "noisy", "saturated", "flat")
    );
    expect(good).toBeLessThan(0.1);
    expect(flat).toBeGreaterThan(0.9);
    expect(NOISE_BY_LEVEL.good).toBeLessThan(NOISE_BY_LEVEL.noisy);
    expect(NOISE_BY_LEVEL.noisy).toBeLessThan(NOISE_BY_LEVEL.saturated);
    expect(NOISE_BY_LEVEL.saturated).toBeLessThan(NOISE_BY_LEVEL.flat);
  });
});
