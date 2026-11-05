"use client";

import { useFormatter, useTranslations } from "next-intl";
import { daysBetween } from "./lib/gantt";

/** The `next` panel's payload (backend `console.apps.roadmap.data.summary`). */
export interface NextPayload {
  today: string;
  updated: string;
  next_milestones: { date: string; name: string; track: string }[];
  counts: Record<string, number>;
}

/** "Next milestone": days to it and its name, with the items in review and planned. */
export function NextMilestoneWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.roadmap.widget");
  const format = useFormatter();
  const p = payload as unknown as NextPayload;
  const next = p.next_milestones[0];
  if (!next) return <p className="text-[13px] text-ink-3">{t("none")}</p>;
  const days = daysBetween(p.today, next.date);
  return (
    <div>
      <p className="type-figure">
        {days === 0 ? t("today") : t("inDays", { days })}
      </p>
      <p className="text-[12px] text-ink-2">
        {format.dateTime(new Date(`${next.date}T12:00:00Z`), {
          day: "numeric",
          month: "short",
        })}{" "}
        · {next.name}
      </p>
      <p className="text-[12px] text-ink-3">
        {t("counts", {
          review: p.counts.review ?? 0,
          planned: p.counts.planned ?? 0,
        })}
      </p>
    </div>
  );
}
