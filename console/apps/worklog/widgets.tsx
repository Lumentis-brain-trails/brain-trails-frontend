"use client";

import { useTranslations } from "next-intl";
import { Bars } from "@console/components/Charts";
import { tokens } from "@console/lib/format";
import type { TokensWeekPayload, WeekPayload } from "./lib/worklog";

/** "Work this week": entries, how many are done, days worked. */
export function WorkWeekWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.worklog.widgets");
  const week = payload as unknown as WeekPayload;
  return (
    <div>
      <p className="type-figure">{week.entries}</p>
      <p className="text-[12px] text-ink-3">
        {t("workWeek", {
          done: week.done,
          open: week.in_progress,
          days: week.days_worked,
        })}
      </p>
    </div>
  );
}

/** "Tokens this week": the total and one bar a day, Monday to Sunday. */
export function TokensWeekWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.worklog.widgets");
  const week = payload as unknown as TokensWeekPayload;
  return (
    <div>
      <p className="type-figure">{tokens(week.tokens_new)}</p>
      <Bars
        values={week.per_day.map((d) => d.tokens_new)}
        label={t("tokensWeekChart")}
      />
    </div>
  );
}
