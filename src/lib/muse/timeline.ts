/**
 * Device-clock timeline for a Muse stream (decision V1-0001).
 *
 * The headset's own clock is the clock: the driver stamps every packet with
 * the index of its first sample at a nominal 256 Hz, independent of Bluetooth
 * arrival jitter and of how the band happens to number its packets. This
 * module counts lost packets from the holes in those indices and fits a line
 * from sample index to host time (`performance.now()`), LSL-style, so later
 * work can put page-generated stimuli on the same axis and report jitter and
 * drift.
 */
import { SAMPLE_RATE_HZ } from "./protocol";

/** Arrival observation kept for the clock fit. */
interface Anchor {
  sampleIndex: number;
  hostMs: number;
}

/** Summary of the stream's timing so far. */
export interface TimelineStats {
  packets: number;
  lostPackets: number;
  /** Index of the first sample of the most recent packet. */
  lastSampleIndex: number;
  /** Host milliseconds per sample from the fit, or null before two anchors. */
  msPerSample: number | null;
  /** Fitted host time (ms) of sample index 0; with msPerSample maps host time to samples. */
  hostMsAtIndex0: number | null;
  /** Fitted rate in Hz (1000 / msPerSample). */
  effectiveRateHz: number | null;
  /** Deviation of the fitted rate from nominal, in parts per million. */
  driftPpm: number | null;
  /** RMS of arrival residuals around the fit, in ms (Bluetooth jitter). */
  jitterRmsMs: number | null;
}

/**
 * Tracks one electrode's packet stream; the four channels are stamped in
 * lockstep, so the caller feeds only the first channel's packets here.
 */
export class PacketTimeline {
  private lastSampleIndex: number | null = null;
  private packets = 0;
  private lostPackets = 0;
  private anchors: Anchor[] = [];

  /** Keep this many recent anchors for the fit (~30 s at 21 packets/s). */
  constructor(private readonly windowSize = 640) {}

  /**
   * Register a packet of `sampleCount` samples starting at `sampleIndex`.
   *
   * A gap wider than one packet means notifications went missing; how many is
   * read off the gap in packet-sized steps, which works for any band's packet
   * size and tolerates the rounding of a clock-derived index.
   */
  push(sampleIndex: number, hostMs: number, sampleCount: number): void {
    if (this.lastSampleIndex !== null) {
      const gap = sampleIndex - this.lastSampleIndex;
      if (gap > sampleCount)
        this.lostPackets += Math.max(Math.round(gap / sampleCount) - 1, 0);
    }
    this.lastSampleIndex = sampleIndex;
    this.packets += 1;
    this.anchors.push({ sampleIndex, hostMs });
    if (this.anchors.length > this.windowSize) this.anchors.shift();
  }

  /** Least-squares fit of host time against sample index over the window. */
  stats(): TimelineStats {
    const n = this.anchors.length;
    const base: TimelineStats = {
      packets: this.packets,
      lostPackets: this.lostPackets,
      lastSampleIndex: this.lastSampleIndex ?? 0,
      msPerSample: null,
      hostMsAtIndex0: null,
      effectiveRateHz: null,
      driftPpm: null,
      jitterRmsMs: null,
    };
    if (n < 2) return base;
    let sx = 0,
      sy = 0;
    for (const a of this.anchors) {
      sx += a.sampleIndex;
      sy += a.hostMs;
    }
    const mx = sx / n,
      my = sy / n;
    let sxx = 0,
      sxy = 0;
    for (const a of this.anchors) {
      const dx = a.sampleIndex - mx;
      sxx += dx * dx;
      sxy += dx * (a.hostMs - my);
    }
    if (sxx === 0) return base;
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    let ss = 0;
    for (const a of this.anchors) {
      const r = a.hostMs - (intercept + slope * a.sampleIndex);
      ss += r * r;
    }
    const nominalMs = 1000 / SAMPLE_RATE_HZ;
    return {
      ...base,
      msPerSample: slope,
      hostMsAtIndex0: intercept,
      effectiveRateHz: 1000 / slope,
      driftPpm: ((slope - nominalMs) / nominalMs) * 1e6,
      jitterRmsMs: Math.sqrt(ss / n),
    };
  }
}
