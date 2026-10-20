"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
  Stat,
  buttonClass,
  cn,
} from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import { ops } from "@console/lib/client";
import type { AppPageProps } from "@console/lib/manifest";
import { tokens } from "@console/lib/format";
import {
  type Entry,
  type Facets,
  type Filters,
  type Grouping,
  type HoursDay,
  type Milestone,
  NO_FILTERS,
  type Plan,
  type Totals,
  byDay,
  byPlan,
  hoursText,
  filterQuery,
  reportHref,
  splitDetail,
} from "./lib/worklog";

const PAGE = 30;

/** The filters: area, thread, status, a span of days. */
function FilterBar({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
}) {
  const t = useTranslations("console.worklog.filters");
  const facets = useQuery({
    queryKey: ["worklog", "facets"],
    queryFn: () => ops.get<Facets>("worklog/facets"),
  });
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label={t("area")}>
        <Select
          value={value.area}
          onChange={(e) => set({ area: e.target.value })}
        >
          <option value="">{t("anyArea")}</option>
          {(facets.data?.areas ?? []).map((a) => (
            <option key={a.name} value={a.name}>
              {a.name} ({a.entries})
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("thread")}>
        <Select
          value={value.thread}
          onChange={(e) => set({ thread: e.target.value })}
        >
          <option value="">{t("anyThread")}</option>
          {(facets.data?.threads ?? []).map((th) => (
            <option key={th.name} value={th.name}>
              {th.name} ({th.entries})
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("status")}>
        <Select
          value={value.status}
          onChange={(e) => set({ status: e.target.value as Filters["status"] })}
        >
          <option value="">{t("anyStatus")}</option>
          <option value="done">{t("done")}</option>
          <option value="in_progress">{t("inProgress")}</option>
        </Select>
      </Field>
      <Field label={t("since")}>
        <Input
          type="date"
          value={value.since}
          onChange={(e) => set({ since: e.target.value })}
        />
      </Field>
      <Field label={t("until")}>
        <Input
          type="date"
          value={value.until}
          onChange={(e) => set({ until: e.target.value })}
        />
      </Field>
    </div>
  );
}

/** Token totals per day, week or area, with the grand total of the selection. */
function TotalsPanel({ filters }: { filters: Filters }) {
  const t = useTranslations("console.worklog.totals");
  const format = useFormatter();
  const locale = useLocale();
  const [by, setBy] = useState<Grouping>("week");
  const totals = useQuery({
    queryKey: ["worklog", "totals", by, filters],
    queryFn: () =>
      ops.get<Totals>(`worklog/totals${filterQuery(filters, { by })}`),
  });
  const rows = totals.data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.tokens_new));
  const label = (key: string, offline: boolean) =>
    offline
      ? t("offline")
      : by === "area"
        ? key
        : by === "week"
          ? t("weekOf", {
              day: format.dateTime(new Date(`${key}T12:00:00`), {
                dateStyle: "medium",
              }),
            })
          : format.dateTime(new Date(`${key}T12:00:00`), {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("hours")}
          value={hoursText(totals.data?.minutes ?? 0, locale)}
          hint={t("hoursHint")}
        />
        <Stat
          label={t("tokensNew")}
          value={tokens(totals.data?.tokens_new ?? 0)}
          hint={t("tokensNewHint")}
        />
        <Stat
          label={t("tokensCache")}
          value={tokens(totals.data?.tokens_cache ?? 0)}
          hint={t("tokensCacheHint")}
        />
        <Stat label={t("entries")} value={String(totals.data?.entries ?? 0)} />
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-heading">{t("title")}</h2>
          <Segmented
            label={t("groupBy")}
            value={by}
            onChange={setBy}
            options={[
              { value: "day", label: t("byDay") },
              { value: "week", label: t("byWeek") },
              { value: "area", label: t("byArea") },
            ]}
          />
        </div>
        {totals.isPending ? (
          <Skeleton className="h-24" />
        ) : rows.length === 0 ? (
          <p className="text-[14px] text-ink-3">{t("none")}</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr>
                <th className="pb-2 font-medium">
                  {by === "area" ? t("area") : t("period")}
                </th>
                <th className="w-1/4 pb-2" />
                <th className="pb-2 text-right font-medium">{t("hours")}</th>
                <th className="pb-2 text-right font-medium">
                  {t("tokensNew")}
                </th>
                <th className="pb-2 text-right font-medium max-sm:hidden">
                  {t("tokensCache")}
                </th>
                <th className="pb-2 text-right font-medium">{t("entries")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-hairline">
                  <td className="py-2 pr-3">
                    {label(r.key, r.offline ?? false)}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="h-2 rounded-full bg-surface-2">
                      <div
                        className="h-2 rounded-full bg-ink-2"
                        style={{
                          width: `${Math.max(2, (r.tokens_new / max) * 100)}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {hoursText(r.minutes, locale)}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {tokens(r.tokens_new)}
                  </td>
                  <td className="py-2 text-right font-mono text-ink-3 tabular-nums max-sm:hidden">
                    {tokens(r.tokens_cache)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

/**
 * Andrea's table: date, activity category, time spent in hours, description, with a
 * total per day that merges the sessions run side by side and adds the offline time.
 */
function HoursPanel({ filters }: { filters: Filters }) {
  const t = useTranslations("console.worklog.hours");
  const format = useFormatter();
  const locale = useLocale();
  const days = useQuery({
    queryKey: ["worklog", "hours", filters],
    queryFn: () => ops.get<HoursDay[]>(`worklog/hours${filterQuery(filters)}`),
  });
  const date = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "short" });
  return (
    <Card inset>
      <div className="border-b border-hairline px-5 py-3">
        <h2 className="type-heading">{t("title")}</h2>
        <p className="mt-1 text-[13px] text-ink-3">{t("note")}</p>
      </div>
      {days.isPending ? (
        <Skeleton className="m-5 h-24" />
      ) : (days.data ?? []).length === 0 ? (
        <p className="px-5 py-4 text-[14px] text-ink-3">{t("none")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-5 py-2 font-medium">{t("date")}</th>
                <th className="py-2 pr-3 font-medium">{t("category")}</th>
                <th className="py-2 pr-3 text-right font-medium whitespace-nowrap">
                  {t("hours")}
                </th>
                <th className="py-2 pr-5 font-medium">{t("description")}</th>
              </tr>
            </thead>
            <tbody>
              {(days.data ?? []).map((day) => (
                <DayRows
                  key={day.date}
                  day={day}
                  date={date(day.date)}
                  locale={locale}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DayRows({
  day,
  date,
  locale,
}: {
  day: HoursDay;
  date: string;
  locale: string;
}) {
  const t = useTranslations("console.worklog.hours");
  return (
    <>
      {day.rows.map((row) => (
        <tr key={row.id} className="border-t border-hairline align-top">
          <td className="px-5 py-2 whitespace-nowrap">{date}</td>
          <td className="py-2 pr-3">{row.category}</td>
          <td className="py-2 pr-3 text-right font-mono tabular-nums">
            {hoursText(row.minutes, locale)}
          </td>
          <td className="py-2 pr-5 text-ink-2">{row.description}</td>
        </tr>
      ))}
      {day.offline_minutes > 0 && (
        <tr className="border-t border-hairline align-top">
          <td className="px-5 py-2 whitespace-nowrap">{date}</td>
          <td className="py-2 pr-3">{t("offline")}</td>
          <td className="py-2 pr-3 text-right font-mono tabular-nums">
            {hoursText(day.offline_minutes, locale)}
          </td>
          <td className="py-2 pr-5 text-ink-2">{day.offline_description}</td>
        </tr>
      )}
      <tr className="border-t border-hairline bg-surface-2 font-semibold">
        <td className="px-5 py-2 whitespace-nowrap">{date}</td>
        <td className="py-2 pr-3">{t("dayTotal")}</td>
        <td className="py-2 pr-3 text-right font-mono tabular-nums">
          {hoursText(day.total_minutes, locale)}
        </td>
        <td className="py-2 pr-5" />
      </tr>
    </>
  );
}

/** Results by project area, and where every sprint of every plan stands. */
function ProjectsPanel() {
  const t = useTranslations("console.worklog.projects");
  const format = useFormatter();
  const milestones = useQuery({
    queryKey: ["worklog", "milestones"],
    queryFn: () => ops.get<Milestone[]>("worklog/milestones"),
  });
  const plans = useQuery({
    queryKey: ["worklog", "plans"],
    queryFn: () => ops.get<Plan[]>("worklog/plans"),
  });
  const summary = useQuery({
    queryKey: ["worklog", "summary"],
    queryFn: () => ops.get<Record<string, unknown>>("worklog/summary"),
  });
  const merged = summary.data?.pr_merged;
  const open = summary.data?.pr_open;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="type-heading mb-3">{t("results")}</h2>
        {typeof merged === "number" && typeof open === "number" && (
          <p className="mb-3 text-[13px] text-ink-3">
            {t("prs", { merged, open })}
          </p>
        )}
        {(milestones.data ?? []).length === 0 ? (
          <p className="text-[14px] text-ink-3">{t("noResults")}</p>
        ) : (
          <ul className="space-y-3">
            {(milestones.data ?? []).map((m) => (
              <li key={m.id}>
                <p className="text-[14px] font-semibold">
                  <span className="mr-2 rounded-md bg-accent-soft px-2 py-0.5 text-[12px]">
                    {m.area}
                  </span>
                  {m.title}
                </p>
                <p className="text-[12px] text-ink-3">
                  {m.status === "done" ? t("done") : t("inProgress")} ·{" "}
                  {format.dateTime(new Date(`${m.date}T12:00:00`), {
                    dateStyle: "medium",
                  })}
                </p>
                {m.detail && (
                  <p className="mt-1 text-[13px] text-ink-2">{m.detail}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="type-heading mb-3">{t("plans")}</h2>
        {(plans.data ?? []).length === 0 ? (
          <p className="text-[14px] text-ink-3">{t("noPlans")}</p>
        ) : (
          <div className="space-y-4">
            {byPlan(plans.data ?? []).map((group) => (
              <div key={group.plan}>
                <h3 className="mb-1 text-[13px] font-semibold text-ink-2">
                  {group.plan}
                </h3>
                <ul className="space-y-1">
                  {group.sprints.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-baseline gap-2 text-[14px]"
                    >
                      <span className="w-8 shrink-0 font-mono text-[12px] text-ink-3">
                        {p.sprint}
                      </span>
                      <span className="flex-1">
                        {p.name}
                        {p.note && (
                          <span className="text-ink-3"> · {p.note}</span>
                        )}
                      </span>
                      <span className="text-[12px] text-ink-3">{p.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** The report for Andrea: Markdown or a PDF drawn by bt-ops, same filters, his language. */
function ExportBar({ filters }: { filters: Filters }) {
  const t = useTranslations("console.worklog.export");
  const [lang, setLang] = useState<"en" | "it">("it");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[13px] text-ink-2">{t("label")}</span>
      <Segmented
        label={t("language")}
        value={lang}
        onChange={setLang}
        options={[
          { value: "it", label: t("italian") },
          { value: "en", label: t("english") },
        ]}
      />
      <a
        href={reportHref(filters, "pdf", lang)}
        className={buttonClass("primary", "sm")}
        download
      >
        {t("pdf")}
      </a>
      <a
        href={reportHref(filters, "md", lang)}
        className={buttonClass("secondary", "sm")}
        download
      >
        {t("markdown")}
      </a>
    </div>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  const t = useTranslations("console.worklog.entry");
  const locale = useLocale();
  const { prose, bullets } = splitDetail(entry.detail);
  const done = entry.status === "done";
  return (
    <article className="space-y-2 rounded-[var(--radius-card)] border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          {entry.areas.map((a) => (
            <span
              key={a}
              className="rounded-md bg-accent-soft px-2 py-0.5 font-semibold text-ink"
            >
              {a}
            </span>
          ))}
          <span>
            {[
              entry.thread,
              entry.started_local,
              entry.category,
              entry.minutes
                ? t("hours", { hours: hoursText(entry.minutes, locale) })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-semibold",
              done ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
            )}
          >
            {done ? t("done") : t("inProgress")}
          </span>
        </div>
        <span className="font-mono text-[13px] tabular-nums">
          {tokens(entry.tokens_new)}{" "}
          <span className="text-ink-3">
            {t("tokens", { cache: tokens(entry.tokens_cache) })}
          </span>
        </span>
      </div>
      <h3 className="text-[17px] leading-snug font-semibold">{entry.title}</h3>
      {prose && <p className="text-[14px] text-ink-2">{prose}</p>}
      {bullets.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-[14px] text-ink-2">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {entry.links.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {entry.links.map((l) => (
            <a
              key={l.url + l.label}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline-offset-2 hover:underline"
            >
              {l.label}
            </a>
          ))}
        </p>
      )}
    </article>
  );
}

/** The entries, newest first, day by day, a page at a time. */
function EntryList({ filters }: { filters: Filters }) {
  const t = useTranslations("console.worklog");
  const format = useFormatter();
  const errorText = useErrorText();
  const list = useInfiniteQuery({
    queryKey: ["worklog", "entries", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      ops.page<Entry>(
        `worklog/entries${filterQuery(filters, { limit: PAGE, cursor: pageParam })}`
      ),
    getNextPageParam: (last) => last.next,
  });
  if (list.isError) return <ErrorBanner message={errorText(list.error)} />;
  if (list.isPending) return <Skeleton className="h-48" />;
  const entries = list.data.pages.flatMap((p) => p.items);
  if (entries.length === 0)
    return <EmptyState title={t("emptyTitle")} text={t("emptyText")} />;
  return (
    <div className="space-y-6">
      {byDay(entries).map((day) => (
        <section key={day.date} className="space-y-3">
          <header className="flex items-baseline justify-between border-b border-hairline pb-1.5">
            <h2 className="text-[16px] font-semibold first-letter:uppercase">
              {format.dateTime(new Date(`${day.date}T12:00:00`), {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </h2>
            <span className="font-mono text-[13px] text-ink-3">
              {t("dayTokens", { tokens: tokens(day.tokens) })}
            </span>
          </header>
          {day.entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </section>
      ))}
      {list.hasNextPage && (
        <Button
          variant="secondary"
          onClick={() => list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
        >
          {t("more")}
        </Button>
      )}
    </div>
  );
}

/**
 * Work log ("Registro lavori"): what Alessio and Claude did together, with the tokens it
 * took. Filters narrow the totals, the list and the report alike.
 */
export function WorklogApp({ semver }: AppPageProps) {
  const t = useTranslations("console.worklog");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  return (
    <div data-version={semver} className="space-y-8">
      <p className="max-w-2xl text-ink-2">{t("intro")}</p>
      <FilterBar value={filters} onChange={setFilters} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ExportBar filters={filters} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilters(NO_FILTERS)}
        >
          {t("filters.clear")}
        </Button>
      </div>
      <TotalsPanel filters={filters} />
      <HoursPanel filters={filters} />
      <ProjectsPanel />
      <EntryList filters={filters} />
      <p className="max-w-2xl text-[13px] text-ink-3">{t("tokensNote")}</p>
    </div>
  );
}
