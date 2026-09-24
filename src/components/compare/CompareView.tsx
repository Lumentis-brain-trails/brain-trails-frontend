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
 *
 * The trails rest on a 3D terrain: the person's brain landscape - one map of all their
 * recordings, grown session by session (backend V3-0016, V3-0017) - when it already holds
 * this recording, and the session's own terrain until then (the page says which). Both
 * columns share one camera, so turning one turns the other. Without WebGL the trail is
 * drawn flat.
 *
 * Each column can be narrowed (`FocusControls`): a stretch of its block and, for a task
 * block, the kinds of trial to keep. Every number in the column is then the backend's
 * recomputation for that focus (`useSelection`); the average person stays whole-block.
 */
import { useTranslations } from "next-intl";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AddRowMenu } from "@/components/compare/AddRowMenu";
import { FocusControls } from "@/components/compare/FocusControls";
import { useSelection } from "@/components/compare/useSelection";
import { BlockFrame, type FrameVideo } from "@/components/compare/BlockFrame";
import { BlockLandscape } from "@/components/compare/BlockLandscape";
import {
  type Camera,
  DEFAULT_CAMERA,
} from "@/components/compare/LandscapeSurface";
import { BlockTrail, blockWindows } from "@/components/compare/BlockTrail";
import {
  type BandSeries,
  MetricCell,
  NormMark,
} from "@/components/compare/MetricCell";
import { Select } from "@/components/ui";
import {
  type BrainLandscape,
  sessionTerrain,
  supportsWebGL,
} from "@/lib/brainLandscape";
import { formatClock } from "@/lib/builder/draft";
import { labelGroups } from "@/lib/compare/labels";
import {
  type BlockMetrics,
  ROWS,
  type RowId,
  readRows,
  rowSpec,
  writeRows,
} from "@/lib/compare/rows";
import {
  type Focus,
  WHOLE_BLOCK,
  focusRange,
  focusedBlock,
  isNarrowed,
  keptWindows,
} from "@/lib/compare/selection";
import type { WireEvent } from "@/lib/protocol/marker";
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
  recordingId,
  analysis,
  blocks,
  events,
  steps,
  bands,
  videoAt,
  landscape = null,
}: {
  /** The recording the blocks belong to: what the selections are asked of. */
  recordingId: string;
  analysis: Analysis;
  blocks: readonly BlockMetrics[];
  events: readonly WireEvent[];
  /** The plan's steps by block id, for each block's kind and config. */
  steps: Readonly<Record<string, PlanStep>>;
  /** Relative power per band across the session, channels averaged. */
  bands: Readonly<Record<string, BandSeries>> | null;
  /** The video on screen at a session time, if any. */
  videoAt: (t: number) => FrameVideo | null;
  /** The person's brain landscape, with this recording's trail on it when it has one. */
  landscape?: BrainLandscape | null;
}) {
  const tr = useTranslations("compare");
  const [pair, setPair] = useState(() => defaultPair(blocks));
  const [moments, setMoments] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<RowId[]>(() => readRows());
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [focus, setFocus] = useState<[Focus, Focus]>([
    WHOLE_BLOCK,
    WHOLE_BLOCK,
  ]);
  // the server cannot know; hydration takes its answer, then the browser's
  const webgl = useSyncExternalStore(
    noSubscription,
    supportsWebGL,
    () => false
  );
  const onLandscape = Boolean(landscape?.trail);
  // the person's map when it holds this recording, else the session's own terrain
  const terrain = useMemo(
    () => (onLandscape ? landscape : sessionTerrain(analysis)),
    [analysis, landscape, onLandscape]
  );

  const byKey = (key: string) => blocks.find((b) => b.key === key) ?? blocks[0];
  const rowsOf = pair.map(byKey);
  const selections = [
    useSelection(recordingId, rowsOf[0]?.key, focus[0]),
    useSelection(recordingId, rowsOf[1]?.key, focus[1]),
  ];
  // labels: the selection's (computed for every recording), else the stored row's
  const sideLabels = [
    selections[0].data?.window_labels ?? rowsOf[0]?.labels ?? null,
    selections[1].data?.window_labels ?? rowsOf[1]?.labels ?? null,
  ];
  const [leftLabels, rightLabels] = sideLabels;
  const labelsOf = (side: number): readonly (string | null)[] | null =>
    sideLabels[side];
  const groups = labelGroups([
    ...blocks.map((b) => b.labels),
    leftLabels,
    rightLabels,
  ]);
  const columns = rowsOf.map((row, side) =>
    focusedBlock(row, focus[side], selections[side].data)
  );
  const setSideFocus = (side: number, next: Focus) =>
    setFocus((f) => (side === 0 ? [next, f[1]] : [f[0], next]));

  const updateRows = (next: RowId[]) => {
    setRows(next);
    writeRows(next);
  };
  const available = ROWS.filter((r) => !rows.includes(r.id));

  return (
    <div className="space-y-4">
      <p className="type-caption text-center text-ink-3">
        {onLandscape && landscape
          ? tr("onLandscape", { n: landscape.n_recordings })
          : landscape?.pending
            ? tr("landscapePending")
            : tr("onSessionTerrain")}
        {onLandscape && landscape?.change === "redrawn"
          ? ` ${tr("redrawn")}`
          : ""}
      </p>
      <div
        className="grid grid-cols-2 gap-3 sm:gap-5"
        style={{
          gridTemplateRows: `repeat(${FIXED_ROWS + rows.length}, auto)`,
        }}
      >
        {columns.map((block, side) => {
          const row = rowsOf[side];
          const other = columns[1 - side] ?? null;
          const selection = selections[side];
          const [from, to] = focusRange(row, focus[side]);
          const moment = moments[`${side}:${row.key}`] ?? from;
          const t = Math.min(to, Math.max(from, moment));
          const setT = (next: number) =>
            setMoments((m) => ({
              ...m,
              [`${side}:${row.key}`]: Math.min(to, Math.max(from, next)),
            }));
          const step = steps[row.block_id] ?? {};
          const title = row.label ?? row.block_id;
          const labels = labelsOf(side);
          const windowT = blockWindows(analysis.points, row).map(
            (p) => p.t_start
          );
          const kept = keptWindows(windowT, labels, row, focus[side]);
          return (
            <section
              key={side}
              aria-label={tr(side === 0 ? "left" : "right")}
              className="grid min-w-0 grid-rows-subgrid gap-y-3 rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-(--shadow-card) sm:p-5"
              style={{ gridRow: "1 / -1" }}
            >
              <div className="min-w-0 space-y-3">
                <BlockPicker
                  blocks={blocks}
                  value={row.key}
                  label={tr(side === 0 ? "left" : "right")}
                  onChange={(key) => {
                    setPair((p) => (side === 0 ? [key, p[1]] : [p[0], key]));
                    setSideFocus(side, WHOLE_BLOCK);
                  }}
                />
                <FocusControls
                  block={row}
                  focus={focus[side]}
                  onChange={(next) => setSideFocus(side, next)}
                  windowT={windowT}
                  windowLabels={labels}
                  groups={groups}
                  step={analysis.step_s || 1}
                  title={title}
                />
                {selection.data && (
                  <p className="type-caption text-ink-3">
                    {tr(`regions.${selection.data.regions ?? "session"}`)}
                  </p>
                )}
              </div>

              <div className="min-w-0 space-y-2">
                <h3 className="type-caption font-medium text-ink-3">
                  {tr("trail")}
                </h3>
                {terrain && webgl ? (
                  <BlockLandscape
                    landscape={terrain}
                    block={row}
                    labels={labels}
                    groups={groups}
                    kept={kept}
                    t={t}
                    camera={camera}
                    onCamera={setCamera}
                    title={tr("trailAria", { block: title })}
                  />
                ) : (
                  <BlockTrail
                    analysis={analysis}
                    block={row}
                    labels={labels}
                    groups={groups}
                    kept={kept}
                    t={t}
                    onSeek={setT}
                    title={tr("trailAria", { block: title })}
                  />
                )}
                <label className="block">
                  <span className="type-caption flex justify-between text-ink-3">
                    <span>{tr("cursor")}</span>
                    <span className="tabular-nums">
                      {tr("cursorValue", {
                        at: formatClock(t - row.t_start_s),
                        total: formatClock(row.t_end_s - row.t_start_s),
                      })}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={from}
                    max={to}
                    step={analysis.step_s || 1}
                    value={t}
                    onChange={(e) => setT(Number(e.target.value))}
                    className="mt-1 w-full accent-[var(--accent)]"
                    aria-label={`${tr("cursor")} · ${title}`}
                  />
                </label>
                {!labels && windowT.length > 0 && (
                  <p className="type-caption text-ink-3">{tr("byTime")}</p>
                )}
              </div>

              <div className="min-w-0 space-y-2">
                <h3 className="type-caption font-medium text-ink-3">
                  {tr("onScreen")}
                </h3>
                <BlockFrame
                  kind={step.kind ?? row.kind}
                  label={title}
                  config={step.config ?? null}
                  events={events}
                  block={row}
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
                  narrowed={isNarrowed(row, focus[side])}
                  pending={selection.isFetching}
                  t={t}
                  onRemove={() => updateRows(rows.filter((r) => r !== id))}
                />
              ))}
            </section>
          );
        })}
      </div>

      <AddRowMenu
        available={available}
        onAdd={(id) => updateRows([...rows, id])}
      />

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

/** WebGL support does not change while a page is open: nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}
