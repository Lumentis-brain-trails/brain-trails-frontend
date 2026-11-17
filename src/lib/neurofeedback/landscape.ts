/**
 * Neurofeedback toward places of the person's own landscape (backend V4-0010).
 *
 * The band engine (`engine.ts`) reads a rhythm from the raw EEG, ten times a second.
 * This one reads **where the person is on their brain landscape**: every window the
 * live service embeds with REVE and places on their map (`place` frames, one a second,
 * about a second late). The reward is the closeness to the nearest target point:
 *
 *   closeness = 2^-(d / radius)^2     (1 on the point, 1/2 at `radius`, ~0 far away)
 *
 * measured at the mean of the last `MAP_SMOOTH` windows, the dot the live views draw, so
 * what the person is rewarded for is what a carer sees. After that it is the band block
 * again: a baseline at the neutral level whose clean updates set the threshold (or a
 * fixed one), in target when the closeness is above it, the picture's level ramped and
 * its luminance rate-limited (`picture.ts`, H4).
 *
 * The gate: a window during which the EEG went over the block's artefact limits is
 * held, as a gated band update is. The browser has the raw signal the window was made
 * of, so the band engine's own gate (`windowValue`) runs on it here, hop by hop on every
 * electrode, and a window is gated when most of the hops of the second it covers were.
 *
 * Targets are points of one drawing of the map (its `epoch`); a window on a map of the
 * session's own (no stored map) or on another drawing is held too (`no_map`).
 *
 * Pure and clocked by the window index (`i`, one window a second), so the same frames
 * give the same updates in a test as in a run.
 */

import type { NeurofeedbackConfig } from "@/lib/protocol/blocks";
import { NUDGE_MAX_STEPS } from "@/lib/protocol/commands";
import type { EegChannel } from "@/lib/muse/protocol";
import {
  BASELINE_MIN_CLEAN,
  BASELINE_MIN_UPDATES,
  type EegPacket,
  type GateReason,
  NUDGE_FACTOR,
  NeurofeedbackEngine,
  type NfOutput,
  type Phase,
  quantile,
} from "./engine";
import { Picture } from "./picture";

/** Seconds between two live windows (the live service's step). */
export const STEP_S = 1;

/** Windows averaged per position: the live dot's 4 s. */
export const MAP_SMOOTH = 4;

/** A baseline-set threshold is never below this closeness: "anywhere" is no target. */
export const MIN_THRESHOLD = 0.05;
/** ...nor above this one: a target nobody can stay in teaches nothing. */
export const MAX_THRESHOLD = 0.9;

/** Every electrode: a blink at the forehead moves the whole window's embedding. */
const GATE_CHANNELS: readonly EegChannel[] = ["TP9", "AF7", "AF8", "TP10"];

/** One window on the person's landscape, as the run page hears it. */
export interface LandscapePoint {
  /** The window's index in the session (one a second). */
  i: number;
  x: number;
  y: number;
  /**
   * When the window's second ended, on this page's clock (`performance.now()`): its
   * arrival, moved back a second for each newer window that came in the same burst.
   */
  hostMs: number;
  /** `performance.now()` when the frame arrived; a burst shares one. */
  arrivalMs?: number;
  /** The worker's lag for its newest window, when it said (`window` frames). */
  lagMs: number | null;
  /** Whether the map is the person's own; false on a map this session fitted alone. */
  ownMap: boolean;
  /** The map's epoch, when the live service has sent its own grown map; else null. */
  epoch: number | null;
}

export type LandscapeTargets = NonNullable<NeurofeedbackConfig["targets"]>;

/** The closeness to the nearest target: 1 on a point, 1/2 at `radius`. */
export function closeness(
  x: number,
  y: number,
  targets: Pick<LandscapeTargets, "points" | "radius">
): { closeness: number; distance: number } {
  let best = Infinity;
  for (const [px, py] of targets.points)
    best = Math.min(best, Math.hypot(x - px, y - py));
  const r = best / targets.radius;
  return { closeness: 2 ** -(r * r), distance: best };
}

/** What one landscape update says; every field goes on its `nf_update`. */
export interface LandscapeUpdate {
  phase: Phase;
  /** The window this update is the closeness of. */
  window: number;
  /** The window's own closeness; null when gated. */
  value: number | null;
  /** The closeness of the averaged position, which the threshold is compared with. */
  smoothed: number | null;
  /** The averaged position, and its distance to the nearest target. */
  x: number | null;
  y: number | null;
  distance: number | null;
  threshold: number | null;
  inTarget: boolean | null;
  gated: GateReason | "no_map" | null;
  level: number;
  brightness: number;
  blurPx: number;
  /** The frame's arrival, and the worker's lag before it. */
  hostMs: number;
  lagMs: number | null;
}

export type LandscapeOutput =
  | { type: "update"; update: LandscapeUpdate }
  | Exclude<NfOutput, { type: "update" }>;

/** The artefact gate over the raw EEG, as `[arrival, gated]` per hop. */
class EegGate {
  private readonly engine: NeurofeedbackEngine;
  readonly hops: [number, boolean][] = [];

  constructor(artefact: NeurofeedbackConfig["artefact"]) {
    // the band engine, for its gate only: a fixed threshold and no baseline, so it
    // computes every hop and never ends before the block does
    this.engine = new NeurofeedbackEngine({
      signal: "alpha",
      feedback: "video",
      channels: [...GATE_CHANNELS],
      effect: "brightness",
      duration_s: 1800,
      baseline_s: 0,
      threshold: { mode: "fixed", value: 1 },
      window_s: 1,
      smoothing_s: 1,
      ramp_s: 3,
      min_level: 0.4,
      artefact,
    });
  }

  push(packet: EegPacket): void {
    for (const out of this.engine.push(packet))
      if (out.type === "update") {
        this.hops.push([packet.hostMs, out.update.gated !== null]);
        if (this.hops.length > 200) this.hops.shift();
      }
  }

  /** Whether most hops that arrived in `[from, to]` were gated; null with none there. */
  gatedBetween(from: number, to: number): boolean | null {
    let n = 0;
    let gated = 0;
    for (const [at, g] of this.hops)
      if (at >= from && at <= to) {
        n += 1;
        if (g) gated += 1;
      }
    return n === 0 ? null : gated * 2 > n;
  }
}

export class LandscapeEngine {
  readonly direction = "up" as const;
  private readonly targets: LandscapeTargets;
  private readonly picture: Picture;
  private readonly gate: EegGate;
  private readonly recent: { x: number; y: number }[] = [];
  private threshold: number | null = null;
  private phase: Phase;
  private firstWindow: number | null = null;
  private lastWindow: number | null = null;
  private lastArrival: number | null = null;
  private baselineEnd: number;
  private baselineCount = 0;
  private baselineValues: number[] = [];
  private extended = false;
  private trainingEnd: number | null = null;
  private finished = false;
  private announced = false;

  constructor(private readonly config: NeurofeedbackConfig) {
    if (!config.targets) throw new Error("a landscape block needs targets");
    this.targets = config.targets;
    this.picture = new Picture(config.min_level, config.ramp_s, config.effect);
    this.gate = new EegGate(config.artefact);
    this.baselineEnd = config.baseline_s / STEP_S;
    this.phase = config.baseline_s > 0 ? "baseline" : "training";
  }

  get currentThreshold(): number | null {
    return this.threshold;
  }

  get done(): boolean {
    return this.finished;
  }

  get restingBrightness(): number {
    return this.picture.brightness;
  }

  /** The raw EEG, for the artefact gate only. */
  pushEeg(packet: EegPacket): void {
    this.gate.push(packet);
  }

  /** One window on the map; returns everything that became due, in order. */
  push(point: LandscapePoint): LandscapeOutput[] {
    if (this.finished) return [];
    if (this.lastWindow !== null && point.i <= this.lastWindow) return [];
    const out: LandscapeOutput[] = [];
    if (!this.announced) {
      this.announced = true;
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
    this.firstWindow ??= point.i;
    const windowsDt =
      this.lastWindow === null ? STEP_S : (point.i - this.lastWindow) * STEP_S;
    this.lastWindow = point.i;
    // the picture moves with the clock, not with the windows: a burst (a reconnect's
    // backlog) must not spend several seconds of the luminance limit at once (H4)
    const arrival = point.arrivalMs ?? point.hostMs;
    const dt =
      this.lastArrival === null
        ? windowsDt
        : Math.max(0, Math.min(windowsDt, (arrival - this.lastArrival) / 1000));
    this.lastArrival = arrival;

    // the second of EEG this window was made of, on this page's clock
    const end = point.hostMs - (point.lagMs ?? 0);
    const eegGated = this.gate.gatedBetween(end - 1000 * STEP_S, end);
    // targets chosen on another drawing of the map are somewhere else on this one
    const otherMap = point.epoch !== null && point.epoch !== this.targets.epoch;
    const gated: LandscapeUpdate["gated"] =
      !point.ownMap || otherMap ? "no_map" : eegGated ? "amplitude" : null;

    let value: number | null = null;
    let smoothed: number | null = null;
    let at: { x: number; y: number } | null = null;
    let distance: number | null = null;
    if (gated === null) {
      value = closeness(point.x, point.y, this.targets).closeness;
      this.recent.push({ x: point.x, y: point.y });
      if (this.recent.length > MAP_SMOOTH) this.recent.shift();
      at = {
        x: this.recent.reduce((s, p) => s + p.x, 0) / this.recent.length,
        y: this.recent.reduce((s, p) => s + p.y, 0) / this.recent.length,
      };
      const near = closeness(at.x, at.y, this.targets);
      smoothed = near.closeness;
      distance = near.distance;
    }

    const phase = this.phase;
    let inTarget: boolean | null = null;
    if (phase === "baseline") {
      this.baselineCount += 1;
      if (smoothed !== null) this.baselineValues.push(smoothed);
      this.picture.step("neutral", dt);
    } else if (smoothed !== null && this.threshold !== null) {
      inTarget = smoothed > this.threshold;
      this.picture.step(inTarget ? 1 : 0, dt);
    } else {
      this.picture.step(null, dt);
    }
    out.push({
      type: "update",
      update: {
        phase,
        window: point.i,
        value,
        smoothed,
        x: at?.x ?? null,
        y: at?.y ?? null,
        distance,
        threshold: this.threshold,
        inTarget,
        gated,
        level: this.picture.level,
        brightness: this.picture.brightness,
        blurPx: this.picture.blurPx,
        hostMs: point.hostMs,
        lagMs: point.lagMs,
      },
    });

    const elapsed = (point.i - this.firstWindow + 1) * STEP_S;
    if (phase === "baseline" && elapsed >= this.baselineEnd)
      out.push(...this.closeBaseline(point.i));
    else if (phase === "training") {
      this.trainingEnd ??= point.i + this.config.duration_s / STEP_S;
      if (point.i + 1 >= this.trainingEnd) {
        this.finished = true;
        out.push({ type: "done", reason: "duration" });
      }
    }
    return out;
  }

  /** As the band engine's: 5% a step, at most five either way. */
  nudge(steps: number): { threshold: number; previous: number } | null {
    if (this.threshold === null || this.finished || steps === 0) return null;
    const clamped = Math.max(
      -NUDGE_MAX_STEPS,
      Math.min(NUDGE_MAX_STEPS, Math.trunc(steps))
    );
    const previous = this.threshold;
    this.threshold = Math.min(1, previous * NUDGE_FACTOR ** clamped);
    return { threshold: this.threshold, previous };
  }

  private closeBaseline(window: number): LandscapeOutput[] {
    const updates = this.baselineCount;
    const clean = this.baselineValues.length;
    const usable =
      clean >= BASELINE_MIN_UPDATES && clean >= BASELINE_MIN_CLEAN * updates;
    if (!usable && this.config.threshold.mode === "baseline") {
      if (!this.extended) {
        this.extended = true;
        this.baselineEnd += this.config.baseline_s;
        return [{ type: "baseline_extended", updates, clean }];
      }
      this.finished = true;
      return [
        { type: "baseline_failed", updates, clean },
        { type: "done", reason: "baseline_failed" },
      ];
    }
    this.phase = "training";
    this.trainingEnd = window + 1 + this.config.duration_s / STEP_S;
    const out: LandscapeOutput[] = [
      { type: "baseline_end", updates, clean, extended: this.extended },
    ];
    if (this.config.threshold.mode === "baseline") {
      const previous = this.threshold;
      const q = quantile(
        this.baselineValues,
        1 - this.config.threshold.target_fraction
      );
      this.threshold = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, q));
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

/**
 * Whether a protocol tree holds a block that trains on the landscape: its run must be
 * published to the live service and observed, or the block hears nothing.
 */
export function hasLandscapeBlock(tree: unknown): boolean {
  if (Array.isArray(tree)) return tree.some(hasLandscapeBlock);
  if (!tree || typeof tree !== "object") return false;
  const node = tree as Record<string, unknown>;
  const config = node.config as Record<string, unknown> | undefined;
  if (node.kind === "neurofeedback" && config?.signal === "landscape_region")
    return true;
  return Object.values(node).some(
    (v) => typeof v === "object" && v !== null && hasLandscapeBlock(v)
  );
}
