"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useFormatLocale } from "@/i18n/formatLocale";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";
import { formatDate, formatDuration } from "@/lib/format";
import type { Recording } from "@/lib/types";
import { TrailThumb } from "@/components/TrailThumb";
import { UploadDialog } from "@/components/UploadDialog";
import {
  Button,
  buttonClass,
  Card,
  EmptyState,
  Icon,
  Skeleton,
} from "@/components/ui";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const RECENT = 4;

/**
 * Home: where a signed-in session starts. One way to begin a new trail (the only
 * place a ribbon appears inside the app: a trail is about to start there), the
 * week at a glance, and the latest trails drawn from their own data.
 */
export default function HomePage() {
  const t = useTranslations("home");
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
  const list = recordings.data ?? [];
  const recent = [...list]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, RECENT);
  // "This week" is fixed when the page opens, not re-evaluated every render.
  const [weekAgo] = useState(() => Date.now() - WEEK_MS);
  const thisWeek = list.filter((r) => +new Date(r.created_at) >= weekAgo);
  const today = new Date().toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-12">
      <header className="enter-up mb-10">
        <p className="type-eyebrow text-ink-3" suppressHydrationWarning>
          {today}
        </p>
        <h1 className="type-display mt-2 text-[clamp(2.25rem,4.5vw,3rem)]">
          {t("welcome")}
        </h1>
      </header>

      <div className="stagger grid gap-5 lg:grid-cols-3">
        <Card className="relative isolate flex min-h-[250px] flex-col justify-between gap-8 overflow-hidden p-8 lg:col-span-2">
          <div
            aria-hidden
            className="ribbon-glow -top-[64px] -right-[150px] -z-10 rotate-[-18deg]"
          />
          <div>
            <h2 className="type-heading text-[26px] tracking-[-0.02em]">
              {t("start.title")}
            </h2>
            <p className="mt-2 text-ink-2">{t("start.text")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/protocols" className={buttonClass("primary", "lg")}>
              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
              {t("start.record")}
            </Link>
            <Link href="/library" className={buttonClass("secondary", "lg")}>
              {t("start.pick")}
            </Link>
            <Button variant="ghost" onClick={() => setShowUpload(true)}>
              <Icon name="plus" /> {t("start.upload")}
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col p-7">
          <h2 className="type-eyebrow text-ink-3">{t("week.title")}</h2>
          <dl className="mt-5 flex flex-1 flex-col justify-between gap-4">
            <WeekRow label={t("week.sessions")} value={thisWeek.length} />
            <WeekRow
              label={t("week.signal")}
              value={formatDuration(
                thisWeek.reduce((a, r) => a + (r.duration_s ?? 0), 0)
              )}
            />
            <WeekRow label={t("week.all")} value={list.length} last />
          </dl>
        </Card>
      </div>

      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="type-heading text-[22px]">{t("recent.title")}</h2>
          {list.length > RECENT && (
            <Link
              href="/recordings"
              className="text-[14px] font-medium text-ink-2 hover:text-ink"
            >
              {t("recent.all")}
            </Link>
          )}
        </div>

        {recordings.isPending && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[200px]" />
            ))}
          </div>
        )}
        {recordings.isError && (
          <Card>
            <p className="text-ink-2">{t("recent.loadFailed")}</p>
          </Card>
        )}
        {recordings.isSuccess && list.length === 0 && (
          <Card inset>
            <EmptyState
              title={t("recent.emptyTitle")}
              text={t("recent.emptyText")}
              action={
                <Link href="/protocols" className={buttonClass()}>
                  {t("recent.emptyAction")}
                </Link>
              }
            />
          </Card>
        )}
        {recent.length > 0 && (
          <ul className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recordings/${r.id}`}
                  className="pressable group block"
                >
                  <TrailThumb recording={r} />
                  <p className="mt-3 truncate font-semibold group-hover:underline">
                    {r.title}
                  </p>
                  <p className="type-caption mt-0.5 text-ink-3">
                    {t("recent.meta", {
                      date: formatDate(r.created_at, locale),
                      duration: formatDuration(r.duration_s),
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
    </main>
  );
}

function WeekRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline justify-between gap-4" +
        (last ? "" : " border-b border-hairline pb-4")
      }
    >
      <dt className="text-[14px] text-ink-2">{label}</dt>
      <dd className="type-figure text-[24px]">{value}</dd>
    </div>
  );
}
