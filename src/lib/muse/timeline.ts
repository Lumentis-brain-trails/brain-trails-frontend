/**
 * Device-clock timeline for a Muse stream (decision V1-0001).
 *
 * The headset's packet counter is the clock: every packet carries twelve
 * samples at a nominal 256 Hz, so a sample's position on the device timeline is
 * `counter * 12 + i`, independent of Bluetooth arrival jitter. This module
 * unwraps the 16-bit counter, counts lost packets, and fits a line from sample
 * index to host time (`performance.now()`), LSL-style, so later work can put
 * page-generated stimuli on the same axis and report jitter and drift.
 */
import { SAMPLES_PER_PACKET, SAMPLE_RATE_HZ } from "./protocol";

const COUNTER_MODULO = 0x10000;

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
 * Tracks one electrode's packet stream; the four channels share counters in
 * lockstep, so the caller feeds only the first channel's packets here.
 */
export class PacketTimeline {
  private unwrapped: number | null = null;
  private lastRaw: number | null = null;
  private packets = 0;
  private lostPackets = 0;
  private anchors: Anchor[] = [];

  /** Keep this many recent anchors for the fit (~30 s at 21 packets/s). */
  constructor(private readonly windowSize = 640) {}

  /**
   * Register a packet. Returns the unwrapped index of its first sample so the
   * caller can place the samples on the device timeline.
   */
  push(rawCounter: number, hostMs: number): number {
    if (this.unwrapped === null || this.lastRaw === null) {
      this.unwrapped = rawCounter;
    } else {
      let delta = rawCounter - this.lastRaw;
      if (delta < -COUNTER_MODULO / 2) delta += COUNTER_MODULO; // wrapped
      if (delta <= 0) delta = 1; // duplicate or out-of-order: never go backwards
      this.lostPackets += delta - 1;
      this.unwrapped += delta;
    }
    this.lastRaw = rawCounter;
    this.packets += 1;
    const sampleIndex = this.unwrapped * SAMPLES_PER_PACKET;
    this.anchors.push({ sampleIndex, hostMs });
    if (this.anchors.length > this.windowSize) this.anchors.shift();
    return sampleIndex;
  }

  /** Least-squares fit of host time against sample index over the window. */
  stats(): TimelineStats {
    const n = this.anchors.length;
    const base: TimelineStats = {
      packets: this.packets,
      lostPackets: this.lostPackets,
      lastSampleIndex: (this.unwrapped ?? 0) * SAMPLES_PER_PACKET,
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
