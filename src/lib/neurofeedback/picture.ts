/**
 * What the neurofeedback picture looks like from one update to the next (V4-0009).
 *
 * Two stages, in this order:
 *
 * 1. the **level** ramps toward 1 while the person is in target and toward 0 while not,
 *    a full swing taking `rampS` - the feedback's own pace, chosen by the author;
 * 2. the picture's **relative luminance** (brightness^2.2 of the unmodulated frame)
 *    follows the level at no more than `MAX_LUMINANCE_RATE` per second, whatever the
 *    level does. This is the photosensitivity control (hazard H4): WCAG 2.3.1 counts a
 *    flash as a pair of opposing changes of at least 10% of the luminance, and at 0.3/s
 *    a pair takes at least 2/3 s - at most 1.5 flashes a second, half the limit of 3,
 *    even when the target flips on every update.
 *
 * A held step (a gated window) changes neither.
 */

/**
 * The fastest the picture's relative luminance may change, per second.
 *
 * WCAG 2.3.1 counts a flash as a pair of opposing luminance changes of at least 10%; at
 * 0.3/s one such change takes at least 1/3 s and a pair 2/3 s.
 */
export const MAX_LUMINANCE_RATE = 0.3;

/** Display gamma: relative luminance ~ brightness^2.2 for sRGB content. */
export const GAMMA = 2.2;

/** The neutral level the baseline holds the picture at. */
export const NEUTRAL_LEVEL = 0.5;

/** The largest blur, in CSS pixels, of the `clarity` effect fully out of target. */
export const MAX_BLUR_PX = 6;

export class Picture {
  private levelNow = NEUTRAL_LEVEL;
  private luminance: number;

  constructor(
    private readonly minLevel: number,
    private readonly rampS: number,
    private readonly effect: "brightness" | "clarity"
  ) {
    this.luminance = this.brightnessOf(NEUTRAL_LEVEL) ** GAMMA;
  }

  /** The ramped level, in [0, 1]. */
  get level(): number {
    return this.levelNow;
  }

  /** CSS `brightness()` after the luminance limit. */
  get brightness(): number {
    return this.luminance ** (1 / GAMMA);
  }

  /** CSS blur in px; 0 unless the effect is `clarity`. */
  get blurPx(): number {
    if (this.effect !== "clarity") return 0;
    const t = (this.brightness - this.minLevel) / (1 - this.minLevel);
    return Math.max(0, Math.min(1, 1 - t)) * MAX_BLUR_PX;
  }

  /**
   * Advance by `dtS` seconds toward `goal`: 1 in target, 0 out of it, `"neutral"` during
   * the baseline, `null` to hold (a gated window).
   */
  step(goal: 0 | 1 | "neutral" | null, dtS: number): void {
    if (goal === null) return;
    if (goal === "neutral") this.levelNow = NEUTRAL_LEVEL;
    else {
      const stepMax = dtS / this.rampS;
      this.levelNow += clamp(goal - this.levelNow, stepMax);
    }
    const target = this.brightnessOf(this.levelNow) ** GAMMA;
    this.luminance += clamp(target - this.luminance, MAX_LUMINANCE_RATE * dtS);
  }

  private brightnessOf(level: number): number {
    return this.minLevel + (1 - this.minLevel) * level;
  }
}

function clamp(delta: number, max: number): number {
  return Math.max(-max, Math.min(max, delta));
}

/**
 * Flashes in the busiest one-second stretch of a luminance series sampled every `dtS`:
 * a flash is a pair of opposing changes of at least `minChange` each (WCAG 2.3.1's
 * general flash, 10% by default), each change counted in one flash only. For tests.
 */
export function maxFlashesPerSecond(
  luminance: readonly number[],
  dtS: number,
  minChange = 0.1
): number {
  // turning points of the series, then the changes between them big enough to count
  const changes: { at: number; sign: number }[] = [];
  let anchor = 0;
  let direction = 0;
  for (let i = 1; i < luminance.length; i++) {
    const d = Math.sign(luminance[i] - luminance[i - 1]);
    if (d === 0) continue;
    if (direction !== 0 && d !== direction) {
      if (Math.abs(luminance[i - 1] - luminance[anchor]) >= minChange)
        changes.push({ at: (i - 1) * dtS, sign: direction });
      anchor = i - 1;
    }
    direction = d;
  }
  if (
    Math.abs(luminance[luminance.length - 1] - luminance[anchor]) >= minChange
  )
    changes.push({ at: (luminance.length - 1) * dtS, sign: direction });
  // a flash is two opposing changes; a change belongs to one flash only
  const flashes: number[] = [];
  for (let i = 1; i < changes.length; i++)
    if (changes[i].sign !== changes[i - 1].sign) {
      flashes.push(changes[i].at);
      i++;
    }
  let best = 0;
  for (let i = 0, j = 0; i < flashes.length; i++) {
    while (flashes[i] - flashes[j] >= 1) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}
