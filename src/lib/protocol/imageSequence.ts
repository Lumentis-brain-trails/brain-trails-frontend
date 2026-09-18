/**
 * Planning for the timed-image task, kept pure so the schedule is testable.
 *
 * An image sequence is the simplest oddball-style stimulus: items at scheduled onsets with
 * a fixed inter-stimulus interval and optional jitter. The `class` on an item is what makes
 * it usable for an oddball design - `standard` vs `deviant` - without the renderer knowing
 * anything about the paradigm.
 */

import { z } from "zod";
import { type Rng, jitter, shuffleInPlace } from "./rng";

export const imageSequenceConfigSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        src: z.string().min(1),
        /** Free-form label, e.g. "standard" or "deviant"; carried into every marker. */
        class: z.string().max(40).optional(),
        durationMs: z.number().int().positive(),
      })
    )
    .min(1),
  isiMs: z.number().int().min(0),
  jitterMs: z.tuple([z.number().int(), z.number().int()]).optional(),
  loops: z.number().int().positive().default(1),
  shuffle: z.boolean().default(false),
  markers: z
    .object({
      onset: z.string().max(50).default("image_onset"),
      offset: z.string().max(50).optional(),
    })
    .default({ onset: "image_onset" }),
});

export type ImageSequenceConfig = z.infer<typeof imageSequenceConfigSchema>;

export interface ScheduledImage {
  index: number;
  id: string;
  src: string;
  class?: string;
  plannedOnsetMs: number;
  durationMs: number;
}

/** Lay out every image's planned onset, cumulatively from stage time zero. */
export function planImageSequence(
  config: ImageSequenceConfig,
  rng: Rng
): ScheduledImage[] {
  const planned: ScheduledImage[] = [];
  let cursor = 0;
  let index = 0;

  for (let loop = 0; loop < config.loops; loop++) {
    const items = config.shuffle
      ? shuffleInPlace([...config.items], rng)
      : config.items;
    for (const item of items) {
      planned.push({
        index,
        id: item.id,
        src: item.src,
        ...(item.class ? { class: item.class } : {}),
        plannedOnsetMs: cursor,
        durationMs: item.durationMs,
      });
      cursor +=
        item.durationMs +
        config.isiMs +
        (config.jitterMs ? jitter(rng, config.jitterMs) : 0);
      index++;
    }
  }
  return planned;
}

/** Total stage duration in milliseconds, given a planned sequence. */
export function imageSequenceDurationMs(
  planned: readonly ScheduledImage[]
): number {
  const last = planned[planned.length - 1];
  return last ? last.plannedOnsetMs + last.durationMs : 0;
}

/** Unique image sources, for preloading before the first onset. */
export function sourcesToPreload(config: ImageSequenceConfig): string[] {
  return [...new Set(config.items.map((item) => item.src))];
}
