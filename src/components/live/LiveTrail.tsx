"use client";

/**
 * The live trail (T5, T4b): the session's own adaptive PCA as the worker draws it, in
 * the trail's colours from the first window (warm) to the last (cool), marked live until
 * the final frame. Each point is the mean of the windows behind it, final when it comes
 * (V4-0004, amended 2026-11-10), so nothing here is provisional.
 *
 * Drawn as a continuous curve, gliding from one picture to the next (`smoothPath`): the
 * projection's refresh moves every point a little each second, and the newest segment
 * grows out of the previous end instead of appearing. No glide under reduced motion.
 * Plain SVG: a few hundred points at most, nothing to load.
 */

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Point, curveSegments, interpolate } from "@/lib/live/smoothPath";
import { useChartTheme, trailHexAt } from "@/lib/theme";

/** How long a new picture takes to settle, in ms: under the 1 s between windows. */
export const GLIDE_MS = 900;

function reducedMotion(): boolean {
  return (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** `target` as drawn now: gliding from the last picture drawn to it. */
function useGlide(target: readonly Point[]): readonly Point[] {
  const [drawn, setDrawn] = useState<readonly Point[]>(target);
  const drawnRef = useRef(drawn);
  useEffect(() => {
    drawnRef.current = drawn;
  }, [drawn]);
  const still = reducedMotion();
  useEffect(() => {
    if (still) return;
    const from = drawnRef.current;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = (now - started) / GLIDE_MS;
      setDrawn(interpolate(from, target, t));
      if (t < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [still, target]);
  // the first picture is drawn as it is: there is nothing to glide from
  return still || drawn.length === 0 ? target : drawn;
}

export function LiveTrail({
  x,
  y,
  final,
  lagMs = null,
  height = 320,
  compact = false,
}: {
  x: readonly number[];
  y: readonly number[];
  final: boolean;
  lagMs?: number | null;
  height?: number;
  /** The small view over a run (no caption, no empty-state text). */
  compact?: boolean;
}) {
  const t = useTranslations("live.console");
  const theme = useChartTheme();
  const target = useMemo<readonly Point[]>(
    () =>
      x
        .map((px, i) => [px, y[i]] as const)
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)),
    [x, y]
  );
  const points = useGlide(target);
  if (points.length < 2)
    return compact ? null : (
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
  const segments = curveSegments(points);
  const at = ([px, py]: Point) => `${sx(px)} ${sy(py)}`;
  return (
    <figure className="relative">
      <svg
        role="img"
        aria-label={t("trailAria", { n })}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className={
          compact
            ? "w-full rounded-[var(--radius-card)]"
            : "w-full rounded-[var(--radius-card)] bg-surface-2"
        }
        style={{ height }}
      >
        {segments.map(([p0, c1, c2, p1], i) => (
          <path
            key={i}
            d={`M ${at(p0)} C ${at(c1)} ${at(c2)} ${at(p1)}`}
            fill="none"
            stroke={trailHexAt(theme.trail, i / Math.max(1, n - 2))}
            strokeWidth={compact ? 0.012 : 0.006}
            strokeLinecap="round"
          />
        ))}
        <circle
          cx={sx(points[n - 1][0])}
          cy={sy(points[n - 1][1])}
          r={compact ? 0.02 : 0.012}
          fill={trailHexAt(theme.trail, 1)}
        />
      </svg>
      {!compact && (
        <figcaption className="type-caption absolute top-2 right-3 text-ink-3">
          {final
            ? t("final")
            : lagMs === null
              ? t("liveMark")
              : t("liveLag", { s: Math.round(lagMs / 100) / 10 })}
        </figcaption>
      )}
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
