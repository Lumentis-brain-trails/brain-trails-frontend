"use client";

/**
 * The live trail (T5): the session's own adaptive PCA as the worker draws it, in the
 * trail's colours from the first window (warm) to the last (cool), marked live until
 * the final frame. Plain SVG: a few hundred points a second at most, nothing to load.
 *
 * The tip (T4b) is drawn dashed after the final points: the newest windows, on screen
 * about a second after the signal, which the final points replace once the smoothing
 * has the windows after them. The caption says the worker's lag for it.
 */

import { useTranslations } from "next-intl";
import { useChartTheme, trailHexAt } from "@/lib/theme";

export function LiveTrail({
  x,
  y,
  final,
  tip = null,
  lagMs = null,
  height = 320,
}: {
  x: readonly number[];
  y: readonly number[];
  final: boolean;
  tip?: { from: number; x: readonly number[]; y: readonly number[] } | null;
  lagMs?: number | null;
  height?: number;
}) {
  const t = useTranslations("live.console");
  const theme = useChartTheme();
  const finite = ([a, b]: readonly [number, number]) =>
    Number.isFinite(a) && Number.isFinite(b);
  const points = x.map((px, i) => [px, y[i]] as const).filter(finite);
  // only the tip's windows the final trail has not reached yet
  const ahead =
    final || !tip
      ? []
      : tip.x
          .map((px, k) => [tip.from + k, px, tip.y[k]] as const)
          .filter(([i]) => i >= x.length)
          .map(([, px, py]) => [px, py] as const)
          .filter(finite);
  if (points.length + ahead.length < 2)
    return (
      <div
        className="flex items-center justify-center rounded-[var(--radius-card)] bg-surface-2 text-[14px] text-ink-3"
        style={{ height }}
      >
        {t("noTrail")}
      </div>
    );
  const all = [...points, ...ahead];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pad = 0.06;
  const w = x1 - x0 || 1;
  const h = y1 - y0 || 1;
  const sx = (v: number) => ((v - x0) / w) * (1 - 2 * pad) + pad;
  const sy = (v: number) => 1 - (((v - y0) / h) * (1 - 2 * pad) + pad);
  const n = points.length;
  const dashed = n ? [points[n - 1], ...ahead] : ahead;
  const newest = all[all.length - 1];
  const tipColor = trailHexAt(theme.trail, 1);
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
        {dashed.slice(1).map(([px, py], i) => {
          const [qx, qy] = dashed[i];
          return (
            <line
              key={`tip-${i}`}
              data-tip=""
              x1={sx(qx)}
              y1={sy(qy)}
              x2={sx(px)}
              y2={sy(py)}
              stroke={tipColor}
              strokeOpacity={0.75}
              strokeWidth={0.005}
              strokeDasharray="0.012 0.01"
              strokeLinecap="round"
            />
          );
        })}
        <circle
          cx={sx(newest[0])}
          cy={sy(newest[1])}
          r={0.012}
          fill={tipColor}
        />
      </svg>
      <figcaption className="type-caption absolute top-2 right-3 text-ink-3">
        {final
          ? t("final")
          : lagMs === null
            ? t("liveMark")
            : t("liveLag", { s: Math.round(lagMs / 100) / 10 })}
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
