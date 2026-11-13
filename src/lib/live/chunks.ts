/**
 * The producer's feed: the headband's packets, four channels, cut into chunks of a
 * quarter second with the device's own sample counter (T5, T4b).
 *
 * A chunk's last sample waits for the chunk to fill before it leaves, so the chunk is
 * the part of the live trail's lag the browser adds: a second-long chunk alone made the
 * trail's tip up to a second late, a quarter second keeps it near 0.3 s.
 *
 * The four electrodes are stamped alike, so a chunk is ready when every channel holds
 * `size` samples. Values go out in uV at one decimal: the feed budget is 8 KB a second,
 * and a tenth of a microvolt is below the headband's noise. The counter (`first`) is the
 * sample index of the chunk's first sample, so the room can place it on the EEG clock.
 */

import { EEG_CHANNELS, type EegChannel } from "@/lib/muse/protocol";

/** Samples per chunk: a quarter second at the Muse's 256 Hz. */
export const LIVE_CHUNK_SAMPLES = 64;

export interface LiveChunk {
  type: "chunk";
  seq: number;
  first: number;
  sfreq: number;
  eeg: number[][];
}

export class ChunkAssembler {
  private buffers: Record<EegChannel, number[]>;
  private first: number | null = null;
  private seq = 0;

  constructor(
    private readonly sfreq = 256,
    private readonly size = LIVE_CHUNK_SAMPLES
  ) {
    this.buffers = Object.fromEntries(
      EEG_CHANNELS.map((c) => [c, [] as number[]])
    ) as Record<EegChannel, number[]>;
  }

  /** Add one packet of one channel; returns the chunks it completed. */
  push(
    channel: EegChannel,
    sampleIndex: number,
    samples: ArrayLike<number>
  ): LiveChunk[] {
    if (this.first === null && channel === EEG_CHANNELS[0])
      this.first = sampleIndex;
    const buffer = this.buffers[channel];
    for (let i = 0; i < samples.length; i++)
      buffer.push(Math.round(samples[i] * 10) / 10);
    const out: LiveChunk[] = [];
    while (EEG_CHANNELS.every((c) => this.buffers[c].length >= this.size)) {
      out.push({
        type: "chunk",
        seq: this.seq++,
        first: this.first ?? 0,
        sfreq: this.sfreq,
        eeg: EEG_CHANNELS.map((c) => this.buffers[c].splice(0, this.size)),
      });
      this.first = (this.first ?? 0) + this.size;
    }
    return out;
  }
}
