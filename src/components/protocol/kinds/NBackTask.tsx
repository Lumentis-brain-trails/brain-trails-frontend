"use client";

/**
 * The n-back: letters one at a time, press when this one is the letter from `load` ago.
 *
 * Holding the last few items in order and updating them at every letter is working
 * memory doing its job, and the load is a number (`load`), which is what makes the task
 * a dial rather than a test. For the EEG it is the most headband-friendly task there is:
 * frontal theta rises with the load, and the frontal pair is where a Muse listens.
 *
 * It is a Go/No-Go in shape - press on a match, withhold otherwise - so the backend
 * scores it with the same signal-detection arithmetic. Lures (a repeat one step off)
 * are withheld trials with their own condition name, because pressing on them means
 * recognising a recent letter without remembering *when*.
 *
 * The pace is fixed and the letter leaves the screen before the window closes, as in the
 * standard form: a self-paced n-back measures patience.
 */

import { useTranslations } from "next-intl";
import { z } from "zod";
import { generateNBack } from "@/lib/protocol/choiceTrials";
import { mulberry32 } from "@/lib/protocol/rng";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { RESPONSE_BUTTON, useChoiceRun, useResponseKeys } from "./choiceRun";
import { FixationCross } from "./shared";

export const nBackConfigSchema = z.object({
  n: z.number().int().positive(),
  load: z.number().int().min(1).max(3).default(2),
  matchRatio: z.number().gt(0).lt(1).default(0.3),
  lureRatio: z.number().min(0).lt(1).default(0.1),
  stimulusMs: z.number().int().positive().default(500),
  isiMs: z.number().int().positive().default(2000),
  practice: z.boolean().optional(),
  markers: z
    .object({
      trialStart: z.string().max(50),
      stimulusOnset: z.string().max(50),
      response: z.string().max(50),
      outcome: z.string().max(50),
    })
    .default({
      trialStart: "nback_trial_start",
      stimulusOnset: "nback_stimulus_onset",
      response: "nback_response",
      outcome: "nback_outcome",
    }),
});

export type NBackConfig = z.infer<typeof nBackConfigSchema>;

const KEYS = { Space: "press", " ": "press" } as const;

function NBackRenderer(ctx: TaskContext<NBackConfig>) {
  const t = useTranslations("kinds");
  const { config } = ctx;
  const { scene, press } = useChoiceRun(ctx, "n-back", () => ({
    trials: generateNBack(config, mulberry32(ctx.seed)),
    config: { phase: ctx.phase, labels: config.markers, keys: ["press"] },
  }));
  useResponseKeys(KEYS, press);
  const letter = (scene.stimulus as { letter?: string } | null)?.letter;

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6"
        role="img"
        aria-label={t("nback.area")}
      >
        <div className="flex h-32 items-center justify-center">
          {letter ? (
            <span className="text-[112px] leading-none font-semibold text-ink">
              {letter}
            </span>
          ) : (
            <FixationCross label={t("fixation.label")} />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <span className="type-caption text-ink-3">
          {t("nback.rule", { load: config.load })} ·{" "}
          {t("choice.progress", {
            n: Math.min(scene.trialIndex + 1, scene.totalTrials),
            total: scene.totalTrials,
          })}
        </span>
        <button
          type="button"
          className={RESPONSE_BUTTON}
          onPointerDown={(event) => press("press", event.timeStamp)}
        >
          {t("nback.match")}
        </button>
      </div>
    </div>
  );
}

export const nBackTaskKind: TaskKind<NBackConfig> = {
  name: "n-back",
  configSchema: nBackConfigSchema,
  Renderer: NBackRenderer,
};
