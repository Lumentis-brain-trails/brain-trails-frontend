"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useFormatLocale } from "@/i18n/formatLocale";
import { ApiRequestError, api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { taskName } from "@/lib/types";
import {
  Card,
  ErrorBanner,
  Icon,
  SectionTitle,
  Skeleton,
  Stat,
  buttonClass,
} from "@/components/ui";

interface Stats {
  users_by_status: Record<string, number>;
  recordings: {
    count: number;
    total_minutes: number;
    by_task: Record<string, number>;
    by_source: Record<string, number>;
    per_day: { day: string; count: number }[];
  };
  jobs_by_status: Record<string, number>;
}

interface UserRow {
  id: string;
  email: string;
  status: string;
  member_since: string;
  recordings: number;
  total_minutes: number;
  last_activity: string | null;
}

function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const t = useTranslations("admin.dashboard");
  return (
    <div className="flex items-center gap-3 text-[14px]">
      <span className="w-36 shrink-0 truncate text-ink-2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-(--m-slow)"
          style={{ width: `${max ? (value / max) * 100 : 0}%` }}
          title={t("valueOf", { label, value })}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  const tStatus = useTranslations("admin.statuses");
  const tRecordings = useTranslations("recordings");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<Stats>("admin/stats"),
  });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserRow[]>("admin/users"),
  });

  const s = stats.data;
  const maxTask = s ? Math.max(1, ...Object.values(s.recordings.by_task)) : 1;
  const days = s ? [...s.recordings.per_day].reverse() : [];
  const maxDay = Math.max(1, ...days.map((d) => d.count));
  const pending = s?.users_by_status?.pending ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">{t("title")}</h1>
          <p className="mt-1 text-ink-2">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/fair" className={buttonClass("secondary")}>
            {t("links.fair")}
          </Link>
          <Link href="/admin/protocols" className={buttonClass("secondary")}>
            {t("links.protocols")}
          </Link>
          <Link href="/admin/review" className={buttonClass("secondary")}>
            {t("links.review")}
          </Link>
          <Link
            href="/admin/applications"
            className="pressable inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 font-medium text-on-accent hover:bg-accent-hover"
          >
            {t("links.applications")}
            {pending > 0 && (
              <span className="rounded-full bg-white/25 px-2 text-[12px] tabular-nums">
                {pending}
              </span>
            )}
          </Link>
        </div>
      </header>

      {stats.isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}
      {stats.isError && (
        <ErrorBanner
          message={
            stats.error instanceof ApiRequestError
              ? errorMessage(stats.error)
              : t("loadFailed")
          }
        />
      )}
      {s && (
        <>
          <div className="stagger mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label={t("stats.active")}
              value={s.users_by_status.active ?? 0}
            />
            <Stat
              label={t("stats.pending")}
              value={pending}
              hint={t("stats.rejected", {
                count: s.users_by_status.rejected ?? 0,
              })}
            />
            <Stat
              label={t("stats.recordings")}
              value={s.recordings.count}
              hint={t("stats.liveSessions", {
                count: s.recordings.by_source.stream ?? 0,
              })}
            />
            <Stat
              label={t("stats.minutes")}
              value={s.recordings.total_minutes}
              hint={t("stats.failedJobs", {
                count: s.jobs_by_status.failed ?? 0,
              })}
            />
          </div>

          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <section>
              <SectionTitle>{t("byTask.title")}</SectionTitle>
              <Card className="space-y-3">
                {Object.entries(s.recordings.by_task)
                  .sort((a, b) => b[1] - a[1])
                  .map(([task, count]) => (
                    <BarRow
                      key={task}
                      label={
                        task === "none"
                          ? tRecordings("list.noTask")
                          : taskName(tRecordings, task)
                      }
                      value={count}
                      max={maxTask}
                    />
                  ))}
                {Object.keys(s.recordings.by_task).length === 0 && (
                  <p className="text-ink-3">{t("byTask.empty")}</p>
                )}
              </Card>
            </section>
            <section>
              <SectionTitle>{t("uploads.title")}</SectionTitle>
              <Card>
                {days.length === 0 ? (
                  <p className="text-ink-3">{t("uploads.empty")}</p>
                ) : (
                  <div
                    className="flex h-36 items-stretch gap-1.5"
                    role="img"
                    aria-label={t("uploads.aria")}
                  >
                    {days.map((d) => (
                      <div
                        key={d.day}
                        className="group flex flex-1 flex-col items-center justify-end gap-1.5"
                      >
                        <span className="type-caption text-ink-3 tabular-nums opacity-0 transition-opacity duration-(--m-fast) group-hover:opacity-100">
                          {d.count}
                        </span>
                        <div
                          className="w-full rounded-md bg-ink transition-[height] duration-(--m-slow)"
                          style={{
                            height: `${(d.count / maxDay) * 100}%`,
                            minHeight: 3,
                          }}
                          title={t("valueOf", {
                            label: d.day,
                            value: d.count,
                          })}
                        />
                        <span className="text-[10px] text-ink-3 tabular-nums">
                          {d.day.slice(8)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          </div>

          <section>
            <SectionTitle>{t("participants.title")}</SectionTitle>
            <Card inset className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead className="border-b border-hairline text-left">
                  <tr className="type-caption text-ink-3">
                    <th className="px-5 py-3 font-medium">
                      {t("participants.participant")}
                    </th>
                    <th className="px-3 py-3 font-medium">
                      {t("participants.status")}
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      {t("participants.recordings")}
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      {t("participants.minutes")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("participants.lastActivity")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-hairline last:border-0"
                    >
                      <td className="px-5 py-3">{u.email}</td>
                      <td className="px-3 py-3 text-ink-2 capitalize">
                        {tStatus.has(u.status as never)
                          ? tStatus(u.status as never)
                          : u.status}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {u.recordings}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {u.total_minutes}
                      </td>
                      <td className="px-5 py-3 text-ink-2">
                        {u.last_activity
                          ? new Date(u.last_activity).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Link
              href="/admin/applications"
              className="type-caption mt-3 inline-flex items-center gap-1 font-medium text-accent hover:underline"
            >
              {t("participants.allApplications")}{" "}
              <Icon name="chevron" className="h-3.5 w-3.5" />
            </Link>
          </section>
        </>
      )}
    </main>
  );
}
