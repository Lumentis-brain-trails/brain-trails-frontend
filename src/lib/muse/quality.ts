/**
 * Per-electrode contact quality from the last two seconds of raw signal.
 *
 * Wearing the band correctly is most of signal quality on a dry-electrode
 * headset, so the page shows one light per electrode and gates recording on
 * "all good". Thresholds are deliberately simple and explainable: a flat
 * trace means no contact (the ADC sits at a rail or a constant), a saturated
 * trace means the electrode is railing, a very large spread means motion or
 * muscle noise, everything else is good.
 */

export type QualityLevel = "unknown" | "flat" | "saturated" | "noisy" | "good";

export interface ChannelQuality {
  level: QualityLevel;
  /** Standard deviation of the window in microvolts (null when unknown). */
  stdUv: number | null;
  /** Short human hint shown under the light. */
  hint: string;
}

/** Fewer samples than this (1 s at 256 Hz) and the light stays grey. */
export const MIN_SAMPLES = 256;
/** Absolute value beyond which a sample is considered at the ADC rail. */
export const RAIL_UV = 990;
export const FLAT_STD_UV = 1.5;
export const NOISY_STD_UV = 100;

/** Assess one electrode from its most recent samples (microvolts). */
export function assessChannel(samples: ArrayLike<number>): ChannelQuality {
  const n = samples.length;
  if (n < MIN_SAMPLES) {
    return { level: "unknown", stdUv: null, hint: "Waiting for signal" };
  }
  let sum = 0;
  let railed = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    sum += v;
    if (Math.abs(v) > RAIL_UV) railed += 1;
  }
  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = samples[i] - mean;
    ss += d * d;
  }
  const std = Math.sqrt(ss / n);
  if (railed / n > 0.05) {
    return {
      level: "saturated",
      stdUv: std,
      hint: "Saturated · lift and reseat",
    };
  }
  if (std < FLAT_STD_UV) {
    return { level: "flat", stdUv: std, hint: "No contact · press gently" };
  }
  if (std > NOISY_STD_UV) {
    return { level: "noisy", stdUv: std, hint: "Noisy · relax and hold still" };
  }
  return { level: "good", stdUv: std, hint: "Good" };
}
