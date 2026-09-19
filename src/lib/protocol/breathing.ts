/**
 * The breathing/reset stage's timeline, as pure data.
 *
 * Kept out of the component so "exactly three timed cycles before the rule appears" - a
 * requirement in the spec's implementation checklist - is something a unit test asserts
 * rather than something a reviewer counts by watching the screen.
 */

import { z } from "zod";

export const breathingConfigSchema = z.object({
  cycles: z.number().int().positive(),
  inhaleMs: z.number().int().positive(),
  holdMs: z.number().int().min(0).default(0),
  exhaleMs: z.number().int().positive(),
  markers: z
    .object({
      cycleStart: z.string().max(50).default("breath_cycle_start"),
      inhale: z.string().max(50).default("breath_inhale"),
      exhale: z.string().max(50).default("breath_exhale"),
    })
    .default({
      cycleStart: "breath_cycle_start",
      inhale: "breath_inhale",
      exhale: "breath_exhale",
    }),
  lines: z
    .array(
      z.object({
        text: z.string().min(1),
        marker: z.string().max(50).optional(),
        holdMs: z.number().int().positive().default(5000),
      })
    )
    .default([]),
});

export type BreathingConfig = z.infer<typeof breathingConfigSchema>;

export type BreathPhase = "inhale" | "hold" | "exhale" | "rule";

export interface BreathingSegment {
  atMs: number;
  durationMs: number;
  phase: BreathPhase;
  cycle: number;
  /** The marker to emit when this segment starts, if any. */
  marker?: string;
  /** Copy to show during this segment, for the rule lines. */
  text?: string;
  /** True on the first segment of a cycle. */
  cycleStart?: boolean;
}

/** Lay out every breath phase and rule line, cumulatively from stage time zero. */
export function planBreathing(config: BreathingConfig): BreathingSegment[] {
  const segments: BreathingSegment[] = [];
  let cursor = 0;

  for (let cycle = 0; cycle < config.cycles; cycle++) {
    segments.push({
      atMs: cursor,
      durationMs: config.inhaleMs,
      phase: "inhale",
      cycle,
      marker: config.markers.inhale,
      cycleStart: true,
    });
    cursor += config.inhaleMs;

    if (config.holdMs > 0) {
      segments.push({
        atMs: cursor,
        durationMs: config.holdMs,
        phase: "hold",
        cycle,
      });
      cursor += config.holdMs;
    }

    segments.push({
      atMs: cursor,
      durationMs: config.exhaleMs,
      phase: "exhale",
      cycle,
      marker: config.markers.exhale,
    });
    cursor += config.exhaleMs;
  }

  for (const line of config.lines) {
    segments.push({
      atMs: cursor,
      durationMs: line.holdMs,
      phase: "rule",
      cycle: config.cycles,
      marker: line.marker,
      text: line.text,
    });
    cursor += line.holdMs;
  }
  return segments;
}

/** Total stage duration in milliseconds. */
export function breathingDurationMs(config: BreathingConfig): number {
  const segments = planBreathing(config);
  const last = segments[segments.length - 1];
  return last ? last.atMs + last.durationMs : 0;
}
