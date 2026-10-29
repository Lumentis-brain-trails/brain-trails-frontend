/**
 * The neurofeedback engine: Muse packets in, what the picture should do out (V4-0009).
 *
 * Pure and clocked by the **device's sample index**, not by wall time, so the same
 * packets always give the same updates - which is what lets the unit test pin every
 * value, and the backend replay the computation from the uploaded EEG (`sample_end` on
 * each update names the window). The only wall-clock figure it carries is the arrival
 * time of the packets an update includes, for the latency the block records.
 *
 * One update every `HOP_SAMPLES` (24 samples, two Muse packets, ~94 ms) once a full
 * window is in on every chosen channel:
 *
 * 1. value: relative band power averaged over the channels, or a ratio of the
 *    channel-averaged absolute powers (`spectrum.ts`);
 * 2. gate: peak to peak over `max_ptp_uv`, muscle share over `max_muscle`, a flat
 *    channel or a hole in the packets - a gated update changes nothing;
 * 3. smoothing: exponential, time constant `smoothing_s`;
 * 4. in target against the threshold, in the block's direction;
 * 5. the picture's level ramps toward 1 or 0 over `ramp_s`, and its luminance is then
 *    rate-limited (`picture.ts`, photosensitivity, H4).
 *
 * The engine runs the baseline (the picture held at the neutral level), sets the
 * threshold from it, counts the training out, and applies the operator's nudges.
 */

import type { NeurofeedbackConfig } from "@/lib/protocol/blocks";
import { NUDGE_MAX_STEPS } from "@/lib/protocol/commands";
import type { EegChannel } from "@/lib/muse/protocol";
import {
  BANDS,
  type BandName,
  MUSCLE_BAND,
  TOTAL_BAND,
  bandPower,
  powerSpectrum,
} from "./spectrum";
import { Picture } from "./picture";

export const SFREQ = 256;

/** Samples between two updates: two Muse packets (~94 ms, ~10.7 updates a second). */
export const HOP_SAMPLES = 24;

/** Below this standard deviation (µV) a channel is flat: no contact, or a dead input. */
export const FLAT_STD_UV = 0.5;

/** A baseline is usable when at least this share of its updates were clean... */
export const BASELINE_MIN_CLEAN = 0.5;
/** ...and at least this many. */
export const BASELINE_MIN_UPDATES = 10;

/** One operator nudge moves the threshold by this factor (5%). */
export const NUDGE_FACTOR = 1.05;

export type GateReason = "amplitude" | "muscle" | "flat" | "gap";

export type Phase = "baseline" | "training";

/** One Muse packet of one electrode, as `useMuse` hands it on. */
export interface EegPacket {
  channel: EegChannel;
  /** Device index of the first sample. */
  sampleIndex: number;
  samples: ArrayLike<number>;
  /** `performance.now()` when the packet arrived. */
  hostMs: number;
}

/** What one update says; every field is recorded on `nf_update`. */
export interface NfUpdate {
  phase: Phase;
  /** Device index one past the window's last sample. */
  sampleEnd: number;
  /** This window's value; null when gated. */
  value: number | null;
  /** The smoothed value the threshold is compared with; null before the first clean window. */
  smoothed: number | null;
  threshold: number | null;
  /** Null during the baseline and while gated. */
  inTarget: boolean | null;
  gated: GateReason | null;
  /** The picture's level after the ramp, in [0, 1]. */
  level: number;
  /** CSS brightness of the picture after the luminance limit. */
  brightness: number;
  /** CSS blur in px (0 unless `effect: clarity`). */
  blurPx: number;
  /** Arrival of the oldest packet this update is the first to include. */
  firstArrivalMs: number;
}

export type NfOutput =
  | { type: "update"; update: NfUpdate }
  | {
      type: "threshold";
      threshold: number;
      previous: number | null;
      cause: "baseline" | "fixed" | "operator";
    }
  | { type: "baseline_end"; updates: number; clean: number; extended: boolean }
  | { type: "baseline_extended"; updates: number; clean: number }
  | { type: "baseline_failed"; updates: number; clean: number }
  /** The training ran its length (or the baseline failed): the block is over. */
  | { type: "done"; reason: "duration" | "baseline_failed" };

const POSTERIOR: readonly EegChannel[] = ["TP9", "TP10"];
const FRONTAL: readonly EegChannel[] = ["AF7", "AF8"];

/** The block's direction: what the author chose, else the signal's usual one. */
export function nfDirection(config: NeurofeedbackConfig): "up" | "down" {
  if (config.direction) return config.direction;
  return config.signal === "theta" ||
    config.signal === "beta" ||
    config.signal === "theta_beta"
    ? "down"
    : "up";
}

/** The block's electrodes: what the author chose, else where the signal is strongest. */
export function nfChannels(config: NeurofeedbackConfig): readonly EegChannel[] {
  if (config.channels && config.channels.length > 0) return config.channels;
  // theta is a frontal rhythm; beta and SMR at the forehead are mostly the frontalis
  // muscle, so they and alpha are read behind the ears (V4-0009, checked on recordings)
  return config.signal === "theta" || config.signal === "theta_beta"
    ? FRONTAL
    : POSTERIOR;
}

const RATIOS: Record<string, [BandName, BandName]> = {
  theta_beta: ["theta", "beta"],
  alpha_theta: ["alpha", "theta"],
};

/**
 * The value and the gate of one window: `windows[c]` holds the chosen channels' samples.
 *
 * Exported for the golden file the backend's replay is checked against.
 */
export function windowValue(
  windows: readonly ArrayLike<number>[],
  signal: NeurofeedbackConfig["signal"],
  artefact: NeurofeedbackConfig["artefact"],
  sfreq = SFREQ
): { value: number | null; gated: GateReason | null } {
  const ratio = RATIOS[signal];
  let relative = 0;
  let num = 0;
  let den = 0;
  for (const x of windows) {
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!Number.isFinite(v)) return { value: null, gated: "gap" };
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      sum += v;
      sq += v * v;
    }
    const mean = sum / x.length;
    const std = Math.sqrt(Math.max(0, sq / x.length - mean * mean));
    if (std < FLAT_STD_UV) return { value: null, gated: "flat" };
    if (hi - lo > artefact.max_ptp_uv)
      return { value: null, gated: "amplitude" };
    const { power, binHz } = powerSpectrum(x, sfreq);
    const total = bandPower(power, binHz, TOTAL_BAND);
    if (!(total > 0)) return { value: null, gated: "flat" };
    if (bandPower(power, binHz, MUSCLE_BAND) / total > artefact.max_muscle)
      return { value: null, gated: "muscle" };
    if (ratio) {
      num += bandPower(power, binHz, BANDS[ratio[0]]);
      den += bandPower(power, binHz, BANDS[ratio[1]]);
    } else {
      relative += bandPower(power, binHz, BANDS[signal as BandName]) / total;
    }
  }
  if (ratio)
    return den > 0
      ? { value: num / den, gated: null }
      : { value: null, gated: "flat" };
  return { value: relative / windows.length, gated: null };
}

/** The `q` quantile (0-1) of `values`, linear between order statistics (numpy's default). */
export function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const RING = 1024;

/** The last `RING` samples of one channel, addressed by device index. */
class ChannelBuffer {
  readonly data = new Float64Array(RING);
  /** One past the newest sample held. */
  end = -1;
  /** The first index after the most recent hole: windows must start at or after it. */
  contiguousFrom = 0;
  /** `[endIndex, hostMs]` of recent packets, oldest first. */
  readonly arrivals: [number, number][] = [];

  push(packet: EegPacket): void {
    const start = packet.sampleIndex;
    if (this.end < 0) {
      this.end = start;
      this.contiguousFrom = start;
    } else if (start > this.end) {
      this.contiguousFrom = start; // lost packets: no window may span the hole
    } else if (start < this.end) {
      return; // a duplicate or a packet from before the last one: nothing new
    }
    for (let i = 0; i < packet.samples.length; i++)
      this.data[(start + i) % RING] = packet.samples[i];
    this.end = start + packet.samples.length;
    this.arrivals.push([this.end, packet.hostMs]);
    if (this.arrivals.length > 64) this.arrivals.shift();
  }

  window(end: number, n: number): Float64Array | null {
    if (end - n < this.contiguousFrom || end - n < this.end - RING) return null;
    if (end > this.end) return null;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = this.data[(end - n + i) % RING];
    return out;
  }

  /** Arrival of the first packet that holds samples at or after `index`. */
  arrivalAfter(index: number): number | null {
    for (const [end, host] of this.arrivals) if (end > index) return host;
    return null;
  }
}

export class NeurofeedbackEngine {
  readonly direction: "up" | "down";
  readonly channels: readonly EegChannel[];
  private readonly n: number;
  private readonly buffers = new Map<EegChannel, ChannelBuffer>();
  private nextEnd: number | null = null;
  private lastEnd: number | null = null;
  private smoothed: number | null = null;
  private readonly picture: Picture;
  private threshold: number | null = null;
  private phase: Phase;
  private baselineTarget: number;
  private baselineCount = 0;
  private baselineValues: number[] = [];
  private extended = false;
  private trainingLeft: number;
  private finished = false;
  private readonly dt = HOP_SAMPLES / SFREQ;

  constructor(private readonly config: NeurofeedbackConfig) {
    this.direction = nfDirection(config);
    this.channels = nfChannels(config);
    this.n = config.window_s * SFREQ;
    for (const c of this.channels) this.buffers.set(c, new ChannelBuffer());
    this.baselineTarget = Math.round((config.baseline_s * SFREQ) / HOP_SAMPLES);
    this.trainingLeft = Math.round((config.duration_s * SFREQ) / HOP_SAMPLES);
    this.phase = this.baselineTarget > 0 ? "baseline" : "training";
    this.picture = new Picture(config.min_level, config.ramp_s, config.effect);
  }

  get currentThreshold(): number | null {
    return this.threshold;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  get done(): boolean {
    return this.finished;
  }

  /** The picture at rest (the baseline's), for the first frame before any update. */
  get restingBrightness(): number {
    return this.picture.brightness;
  }

  /**
   * Feed one packet; returns everything that became due, in order.
   *
   * The fixed threshold is announced with the first output, so the record says what
   * the criterion was before anything was compared with it.
   */
  push(packet: EegPacket): NfOutput[] {
    const buffer = this.buffers.get(packet.channel);
    if (!buffer || this.finished) return [];
    buffer.push(packet);
    const out: NfOutput[] = [];
    if (this.nextEnd === null) {
      if ([...this.buffers.values()].some((b) => b.end < 0)) return out;
      const start =
        Math.max(...[...this.buffers.values()].map((b) => b.contiguousFrom)) +
        this.n;
      this.nextEnd = Math.ceil(start / HOP_SAMPLES) * HOP_SAMPLES;
      if (this.config.threshold.mode === "fixed") {
        this.threshold = this.config.threshold.value;
        out.push({
          type: "threshold",
          threshold: this.threshold,
          previous: null,
          cause: "fixed",
        });
      }
    }
    const ready = Math.min(...[...this.buffers.values()].map((b) => b.end));
    while (!this.finished && this.nextEnd !== null && this.nextEnd <= ready) {
      out.push(...this.step(this.nextEnd));
      this.lastEnd = this.nextEnd;
      this.nextEnd += HOP_SAMPLES;
    }
    return out;
  }

  /**
   * Move the threshold by `steps` nudges (5% each, at most five either way); null when
   * there is no threshold yet to move (the baseline has not set it).
   */
  nudge(steps: number): { threshold: number; previous: number } | null {
    if (this.threshold === null || this.finished || steps === 0) return null;
    const clamped = Math.max(
      -NUDGE_MAX_STEPS,
      Math.min(NUDGE_MAX_STEPS, Math.trunc(steps))
    );
    const previous = this.threshold;
    this.threshold = previous * NUDGE_FACTOR ** clamped;
    return { threshold: this.threshold, previous };
  }

  private step(end: number): NfOutput[] {
    const windows: Float64Array[] = [];
    let gated: GateReason | null = null;
    let firstArrival = Infinity;
    const since = this.lastEnd ?? end - HOP_SAMPLES;
    for (const c of this.channels) {
      const buffer = this.buffers.get(c)!;
      const arrival = buffer.arrivalAfter(since);
      if (arrival !== null) firstArrival = Math.min(firstArrival, arrival);
      const w = buffer.window(end, this.n);
      if (!w) gated = "gap";
      else windows.push(w);
    }
    let value: number | null = null;
    if (!gated) {
      const result = windowValue(
        windows,
        this.config.signal,
        this.config.artefact
      );
      value = result.value;
      gated = result.gated;
    }
    if (value !== null) {
      const a = 1 - Math.exp(-this.dt / this.config.smoothing_s);
      this.smoothed =
        this.smoothed === null
          ? value
          : this.smoothed + a * (value - this.smoothed);
    }
    const out: NfOutput[] = [];
    let inTarget: boolean | null = null;
    const phase = this.phase;
    if (phase === "baseline") {
      this.baselineCount += 1;
      if (value !== null && this.smoothed !== null)
        this.baselineValues.push(this.smoothed);
      this.picture.step("neutral", this.dt);
    } else if (
      value !== null &&
      this.smoothed !== null &&
      this.threshold !== null
    ) {
      inTarget =
        this.direction === "up"
          ? this.smoothed > this.threshold
          : this.smoothed < this.threshold;
      this.picture.step(inTarget ? 1 : 0, this.dt);
    } else {
      this.picture.step(null, this.dt);
    }
    out.push({
      type: "update",
      update: {
        phase,
        sampleEnd: end,
        value,
        smoothed: this.smoothed,
        threshold: this.threshold,
        inTarget,
        gated,
        level: this.picture.level,
        brightness: this.picture.brightness,
        blurPx: this.picture.blurPx,
        firstArrivalMs: Number.isFinite(firstArrival) ? firstArrival : 0,
      },
    });
    if (phase === "baseline" && this.baselineCount >= this.baselineTarget)
      out.push(...this.closeBaseline());
    else if (phase === "training") {
      this.trainingLeft -= 1;
      if (this.trainingLeft <= 0) {
        this.finished = true;
        out.push({ type: "done", reason: "duration" });
      }
    }
    return out;
  }

  private closeBaseline(): NfOutput[] {
    const updates = this.baselineCount;
    const clean = this.baselineValues.length;
    const usable =
      clean >= BASELINE_MIN_UPDATES && clean >= BASELINE_MIN_CLEAN * updates;
    if (!usable && this.config.threshold.mode === "baseline") {
      if (!this.extended) {
        this.extended = true;
        this.baselineTarget += Math.round(
          (this.config.baseline_s * SFREQ) / HOP_SAMPLES
        );
        return [{ type: "baseline_extended", updates, clean }];
      }
      this.finished = true;
      return [
        { type: "baseline_failed", updates, clean },
        { type: "done", reason: "baseline_failed" },
      ];
    }
    this.phase = "training";
    const out: NfOutput[] = [
      { type: "baseline_end", updates, clean, extended: this.extended },
    ];
    if (this.config.threshold.mode === "baseline") {
      const share = this.config.threshold.target_fraction;
      const previous = this.threshold;
      this.threshold = quantile(
        this.baselineValues,
        this.direction === "up" ? 1 - share : share
      );
      out.push({
        type: "threshold",
        threshold: this.threshold,
        previous,
        cause: "baseline",
      });
    }
    return out;
  }
}
