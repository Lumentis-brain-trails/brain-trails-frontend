/**
 * Session capture: collects packets while recording and serialises the
 * canonical Brain Trails session file (decision V1-0001).
 *
 * The file is CSV with a metadata comment line, then
 * `sample_index,t_session_s,TP9,AF7,AF8,TP10`. `sample_index` is the device
 * clock (unwrapped counter * 12 + i); the backend parser
 * (`pipeline/sources/braintrails.py`) relies on it alone. A lost packet is an
 * index jump; a packet lost on one electrode only is an empty cell.
 */
import {
  EEG_CHANNELS,
  SAMPLE_RATE_HZ,
  SAMPLES_PER_PACKET,
  type EegChannel,
} from "./protocol";
import type { TimelineStats } from "./timeline";

const COUNTER_MODULO = 0x10000;
/** Entries older than this many packets are flushed even if a channel is missing. */
const STALE_PACKETS = 64;

interface Block {
  sampleIndex: number;
  channels: Partial<Record<EegChannel, Float32Array>>;
}

/** What `stop()` hands back: enough to build the file and the report. */
export interface SessionCapture {
  startedAt: Date;
  endedAt: Date;
  /** Complete or partial 12-sample blocks, sorted by device clock. */
  blocks: Block[];
  firstSampleIndex: number;
  lastSampleIndex: number;
  /** Samples the device produced but the browser never received. */
  missingSamples: number;
  durationS: number;
}

/**
 * Accumulates packets from all four electrodes, matching them by counter.
 * Owns its own counter unwrapping so a channel arriving before or after the
 * others still lands on the same sample index.
 */
export class SessionRecorder {
  private startedAt = new Date();
  private pending = new Map<number, Block>();
  private done: Block[] = [];
  private lastRaw: number | null = null;
  private unwrapped = 0;

  feed(channel: EegChannel, rawCounter: number, samples: Float32Array): void {
    const index = this.unwrap(rawCounter) * SAMPLES_PER_PACKET;
    let block = this.pending.get(index);
    if (!block) {
      block = { sampleIndex: index, channels: {} };
      this.pending.set(index, block);
    }
    block.channels[channel] = samples;
    if (EEG_CHANNELS.every((c) => block!.channels[c])) {
      this.pending.delete(index);
      this.done.push(block);
    }
    this.flushStale(index);
  }

  /** Close the capture: flush everything, sort, and measure. */
  stop(): SessionCapture {
    for (const block of this.pending.values()) this.done.push(block);
    this.pending.clear();
    this.done.sort((a, b) => a.sampleIndex - b.sampleIndex);
    const endedAt = new Date();
    if (this.done.length === 0) {
      return {
        startedAt: this.startedAt,
        endedAt,
        blocks: [],
        firstSampleIndex: 0,
        lastSampleIndex: 0,
        missingSamples: 0,
        durationS: 0,
      };
    }
    const first = this.done[0].sampleIndex;
    const last =
      this.done[this.done.length - 1].sampleIndex + SAMPLES_PER_PACKET - 1;
    const expected = last - first + 1;
    return {
      startedAt: this.startedAt,
      endedAt,
      blocks: this.done,
      firstSampleIndex: first,
      lastSampleIndex: last,
      missingSamples: expected - this.done.length * SAMPLES_PER_PACKET,
      durationS: expected / SAMPLE_RATE_HZ,
    };
  }

  /** Seconds captured so far, on the device clock. */
  get seconds(): number {
    if (this.done.length === 0 && this.pending.size === 0) return 0;
    let min = Infinity;
    let max = -Infinity;
    for (const b of [...this.done, ...this.pending.values()]) {
      if (b.sampleIndex < min) min = b.sampleIndex;
      if (b.sampleIndex > max) max = b.sampleIndex;
    }
    return (max - min + SAMPLES_PER_PACKET) / SAMPLE_RATE_HZ;
  }

  /** Signed wrap-aware unwrap; small negative deltas mean a late channel packet. */
  private unwrap(raw: number): number {
    if (this.lastRaw === null) {
      this.lastRaw = raw;
      this.unwrapped = raw;
      return raw;
    }
    let delta = raw - this.lastRaw;
    if (delta > COUNTER_MODULO / 2) delta -= COUNTER_MODULO;
    if (delta < -COUNTER_MODULO / 2) delta += COUNTER_MODULO;
    const value = this.unwrapped + delta;
    if (delta > 0) {
      this.lastRaw = raw;
      this.unwrapped = value;
    }
    return value;
  }

  private flushStale(latestIndex: number): void {
    for (const [index, block] of this.pending) {
      if (latestIndex - index > STALE_PACKETS * SAMPLES_PER_PACKET) {
        this.pending.delete(index);
        this.done.push(block);
      }
    }
  }
}

/** Header fields written on the first line of the file. */
export interface SessionMeta {
  deviceName: string;
  timeline: TimelineStats | null;
}

/** Serialise a capture into the canonical CSV text. */
export function buildSessionCsv(
  capture: SessionCapture,
  meta: SessionMeta
): string {
  const t = meta.timeline;
  const fmt = (v: number | null | undefined, digits: number) =>
    v === null || v === undefined || Number.isNaN(v) ? "na" : v.toFixed(digits);
  const header = [
    "# brain-trails-session v1",
    `sfreq=${SAMPLE_RATE_HZ}`,
    `device=${meta.deviceName.replace(/\s+/g, "_")}`,
    `started_at=${capture.startedAt.toISOString()}`,
    `ended_at=${capture.endedAt.toISOString()}`,
    `missing_samples=${capture.missingSamples}`,
    `lost_packets=${t?.lostPackets ?? "na"}`,
    `jitter_rms_ms=${fmt(t?.jitterRmsMs, 2)}`,
    `drift_ppm=${fmt(t?.driftPpm, 1)}`,
    `effective_rate_hz=${fmt(t?.effectiveRateHz, 3)}`,
  ].join(" ");
  const lines: string[] = [
    header,
    `sample_index,t_session_s,${EEG_CHANNELS.join(",")}`,
  ];
  for (const block of capture.blocks) {
    for (let i = 0; i < SAMPLES_PER_PACKET; i++) {
      const index = block.sampleIndex + i;
      const tSession = (
        (index - capture.firstSampleIndex) /
        SAMPLE_RATE_HZ
      ).toFixed(6);
      const values = EEG_CHANNELS.map((c) => {
        const row = block.channels[c];
        return row ? row[i].toFixed(2) : "";
      });
      lines.push(`${index},${tSession},${values.join(",")}`);
    }
  }
  return lines.join("\n") + "\n";
}
