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
 * The standard pace is fixed and the letter leaves the screen before the window closes.
 * The self-paced version (`pace: "self"`, asked for on 2026-09-24) keeps each letter
 * until the participant presses Continue: Match before that is the answer, none is a
 * withhold. It trades the time pressure for a second measure, how long each letter was
 * kept (`advance_ms` on its outcome), and its reaction times are decisions taken at
 * leisure: compare them within the pace, never across.
 */

import { useTranslations } from "next-intl";
import { z } from "zod";
import type { ChoiceState } from "@/lib/protocol/choice";
import { generateNBack } from "@/lib/protocol/choiceTrials";
import { mulberry32 } from "@/lib/protocol/rng";
import { median } from "@/lib/protocol/stats";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { RESPONSE_BUTTON, useChoiceRun, useResponseKeys } from "./choiceRun";
import { FixationCross } from "./shared";

const common = {
  n: z.number().int().positive(),
  load: z.number().int().min(1).max(3).default(2),
  matchRatio: z.number().gt(0).lt(1).default(0.3),
  lureRatio: z.number().min(0).lt(1).default(0.1),
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
};

/**
 * Two paces, told apart by `pace`. A block written before the self-paced one existed
 * has no `pace` and is the fixed one, which is why that branch comes first and defaults.
 */
export const nBackConfigSchema = z.union([
  z.object({
    pace: z.literal("fixed").default("fixed"),
    ...common,
    stimulusMs: z.number().int().positive().default(500),
    isiMs: z.number().int().positive().default(2000),
  }),
  z.object({
    pace: z.literal("self"),
    ...common,
    gapMs: z.number().int().min(0).default(500),
  }),
]);

export type NBackConfig = z.infer<typeof nBackConfigSchema>;

const ADVANCE = "continue";
const KEYS = { Space: "press", " ": "press" } as const;
/** Self-paced: Enter moves on, as the Continue button does. */
const SELF_PACED_KEYS = { ...KEYS, Enter: ADVANCE } as const;

/** How long a self-paced letter was kept, over the scored ones. */
function advanceSummary(state: ChoiceState) {
  const kept = state.outcomes.flatMap((o) =>
    o.invalid || o.practice || o.advanceMs === undefined ? [] : [o.advanceMs]
  );
  return { medianAdvanceMs: median(kept) };
}

function NBackRenderer(ctx: TaskContext<NBackConfig>) {
  const t = useTranslations("kinds");
  const { config } = ctx;
  const selfPaced = config.pace === "self";
  const { scene, press } = useChoiceRun(
    ctx,
    "n-back",
    () => ({
      trials: generateNBack(config, mulberry32(ctx.seed)),
      config: {
        phase: ctx.phase,
        labels: config.markers,
        keys: ["press"],
        ...(selfPaced ? { advanceKey: ADVANCE } : {}),
      },
    }),
    selfPaced ? { extra: advanceSummary } : {}
  );
  useResponseKeys(selfPaced ? SELF_PACED_KEYS : KEYS, press);
  const letter = (scene.stimulus as { letter?: string } | null)?.letter;
  const marked = scene.response === "press";

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
          {t(selfPaced ? "nback.ruleSelfPaced" : "nback.rule", {
            load: config.load,
          })}{" "}
          ·{" "}
          {t("choice.progress", {
            n: Math.min(scene.trialIndex + 1, scene.totalTrials),
            total: scene.totalTrials,
          })}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={
              selfPaced
                ? "pressable rounded-full px-8 py-4 text-base font-semibold text-ink ring-1 ring-hairline-strong select-none touch-manipulation aria-pressed:bg-accent-soft aria-pressed:ring-accent"
                : RESPONSE_BUTTON
            }
            aria-pressed={selfPaced ? marked : undefined}
            onPointerDown={(event) => press("press", event.timeStamp)}
          >
            {selfPaced && marked ? t("nback.marked") : t("nback.match")}
          </button>
          {selfPaced && (
            <button
              type="button"
              className={RESPONSE_BUTTON}
              disabled={!letter}
              onPointerDown={(event) => press(ADVANCE, event.timeStamp)}
            >
              {t("nback.continue")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const nBackTaskKind: TaskKind<NBackConfig> = {
  name: "n-back",
  configSchema: nBackConfigSchema,
  Renderer: NBackRenderer,
};
