"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  ErrorBanner,
  Field,
  Segmented,
  Select,
  cn,
} from "@/components/ui";
import { Bars } from "@console/components/Charts";
import { Sections } from "@console/components/Sections";
import { SnapshotPanel } from "@console/components/SnapshotPanel";
import { useRefresh } from "@console/components/data";
import { useErrorText } from "@console/components/useErrorText";
import { ops } from "@console/lib/client";
import type { AppPageProps } from "@console/lib/manifest";
import {
  type AcquisitionPayload,
  type ConsentPayload,
  type Count,
  type Definitions,
  type EngagementPayload,
  REPORTS,
  count,
  funnelRows,
  maxOf,
  median,
  series,
  share,
} from "./lib/stats";

interface Cohort {
  id: string;
  name: string;
  profile: string | null;
}

type Params = { weeks: number; cohort?: string };

/** A labelled bar: a count against the largest of its group; a dash when hidden. */
function BarRow({
  label,
  value,
  max,
  note,
}: {
  label: string;
  value: Count;
  max: number;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-[14px]">
      <span className="w-40 shrink-0 truncate text-ink-2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-ink-2"
          style={{ width: `${value ? (value / max) * 100 : 0}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono tabular-nums">
        {count(value)}
      </span>
      {note !== undefined && (
        <span className="w-24 text-right text-[12px] text-ink-3">{note}</span>
      )}
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline px-5 py-4 first:border-t-0">
      <h3 className="mb-3 text-[13px] font-semibold text-ink-2">{title}</h3>
      {children}
    </div>
  );
}

/** A table of rows with a label column and count columns; hidden values are dashes. */
function CountTable<R extends object>({
  rows,
  label,
  columns,
}: {
  rows: R[];
  label: (row: R) => string;
  columns: { key: keyof R & string; title: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[12px] text-ink-3">
          <tr>
            <th className="pb-2 font-medium" />
            {columns.map((c) => (
              <th key={c.key} className="pb-2 text-right font-medium">
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-hairline">
              <td className="py-1.5 pr-3">{label(row)}</td>
              {columns.map((c) => (
                <td key={c.key} className="py-1.5 text-right tabular-nums">
                  {count((row as Record<string, unknown>)[c.key] as Count)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Acquisition({ params }: { params: Params }) {
  const t = useTranslations("console.statistics.acquisition");
  const tSteps = useTranslations("console.statistics.steps");
  const steps = (
    ["accepted", "verified", "first_session", "second_session"] as const
  ).map((key) => ({ key, title: tSteps(key) }));
  return (
    <SnapshotPanel<AcquisitionPayload>
      panelKey="statistics.acquisition"
      params={params}
      title={t("title")}
    >
      {(p) => {
        const funnel = funnelRows(p.funnel);
        const max = maxOf(p.funnel.map((r) => r.people));
        return (
          <>
            <Block title={t("funnel")}>
              <div className="grid gap-2">
                {funnel.map((r) => (
                  <BarRow
                    key={r.step}
                    label={tSteps(r.step as never)}
                    value={r.people}
                    max={max}
                    note={
                      r.ofPrevious && t("ofPrevious", { share: r.ofPrevious })
                    }
                  />
                ))}
              </div>
            </Block>
            <Block title={t("perWeek")}>
              <Bars
                values={series(p.per_week.map((w) => w.people))}
                label={t("perWeek")}
              />
              <CountTable
                rows={p.per_week}
                label={(r) => r.week}
                columns={[
                  { key: "people", title: tSteps("registered") },
                  ...steps,
                ]}
              />
            </Block>
            <Block title={t("times")}>
              <div className="grid gap-1.5 text-[14px]">
                {p.times.map((r) => (
                  <p key={r.step}>
                    <span className="text-ink-2">
                      {t(`timeTo.${r.step}` as never)}
                    </span>{" "}
                    <span className="font-mono tabular-nums">
                      {t(r.unit === "hours" ? "hours" : "days", {
                        n: median(r.median),
                      })}
                    </span>{" "}
                    <span className="text-[12px] text-ink-3">
                      {t("ofPeople", { people: count(r.people) })}
                    </span>
                  </p>
                ))}
              </div>
            </Block>
            <Block title={t("byProfile")}>
              <CountTable
                rows={p.by_profile}
                label={(r) => r.profile}
                columns={[
                  { key: "people", title: tSteps("registered") },
                  ...steps,
                ]}
              />
            </Block>
            {!p.cohort && (
              <Block title={t("byCohort")}>
                <CountTable
                  rows={p.by_cohort}
                  label={(r) => r.cohort ?? t("noCohort")}
                  columns={[
                    { key: "people", title: tSteps("registered") },
                    ...steps,
                  ]}
                />
              </Block>
            )}
          </>
        );
      }}
    </SnapshotPanel>
  );
}

function Engagement({ params }: { params: Params }) {
  const t = useTranslations("console.statistics.engagement");
  return (
    <SnapshotPanel<EngagementPayload>
      panelKey="statistics.engagement"
      params={params}
      title={t("title")}
    >
      {(p) => {
        const perPerson = maxOf(p.sessions_per_person.map((b) => b.people));
        const idle = maxOf(p.days_since_last.map((b) => b.people));
        return (
          <>
            <Block title={t("perWeek")}>
              <Bars
                values={series(p.per_week.map((w) => w.people))}
                label={t("perWeek")}
              />
              <CountTable
                rows={p.per_week}
                label={(r) => r.week}
                columns={[
                  { key: "people", title: t("active") },
                  { key: "sessions", title: t("sessions") },
                ]}
              />
            </Block>
            <Block title={t("perMonth")}>
              <CountTable
                rows={p.per_month}
                label={(r) => r.month.slice(0, 7)}
                columns={[
                  { key: "people", title: t("active") },
                  { key: "sessions", title: t("sessions") },
                ]}
              />
            </Block>
            <Block title={t("perPerson")}>
              <div className="grid gap-2">
                {p.sessions_per_person.map((b) => (
                  <BarRow
                    key={b.bucket}
                    label={t("sessionsBucket", { bucket: b.bucket })}
                    value={b.people}
                    max={perPerson}
                  />
                ))}
              </div>
            </Block>
            <Block title={t("retention")}>
              {p.retention.length === 0 ? (
                <p className="text-[13px] text-ink-3">{t("noRetention")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-[12px]">
                    <thead className="text-ink-3">
                      <tr>
                        <th className="pr-3 pb-2 text-left font-medium">
                          {t("firstWeek")}
                        </th>
                        <th className="pr-3 pb-2 text-right font-medium">
                          {t("people")}
                        </th>
                        {(p.retention[0].retained ?? []).map((_, n) => (
                          <th
                            key={n}
                            className="w-12 pb-2 text-center font-medium"
                          >
                            {t("weekN", { n })}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.retention.map((r) => (
                        <tr key={r.week}>
                          <td className="pr-3 py-0.5">{r.week}</td>
                          <td className="pr-3 py-0.5 text-right tabular-nums">
                            {count(r.people)}
                          </td>
                          {(r.retained ?? []).map((v, n) => (
                            <td key={n} className="p-0.5">
                              <div
                                className="rounded py-1 text-center tabular-nums"
                                style={{
                                  backgroundColor:
                                    v == null
                                      ? undefined
                                      : `color-mix(in srgb, var(--color-ink) ${Math.round(
                                          v * 45
                                        )}%, transparent)`,
                                }}
                              >
                                {share(v)}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Block>
            <Block title={t("idle")}>
              <div className="grid gap-2">
                {p.days_since_last.map((b) => (
                  <BarRow
                    key={b.bucket}
                    label={t("daysBucket", { bucket: b.bucket })}
                    value={b.people}
                    max={idle}
                  />
                ))}
              </div>
            </Block>
          </>
        );
      }}
    </SnapshotPanel>
  );
}

function Consent({ params }: { params: Params }) {
  const t = useTranslations("console.statistics.consent");
  return (
    <SnapshotPanel<ConsentPayload>
      panelKey="statistics.consent"
      params={params}
      title={t("title")}
    >
      {(p) => (
        <>
          <Block title={t("people")}>
            <p className="text-[14px]">
              {t("summary", {
                people: count(p.people),
                newsletter: count(p.newsletter.people),
              })}
            </p>
          </Block>
          <Block title={t("versions")}>
            <CountTable
              rows={p.versions}
              label={(r) => r.version}
              columns={[{ key: "people", title: t("peopleColumn") }]}
            />
          </Block>
          <Block title={t("research")}>
            <CountTable
              rows={p.research}
              label={(r) => (r.version === "none" ? t("none") : r.version)}
              columns={[{ key: "people", title: t("peopleColumn") }]}
            />
          </Block>
          <Block title={t("erasures")}>
            {p.erasures.length === 0 ? (
              <p className="text-[13px] text-ink-3">{t("noErasures")}</p>
            ) : (
              <CountTable
                rows={p.erasures}
                label={(r) => r.month.slice(0, 7)}
                columns={[{ key: "erasures", title: t("erasuresColumn") }]}
              />
            )}
          </Block>
        </>
      )}
    </SnapshotPanel>
  );
}

/** What every number means, from the backend's one definitions module. */
function DefinitionsSection({ defs }: { defs: Definitions | undefined }) {
  const t = useTranslations("console.statistics.definitions");
  if (!defs) return null;
  const items = [
    t("people", { patterns: defs.test_email_patterns.join(", ") }),
    t("session"),
    t("active"),
    t("retained", { last: defs.retention_weeks - 1 }),
    t("weeks"),
    t("accepted"),
    t("verified"),
    t("sessionsSteps"),
    t("small", { min: defs.min_people }),
    t("erasures"),
  ];
  return (
    <ul className="grid max-w-3xl gap-3 text-[14px] text-ink-2">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

/**
 * Statistics: how the product is used, and whether its data is any good. Each report is
 * a snapshot for one period and cohort; nothing refreshes on its own, and "Refresh all"
 * runs the reports one after the other.
 */
export function StatisticsApp({ semver }: AppPageProps) {
  const t = useTranslations("console.statistics");
  const errorText = useErrorText();
  const refresh = useRefresh();
  const defs = useQuery({
    queryKey: ["stats-definitions"],
    queryFn: () => ops.get<Definitions>("stats/definitions"),
  });
  const [weeks, setWeeks] = useState<string>("13");
  const [cohort, setCohort] = useState("");
  // The cohort list reads the product: only once someone opens the picker.
  const [wantCohorts, setWantCohorts] = useState(false);
  const cohorts = useQuery({
    queryKey: ["stats-cohorts"],
    queryFn: () => ops.get<Cohort[]>("stats/cohorts"),
    enabled: wantCohorts,
  });
  const params: Params = cohort
    ? { weeks: Number(weeks), cohort }
    : { weeks: Number(weeks) };
  const [step, setStep] = useState(0);
  const all = useMutation({
    mutationFn: async () => {
      for (const [i, report] of REPORTS.entries()) {
        setStep(i + 1);
        await refresh.mutateAsync({ key: `statistics.${report}`, params });
      }
    },
    onSettled: () => setStep(0),
  });
  const choices = (defs.data?.week_choices ?? [4, 13, 26, 52]).map(String);
  return (
    <div data-version={semver} className="grid max-w-5xl gap-6">
      <p className="text-ink-2">{t("intro")}</p>
      <div className="flex flex-wrap items-end gap-4">
        <Field label={t("period")}>
          <Segmented
            label={t("period")}
            value={weeks}
            onChange={setWeeks}
            options={choices.map((w) => ({
              value: w,
              label: t("weeks", { n: Number(w) }),
            }))}
          />
        </Field>
        <Field label={t("cohort")}>
          <Select
            value={cohort}
            onFocus={() => setWantCohorts(true)}
            onMouseDown={() => setWantCohorts(true)}
            onChange={(e) => setCohort(e.target.value)}
          >
            <option value="">{t("everyone")}</option>
            {cohort && !cohorts.data && (
              <option value={cohort}>{cohort}</option>
            )}
            {(cohorts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          disabled={all.isPending}
          onClick={() => all.mutate()}
        >
          {all.isPending
            ? t("refreshing", { step, total: REPORTS.length })
            : t("refreshAll")}
        </Button>
      </div>
      {(all.isError || cohorts.isError) && (
        <ErrorBanner message={errorText(all.error ?? cohorts.error)} />
      )}
      <p className={cn("text-[13px] text-ink-3")}>{t("snapshotsNote")}</p>
      <Sections
        label={t("reports")}
        sections={[
          {
            id: "acquisition",
            label: t("acquisition.title"),
            render: () => <Acquisition params={params} />,
          },
          {
            id: "engagement",
            label: t("engagement.title"),
            render: () => <Engagement params={params} />,
          },
          {
            id: "consent",
            label: t("consent.title"),
            render: () => <Consent params={params} />,
          },
          {
            id: "definitions",
            label: t("definitions.title"),
            render: () => <DefinitionsSection defs={defs.data} />,
          },
        ]}
      />
    </div>
  );
}
