"use client";

/**
 * The live trail (T5): the session's own adaptive PCA as the worker draws it, in the
 * trail's colours from the first window (warm) to the last (cool), marked live until
 * the final frame. Plain SVG: a few hundred points a second at most, nothing to load.
 */

import { useTranslations } from "next-intl";
import { useChartTheme, trailHexAt } from "@/lib/theme";

export function LiveTrail({
  x,
  y,
  final,
  height = 320,
}: {
  x: readonly number[];
  y: readonly number[];
  final: boolean;
  height?: number;
}) {
  const t = useTranslations("live.console");
  const theme = useChartTheme();
  const points = x
    .map((px, i) => [px, y[i]] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (points.length < 2)
    return (
      <div
        className="flex items-center justify-center rounded-[var(--radius-card)] bg-surface-2 text-[14px] text-ink-3"
        style={{ height }}
      >
        {t("noTrail")}
      </div>
    );
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pad = 0.06;
  const w = x1 - x0 || 1;
  const h = y1 - y0 || 1;
  const sx = (v: number) => ((v - x0) / w) * (1 - 2 * pad) + pad;
  const sy = (v: number) => 1 - (((v - y0) / h) * (1 - 2 * pad) + pad);
  const n = points.length;
  return (
    <figure className="relative">
      <svg
        role="img"
        aria-label={t("trailAria", { n })}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="w-full rounded-[var(--radius-card)] bg-surface-2"
        style={{ height }}
      >
        {points.slice(1).map(([px, py], i) => {
          const [qx, qy] = points[i];
          return (
            <line
              key={i}
              x1={sx(qx)}
              y1={sy(qy)}
              x2={sx(px)}
              y2={sy(py)}
              stroke={trailHexAt(theme.trail, i / Math.max(1, n - 2))}
              strokeWidth={0.006}
              strokeLinecap="round"
            />
          );
        })}
        <circle
          cx={sx(points[n - 1][0])}
          cy={sy(points[n - 1][1])}
          r={0.012}
          fill={trailHexAt(theme.trail, 1)}
        />
      </svg>
      <figcaption className="type-caption absolute top-2 right-3 text-ink-3">
        {final ? t("final") : t("liveMark")}
      </figcaption>
    </figure>
  );
}

/** Each finished block's own result as the participant's run reported it. */
export function BlockResults({
  results,
  labels,
}: {
  results: readonly {
    stepId: string;
    taskKind: string;
    summary: Record<string, unknown>;
  }[];
  labels: Record<string, string>;
}) {
  const t = useTranslations("live.console.results");
  const pct = (v: unknown) =>
    typeof v === "number" ? `${Math.round(v * 100)}%` : null;
  const ms = (v: unknown) =>
    typeof v === "number" ? `${Math.round(v)} ms` : null;
  return (
    <section aria-label={t("title")}>
      <h2 className="type-subhead mb-3">{t("title")}</h2>
      {results.length === 0 ? (
        <p className="text-[14px] text-ink-3">{t("none")}</p>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => {
            const s = r.summary;
            const parts = [
              pct(s.hitRate) && t("hits", { v: pct(s.hitRate) ?? "" }),
              pct(s.commissionRate) &&
                t("falseAlarms", { v: pct(s.commissionRate) ?? "" }),
              ms(s.medianRtMs) && t("medianRt", { v: ms(s.medianRtMs) ?? "" }),
              s.skipped === true && t("skipped"),
              s.ended_by === "operator" && s.skipped !== true && t("ended"),
            ].filter(Boolean);
            return (
              <li key={r.stepId} className="text-[14px]">
                <span className="font-medium">
                  {labels[r.stepId] ?? r.stepId}
                </span>
                <span className="text-ink-3">
                  {" · "}
                  {parts.length ? parts.join(" · ") : t("done")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
