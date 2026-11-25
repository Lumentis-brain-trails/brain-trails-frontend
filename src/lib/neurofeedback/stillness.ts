/**
 * Stillness for the neurofeedback games (V4-0013): is the person's head moving?
 *
 * The Muse's gyroscope reports the head's angular speed three times a packet (~52 Hz).
 * Its magnitude, in degrees per second, is smoothed with a one-second time constant on
 * the packets' arrival clock; above a limit the person is **moving**. The limit is the
 * person's own: twice the 95th percentile of the smoothed speed over the block's
 * baseline, and never below `MIN_LIMIT_DPS`, so a person who sat very still in the
 * baseline is not called moving for a breath. A block that carries its threshold has no
 * baseline: it takes the limit the run's previous block set, or the floor.
 *
 * A game shows moving as motion (the lantern sways, the walker slows) and pauses the
 * hands' score; the trained signal never reads it: its gate, threshold and reward are
 * the engine's, unchanged (V4-0013, "Stillness").
 */

import { quantile } from "./engine";

/** The limit's floor, in °/s: a slow nod is about 20-30. */
export const MIN_LIMIT_DPS = 15;

/** The limit is this many times the baseline's 95th percentile. */
export const LIMIT_FACTOR = 2;

/** The smoothing's time constant, in seconds. */
export const STILLNESS_TAU_S = 1;

/** Fewer baseline readings than this and the limit is the floor. */
const MIN_BASELINE_READINGS = 20;

/** One gyroscope reading as the run hands it on: its magnitude and arrival. */
export interface MotionSample {
  /** Angular speed magnitude, degrees per second. */
  dps: number;
  /** `performance.now()` when the packet holding it arrived. */
  hostMs: number;
}

export class Stillness {
  private smoothedDps: number | null = null;
  private lastMs: number | null = null;
  private readonly baseline: number[] = [];
  private limitDps: number | null;

  /** `limit` is a carried limit (the run's previous block's), or null to learn one. */
  constructor(limit: number | null = null) {
    this.limitDps =
      limit !== null && Number.isFinite(limit)
        ? Math.max(MIN_LIMIT_DPS, limit)
        : null;
  }

  /** The smoothed speed, °/s; null before the first reading. */
  get dps(): number | null {
    return this.smoothedDps;
  }

  /** The limit in force: learnt, carried, or the floor while still learning. */
  get limit(): number {
    return this.limitDps ?? MIN_LIMIT_DPS;
  }

  /** Whether the limit is settled (learnt from a baseline, or carried). */
  get settled(): boolean {
    return this.limitDps !== null;
  }

  /** Moving: the smoothed speed over the limit. */
  get moving(): boolean {
    return this.smoothedDps !== null && this.smoothedDps > this.limit;
  }

  /** One reading; `learning` while the block's baseline runs. */
  push(sample: MotionSample, learning: boolean): void {
    if (!Number.isFinite(sample.dps)) return;
    const dt =
      this.lastMs === null
        ? 0
        : Math.max(0, sample.hostMs - this.lastMs) / 1000;
    this.lastMs = sample.hostMs;
    const a = 1 - Math.exp(-dt / STILLNESS_TAU_S);
    this.smoothedDps =
      this.smoothedDps === null
        ? sample.dps
        : this.smoothedDps + a * (sample.dps - this.smoothedDps);
    if (learning && this.limitDps === null)
      this.baseline.push(this.smoothedDps);
  }

  /**
   * Close the baseline: the limit from what it saw, the floor when it saw too little.
   * A limit already settled stays.
   */
  settle(): number {
    if (this.limitDps === null)
      this.limitDps =
        this.baseline.length >= MIN_BASELINE_READINGS
          ? Math.max(
              MIN_LIMIT_DPS,
              LIMIT_FACTOR * quantile(this.baseline, 0.95)
            )
          : MIN_LIMIT_DPS;
    return this.limitDps;
  }
}

/** The magnitude of each of a gyroscope packet's readings (x, y, z three times over). */
export function gyroMagnitudes(samples: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < samples.length; i += 3)
    out.push(Math.hypot(samples[i], samples[i + 1], samples[i + 2]));
  return out;
}
