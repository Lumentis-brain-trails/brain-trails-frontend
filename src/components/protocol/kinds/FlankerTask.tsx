"use client";

/**
 * The flanker task, and with cues the Attention Network Test.
 *
 * A row of five arrows; the participant answers which way the middle one points and the
 * four around it either agree (congruent) or not (incongruent). The cost of the
 * disagreement, in milliseconds and errors, is the classic measure of resolving
 * conflict (Eriksen & Eriksen 1974).
 *
 * With `cues` the same trials become the ANT (Fan et al. 2002): the row appears above or
 * below fixation and a brief asterisk may come first - none, at the centre or at both
 * places (it says *when*, not where: alerting), or where the row will be (orienting).
 * One kind, because the ANT is by definition a cued flanker task.
 *
 * Arrows are drawn as SVG rather than typed: arrow glyphs differ in width and weight
 * between fonts, and a target that looks different from its flankers is a different
 * experiment.
 */

import { useTranslations } from "next-intl";
import { z } from "zod";
import { FLANKER_CUES, generateFlanker } from "@/lib/protocol/choiceTrials";
import { mulberry32 } from "@/lib/protocol/rng";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { RESPONSE_BUTTON, useChoiceRun, useResponseKeys } from "./choiceRun";
import { FixationCross } from "./shared";

const range = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
]);

export const flankerConfigSchema = z.object({
  n: z.number().int().positive(),
  congruentRatio: z.number().gt(0).lt(1).default(0.5),
  cues: z.array(z.enum(FLANKER_CUES)).default([]),
  maxRun: z.number().int().positive().default(4),
  cueMs: z.number().int().positive().default(100),
  cueTargetMs: z.number().int().min(0).default(400),
  stimulusMs: z.number().int().positive().default(1700),
  itiMs: range.default([400, 1200]),
  practice: z.boolean().optional(),
  feedback: z.boolean().default(false),
  markers: z
    .object({
      trialStart: z.string().max(50),
      cueOnset: z.string().max(50).optional(),
      stimulusOnset: z.string().max(50),
      response: z.string().max(50),
      outcome: z.string().max(50),
    })
    .default({
      trialStart: "flanker_trial_start",
      cueOnset: "flanker_cue_onset",
      stimulusOnset: "flanker_stimulus_onset",
      response: "flanker_response",
      outcome: "flanker_outcome",
    }),
});

export type FlankerConfig = z.infer<typeof flankerConfigSchema>;

const KEYS = {
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyF: "left",
  KeyJ: "right",
} as const;

function Arrow({ direction }: { direction: string }) {
  return (
    <svg
      width="56"
      height="40"
      viewBox="0 0 56 40"
      aria-hidden
      style={{ transform: direction === "left" ? "scaleX(-1)" : undefined }}
    >
      <path
        d="M4 20h44M34 6l14 14-14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One slot above or below fixation: a row of arrows, an asterisk, or nothing. */
function Slot({
  row,
  cue,
}: {
  row: { direction: string; flankers: string } | null;
  cue: boolean;
}) {
  return (
    <div className="flex h-12 items-center justify-center gap-1 text-ink">
      {row ? (
        [
          row.flankers,
          row.flankers,
          row.direction,
          row.flankers,
          row.flankers,
        ].map((direction, i) => <Arrow key={i} direction={direction} />)
      ) : cue ? (
        <span className="text-4xl leading-none" aria-hidden>
          ✱
        </span>
      ) : null}
    </div>
  );
}

function FlankerRenderer(ctx: TaskContext<FlankerConfig>) {
  const t = useTranslations("kinds");
  const { config } = ctx;
  const { scene, press } = useChoiceRun(ctx, "flanker", () => ({
    trials: generateFlanker(
      {
        ...config,
        itiMs: config.itiMs as [number, number],
      },
      mulberry32(ctx.seed)
    ),
    config: {
      phase: ctx.phase,
      labels: config.markers,
      keys: ["left", "right"],
      endOnResponse: true,
    },
  }));
  useResponseKeys(KEYS, press);

  const stimulus = scene.stimulus as {
    direction: string;
    flankers: string;
    position: string;
  } | null;
  const upcoming = scene.upcoming as { position?: string } | null;
  const at = (position: string) =>
    stimulus && stimulus.position === position ? stimulus : null;
  const cueAt = (position: "up" | "center" | "down") => {
    if (scene.cue === null || scene.cue === "none") return false;
    if (scene.cue === "center") return position === "center";
    if (scene.cue === "double") return position !== "center";
    return upcoming?.position === position;
  };

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6"
        role="img"
        aria-label={t("flanker.area")}
      >
        <Slot row={at("up")} cue={cueAt("up")} />
        <div className="flex h-12 items-center justify-center">
          {at("center") ? (
            <Slot row={at("center")} cue={false} />
          ) : cueAt("center") ? (
            <Slot row={null} cue />
          ) : (
            <FixationCross label={t("fixation.label")} />
          )}
        </div>
        <Slot row={at("down")} cue={cueAt("down")} />
        <p className="h-6 text-ink-2" aria-live="polite">
          {config.feedback && scene.feedback
            ? t(`choice.feedback.${scene.feedback}`)
            : ""}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <button
          type="button"
          className={RESPONSE_BUTTON}
          onPointerDown={(event) => press("left", event.timeStamp)}
        >
          ← {t("flanker.left")}
        </button>
        <span className="type-caption text-ink-3">
          {t("choice.progress", {
            n: Math.min(scene.trialIndex + 1, scene.totalTrials),
            total: scene.totalTrials,
          })}
        </span>
        <button
          type="button"
          className={RESPONSE_BUTTON}
          onPointerDown={(event) => press("right", event.timeStamp)}
        >
          {t("flanker.right")} →
        </button>
      </div>
    </div>
  );
}

export const flankerTaskKind: TaskKind<FlankerConfig> = {
  name: "flanker",
  configSchema: flankerConfigSchema,
  Renderer: FlankerRenderer,
};
