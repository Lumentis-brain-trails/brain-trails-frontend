"use client";

/**
 * Two blocks of one recording, side by side: the recording page's main view.
 *
 * Two floating columns, one per block, whose rows line up across them (one grid, each
 * column a subgrid, so a tall cell on the left pushes the same row down on the right):
 *
 * 1. the block, chosen from the ones the run actually played;
 * 2. its stretch of the brain trail, on the session's terrain, with a slider through it;
 * 3. what was on screen at the slider's moment;
 * 4. then rows the reader adds and removes - band power, neurometrics, task scores -
 *    each one number per block on a scale both columns share.
 *
 * Each column keeps its own moment: the two blocks have their own lengths, and a shared
 * clock would pin one of them to a time it does not have. The chosen rows are
 * remembered in this browser (`lib/compare/rows.ts`).
 */
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { BlockFrame, type FrameVideo } from "@/components/compare/BlockFrame";
import { BlockTrail, blockWindows } from "@/components/compare/BlockTrail";
import {
  type BandSeries,
  MetricCell,
  NormMark,
} from "@/components/compare/MetricCell";
import { Select } from "@/components/ui";
import { formatClock } from "@/lib/builder/draft";
import {
  groupSlot,
  labelGroups,
  legend,
  markerOf,
  parseLabel,
} from "@/lib/compare/labels";
import {
  type BlockMetrics,
  ROW_GROUPS,
  ROWS,
  type RowId,
  readRows,
  rowSpec,
  writeRows,
} from "@/lib/compare/rows";
import type { WireEvent } from "@/lib/protocol/marker";
import { useChartTheme } from "@/lib/theme";
import type { Analysis } from "@/lib/types";

/** Rows above the reader's own: the block, its trail, what was on screen. */
const FIXED_ROWS = 3;

/** A step of the plan the browser ran, as far as this view reads it. */
export interface PlanStep {
  kind?: string;
  label?: string;
  config?: Record<string, unknown>;
}

/** Left: the first baseline (the reference state); right: the first task, else the next. */
export function defaultPair(blocks: readonly BlockMetrics[]): [string, string] {
  const left =
    blocks.find((b) => b.kind === "baseline")?.key ?? blocks[0]?.key ?? "";
  const right =
    blocks.find((b) => b.key !== left && b.behaviour)?.key ??
    blocks.find((b) => b.key !== left)?.key ??
    left;
  return [left, right];
}

export function CompareView({
  analysis,
  blocks,
  events,
  steps,
  bands,
  videoAt,
}: {
  analysis: Analysis;
  blocks: readonly BlockMetrics[];
  events: readonly WireEvent[];
  /** The plan's steps by block id, for each block's kind and config. */
  steps: Readonly<Record<string, PlanStep>>;
  /** Relative power per band across the session, channels averaged. */
  bands: Readonly<Record<string, BandSeries>> | null;
  /** The video on screen at a session time, if any. */
  videoAt: (t: number) => FrameVideo | null;
}) {
  const tr = useTranslations("compare");
  const [pair, setPair] = useState(() => defaultPair(blocks));
  const [moments, setMoments] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<RowId[]>(() => readRows());
  const groups = useMemo(
    () => labelGroups(blocks.map((b) => b.labels)),
    [blocks]
  );

  const byKey = (key: string) => blocks.find((b) => b.key === key) ?? blocks[0];
  const columns = pair.map(byKey);

  const updateRows = (next: RowId[]) => {
    setRows(next);
    writeRows(next);
  };
  const available = ROWS.filter((r) => !rows.includes(r.id));

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-2 gap-3 sm:gap-5"
        style={{
          gridTemplateRows: `repeat(${FIXED_ROWS + rows.length}, auto)`,
        }}
      >
        {columns.map((block, side) => {
          const other = columns[1 - side] ?? null;
          const t = moments[`${side}:${block.key}`] ?? block.t_start_s;
          const setT = (next: number) =>
            setMoments((m) => ({
              ...m,
              [`${side}:${block.key}`]: Math.min(
                block.t_end_s,
                Math.max(block.t_start_s, next)
              ),
            }));
          const step = steps[block.block_id] ?? {};
          const title = block.label ?? block.block_id;
          return (
            <section
              key={side}
              aria-label={tr(side === 0 ? "left" : "right")}
              className="grid min-w-0 grid-rows-subgrid gap-y-3 rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-(--shadow-card) sm:p-5"
              style={{ gridRow: "1 / -1" }}
            >
              <BlockPicker
                blocks={blocks}
                value={block.key}
                label={tr(side === 0 ? "left" : "right")}
                onChange={(key) =>
                  setPair((p) => (side === 0 ? [key, p[1]] : [p[0], key]))
                }
              />

              <div className="min-w-0 space-y-2">
                <h3 className="type-caption font-medium text-ink-3">
                  {tr("trail")}
                </h3>
                <BlockTrail
                  analysis={analysis}
                  block={block}
                  labels={block.labels}
                  groups={groups}
                  t={t}
                  onSeek={setT}
                  title={tr("trailAria", { block: title })}
                />
                <label className="block">
                  <span className="type-caption flex justify-between text-ink-3">
                    <span>{tr("cursor")}</span>
                    <span className="tabular-nums">
                      {tr("cursorValue", {
                        at: formatClock(t - block.t_start_s),
                        total: formatClock(block.t_end_s - block.t_start_s),
                      })}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={block.t_start_s}
                    max={block.t_end_s}
                    step={analysis.step_s || 1}
                    value={t}
                    onChange={(e) => setT(Number(e.target.value))}
                    className="mt-1 w-full accent-[var(--accent)]"
                    aria-label={`${tr("cursor")} · ${title}`}
                  />
                </label>
                <TrailLegend
                  labels={block.labels ?? null}
                  groups={groups}
                  empty={blockWindows(analysis.points, block).length === 0}
                />
              </div>

              <div className="min-w-0 space-y-2">
                <h3 className="type-caption font-medium text-ink-3">
                  {tr("onScreen")}
                </h3>
                <BlockFrame
                  kind={step.kind ?? block.kind}
                  label={title}
                  config={step.config ?? null}
                  events={events}
                  block={block}
                  t={t}
                  video={videoAt(t)}
                />
              </div>

              {rows.map((id) => (
                <MetricCell
                  key={id}
                  spec={rowSpec(id)}
                  block={block}
                  other={other}
                  series={bands?.[id] ?? null}
                  t={t}
                  onRemove={() => updateRows(rows.filter((r) => r !== id))}
                />
              ))}
            </section>
          );
        })}
      </div>

      {available.length > 0 && (
        <div className="flex justify-center">
          <label className="w-full max-w-xs">
            <span className="sr-only">{tr("addRow")}</span>
            <Select
              value=""
              aria-label={tr("addRow")}
              onChange={(e) => {
                const id = e.target.value as RowId;
                if (id) updateRows([...rows, id]);
              }}
            >
              <option value="">{`+ ${tr("addRow")}`}</option>
              {ROW_GROUPS.map((group) => {
                const options = available.filter((r) => r.group === group);
                if (options.length === 0) return null;
                return (
                  <optgroup key={group} label={tr(`groups.${group}`)}>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>
                        {tr(`rows.${r.id}.name`)}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </label>
        </div>
      )}

      <BarKey />
      <p className="type-caption text-center text-ink-3">{tr("disclaimer")}</p>
    </div>
  );
}

function BlockPicker({
  blocks,
  value,
  label,
  onChange,
}: {
  blocks: readonly BlockMetrics[];
  value: string;
  label: string;
  onChange: (key: string) => void;
}) {
  const tr = useTranslations("compare");
  const block = blocks.find((b) => b.key === value);
  return (
    <div className="min-w-0 space-y-1">
      <Select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="font-semibold"
      >
        {blocks.map((b) => (
          <option key={b.key} value={b.key}>
            {tr("blockOption", {
              label: b.label ?? b.block_id,
              start: formatClock(b.t_start_s),
            })}
          </option>
        ))}
      </Select>
      {block && (
        <p className="type-caption px-1 text-ink-3">
          {tr("blockMeta", {
            duration: formatClock(block.t_end_s - block.t_start_s),
            windows: block.n_windows,
          })}
        </p>
      )}
    </div>
  );
}

/** What the trail's colours and markers mean in this block, with how many windows each. */
function TrailLegend({
  labels,
  groups,
  empty,
}: {
  labels: readonly (string | null)[] | null;
  groups: readonly string[];
  empty: boolean;
}) {
  const tr = useTranslations("compare");
  const theme = useChartTheme();
  if (empty) return null;
  if (!labels) return <p className="type-caption text-ink-3">{tr("byTime")}</p>;
  const entries = legend(labels, groups);
  const named = (label: string) => {
    const key = `labels.${label}`;
    if (tr.has(key as never)) return tr(key as never);
    const { group, act } = parseLabel(label);
    return act ? `${group} · ${tr(`labels.${act}`)}` : group;
  };
  return (
    <ul className="type-caption flex flex-wrap gap-x-3 gap-y-1 text-ink-2">
      {entries.map((entry) => {
        const slot = groupSlot(groups, entry.group);
        const colour = slot === null ? theme.ink3 : theme.labels[slot];
        const marker = markerOf(entry.act);
        return (
          <li key={entry.label} className="flex items-center gap-1.5">
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
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
            <span>
              {named(entry.label)}{" "}
              <span className="tabular-nums text-ink-3">{entry.count}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** How to read a row's bar, said once for every row. */
function BarKey() {
  const tr = useTranslations("compare");
  return (
    <ul className="type-caption flex flex-wrap justify-center gap-x-4 gap-y-1 text-ink-3">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-4 rounded-full bg-ink-2" />
        {tr("key.block")}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-0.5 rounded-full bg-ink-3" />
        {tr("key.other")}
      </li>
      <li className="flex items-center gap-1.5">
        <NormMark />
        {tr("key.average")}
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-3 w-4 rounded-sm bg-higher-soft ring-1 ring-higher"
        />
        {tr("key.higher")}
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-3 w-4 rounded-sm bg-lower-soft ring-1 ring-lower"
        />
        {tr("key.lower")}
      </li>
    </ul>
  );
}
