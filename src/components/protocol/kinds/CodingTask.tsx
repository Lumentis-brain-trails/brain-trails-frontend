"use client";

/**
 * Symbol coding: a key of symbol-digit pairs stays on screen, a symbol appears, the
 * participant presses its digit, as many as fit in the time.
 *
 * After the Symbol Digit Modalities Test (Smith 1973), the single most sensitive short
 * measure of processing speed: it slows with age, fatigue and nearly every neurological
 * condition, which makes it a good thermometer and a poor diagnosis. The score is the
 * number correct in the block; the pairing is drawn per session so nobody carries a
 * learned key from one run to the next, and the symbols have no names, so the key cannot
 * be rehearsed in words.
 *
 * Self-paced inside a fixed time: each answer brings the next symbol, and the block ends
 * on the clock with the open item unscored.
 */

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { z } from "zod";
import { generateCoding } from "@/lib/protocol/choiceTrials";
import { mulberry32 } from "@/lib/protocol/rng";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { useChoiceRun, useResponseKeys } from "./choiceRun";

export const codingConfigSchema = z.object({
  duration_s: z.number().positive().default(90),
  pairs: z.number().int().min(2).max(9).default(9),
  itiMs: z.number().int().min(0).default(150),
  practice: z.boolean().optional(),
  markers: z
    .object({
      trialStart: z.string().max(50),
      stimulusOnset: z.string().max(50),
      response: z.string().max(50),
      outcome: z.string().max(50),
    })
    .default({
      trialStart: "coding_trial_start",
      stimulusOnset: "coding_stimulus_onset",
      response: "coding_response",
      outcome: "coding_outcome",
    }),
});

export type CodingConfig = z.infer<typeof codingConfigSchema>;

const GLYPHS: Record<string, string> = {
  cup: "M5 5v9a7 7 0 0 0 14 0V5",
  tee: "M5 5v14M5 12h14",
  bow: "M5 5l14 14V5L5 19z",
  peak: "M4 19L12 5l8 14",
  kite: "M12 3l8 9-8 9-8-9z",
  cross: "M12 4v16M4 12h16M7 7l10 10",
  dots: "M12 6v.01M6 17v.01M18 17v.01",
  wave: "M4 14c3-8 5-8 8 0s5 8 8 0",
  arc: "M4 17a8 8 0 0 1 16 0M12 9v10",
};

/**
 * One of the nine marks, drawn: the same stroke, the same box, on every device.
 * `dots` is three round caps, so it gets a heavier stroke to weigh what the lines weigh.
 */
export function CodingGlyph({ name, size }: { name: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      data-glyph={name}
    >
      <path
        d={GLYPHS[name] ?? ""}
        fill="none"
        stroke="currentColor"
        strokeWidth={name === "dots" ? 4 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CodingRenderer(ctx: TaskContext<CodingConfig>) {
  const t = useTranslations("kinds");
  const { config } = ctx;
  // The key must be the one the trials were dealt from: same seed, same draw.
  const plan = useMemo(
    () =>
      generateCoding(
        {
          durationS: config.duration_s,
          pairs: config.pairs,
          itiMs: config.itiMs,
          practice: config.practice,
        },
        mulberry32(ctx.seed)
      ),
    [config.duration_s, config.itiMs, config.pairs, config.practice, ctx.seed]
  );
  const digits = useMemo(
    () => plan.key.map((_, i) => String(i + 1)),
    [plan.key]
  );
  const keymap = useMemo(
    () =>
      Object.fromEntries(
        digits.flatMap((d) => [
          [`Digit${d}`, d],
          [`Numpad${d}`, d],
        ])
      ),
    [digits]
  );

  const { scene, press } = useChoiceRun(
    ctx,
    "coding",
    () => ({
      trials: plan.trials,
      config: {
        phase: ctx.phase,
        labels: config.markers,
        keys: digits,
        endOnResponse: true,
        maxDurationMs: config.duration_s * 1000,
      },
    }),
    {
      tickMs: 1000,
      extra: (state) => ({
        duration_s: config.duration_s,
        pairs: config.pairs,
        answered: state.outcomes.length,
      }),
    }
  );
  useResponseKeys(keymap, press);

  const symbol = (scene.stimulus as { symbol?: string } | null)?.symbol;
  const left = Math.max(0, Math.ceil(config.duration_s - scene.nowMs / 1000));

  return (
    <div className="flex h-full flex-col items-center justify-between gap-6 px-4 py-6">
      <table
        className="border-collapse text-center text-ink"
        aria-label={t("coding.key")}
      >
        <tbody>
          <tr>
            {plan.key.map((s) => (
              <td key={s} className="border border-hairline-strong px-3 py-2">
                <CodingGlyph name={s} size={30} />
              </td>
            ))}
          </tr>
          <tr>
            {digits.map((d) => (
              <td
                key={d}
                className="border border-hairline-strong px-3 py-1 text-xl tabular-nums"
              >
                {d}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div
        className="flex h-40 items-center justify-center text-ink"
        role="img"
        aria-label={t("coding.area")}
        data-symbol={symbol ?? ""}
      >
        {symbol ? <CodingGlyph name={symbol} size={132} /> : null}
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <div className="grid w-full grid-cols-5 gap-2 sm:grid-cols-9">
          {digits.map((d) => (
            <button
              key={d}
              type="button"
              onPointerDown={(event) => press(d, event.timeStamp)}
              className="pressable touch-manipulation rounded-[var(--radius-control)] border border-hairline-strong bg-surface py-3 text-xl font-semibold tabular-nums select-none"
            >
              {d}
            </button>
          ))}
        </div>
        <span className="type-caption text-ink-3" aria-live="off">
          {t("coding.left", { seconds: left })}
        </span>
      </div>
    </div>
  );
}

export const codingTaskKind: TaskKind<CodingConfig> = {
  name: "coding",
  configSchema: codingConfigSchema,
  Renderer: CodingRenderer,
};
