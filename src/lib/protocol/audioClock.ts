/**
 * The Web Audio clock, mapped onto the host clock the runner stamps markers with.
 *
 * An audio onset scheduled with `source.start(when)` happens at `when` on the audio
 * context's own clock, sample-accurately. `getOutputTimestamp()` pairs a context time
 * with the `performance.now()` at which that sample leaves the output, so the onset's
 * host time is a linear map rather than a guess at when a callback ran. That is why the
 * audio kinds say `timing_source: "webaudio"`, and why their uncertainty is one render
 * quantum rather than a frame.
 */

import { FRAME_MS } from "./marker";

/** The subset of `AudioContext` this module reads; a test can pass a plain object. */
export interface AudioClock {
  currentTime: number;
  sampleRate: number;
  baseLatency?: number;
  outputLatency?: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

/** Web Audio renders in quanta of 128 frames. */
const RENDER_QUANTUM = 128;

/**
 * Host time (`performance.now()` origin, ms) at which `contextTime` reaches the output,
 * and how uncertain that is.
 *
 * Without a usable output timestamp (older engines return zeros before the first render)
 * it falls back to "now plus the remaining context time plus the reported latency",
 * whose uncertainty is a frame: the latency figures are estimates.
 */
export function audioTimeToHost(
  clock: AudioClock,
  contextTime: number,
  nowMs: number
): { hostMs: number; uncertaintyMs: number } {
  const stamp = clock.getOutputTimestamp?.();
  if (
    stamp &&
    typeof stamp.contextTime === "number" &&
    typeof stamp.performanceTime === "number" &&
    stamp.performanceTime > 0
  ) {
    return {
      hostMs: stamp.performanceTime + (contextTime - stamp.contextTime) * 1000,
      uncertaintyMs: (RENDER_QUANTUM / clock.sampleRate) * 1000,
    };
  }
  const latencyS = clock.outputLatency || clock.baseLatency || 0;
  return {
    hostMs: nowMs + (contextTime - clock.currentTime + latencyS) * 1000,
    uncertaintyMs: FRAME_MS,
  };
}

/** The `AudioContext` constructor, or null where Web Audio is missing (SSR, jsdom). */
export function audioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}
