"use client";

/**
 * Narrowing a column's block: a stretch of it, and - for a task block - the kinds of
 * trial to keep.
 *
 * Two sliders bound the stretch; the label chips are both the trail's legend (colour for
 * what was on screen, marker for what was done, how many windows in the stretch) and the
 * filter: pressing one takes its windows and trials out of every number in the column.
 * Everything the column shows follows (`lib/compare/selection.ts`).
 */
import { useTranslations } from "next-intl";
import { useLabelNamer } from "@/components/compare/useLabelNamer";
import { formatClock } from "@/lib/builder/draft";
import { groupSlot, legend, markerOf, parseLabel } from "@/lib/compare/labels";
import {
  type Focus,
  focusRange,
  isNarrowed,
  toggleLabel,
} from "@/lib/compare/selection";
import { useChartTheme } from "@/lib/theme";

export function FocusControls({
  block,
  focus,
  onChange,
  windowT,
  windowLabels,
  groups,
  step,
  title,
}: {
  block: { t_start_s: number; t_end_s: number };
  focus: Focus;
  onChange: (focus: Focus) => void;
  /** Start of every window of the block, session seconds. */
  windowT: readonly number[];
  /** The label of every window of the block, or null for a block without trials. */
  windowLabels: readonly (string | null)[] | null;
  groups: readonly string[];
  /** The windows' step, seconds: the sliders move by it. */
  step: number;
  title: string;
}) {
  const tr = useTranslations("compare");
  const theme = useChartTheme();
  const namer = useLabelNamer();
  const [from, to] = focusRange(block, focus);
  const gap = Math.max(step, 1);

  const setRange = (a: number, b: number) => {
    const whole = a <= block.t_start_s && b >= block.t_end_s;
    onChange({ ...focus, range: whole ? null : [a, b] });
  };

  // counts in the stretch: what a chip is worth under the current range
  const inRange = windowLabels
    ? windowLabels.filter((_, i) => windowT[i] >= from && windowT[i] < to)
    : null;
  const available = windowLabels
    ? legend(windowLabels, groups).map((e) => e.label)
    : [];
  const kept = new Set(focus.labels ?? available);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="type-caption flex justify-between text-ink-3">
            <span>{tr("focus.from")}</span>
            <span className="tabular-nums">
              {formatClock(from - block.t_start_s)}
            </span>
          </span>
          <input
            type="range"
            min={block.t_start_s}
            max={block.t_end_s}
            step={step || 1}
            value={from}
            onChange={(e) =>
              setRange(Math.min(Number(e.target.value), to - gap), to)
            }
            className="w-full accent-[var(--accent)]"
            aria-label={`${tr("focus.from")} · ${title}`}
          />
        </label>
        <label className="block">
          <span className="type-caption flex justify-between text-ink-3">
            <span>{tr("focus.to")}</span>
            <span className="tabular-nums">
              {formatClock(to - block.t_start_s)}
            </span>
          </span>
          <input
            type="range"
            min={block.t_start_s}
            max={block.t_end_s}
            step={step || 1}
            value={to}
            onChange={(e) =>
              setRange(from, Math.max(Number(e.target.value), from + gap))
            }
            className="w-full accent-[var(--accent)]"
            aria-label={`${tr("focus.to")} · ${title}`}
          />
        </label>
      </div>

      {inRange && available.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5"
          aria-label={tr("focus.labels", { block: title })}
        >
          {legend(inRange, groups).length === 0 && (
            <li className="type-caption text-ink-3">{tr("focus.noTrials")}</li>
          )}
          {available.map((label) => {
            const { group, act } = parseLabel(label);
            const slot = groupSlot(groups, group);
            const colour = slot === null ? theme.ink3 : theme.labels[slot];
            const on = kept.has(label);
            const count = inRange.filter((l) => l === label).length;
            return (
              <li key={label}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(toggleLabel(focus, label, available))}
                  className={`pressable type-caption flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                    on
                      ? "border-hairline-strong bg-surface text-ink-2"
                      : "border-dashed border-hairline text-ink-3 line-through opacity-60"
                  }`}
                >
                  <Swatch marker={markerOf(act)} colour={colour} />
                  {namer.label(label)}
                  <span className="tabular-nums text-ink-3">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isNarrowed(block, focus) && (
        <button
          type="button"
          onClick={() => onChange({ range: null, labels: null })}
          className="type-caption font-medium text-accent hover:underline"
        >
          {tr("focus.reset")}
        </button>
      )}
    </div>
  );
}

/** A label's colour and marker, as the trail draws them. */
export function Swatch({
  marker,
  colour,
}: {
  marker: "dot" | "ring" | "diamond";
  colour: string;
}) {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden>
      {marker === "ring" ? (
        <circle
          cx={6}
          cy={6}
          r={4}
          fill="none"
          stroke={colour}
          strokeWidth={2}
        />
      ) : marker === "diamond" ? (
        <rect
          x={2.5}
          y={2.5}
          width={7}
          height={7}
          transform="rotate(45 6 6)"
          fill={colour}
        />
      ) : (
        <circle cx={6} cy={6} r={4.5} fill={colour} />
      )}
    </svg>
  );
}
