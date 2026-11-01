"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import type { JobsPayload, PodsPayload } from "./lib/health";

/** "Failed jobs (24 h)": the count, and how many jobs are in a retry loop now. */
export function FailedJobsWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.health.widgets");
  const p = payload as unknown as JobsPayload;
  return (
    <div>
      <p className={cn("type-figure", p.failed_24h > 0 && "text-danger")}>
        {p.failed_24h}
      </p>
      <p className="text-[12px] text-ink-3">
        {t("failedJobs", {
          loops: p.retry_loops.length,
          stale: p.stale.length,
        })}
      </p>
    </div>
  );
}

/** "Restarted (24 h)": containers restarted in a day, and how many were OOM-killed. */
export function RestartsWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.health.widgets");
  const p = payload as unknown as PodsPayload;
  return (
    <div>
      <p className={cn("type-figure", p.oom_24h > 0 && "text-danger")}>
        {p.restarted_24h}
      </p>
      <p className="text-[12px] text-ink-3">
        {t("restarts", { oom: p.oom_24h, pods: p.pods.length })}
      </p>
    </div>
  );
}
