import { BAND_NAMES, type BandName } from "./bands";

export interface Sample {
  t: number; // seconds since session start
  bands: Record<BandName, number>; // normalized 0..1 power
  dominant: BandName;
  phase: string;
}

export interface Phase {
  label: string;
  duration: number; // seconds
  target: Partial<Record<BandName, number>>; // where band power drifts toward
}

// A simple guided-exercise script: baseline, then a relaxation exercise,
// then a focus exercise, then cool-down. This stands in for real Muse
// session structure until live device data is wired in.
export const DEFAULT_SCRIPT: Phase[] = [
  {
    label: "Baseline",
    duration: 20,
    target: { delta: 0.4, theta: 0.4, alpha: 0.4, beta: 0.35, gamma: 0.2 },
  },
  {
    label: "Relaxation exercise",
    duration: 35,
    target: { delta: 0.55, theta: 0.75, alpha: 0.8, beta: 0.2, gamma: 0.1 },
  },
  {
    label: "Focus exercise",
    duration: 35,
    target: { delta: 0.25, theta: 0.3, alpha: 0.35, beta: 0.85, gamma: 0.7 },
  },
  {
    label: "Cool-down",
    duration: 20,
    target: { delta: 0.5, theta: 0.5, alpha: 0.55, beta: 0.3, gamma: 0.15 },
  },
];

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a mock EEG session by drifting each band's power toward the
 * current script phase's target with noisy, smoothed motion (an
 * Ornstein-Uhlenbeck-style random walk), so bands read as organic rather
 * than linear ramps.
 */
export function generateSession(
  script: Phase[] = DEFAULT_SCRIPT,
  sampleRateHz = 2,
  seed = 1337
): Sample[] {
  const rand = mulberry32(seed);
  const samples: Sample[] = [];
  const dt = 1 / sampleRateHz;

  const current: Record<BandName, number> = {
    delta: 0.4,
    theta: 0.4,
    alpha: 0.4,
    beta: 0.4,
    gamma: 0.3,
  };

  let t = 0;
  for (const phase of script) {
    const steps = Math.round(phase.duration * sampleRateHz);
    for (let s = 0; s < steps; s++) {
      // ease target influence in/out across the phase so transitions feel
      // like a guided exercise rather than a hard switch
      const progress = s / steps;
      const ease = Math.sin(progress * Math.PI * 0.5);

      for (const name of BAND_NAMES) {
        const target = phase.target[name] ?? current[name];
        const pull = (target - current[name]) * 0.06 * (0.5 + ease);
        const jitter = (rand() - 0.5) * 0.035;
        current[name] = clamp01(current[name] + pull + jitter);
      }

      const dominant = BAND_NAMES.reduce((best, n) =>
        current[n] > current[best] ? n : best
      );

      samples.push({
        t,
        bands: { ...current },
        dominant,
        phase: phase.label,
      });

      t += dt;
    }
  }

  return samples;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
