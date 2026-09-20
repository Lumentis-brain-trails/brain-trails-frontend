/**
 * Session capture: collects packets while recording and serialises the
 * canonical Brain Trails session file (decision V1-0001).
 *
 * The file is CSV with a metadata comment line, then
 * `sample_index,t_session_s,TP9,AF7,AF8,TP10`. `sample_index` is the device
 * clock, placed there by the driver; the backend parser
 * (`pipeline/sources/braintrails.py`) relies on it alone. A lost packet is an
 * index jump; a packet lost on one electrode only is an empty cell.
 *
 * The file says nothing about which headband produced it beyond the `device`
 * and `device_model` header fields (the latter is what the backend parser
 * reads as the source's device): a packet's sample count differs between Muse
 * generations, a row does not.
 */
import type { MuseModel } from "./models";
import {
  EEG_CHANNELS,
  IMU_RATE_HZ,
  PPG_RATE_HZ,
  SAMPLE_RATE_HZ,
  SAMPLES_PER_PACKET,
  type EegChannel,
} from "./protocol";
import type { TimelineStats } from "./timeline";

/** Entries this far behind the newest sample are flushed even if a channel is missing. */
const STALE_SAMPLES = 64 * SAMPLES_PER_PACKET;

interface Block {
  sampleIndex: number;
  /** Samples per channel in this block, whatever the band sends per packet. */
  length: number;
  channels: Partial<Record<EegChannel, Float32Array>>;
}

/** What `stop()` hands back: enough to build the file and the report. */
export interface SessionCapture {
  startedAt: Date;
  endedAt: Date;
  /** Complete or partial packets, sorted by device clock. */
  blocks: Block[];
  firstSampleIndex: number;
  lastSampleIndex: number;
  /** Samples actually received, per electrode. */
  sampleCount: number;
  /** Samples the device produced but the browser never received. */
  missingSamples: number;
  durationS: number;
}

/**
 * Accumulates packets from all four electrodes, matching them by the sample
 * index the driver put on them, so a channel arriving before or after the
 * others still lands on the same block whichever band is streaming.
 */
export class SessionRecorder {
  private startedAt = new Date();
  private pending = new Map<number, Block>();
  private done: Block[] = [];

  feed(channel: EegChannel, index: number, samples: Float32Array): void {
    let block = this.pending.get(index);
    if (!block) {
      block = { sampleIndex: index, length: samples.length, channels: {} };
      this.pending.set(index, block);
    }
    block.length = Math.max(block.length, samples.length);
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
        sampleCount: 0,
        missingSamples: 0,
        durationS: 0,
      };
    }
    const tail = this.done[this.done.length - 1];
    const first = this.done[0].sampleIndex;
    const last = tail.sampleIndex + tail.length - 1;
    const expected = last - first + 1;
    const received = this.done.reduce((n, b) => n + b.length, 0);
    return {
      startedAt: this.startedAt,
      endedAt,
      blocks: this.done,
      firstSampleIndex: first,
      lastSampleIndex: last,
      sampleCount: received,
      missingSamples: expected - received,
      durationS: expected / SAMPLE_RATE_HZ,
    };
  }

  /**
   * The first sample index this capture kept, or null before the first packet.
   *
   * Available while recording, not only at `stop()`, so page events can be placed on the
   * session clock as they happen rather than re-dated afterwards.
   */
  get firstIndex(): number | null {
    let min = Infinity;
    for (const b of [...this.done, ...this.pending.values()])
      if (b.sampleIndex < min) min = b.sampleIndex;
    return min === Infinity ? null : min;
  }

  /** Seconds captured so far, on the device clock. */
  get seconds(): number {
    if (this.done.length === 0 && this.pending.size === 0) return 0;
    let min = Infinity;
    let max = -Infinity;
    for (const b of [...this.done, ...this.pending.values()]) {
      if (b.sampleIndex < min) min = b.sampleIndex;
      if (b.sampleIndex + b.length > max) max = b.sampleIndex + b.length;
    }
    return (max - min) / SAMPLE_RATE_HZ;
  }

  private flushStale(latestIndex: number): void {
    for (const [index, block] of this.pending) {
      if (latestIndex - index > STALE_SAMPLES) {
        this.pending.delete(index);
        this.done.push(block);
      }
    }
  }
}

/** Header fields written on the first line of the file. */
export interface SessionMeta {
  deviceName: string;
  /** Which generation recorded it; the rows themselves do not differ. */
  model: MuseModel;
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
    `device_model=${meta.model}`,
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
    for (let i = 0; i < block.length; i++) {
      const index = block.sampleIndex + i;
      const tSession = (
        (index - capture.firstSampleIndex) /
        SAMPLE_RATE_HZ
      ).toFixed(6);
      const values = EEG_CHANNELS.map((c) => {
        const row = block.channels[c];
        return row && i < row.length ? row[i].toFixed(2) : "";
      });
      lines.push(`${index},${tSession},${values.join(",")}`);
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * Non-EEG streams the headband sends; kept for later analyses.
 *
 * The `ppg_*` streams are decoded on the Muse 2 and the Muse S only. The
 * Athena's PPG shares one optics stream with its fNIRS optodes and is not
 * decoded yet, so an Athena session has motion rows here and its optics in
 * the raw Bluetooth capture (`capture.ts`).
 */
export type ExtraStream =
  "acc" | "gyro" | "ppg_ambient" | "ppg_infrared" | "ppg_red";

interface ExtraPacket {
  stream: ExtraStream;
  /** Index of the first reading on that stream's own device clock. */
  sampleIndex: number;
  hostMs: number;
  /** Flat samples: xyz triplets for motion, single values for PPG. */
  samples: Float32Array;
}

const STREAM_RATE: Record<ExtraStream, number> = {
  acc: IMU_RATE_HZ,
  gyro: IMU_RATE_HZ,
  ppg_ambient: PPG_RATE_HZ,
  ppg_infrared: PPG_RATE_HZ,
  ppg_red: PPG_RATE_HZ,
};
const STREAM_WIDTH: Record<ExtraStream, number> = {
  acc: 3,
  gyro: 3,
  ppg_ambient: 1,
  ppg_infrared: 1,
  ppg_red: 1,
};

/** Collects motion and PPG packets on the indices the driver placed them at. */
export class ExtrasRecorder {
  private packets: ExtraPacket[] = [];

  feed(
    stream: ExtraStream,
    sampleIndex: number,
    samples: Float32Array,
    hostMs: number
  ): void {
    this.packets.push({ stream, sampleIndex, hostMs, samples });
  }

  /** Packet counts per stream, for the summary. */
  counts(): Partial<Record<ExtraStream, number>> {
    const out: Partial<Record<ExtraStream, number>> = {};
    for (const p of this.packets) out[p.stream] = (out[p.stream] ?? 0) + 1;
    return out;
  }

  stop(): ExtraPacket[] {
    return this.packets;
  }
}

/**
 * Serialise the extras as CSV on the EEG session clock. Each packet's arrival
 * time is mapped to an EEG sample index with the timeline fit, then samples in
 * the packet are spread backwards at the stream's rate; the stream's own
 * device clock is kept in `sample_index` for gap analysis.
 */
export function buildExtrasCsv(
  packets: ExtraPacket[],
  capture: SessionCapture,
  timeline: TimelineStats | null
): string {
  const lines = [
    "# brain-trails-extras v1 columns=stream,sample_index,t_session_s,v0,v1,v2",
    "stream,sample_index,t_session_s,v0,v1,v2",
  ];
  const slope = timeline?.msPerSample ?? 1000 / SAMPLE_RATE_HZ;
  const intercept = timeline?.hostMsAtIndex0 ?? null;
  for (const p of packets) {
    const width = STREAM_WIDTH[p.stream];
    const n = p.samples.length / width;
    const rate = STREAM_RATE[p.stream];
    // EEG-clock time of the packet's last sample; "na" when the EEG fit is not available.
    const eegIndex = intercept === null ? null : (p.hostMs - intercept) / slope;
    for (let i = 0; i < n; i++) {
      const tSession =
        eegIndex === null
          ? "na"
          : (
              (eegIndex - capture.firstSampleIndex) / SAMPLE_RATE_HZ -
              (n - 1 - i) / rate
            ).toFixed(6);
      const values = [0, 1, 2].map((k) =>
        k < width ? p.samples[i * width + k].toFixed(width === 1 ? 0 : 4) : ""
      );
      lines.push(
        `${p.stream},${p.sampleIndex + i},${tSession},${values.join(",")}`
      );
    }
  }
  return lines.join("\n") + "\n";
}
