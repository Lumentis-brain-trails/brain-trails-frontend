"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useFormatLocale } from "@/i18n/formatLocale";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import { formatDate, formatDuration } from "@/lib/format";
import { taskName } from "@/lib/types";
import type { Recording } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { UploadDialog } from "@/components/UploadDialog";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Skeleton,
  Stat,
} from "@/components/ui";

export default function RecordingsPage() {
  const t = useTranslations("recordings");
  const locale = useFormatLocale();
  const [showUpload, setShowUpload] = useState(false);
  const workspace = useCurrentWorkspace();
  const recordings = useQuery({
    queryKey: ["recordings", workspace?.id],
    queryFn: () => api.get<Recording[]>(inWorkspace("recordings", workspace)),
    enabled: workspace !== undefined,
    refetchInterval: (query) =>
      query.state.data?.some(
        (r) => r.status === "uploaded" || r.status === "processing"
      )
        ? 2000
        : false,
  });
  const list = recordings.data;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">{t("list.title")}</h1>
          <p className="mt-1 text-ink-2">{t("list.subtitle")}</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Icon name="plus" /> {t("list.new")}
        </Button>
      </header>

      {list && list.length > 0 && (
        <div className="stagger mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label={t("list.stats.sessions")} value={list.length} />
          <Stat
            label={t("list.stats.signal")}
            value={formatDuration(
              list.reduce((a, r) => a + (r.duration_s ?? 0), 0)
            )}
          />
          <Stat
            label={t("list.stats.last")}
            value={formatDate(
              new Date(
                Math.max(...list.map((r) => +new Date(r.created_at)))
              ).toISOString(),
              locale
            )}
          />
        </div>
      )}

      {recordings.isPending && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}
      {recordings.isError && (
        <Card>
          <p className="text-ink-2">{t("list.loadFailed")}</p>
        </Card>
      )}
      {list?.length === 0 && (
        <Card inset>
          <EmptyState
            title={t("list.emptyTitle")}
            text={t("list.emptyText")}
            action={
              <Button onClick={() => setShowUpload(true)}>
                {t("list.emptyAction")}
              </Button>
            }
          />
        </Card>
      )}
      {list && list.length > 0 && (
        <Card inset>
          <ul className="stagger divide-y divide-hairline">
            {list.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recordings/${r.id}`}
                  className="pressable flex items-center gap-4 px-5 py-4 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="type-caption mt-0.5 text-ink-3">
                      {t("list.meta", {
                        task: r.task_label
                          ? taskName(t, r.task_label)
                          : t("list.noTask"),
                        duration: formatDuration(r.duration_s),
                        date: formatDate(r.created_at, locale),
                      })}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                  <Icon name="chevron" className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
    </main>
  );
}
