"use client";

/**
 * What the patient sees after a session (backend T6, V4-0006): that it is done, their
 * streak, and - when their carer shares a summary and `client_summary` is on - their
 * landscape before and after, as a picture. No numbers, no labels, no comparison with
 * anyone (QUESTIONS C2). With nothing shared the list is empty and the shell says "done".
 */

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui";
import { useFeature } from "@/lib/features";
import { type Summary, useMySummaries } from "@/lib/therapy";

export function AfterSession() {
  const t = useTranslations("therapy.after");
  const on = useFeature("client_summary");
  const summaries = useMySummaries(on);
  if (!on || !summaries.data?.length) return null;
  const completed = summaries.data.find((s) => s.kind === "completed");
  const change = summaries.data.find((s) => s.kind === "landscape_change");
  const streak = Number(
    (completed?.payload as { streak_days?: number } | undefined)?.streak_days ??
      0
  );
  return (
    <Card className="space-y-4">
      <h2 className="type-heading">{t("title")}</h2>
      {completed && (
        <p className="text-ink-2">
          {streak > 1 ? t("streak", { n: streak }) : t("done")}
        </p>
      )}
      {change && <LandscapeChange summary={change} />}
    </Card>
  );
}

function LandscapeChange({ summary }: { summary: Summary }) {
  const t = useTranslations("therapy.after");
  const payload = summary.payload as {
    before?: number[][];
    after?: number[][];
  };
  if (!payload.before || !payload.after) return null;
  return (
    <figure className="space-y-2">
      <div className="flex items-center justify-center gap-6">
        <Picture grid={payload.before} label={t("before")} />
        <span aria-hidden className="text-ink-3">
          →
        </span>
        <Picture grid={payload.after} label={t("after")} />
      </div>
      <figcaption className="type-caption text-center text-ink-3">
        {t("changed")}
      </figcaption>
    </figure>
  );
}

const SHADES = [
  "transparent",
  "var(--accent-soft)",
  "var(--accent)",
  "var(--ink)",
];

/** A coarse grid of levels as soft squares: a shape to look at, nothing to read. */
function Picture({ grid, label }: { grid: number[][]; label: string }) {
  const n = grid.length || 1;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n} ${n}`}
      className="h-28 w-28 rounded-2xl bg-surface-2"
    >
      {grid.flatMap((row, i) =>
        row.map((level, j) => (
          <rect
            key={`${i}-${j}`}
            x={j + 0.08}
            y={n - 1 - i + 0.08}
            width={0.84}
            height={0.84}
            rx={0.3}
            fill={SHADES[level] ?? SHADES[0]}
            opacity={level === 3 ? 0.55 : 1}
          />
        ))
      )}
    </svg>
  );
}
