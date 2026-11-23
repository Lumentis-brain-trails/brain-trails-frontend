"use client";

import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Card, EmptyState, ErrorBanner, Skeleton, cn } from "@/components/ui";
import { useOps, useOpsEnv } from "@console/components/env";
import { useErrorText } from "@console/components/useErrorText";
import type { LabRunItem, LabRunStatus } from "@console/lib/client";
import { POLL_MS, isActive } from "../lib/lab";

const TONE: Record<LabRunStatus, string> = {
  queued: "bg-surface-2 text-ink-2",
  running: "bg-warn-soft text-warn",
  done: "bg-ok-soft text-ok",
  failed: "bg-danger-soft text-danger",
};

/** A run's status as a small badge. */
export function StatusBadge({ status }: { status: LabRunStatus }) {
  const t = useTranslations("console.pipelineLab.status");
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
        TONE[status]
      )}
    >
      {t(status)}
    </span>
  );
}

/**
 * The runs of the environment being read, newest first (bt-ops keeps the last 100).
 * While one is unfinished the list is read again every 3 s; then it stops.
 */
export function RunList({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useTranslations("console.pipelineLab.list");
  const tEnv = useTranslations("console.env");
  const format = useFormatter();
  const errorText = useErrorText();
  const envOps = useOps();
  const { env, cacheKey } = useOpsEnv();
  const runs = useQuery({
    queryKey: ["lab-runs", cacheKey],
    queryFn: () => envOps.get<LabRunItem[]>("lab/runs"),
    refetchInterval: (query) =>
      query.state.data?.some((r) => isActive(r.status)) ? POLL_MS : false,
  });

  if (runs.isPending) return <Skeleton className="h-40" />;
  if (runs.isError) return <ErrorBanner message={errorText(runs.error)} />;
  if (runs.data.length === 0) {
    return (
      <Card>
        <EmptyState
          title={t("emptyTitle", { env: env ? tEnv(`name.${env}`) : "" })}
          text={t("emptyText")}
        />
      </Card>
    );
  }
  return (
    <Card inset>
      <ul>
        {runs.data.map((run) => (
          <li
            key={run.id}
            className="border-t border-hairline first:border-t-0"
          >
            <button
              type="button"
              onClick={() => onOpen(run.id)}
              className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{run.title}</span>
                <span className="block text-[13px] text-ink-3">
                  {t("line", {
                    when: format.relativeTime(new Date(run.created_at)),
                    who: run.created_by ?? t("someone"),
                  })}
                  {run.rerun_of && ` · ${t("rerun")}`}
                  {` · ${run.config_hash.slice(0, 8)}`}
                </span>
              </span>
              <StatusBadge status={run.status} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
