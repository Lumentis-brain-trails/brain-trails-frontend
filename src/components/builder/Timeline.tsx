"use client";

/**
 * The builder's timeline: the protocol's top level as a row of clips (sprint S19).
 *
 * A clip is as wide as it lasts, so the shape of a session is visible at a glance; a
 * clip whose length the participant decides (a self-paced rest, a questionnaire) is
 * hatched and marked, because guessing a width there would lie. Groups - a shuffled
 * sequence or a loop - are one stacked clip that says how many blocks it expands to.
 *
 * Drag and drop is the browser's own: dragging from the bin inserts at the gap under the
 * pointer, dragging a clip reorders it. That keeps the dependency list short and the
 * drag feedback inside one frame even with 200 clips, which a JS-driven sortable has to
 * work for.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Clip } from "@/lib/builder/draft";
import { formatClock } from "@/lib/builder/draft";
import { cn } from "@/components/ui";

/** What a drag carries: a new block from the bin, or a clip being moved. */
export const DRAG_TYPE = "application/x-brain-trails-clip";

export interface DragPayload {
  from: "bin-media" | "bin-element" | "timeline";
  /** The media id, the element kind, or the clip index. */
  value: string | number;
}

export function dragPayload(event: React.DragEvent): DragPayload | null {
  try {
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

const PX_PER_SECOND = 2.2;
const MIN_WIDTH = 72;

export interface TimelineProps {
  clips: Clip[];
  selected: number[];
  zoom: number;
  issues: Record<number, { errors: number; warnings: number }>;
  onSelect: (index: number, additive: boolean) => void;
  onDropAt: (index: number, payload: DragPayload) => void;
  onOpenGroup: (index: number) => void;
}

export function Timeline({
  clips,
  selected,
  zoom,
  issues,
  onSelect,
  onDropAt,
  onOpenGroup,
}: TimelineProps) {
  const t = useTranslations("builder.timeline");
  const [over, setOver] = useState<number | null>(null);
  const total = clips.reduce((sum, clip) => sum + clip.seconds, 0);

  const gap = (index: number) => (
    <div
      key={`gap-${index}`}
      data-testid={`gap-${index}`}
      aria-label={t("insert_at", { position: index + 1 })}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(index);
      }}
      onDragLeave={() => setOver((o) => (o === index ? null : o))}
      onDrop={(event) => {
        event.preventDefault();
        setOver(null);
        const payload = dragPayload(event);
        if (payload) onDropAt(index, payload);
      }}
      className={cn(
        "h-24 w-3 shrink-0 rounded-full transition-colors",
        over === index ? "bg-accent" : "bg-transparent"
      )}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="type-caption flex items-center justify-between text-ink-3">
        <span>
          {t("blocks", { count: clips.reduce((n, c) => n + c.count, 0) })}
        </span>
        <span className="tabular-nums">
          {t("total", { time: formatClock(total) })}
        </span>
      </div>
      <div
        className="flex min-h-[7.5rem] items-stretch gap-0 overflow-x-auto rounded-[var(--radius-card)] border border-hairline bg-surface-2 p-3"
        role="list"
        aria-label={t("title")}
      >
        {clips.length === 0 && (
          <p className="type-caption m-auto text-ink-3">{t("empty")}</p>
        )}
        {clips.map((clip) => (
          <div key={clip.index} className="flex items-stretch">
            {gap(clip.index)}
            <ClipCard
              clip={clip}
              zoom={zoom}
              selected={selected.includes(clip.index)}
              issues={issues[clip.index]}
              onSelect={onSelect}
              onOpenGroup={onOpenGroup}
            />
          </div>
        ))}
        {gap(clips.length)}
      </div>
    </div>
  );
}

function ClipCard({
  clip,
  zoom,
  selected,
  issues,
  onSelect,
  onOpenGroup,
}: {
  clip: Clip;
  zoom: number;
  selected: boolean;
  issues?: { errors: number; warnings: number };
  onSelect: (index: number, additive: boolean) => void;
  onOpenGroup: (index: number) => void;
}) {
  const t = useTranslations("builder.timeline");
  const isGroup = clip.node.type !== "block";
  const width = Math.max(MIN_WIDTH, clip.seconds * PX_PER_SECOND * zoom);

  return (
    <div
      role="listitem"
      className={cn(
        "relative flex shrink-0 flex-col justify-between rounded-[var(--radius-control)] border p-2 text-left",
        selected
          ? "border-accent bg-accent-soft"
          : "border-hairline bg-surface hover:border-accent/50",
        isGroup && "shadow-[3px_3px_0_0_var(--hairline)]"
      )}
      style={{ width }}
    >
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(
            DRAG_TYPE,
            JSON.stringify({ from: "timeline", value: clip.index })
          );
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={(event) => onSelect(clip.index, event.shiftKey || event.metaKey)}
        onDoubleClick={() => isGroup && onOpenGroup(clip.index)}
        className="min-w-0 flex-1 cursor-grab text-left"
        aria-pressed={selected}
      >
        <span className="block truncate text-[13px] font-medium">
          {clip.label}
        </span>
        <span className="type-caption block truncate text-ink-3">
          {isGroup
            ? t("group_blocks", { count: clip.count })
            : (clip.node as { kind: string }).kind}
        </span>
      </button>
      <span className="type-caption flex items-center gap-1 tabular-nums text-ink-3">
        {clip.variable ? "~" : ""}
        {formatClock(clip.seconds)}
        {issues?.errors ? (
          <span
            className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white"
            aria-label={t("errors", { count: issues.errors })}
          >
            {issues.errors}
          </span>
        ) : issues?.warnings ? (
          <span
            className="ml-auto rounded-full bg-warn px-1.5 text-[10px] font-semibold text-ink"
            aria-label={t("warnings", { count: issues.warnings })}
          >
            {issues.warnings}
          </span>
        ) : null}
      </span>
      {clip.variable && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius-control)] bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--hairline)_6px,var(--hairline)_7px)] opacity-60"
        />
      )}
    </div>
  );
}
