/**
 * A fixed four-channel Muse recording for the neurofeedback tests (V4-0009).
 *
 * Generated from a seed, so it is the same recording on every machine, and rounded to
 * 0.01 µV as the session CSV stores it - the replay in the backend reads exactly these
 * numbers. What it contains, second by second, is the point of the tests:
 *
 * - throughout: a 1/f background (1-45 Hz, random phases) plus 2 µV of white noise;
 * - alpha (10 Hz) at 3 µV, rising to 14 µV at TP9/TP10 (6 µV frontally) during each
 *   `alphaOn` stretch: what an `up` alpha block should reward;
 * - a blink at each `blinks` instant: a 250 µV bump on AF7/AF8 (the amplitude gate);
 * - a jaw clench during each `jaw` stretch: 30-58 Hz bursts on every channel (the
 *   muscle gate);
 * - an optional `hole`: a stretch of samples that never arrived (lost packets).
 */

import { mulberry32 } from "@/lib/protocol/rng";
import { EEG_CHANNELS, type EegChannel } from "@/lib/muse/protocol";
import { type EegPacket, SFREQ } from "./engine";

export interface RecordingSpec {
  seconds: number;
  seed?: number;
  alphaOn?: [number, number][];
  blinks?: number[];
  jaw?: [number, number][];
  /** `[from, to)` seconds of lost packets. */
  hole?: [number, number];
  /** The device index of the first sample (a real band starts anywhere). */
  firstIndex?: number;
}

export interface Recording {
  firstIndex: number;
  samples: Record<EegChannel, Float64Array>;
}

const inside = (t: number, spans: [number, number][] = []) =>
  spans.some(([a, b]) => t >= a && t < b);

/** The recording `spec` describes; deterministic for a given spec. */
export function makeRecording(spec: RecordingSpec): Recording {
  const rng = mulberry32(spec.seed ?? 7);
  const n = Math.round(spec.seconds * SFREQ);
  const samples = {} as Record<EegChannel, Float64Array>;
  for (const channel of EEG_CHANNELS) {
    const frontal = channel === "AF7" || channel === "AF8";
    const phases = Array.from({ length: 45 }, () => rng() * 2 * Math.PI);
    const jawPhases = Array.from({ length: 15 }, () => rng() * 2 * Math.PI);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SFREQ;
      let v = 0;
      for (let f = 1; f <= 45; f++)
        v += (12 / f) * Math.sin(2 * Math.PI * f * t + phases[f - 1]);
      v += (rng() - 0.5) * 2 * Math.sqrt(3) * 2;
      const alpha = inside(t, spec.alphaOn) ? (frontal ? 6 : 14) : 3;
      v += alpha * Math.sin(2 * Math.PI * 10 * t);
      if (frontal)
        for (const at of spec.blinks ?? [])
          v += 250 * Math.exp(-(((t - at) / 0.08) ** 2));
      if (inside(t, spec.jaw))
        for (let k = 0; k < 15; k++)
          v += 6 * Math.sin(2 * Math.PI * (30 + 2 * k) * t + jawPhases[k]);
      x[i] = Math.round(v * 100) / 100;
    }
    samples[channel] = x;
  }
  return { firstIndex: spec.firstIndex ?? 1200, samples };
}

/**
 * The recording as the headband delivers it: 12-sample packets, the four electrodes in
 * turn, each packet's arrival `hostMs` 47 ms after the previous set (the hole's packets
 * never arrive).
 */
export function packetsOf(
  recording: Recording,
  hole?: [number, number]
): EegPacket[] {
  const out: EegPacket[] = [];
  const n = recording.samples.TP9.length;
  for (let start = 0; start + 12 <= n; start += 12) {
    const t = start / SFREQ;
    if (hole && t >= hole[0] && t < hole[1]) continue;
    const hostMs = 5000 + ((start + 12) / SFREQ) * 1000 + 8;
    for (const channel of EEG_CHANNELS)
      out.push({
        channel,
        sampleIndex: recording.firstIndex + start,
        samples: recording.samples[channel].subarray(start, start + 12),
        hostMs,
      });
  }
  return out;
}
