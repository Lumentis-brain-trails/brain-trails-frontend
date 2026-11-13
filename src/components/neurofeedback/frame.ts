/**
 * What a neurofeedback picture is told at every update (V4-0009, V4-0010), whatever it
 * draws: the engines' level (ramped, `ramp_s`) and the luminance they allow (rate
 * limited, H4). An animation eases toward these between updates and never changes its
 * light faster than `brightness` does.
 */

import type { Phase } from "@/lib/neurofeedback/engine";
import { NEUTRAL_LEVEL } from "@/lib/neurofeedback/picture";

export interface FeedbackFrame {
  /** The ramped level, in [0, 1]: 1 in target, 0 out of it. */
  level: number;
  /** The CSS brightness the luminance limit allows (`picture.ts`). */
  brightness: number;
  /** The `clarity` effect's blur, in CSS px. */
  blurPx: number;
  inTarget: boolean | null;
  phase: Phase;
}

export function restingFrame(brightness: number): FeedbackFrame {
  return {
    level: NEUTRAL_LEVEL,
    brightness,
    blurPx: 0,
    inTarget: null,
    phase: "baseline",
  };
}

/**
 * Move `from` toward `to` with time constant `tauS` over `dtS`: the frame-to-frame
 * easing every animation uses, so a once-a-second update glides instead of stepping.
 */
export function ease(from: number, to: number, dtS: number, tauS: number) {
  return from + (to - from) * (1 - Math.exp(-dtS / tauS));
}
