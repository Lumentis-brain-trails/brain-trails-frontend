"use client";

/**
 * A resting baseline, eyes open (on a fixation cross) or eyes closed.
 *
 * With eyes closed the participant cannot see the screen change, so the end is a tone.
 * The tone is scheduled on the Web Audio clock and its onset is a marker
 * (`baseline_end_tone`, `timing_source: "webaudio"`): it is an auditory event inside an
 * EEG recording, and whoever epochs the data must be able to find and exclude it.
 */

import { useTranslations } from "next-intl";
import {
  type BaselineConfig,
  baselineConfigSchema,
} from "@/lib/protocol/blocks";
import { timingMeta } from "@/lib/protocol/marker";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import {
  FixationCross,
  Stage,
  playTone,
  useFinish,
  useLatest,
  useTimedFinish,
} from "./shared";

function BaselineRenderer(ctx: TaskContext<BaselineConfig>) {
  const t = useTranslations("kinds");
  const { eyes, duration_s, end_tone } = ctx.config;
  const finish = useFinish(ctx, "baseline");
  const emit = useLatest(ctx.emit);

  useTimedFinish(duration_s, () => {
    const summary = { eyes, duration_s };
    if (eyes !== "closed" || !end_tone) return finish(summary);
    void playTone().then((onset) => {
      if (onset)
        emit.current(
          {
            label: "baseline_end_tone",
            kind: "stimulus",
            meta: timingMeta("webaudio", onset.uncertaintyMs),
          },
          onset.hostMs
        );
      finish(summary);
    });
  });

  return (
    <Stage>
      {eyes === "open" && <FixationCross label={t("fixation.label")} />}
      <p className="max-w-xl text-xl leading-relaxed text-ink-2">
        {eyes === "open"
          ? t("baseline.open")
          : end_tone
            ? t("baseline.closed")
            : t("baseline.closed_silent")}
      </p>
    </Stage>
  );
}

export const baselineTaskKind: TaskKind<BaselineConfig> = {
  name: "baseline",
  configSchema: baselineConfigSchema,
  Renderer: BaselineRenderer,
};
