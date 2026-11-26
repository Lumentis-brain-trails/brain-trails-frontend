/**
 * What one neurofeedback block of a run hands to the next (V4-0013): the threshold a
 * `carry` block starts from, the stillness limit, and a game's hands' level.
 *
 * The run keeps a small memory (`RunCarry`, one per runner); a block reads it when it
 * starts and writes it when it ends. Keys name what must match for a value to carry:
 * the signal (and, for the landscape, the targets) for a threshold, the game for a
 * level. Nothing here depends on how the person did except the level, which follows the
 * hands only: `nextLevel` reads the choices' accuracy, never the EEG.
 */

import {
  type NeurofeedbackConfig,
  NF_GAME_MAX_LEVEL,
  NF_GAME_MIN_LEVEL,
} from "@/lib/protocol/blocks";

/** A run's memory between blocks; absent outside a runner (a preview, a test). */
export interface RunCarry {
  get(key: string): number | undefined;
  set(key: string, value: number): void;
}

/** A plain in-memory carry: what the runner holds for one run. */
export function memoryCarry(): RunCarry {
  const values = new Map<string, number>();
  return {
    get: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
  };
}

/** The key a block's threshold carries under: its signal, and its targets if any. */
export function thresholdKey(config: NeurofeedbackConfig): string {
  if (config.signal !== "landscape_region" || !config.targets)
    return `threshold:${config.signal}`;
  const t = config.targets;
  const points = t.points.map(([x, y]) => `${x},${y}`).join(";");
  return `threshold:landscape:${t.epoch}:${t.radius}:${t.reward ?? "closeness"}:${points}`;
}

/** The key a game's level carries under. */
export function levelKey(feedback: string): string {
  return `level:${feedback}`;
}

/** The key the stillness limit carries under. */
export const MOTION_KEY = "motion:limit";

/** Accuracy at or above this raises the level by one (V4-0013, after NeuroRacer). */
export const LEVEL_UP_ACCURACY = 0.85;
/** Accuracy below this lowers it by one. */
export const LEVEL_DOWN_ACCURACY = 0.65;
/** Fewer scored choices than this leave the level where it is. */
export const MIN_CHOICES = 4;

/** The hands' level after a block: up, down or the same, from the choices only. */
export function nextLevel(level: number, correct: number, total: number) {
  if (total < MIN_CHOICES) return level;
  const accuracy = correct / total;
  if (accuracy >= LEVEL_UP_ACCURACY)
    return Math.min(NF_GAME_MAX_LEVEL, level + 1);
  if (accuracy < LEVEL_DOWN_ACCURACY)
    return Math.max(NF_GAME_MIN_LEVEL, level - 1);
  return level;
}

/** The level a game block starts at: the run's, else the author's, else 1. */
export function startLevel(
  config: NeurofeedbackConfig,
  carry: RunCarry | undefined
): number {
  const carried = carry?.get(levelKey(config.feedback));
  const level = carried ?? config.game?.start_level ?? NF_GAME_MIN_LEVEL;
  return Math.max(NF_GAME_MIN_LEVEL, Math.min(NF_GAME_MAX_LEVEL, level));
}

/**
 * What a block leaves the run when its training ran its length: the threshold it ended
 * on, under its signal's key, for a later `carry` block. A block that never set one
 * leaves nothing.
 */
export function rememberThreshold(
  carry: RunCarry | undefined,
  config: NeurofeedbackConfig,
  threshold: number | null
): void {
  if (
    carry &&
    threshold !== null &&
    Number.isFinite(threshold) &&
    threshold > 0
  )
    carry.set(thresholdKey(config), threshold);
}
