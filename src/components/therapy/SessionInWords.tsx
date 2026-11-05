"use client";

/**
 * A session in plain words, for the therapy edition's review (backend T6): how good the
 * signal was, the named measures of this session, and how each moved since the session
 * before - with the full metrics of the page below, one click away. Read from the
 * patient's timeline, so the words here and on the patient page are the same.
 */

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { formatMeasure, useTimeline } from "@/lib/therapy";

export function SessionInWords({
  subjectId,
  sessionId,
}: {
  subjectId: string;
  sessionId: string;
}) {
  const t = useTranslations("therapy");
  const timeline = useTimeline(subjectId, true, 52);
  const data = timeline.data;
  if (!data) return null;
  const index = data.sessions.findIndex((s) => s.id === sessionId);
  const session = data.sessions[index];
  if (!session) return null;
  const before = data.sessions
    .slice(0, index)
    .reverse()
    .map((s) => s.measures);
  const label = (key: string) => {
    const measure = data.measures.find((m) => m.key === key);
    return measure
      ? `${t(`families.${measure.family as "session"}`)} · ${t(`metrics.${measure.metric as "d_prime"}`)}`
      : key;
  };
  const metricOf = (key: string) =>
    data.measures.find((m) => m.key === key)?.metric ?? "";
  return (
    <Card className="mb-6 space-y-3">
      <h2 className="type-subhead">{t("words.title")}</h2>
      <p className="text-ink">
        {t(`words.verdict.${(session.verdict ?? "unknown") as "good"}`)}
      </p>
      <ul className="space-y-1 text-[14px]">
        {Object.entries(session.measures).map(([key, value]) => {
          const previous = before.find((m) => key in m)?.[key];
          const metric = metricOf(key);
          return (
            <li key={key}>
              <span className="font-medium">{label(key)}</span>
              {": "}
              {formatMeasure(metric, value)}
              {previous !== undefined && (
                <span className="text-ink-3">
                  {" "}
                  {t("words.before", {
                    value: formatMeasure(metric, previous),
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="type-caption text-ink-3">{t("words.full")}</p>
    </Card>
  );
}
