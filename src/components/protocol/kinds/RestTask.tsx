"use client";

/**
 * A rest: timed (the tail `resolvePlan` inserts after a block with `post_rest_s`) or
 * self-paced, ended by the participant.
 *
 * A single self-paced rest is also the "free recording" protocol: the headband records
 * while the screen shows the elapsed time and a Finish button, so an open-ended session
 * still has a version, a plan and block events like every other run.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { type RestConfig, restConfigSchema } from "@/lib/protocol/blocks";
import type { TaskContext, TaskKind } from "@/lib/protocol/types";
import { Stage, useFinish, useTimedFinish } from "./shared";

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatElapsed(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function RestRenderer(ctx: TaskContext<RestConfig>) {
  const t = useTranslations("kinds");
  const { mode, duration_s, message } = ctx.config;
  const finish = useFinish(ctx, "rest");
  const [elapsed, setElapsed] = useState(0);

  useTimedFinish(mode === "timed" ? (duration_s ?? 0) : null, () =>
    finish({ mode, duration_s })
  );

  // Display only: the block's real duration is on its block_end marker.
  useEffect(() => {
    if (mode !== "self_paced") return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [mode]);

  return (
    <Stage>
      <p className="max-w-xl text-xl leading-relaxed text-ink">
        {message ?? (mode === "timed" ? t("rest.timed") : t("rest.self_paced"))}
      </p>
      {mode === "self_paced" && (
        <>
          <p className="type-caption tabular-nums text-ink-2" aria-live="off">
            {t("rest.elapsed", { time: formatElapsed(elapsed) })}
          </p>
          <Button onClick={() => finish({ mode, elapsed_s: elapsed })}>
            {t("rest.finish")}
          </Button>
        </>
      )}
    </Stage>
  );
}

export const restTaskKind: TaskKind<RestConfig> = {
  name: "rest",
  configSchema: restConfigSchema,
  Renderer: RestRenderer,
};
