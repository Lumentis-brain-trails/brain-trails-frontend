"use client";

/**
 * A fixation cross for a fixed time: the lead-in `resolvePlan` inserts before a block
 * with `pre_fixation_s` (seed-jittered), or a block of its own.
 */

import { useTranslations } from "next-intl";
import {
  type FixationConfig,
  fixationConfigSchema,
} from "@/lib/protocol/blocks";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { FixationCross, Stage, useFinish, useTimedFinish } from "./shared";

function FixationRenderer(ctx: TaskContext<FixationConfig>) {
  const t = useTranslations("kinds");
  const finish = useFinish(ctx, "fixation");
  useTimedFinish(ctx.config.duration_s, () =>
    finish({ duration_s: ctx.config.duration_s })
  );
  return (
    <Stage>
      <FixationCross label={t("fixation.label")} />
    </Stage>
  );
}

export const fixationTaskKind: TaskKind<FixationConfig> = {
  name: "fixation",
  configSchema: fixationConfigSchema,
  Renderer: FixationRenderer,
};
