"use client";

/**
 * One block's value on one row of the comparison view.
 *
 * The number comes with its meaning in a sentence, and with a bar on the scale both
 * columns share: this block's value as the fill, the other block's as a thin tick, and -
 * on a task row - the average person's as a dashed one. Two bars on one scale, a tick
 * for what to read them against, never a verdict.
 *
 * A band row also draws the band across the block, with the cursor on it, from the
 * per-window features: the number is the block's mean, the line is how it got there.
 *
 * The cell's ground says at a glance which block is higher on the row: blue for the
 * higher one, yellow for the lower, nothing when they read the same (`direction`). A
 * direction, not a verdict - higher alpha is not "better" - which is why the pair is
 * blue and yellow rather than green and red, and why the word is written next to the
 * value too, so the colour is never the only carrier.
 */
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { cn } from "@/components/ui";
import {
  type BlockMetrics,
  type RowSpec,
  direction,
  formatValue,
  missingReason,
  position,
  sharedDomain,
} from "@/lib/compare/rows";

/** Fewest other people an average is shown from; mirrors backend `app.norms.MIN_PEOPLE`. */
const MIN_PEOPLE = 10;

export interface BandSeries {
  /** Window start times, session seconds. */
  t: readonly number[];
  /** The band's relative power per window, channels averaged. */
  values: readonly number[];
}

export function MetricCell({
  spec,
  block,
  other,
  series,
  narrowed = false,
  pending = false,
  t,
  onRemove,
}: {
  spec: RowSpec;
  block: BlockMetrics;
  /** The block in the other column, for the tick and the shared scale. */
  other: BlockMetrics | null;
  /** A band row's values across the session, for the line under the number. */
  series?: BandSeries | null;
  /** The column shows part of its block: the whole-block average does not apply. */
  narrowed?: boolean;
  /** The column's numbers are being recomputed for a new focus. */
  pending?: boolean;
  /** Session seconds of this column's cursor. */
  t: number;
  onRemove: () => void;
}) {
  const tr = useTranslations("compare");
  const name = tr(`rows.${spec.id}.name`);
  const value = spec.value(block);
  const otherValue = other ? spec.value(other) : null;
  const norm = block.norm && spec.norm ? spec.norm(block.norm) : null;
  const otherNorm = other?.norm && spec.norm ? spec.norm(other.norm) : null;
  const domain = sharedDomain(spec, [value, otherValue, norm, otherNorm]);
  const way = direction(spec.format, value, otherValue);
  const unit =
    spec.format === "bits" || spec.format === "radii"
      ? ` ${tr(`units.${spec.format}`)}`
      : "";

  return (
    <div
      data-direction={way ?? "none"}
      aria-busy={pending}
      className={cn(
        pending && "opacity-60",
        "min-w-0 space-y-2 rounded-[var(--radius-control)] border p-3 transition-colors duration-(--m-fast)",
        way === "higher"
          ? "border-transparent bg-higher-soft"
          : way === "lower"
            ? "border-transparent bg-lower-soft"
            : "border-hairline"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">{name}</h3>
          <p className="type-caption text-pretty text-ink-3">
            {tr(`rows.${spec.id}.meaning`)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={tr("removeRow", { row: name })}
          className="pressable -mt-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {value === null ? (
        <p className="text-[14px] text-ink-3">
          {pending && missingReason(spec, block) !== "not_task"
            ? tr("missing.computing")
            : tr(`missing.${missingReason(spec, block)}`)}
        </p>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[22px] leading-none font-semibold tabular-nums">
              {formatValue(spec.format, value)}
              {unit && (
                <span className="text-[13px] font-normal text-ink-3">
                  {unit}
                </span>
              )}
            </span>
            {(way === "higher" || way === "lower") && (
              <span
                className={cn(
                  "text-[12px] font-semibold",
                  way === "higher" ? "text-higher-ink" : "text-lower-ink"
                )}
              >
                {way === "higher" ? "▲" : "▼"} {tr(`direction.${way}`)}
              </span>
            )}
          </p>
          <Bar
            value={position(value, domain)}
            other={otherValue === null ? null : position(otherValue, domain)}
            norm={norm === null ? null : position(norm, domain)}
            otherLabel={tr("otherBlock")}
          />
        </>
      )}

      {spec.group === "task" && value !== null && (
        <p className="type-caption text-ink-3">
          {narrowed
            ? tr("averageWholeOnly")
            : block.norm == null || block.norm.n_people === 0
              ? tr("noAverage")
              : norm === null
                ? tr("averagePending", {
                    min: MIN_PEOPLE,
                    n: block.norm.n_people,
                  })
                : tr("averagePerson", {
                    value: formatValue(spec.format, norm),
                    n: block.norm.n_people,
                  })}
        </p>
      )}

      {series && series.values.length > 1 && (
        <Sparkline series={series} block={block} t={t} label={name} />
      )}
    </div>
  );
}

/** This block's value as a fill; the other block's and the average person's as ticks. */
function Bar({
  value,
  other,
  norm,
  otherLabel,
}: {
  value: number;
  other: number | null;
  norm: number | null;
  otherLabel: string;
}) {
  return (
    <div className="relative mb-3 h-2.5 rounded-full bg-surface-2">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-ink-2"
        style={{ width: `${Math.max(2, value * 100)}%` }}
      />
      {other !== null && (
        <div
          title={otherLabel}
          className="absolute -inset-y-1 w-0.5 rounded-full bg-ink-3"
          style={{ left: `calc(${other * 100}% - 1px)` }}
        />
      )}
      {norm !== null && (
        <span
          className="absolute top-full mt-0.5 -translate-x-1/2"
          style={{ left: `${norm * 100}%` }}
        >
          <NormMark className="block h-2 w-2.5" />
        </span>
      )}
    </div>
  );
}

/** The average person's mark: a small triangle pointing up at the bar. */
export function NormMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 8" className={className ?? "h-2 w-2.5"} aria-hidden>
      <path d="M5 0L10 8H0Z" fill="var(--accent)" />
    </svg>
  );
}

const SW = 240;
const SH = 36;

/** The band across the block, with the cursor. Its own vertical scale: shape, not size. */
function Sparkline({
  series,
  block,
  t,
  label,
}: {
  series: BandSeries;
  block: BlockMetrics;
  t: number;
  label: string;
}) {
  const points = useMemo(() => {
    const inside: { t: number; v: number }[] = [];
    series.t.forEach((time, i) => {
      if (time >= block.t_start_s && time < block.t_end_s)
        inside.push({ t: time, v: series.values[i] });
    });
    return inside;
  }, [block.t_end_s, block.t_start_s, series]);
  if (points.length < 2) return null;
  const span = Math.max(1e-6, block.t_end_s - block.t_start_s);
  const lo = Math.min(...points.map((p) => p.v));
  const hi = Math.max(...points.map((p) => p.v));
  const x = (time: number) => ((time - block.t_start_s) / span) * SW;
  const y = (v: number) =>
    SH - 2 - ((v - lo) / Math.max(1e-6, hi - lo)) * (SH - 4);
  const cursor = x(Math.min(block.t_end_s, Math.max(block.t_start_s, t)));
  return (
    <svg
      viewBox={`0 0 ${SW} ${SH}`}
      preserveAspectRatio="none"
      className="h-9 w-full"
      role="img"
      aria-label={label}
    >
      <polyline
        points={points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")}
        fill="none"
        stroke="var(--ink-2)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cursor}
        x2={cursor}
        y1={0}
        y2={SH}
        stroke="var(--ink)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="opacity-60"
      />
    </svg>
  );
}
