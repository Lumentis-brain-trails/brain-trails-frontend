/**
 * Run-timing probe: how well the browser is keeping the stimulus on time.
 *
 * Two numbers matter for the V3 performance budgets (plan V3, "Performance budgets"):
 * frames the page failed to paint on time, and how far stimulus onsets landed from
 * where they were planned (`onset_error_ms`, which the runner's markers already carry).
 * The probe collects both while a run is going, for a developer overlay and for the run
 * health summary a session reports at finish (sprint S16). It never reads a clock on
 * behalf of a marker: it only observes.
 */
import { devToolsAllowed } from "@/lib/env";

/** A frame this many times the expected interval counts as dropped. */
const DROPPED_FACTOR = 1.5;
/** Onset errors kept for percentiles; old ones fall off. */
const MAX_ONSETS = 500;

export interface TimingSnapshot {
  frames: number;
  droppedFrames: number;
  /** Median frame interval in ms; 0 until there are frames. */
  frameIntervalMs: number;
  onsets: number;
  /** 95th percentile of |onset error| in ms; 0 until there are onsets. */
  onsetErrorP95Ms: number;
  maxOnsetErrorMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, index)];
}

/** Pure accumulator, fed frame timestamps and onset errors; tested without a browser. */
export class TimingProbe {
  private lastFrame: number | null = null;
  private intervals: number[] = [];
  private frames = 0;
  private dropped = 0;
  private onsets: number[] = [];

  /** Record a painted frame at `timestampMs` (a rAF timestamp). */
  frame(timestampMs: number): void {
    if (this.lastFrame !== null) {
      const interval = timestampMs - this.lastFrame;
      const expected = this.expectedInterval();
      if (expected > 0 && interval > expected * DROPPED_FACTOR) {
        this.dropped += Math.max(1, Math.round(interval / expected) - 1);
      }
      this.intervals.push(interval);
      if (this.intervals.length > 120) this.intervals.shift();
    }
    this.lastFrame = timestampMs;
    this.frames += 1;
  }

  /** Record one stimulus onset's error against its plan, in ms (sign ignored). */
  onset(errorMs: number): void {
    this.onsets.push(Math.abs(errorMs));
    if (this.onsets.length > MAX_ONSETS) this.onsets.shift();
  }

  snapshot(): TimingSnapshot {
    const sortedOnsets = [...this.onsets].sort((a, b) => a - b);
    return {
      frames: this.frames,
      droppedFrames: this.dropped,
      frameIntervalMs: this.expectedInterval(),
      onsets: this.onsets.length,
      onsetErrorP95Ms: percentile(sortedOnsets, 95),
      maxOnsetErrorMs: sortedOnsets.at(-1) ?? 0,
    };
  }

  /** The display's frame interval, estimated as the median of recent intervals. */
  private expectedInterval(): number {
    if (this.intervals.length < 10) return 0;
    return percentile(
      [...this.intervals].sort((a, b) => a - b),
      50
    );
  }
}

/** The probe of the current page, shared by the runner and the overlay. */
export const pageProbe = new TimingProbe();

/**
 * Whether the developer overlay is on: never in production, and only when the URL asks
 * for it with `?probe=1`, so a participant never sees it by accident.
 */
export function probeOverlayEnabled(
  appEnv: string | undefined,
  search: string
): boolean {
  return (
    devToolsAllowed(appEnv) && new URLSearchParams(search).get("probe") === "1"
  );
}
