"use client";

/**
 * A prompt: copy shown at a controlled pace, with no game input.
 *
 * Covers the spec's Arrival and Quiet Orbit stages and any consent or instruction screen.
 * Lines that declare a marker emit one when they appear, which is how fixed vocabulary
 * like `rule_instruction_shown` stays in the protocol data rather than in this component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";

export const promptConfigSchema = z.object({
  lines: z
    .array(
      z.object({
        text: z.string().min(1),
        marker: z.string().max(50).optional(),
        holdMs: z.number().int().min(0).default(2500),
      })
    )
    .min(1),
  // Every branch's own fields carry a default: the builder seeds them when the author
  // switches mode, so a timed advance never starts with an empty duration.
  advance: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("timed"),
      ms: z.number().int().positive().default(4000),
    }),
    z.object({ mode: z.literal("key"), label: z.string().default("Continue") }),
    z.object({
      mode: z.literal("either"),
      minMs: z.number().int().min(0).default(1000),
      maxMs: z.number().int().positive().default(10000),
      label: z.string().default("Continue"),
    }),
  ]),
  footnote: z.string().optional(),
});

export type PromptConfig = z.infer<typeof promptConfigSchema>;

function PromptRenderer({
  config,
  emit,
  onComplete,
  stepId,
}: TaskContext<PromptConfig>) {
  const [visible, setVisible] = useState(1);
  const [canAdvance, setCanAdvance] = useState(
    config.advance.mode !== "either"
  );
  // Seconds left of a minimum dwell, so a button that cannot be pressed yet says why
  // instead of looking broken (Alessio, 2026-09-19: "it always takes long to start").
  const [waitS, setWaitS] = useState(() =>
    config.advance.mode === "either"
      ? Math.ceil(config.advance.minMs / 1000)
      : 0
  );
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({
      stepId,
      taskKind: "prompt",
      summary: { lines_shown: config.lines.length },
    });
  }, [config.lines.length, onComplete, stepId]);

  // Reveal lines on their own schedule, emitting any marker a line declares.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    config.lines.forEach((line, index) => {
      elapsed += index === 0 ? 0 : (config.lines[index - 1].holdMs ?? 2500);
      timers.push(
        setTimeout(() => {
          setVisible(index + 1);
          if (line.marker)
            emit({
              label: line.marker,
              kind: "instruction",
              meta: { line: index },
            });
        }, elapsed)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [config.lines, emit]);

  // Advance rules: a hard timeout, a keypress, or a minimum dwell then either.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const advance = config.advance;
    if (advance.mode === "timed") {
      timers.push(setTimeout(finish, advance.ms));
    } else if (advance.mode === "either") {
      timers.push(setTimeout(() => setCanAdvance(true), advance.minMs));
      timers.push(setTimeout(finish, advance.maxMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [config.advance, finish]);

  // Counts the dwell down once a second; display only, nothing depends on it.
  useEffect(() => {
    if (config.advance.mode !== "either") return;
    const timer = setInterval(
      () => setWaitS((left) => (left > 0 ? left - 1 : 0)),
      1000
    );
    return () => clearInterval(timer);
  }, [config.advance.mode]);

  useEffect(() => {
    if (!canAdvance || config.advance.mode === "timed") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAdvance, config.advance.mode, finish]);

  const label =
    config.advance.mode === "timed"
      ? null
      : (config.advance.label ?? "Continue");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="max-w-xl space-y-4">
        {config.lines.slice(0, visible).map((line, index) => (
          <p
            key={index}
            data-motion="decor"
            className="text-xl leading-relaxed whitespace-pre-line text-ink"
          >
            {line.text}
          </p>
        ))}
      </div>
      {label && (
        <Button onClick={finish} disabled={!canAdvance} aria-label={label}>
          {canAdvance || waitS <= 0 ? label : `${label} in ${waitS} s`}
        </Button>
      )}
      {config.footnote && (
        <p className="type-caption text-ink-3">{config.footnote}</p>
      )}
    </div>
  );
}

export const promptTaskKind: TaskKind<PromptConfig> = {
  name: "prompt",
  configSchema: promptConfigSchema,
  Renderer: PromptRenderer,
};
