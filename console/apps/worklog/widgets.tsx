"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bars } from "@console/components/Charts";
import { tokens } from "@console/lib/format";
import {
  type TokensWeekPayload,
  type WeekPayload,
  hoursText,
} from "./lib/worklog";

/** "Work this week": hours worked, entries, how many are done, days worked. */
export function WorkWeekWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.worklog.widgets");
  const locale = useLocale();
  const week = payload as unknown as WeekPayload;
  return (
    <div>
      <p className="type-figure">
        {t("hours", { hours: hoursText(week.minutes ?? 0, locale) })}
      </p>
      <p className="text-[12px] text-ink-3">
        {t("workWeek", {
          entries: week.entries,
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
