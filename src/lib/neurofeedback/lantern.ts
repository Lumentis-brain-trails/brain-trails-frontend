/**
 * Lantern, the first neurofeedback game (V4-0013): what happens, separate from drawing.
 *
 * A walker carries a lantern along a path on the black stage. Two loops that never cross:
 *
 * - **the trained signal is the light**: the lantern's circle widens and the path ahead
 *   comes out of the dark as the engine's rate-limited brightness rises (`lightFraction`
 *   reads only the brightness, so the light can change no faster than the video would,
 *   H4/H16), and the walk quickens a little;
 * - **the hands are the forks**: every `forkInterval(level)` seconds the path forks and a
 *   faint marker, always drawn alike whatever the light, stands at the side to take; the
 *   person presses left or right before the walker reaches it (`forkWindow(level)`).
 *   A wrong turn costs the point and nothing else: there is no losing state.
 *
 * Head movement (`moving`, from `stillness.ts`) slows the walker, sways the lantern and
 * holds the next fork back, so the hands' score pauses while the head moves. Forks run in
 * the baseline as in the training, unscored, so the threshold is set while the person
 * plays the same game it will reward.
 *
 * Clocked by the frames' own seconds, seeded by the step's seed: the same frames and
 * presses always give the same forks, which is what the tests pin.
 */

import { mulberry32, type Rng } from "@/lib/protocol/rng";
import { NF_GAME_MAX_LEVEL, NF_GAME_MIN_LEVEL } from "@/lib/protocol/blocks";
import { GAMMA } from "./picture";

export type Side = "left" | "right";

/** Seconds between two forks at a level: 6 at level 1, 2.5 at level 10. */
export function forkInterval(level: number): number {
  return 6 - ((clampLevel(level) - 1) * 3.5) / 9;
}

/** Seconds to choose, from the marker's appearance: 3 at level 1, 1.8 at level 10. */
export function forkWindow(level: number): number {
  return 3 - ((clampLevel(level) - 1) * 1.2) / 9;
}

/** What the game records; each becomes an `nf_game` event. */
export type LanternEvent =
  | { event: "prompt"; fork: number; side: Side; scored: boolean }
  | {
      event: "response";
      fork: number;
      side: Side;
      correct: boolean;
      rtMs: number;
      scored: boolean;
    }
  | { event: "miss"; fork: number; side: Side; scored: boolean }
  | { event: "stray"; side: Side };

/** One fork on its way to the walker. */
export interface Fork {
  id: number;
  side: Side;
  /** Game seconds it appeared at. */
  shownAt: number;
  /** Seconds until the walker reaches it. */
  window: number;
  /** Set once the person chose (or the walker passed it). */
  outcome: "correct" | "wrong" | "missed" | null;
  /** Game seconds the outcome happened at. */
  resolvedAt: number | null;
  scored: boolean;
}

/** What the frame needs from the engine to play one step. */
export interface LanternInput {
  /** The engine's rate-limited CSS brightness, in [min_level, 1]. */
  brightness: number;
  /** `min_level` of the block: the brightness fully out of target. */
  minLevel: number;
  phase: "baseline" | "training";
  moving: boolean;
}

/** The round's tally, for the card and the staircase. */
export interface LanternTally {
  prompts: number;
  correct: number;
  wrong: number;
  missed: number;
  stray: number;
}

/** How long a resolved fork stays drawn, in seconds. */
export const RESOLVED_S = 0.8;

/** Walking speed, path lengths a second, at full light and still. */
const WALK_SPEED = 0.12;

export class Lantern {
  private readonly rng: Rng;
  private time = 0;
  private nextForkAt: number;
  private nextId = 1;
  private walkedNow = 0;
  private swayNow = 0;
  private swayPhase = 0;
  private lightNow: number;
  readonly forks: Fork[] = [];
  readonly tally: LanternTally = {
    prompts: 0,
    correct: 0,
    wrong: 0,
    missed: 0,
    stray: 0,
  };

  constructor(
    readonly level: number,
    seed: number,
    private readonly reducedMotion = false
  ) {
    this.rng = mulberry32(seed);
    this.nextForkAt = forkInterval(level);
    this.lightNow = 0.5;
  }

  /** Game seconds so far. */
  get now(): number {
    return this.time;
  }

  /** How far the walker has come, in path lengths; still with reduced motion. */
  get walked(): number {
    return this.walkedNow;
  }

  /** The lantern's sway, in [-1, 1]: 0 while the head is still. */
  get sway(): number {
    return this.swayNow;
  }

  /** The light's reach, in [0, 1], from the brightness alone. */
  get light(): number {
    return this.lightNow;
  }

  /** The fork the person may answer now, if any. */
  get open(): Fork | null {
    return this.forks.find((f) => f.outcome === null) ?? null;
  }

  /** Advance by `dtS` seconds of frames; returns the prompts and misses that happened. */
  step(dtS: number, input: LanternInput): LanternEvent[] {
    const out: LanternEvent[] = [];
    if (!(dtS > 0)) return out;
    this.time += dtS;
    this.lightNow = lightFraction(input.brightness, input.minLevel);
    const speed =
      WALK_SPEED * (0.6 + 0.4 * this.lightNow) * (input.moving ? 0.5 : 1);
    if (!this.reducedMotion) this.walkedNow += speed * dtS;
    // the sway grows while the head moves and settles when it stops
    this.swayPhase += dtS * 2 * Math.PI * 0.6;
    const amplitude = input.moving ? 1 : 0;
    this.swayNow +=
      (amplitude * Math.sin(this.swayPhase) - this.swayNow) *
      (1 - Math.exp(-dtS / 0.4));

    for (const fork of this.forks) {
      if (fork.outcome !== null || this.time < fork.shownAt + fork.window)
        continue;
      fork.outcome = "missed";
      fork.resolvedAt = this.time;
      if (fork.scored) this.tally.missed += 1;
      out.push({
        event: "miss",
        fork: fork.id,
        side: fork.side,
        scored: fork.scored,
      });
    }
    // a moving head holds the next fork back: the hands' score pauses
    if (input.moving) this.nextForkAt += dtS;
    if (this.time >= this.nextForkAt && this.open === null) {
      const fork: Fork = {
        id: this.nextId++,
        side: this.rng() < 0.5 ? "left" : "right",
        shownAt: this.time,
        window: forkWindow(this.level),
        outcome: null,
        resolvedAt: null,
        scored: input.phase === "training",
      };
      this.forks.push(fork);
      if (fork.scored) this.tally.prompts += 1;
      this.nextForkAt = this.time + forkInterval(this.level);
      out.push({
        event: "prompt",
        fork: fork.id,
        side: fork.side,
        scored: fork.scored,
      });
    }
    // forget what is no longer drawn
    while (
      this.forks.length > 0 &&
      this.forks[0].resolvedAt !== null &&
      this.time - this.forks[0].resolvedAt > RESOLVED_S
    )
      this.forks.shift();
    return out;
  }

  /** The person pressed `side`; `ageS` is how long before the current frame they did. */
  press(side: Side, ageS = 0): LanternEvent {
    const fork = this.open;
    if (!fork) {
      this.tally.stray += 1;
      return { event: "stray", side };
    }
    const at = Math.max(fork.shownAt, this.time - Math.max(0, ageS));
    const correct = side === fork.side;
    fork.outcome = correct ? "correct" : "wrong";
    fork.resolvedAt = this.time;
    if (fork.scored) {
      if (correct) this.tally.correct += 1;
      else this.tally.wrong += 1;
    }
    return {
      event: "response",
      fork: fork.id,
      side,
      correct,
      rtMs: Math.round((at - fork.shownAt) * 1000),
      scored: fork.scored,
    };
  }
}

/** The light's reach in [0, 1]: where the brightness sits between `minLevel` and 1. */
export function lightFraction(brightness: number, minLevel: number): number {
  if (!(1 - minLevel > 0)) return 1;
  return Math.max(0, Math.min(1, (brightness - minLevel) / (1 - minLevel)));
}

/** Where the lantern hangs, in units of the stage's shorter side, from the centre. */
export function lanternAt(sway: number): { x: number; y: number } {
  return { x: 0.04 * sway, y: 0.32 };
}

/** The light's radius in units of the stage's shorter side. */
export function lightRadius(light: number): number {
  return 0.16 + 0.5 * light;
}

/** The share of the radius the light keeps its full strength over. */
export const LIGHT_CORE = 0.35;

/** The light's alpha at full brightness: a lantern, not a floodlight. */
export const LIGHT_STRENGTH = 0.55;

/** The lantern's colour as sRGB 0-255, and its relative luminance at full strength. */
export const LANTERN_RGB: readonly [number, number, number] = [249, 196, 110];

/**
 * The light's strength (0-1, the alpha it is drawn with on black) at a point, in units of
 * the shorter side from the stage's centre. The renderer draws the same falloff.
 */
export function lightAlpha(
  x: number,
  y: number,
  brightness: number,
  light: number,
  sway: number
): number {
  const c = lanternAt(sway);
  const r = lightRadius(light);
  const d = Math.hypot(x - c.x, y - c.y) / r;
  if (d >= 1) return 0;
  const t = d <= LIGHT_CORE ? 0 : (d - LIGHT_CORE) / (1 - LIGHT_CORE);
  const falloff = 1 - t * t * (3 - 2 * t);
  return LIGHT_STRENGTH * Math.max(0, Math.min(1, brightness)) * falloff;
}

/** Relative luminance of the light at a point on black (sRGB, gamma 2.2). */
export function lightLuminance(
  x: number,
  y: number,
  brightness: number,
  light: number,
  sway: number
): number {
  const a = lightAlpha(x, y, brightness, light, sway);
  const [r, g, b] = LANTERN_RGB.map((v) => ((a * v) / 255) ** GAMMA);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampLevel(level: number): number {
  return Math.max(NF_GAME_MIN_LEVEL, Math.min(NF_GAME_MAX_LEVEL, level));
}
