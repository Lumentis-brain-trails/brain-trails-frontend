"use client";

import { useTranslations } from "next-intl";
import { Bars, Sparkline } from "@console/components/Charts";
import {
  type SignupsPayload,
  type WeeklyPayload,
  count,
  series,
} from "./lib/stats";

/** "Sign-ups (14 days)": people registered, one bar a day. */
export function SignupsWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.statistics.widgets");
  const p = payload as unknown as SignupsPayload;
  return (
    <div>
      <p className="type-figure">{count(p.people)}</p>
      <Bars
        values={series(p.per_day.map((d) => d.people))}
        label={t("signups")}
      />
    </div>
  );
}

/** Last complete week's figure and eight weeks of it, for sessions or active people. */
function WeeklyWidget({
  payload,
  field,
}: {
  payload: Record<string, unknown>;
  field: "sessions" | "people";
}) {
  const t = useTranslations("console.statistics.widgets");
  const p = payload as unknown as WeeklyPayload;
  return (
    <div>
      <p className="type-figure">{count(p.last_week?.[field])}</p>
      <p className="text-[12px] text-ink-3">
        {t("lastWeek", { week: p.last_week?.week ?? "–" })}
      </p>
      <Sparkline
        values={series(p.per_week.map((w) => w[field]))}
        label={t(field === "sessions" ? "sessions" : "active")}
      />
    </div>
  );
}

export function SessionsWeekWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  return <WeeklyWidget payload={payload} field="sessions" />;
}

export function ActiveWeekWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  return <WeeklyWidget payload={payload} field="people" />;
}
