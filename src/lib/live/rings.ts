/** The last seconds of each channel an observer received, for the live signal panel. */

import { EEG_CHANNELS, type EegChannel } from "@/lib/muse/protocol";

/** Seconds of signal kept per channel. */
export const RING_SECONDS = 10;

export class SignalRings {
  private data: Record<EegChannel, number[]>;

  constructor(private readonly sfreq = 256) {
    this.data = Object.fromEntries(
      EEG_CHANNELS.map((c) => [c, [] as number[]])
    ) as Record<EegChannel, number[]>;
  }

  /** Add a chunk's four channels. */
  push(eeg: readonly (readonly number[])[]): void {
    const cap = RING_SECONDS * this.sfreq;
    EEG_CHANNELS.forEach((c, i) => {
      const row = eeg[i];
      if (!row) return;
      const ring = this.data[c];
      ring.push(...row);
      if (ring.length > cap) ring.splice(0, ring.length - cap);
    });
  }

  /** The last `seconds` of every channel, as `useMuse().getRecent` gives them. */
  recent = (seconds: number): Record<EegChannel, Float32Array> =>
    Object.fromEntries(
      EEG_CHANNELS.map((c) => [
        c,
        Float32Array.from(
          this.data[c].slice(-Math.round(seconds * this.sfreq))
        ),
      ])
    ) as Record<EegChannel, Float32Array>;
}
