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
 * what the person is rewarded for is what a carer sees.
 *
 * Or (`targets.reward`, Andrea's "plane equation") the direction they are heading in:
 *
 *   direction = (1 + cos(X' - X, K (a - X))) / 2
 *
 * with `X` and `X'` two successive averaged positions, `a` the target nearest to `X`
 * and `K` a symmetric positive-definite spring (the identity unless the block sets one).
 * Far from every target, where the closeness is flat at zero, it still says "this way".
 * A step shorter than `STILL_SHARE` of the radius has no direction: the closeness stands
 * in for it; within `ON_TARGET_SHARE` of the radius the person is there: 1. `blend`
 * weighs the two by the closeness itself, `alpha = 1 - closeness`, so the direction
 * leads far away and the closeness near (`rewardAt`).
 *
 * After that it is the band block again, whichever the reward: a baseline at the neutral level whose clean updates set the threshold (or a
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

import {
  IDENTITY_SPRING,
  type NeurofeedbackConfig,
} from "@/lib/protocol/blocks";
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

/**
 * A step between two averaged positions shorter than this share of the radius is
 * standing still: noise, not a direction (the mean of four windows still wanders a
 * little), so the closeness stands in for the direction.
 */
export const STILL_SHARE = 0.05;

/** Closer to a target than this share of the radius is being on it: direction 1. */
export const ON_TARGET_SHARE = 0.1;

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

export type Reward = LandscapeTargets["reward"];
type Point = { x: number; y: number };

/** One position's reward, and what it was made of. */
export interface RewardValue {
  /** What the threshold is compared with, in [0, 1]. */
  value: number;
  /** The closeness at the position, and its distance to the nearest target. */
  closeness: number;
  distance: number;
  /**
   * `cos(step, K (a - X))`, raw in [-1, 1]; null when there is no direction to read
   * (the closeness reward, no previous position, standing still, on the target).
   */
  cos: number | null;
}

/** The target nearest to `(x, y)`. */
function nearest(
  x: number,
  y: number,
  points: readonly (readonly number[])[]
): readonly number[] {
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(x - p[0], y - p[1]);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * The cosine between the step `from -> to` and the spring's pull at `from`,
 * `K (a - from)`, for the target `a` nearest to `from`; null when either vector is
 * zero.
 */
export function directionCos(
  from: Point,
  to: Point,
  targets: Pick<LandscapeTargets, "points" | "spring">
): number | null {
  const [ax, ay] = nearest(from.x, from.y, targets.points);
  const [[k11, k12], [k21, k22]] = targets.spring ?? IDENTITY_SPRING;
  const ux = ax - from.x;
  const uy = ay - from.y;
  const px = k11 * ux + k12 * uy;
  const py = k21 * ux + k22 * uy;
  const sx = to.x - from.x;
  const sy = to.y - from.y;
  const norm = Math.hypot(px, py) * Math.hypot(sx, sy);
  if (!(norm > 0)) return null;
  return Math.max(-1, Math.min(1, (px * sx + py * sy) / norm));
}

/**
 * The reward at the averaged position `at`, given the one before it (`previous`, null
 * for the first): closeness, direction or blend, as the module's comment says. Pure.
 *
 * Out of scope here, said where it would go: Andrea's "penalise near other attractors,
 * reward easily in the open" (a term for the depth of any well that is not the
 * target's, `value - lambda * depth_of_other_well(X)`), in the analysis "The landscape
 * as a potential, direction feedback and the Pipeline lab" (2026-11-22), section "The
 * plane equation, checked". It needs the wells (`lib/landscape.ts` `wellsOf`) in the
 * engine and a choice of lambda that only a study can make.
 */
export function rewardAt(
  reward: Reward,
  previous: Point | null,
  at: Point,
  targets: Pick<LandscapeTargets, "points" | "radius" | "spring">
): RewardValue {
  const near = closeness(at.x, at.y, targets);
  const base = { closeness: near.closeness, distance: near.distance };
  if (reward === "closeness")
    return { ...base, value: near.closeness, cos: null };
  let direction = near.closeness;
  let cos: number | null = null;
  if (near.distance < ON_TARGET_SHARE * targets.radius) direction = 1;
  else if (
    previous &&
    Math.hypot(at.x - previous.x, at.y - previous.y) >=
      STILL_SHARE * targets.radius
  ) {
    cos = directionCos(previous, at, targets);
    if (cos !== null) direction = (1 + cos) / 2;
  }
  if (reward === "direction") return { ...base, value: direction, cos };
  const alpha = 1 - near.closeness;
  return {
    ...base,
    value: alpha * direction + (1 - alpha) * near.closeness,
    cos,
  };
}

/** What one landscape update says; every field goes on its `nf_update`. */
export interface LandscapeUpdate {
  phase: Phase;
  /** The window this update is the closeness of. */
  window: number;
  /** The window's own closeness; null when gated. */
  value: number | null;
  /**
   * The reward at the averaged position, which the threshold is compared with: its
   * closeness, its direction or the blend (`reward`).
   */
  smoothed: number | null;
  /** Which reward `smoothed` is. */
  reward: Reward;
  /** The closeness of the averaged position, whichever the reward. */
  closeness: number | null;
  /** The raw direction cosine, `rewardAt`'s; null when there was none to read. */
  cos: number | null;
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
  /** The averaged position of the last clean window: where the next step starts. */
  private previous: Point | null = null;
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
    // a config that skipped the schema (an old record, a hand-made test) has no
    // reward: the original one
    this.targets = {
      ...config.targets,
      reward: config.targets.reward ?? "closeness",
    };
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
    let near: number | null = null;
    let cos: number | null = null;
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
      const r = rewardAt(this.targets.reward, this.previous, at, this.targets);
      this.previous = at;
      smoothed = r.value;
      near = r.closeness;
      cos = r.cos;
      distance = r.distance;
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
        reward: this.targets.reward,
        closeness: near,
        cos,
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

/**
 * The targets of a protocol tree's first block that trains on the landscape - points,
 * radius and the map's epoch - for the views that draw them on the map; null without
 * such a block, or with targets that do not read as points and a radius.
 */
export function landscapeTargets(
  tree: unknown
): { points: number[][]; radius: number; epoch: number } | null {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = landscapeTargets(child);
      if (found) return found;
    }
    return null;
  }
  if (!tree || typeof tree !== "object") return null;
  const node = tree as Record<string, unknown>;
  const config = node.config as Record<string, unknown> | undefined;
  if (node.kind === "neurofeedback" && config?.signal === "landscape_region") {
    const t = config.targets as Record<string, unknown> | undefined;
    const points = t?.points;
    if (
      Array.isArray(points) &&
      points.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((v) => typeof v === "number")
      ) &&
      typeof t?.radius === "number" &&
      typeof t?.epoch === "number"
    )
      return {
        points: points as number[][],
        radius: t.radius,
        epoch: t.epoch,
      };
    return null;
  }
  for (const value of Object.values(node))
    if (typeof value === "object" && value !== null) {
      const found = landscapeTargets(value);
      if (found) return found;
    }
  return null;
}
