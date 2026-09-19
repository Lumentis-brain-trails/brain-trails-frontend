"use client";

/**
 * A visible countdown before a block that must not start by surprise (a task with a
 * response window, a loud clip). One number per second, then the step ends.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  type CountdownConfig,
  countdownConfigSchema,
} from "@/lib/protocol/blocks";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { Stage, useFinish, useTimedFinish } from "./shared";

function CountdownRenderer(ctx: TaskContext<CountdownConfig>) {
  const t = useTranslations("kinds");
  const { from } = ctx.config;
  const finish = useFinish(ctx, "countdown");
  const [left, setLeft] = useState(from);

  useEffect(() => {
    const timer = setInterval(() => setLeft((n) => Math.max(1, n - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  useTimedFinish(from, () => finish({ from }));

  return (
    <Stage>
      <p className="type-caption text-ink-2">{t("countdown.label")}</p>
      <p
        aria-live="polite"
        className="text-7xl font-semibold tabular-nums text-ink"
      >
        {left}
      </p>
    </Stage>
  );
}

export const countdownTaskKind: TaskKind<CountdownConfig> = {
  name: "countdown",
  configSchema: countdownConfigSchema,
  Renderer: CountdownRenderer,
};
