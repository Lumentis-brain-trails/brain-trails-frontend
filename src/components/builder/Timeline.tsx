"use client";

/**
 * The builder's timeline: the protocol's top level as a row of clips (sprint S19).
 *
 * A clip is as wide as it lasts, so the shape of a session is visible at a glance; a
 * clip whose length the participant decides (a self-paced rest, a questionnaire) is
 * hatched and marked, because guessing a width there would lie. Groups - a shuffled
 * sequence or a loop - are one stacked clip that says how many blocks it expands to.
 *
 * Drag and drop is the browser's own: dragging from the bin inserts where the pointer
 * is, dragging a clip reorders it. That keeps the dependency list short and the drag
 * feedback inside one frame even with 200 clips, which a JS-driven sortable has to work
 * for.
 *
 * The whole strip is the drop target, not only the thin gaps between clips: the
 * insertion point is worked out from the pointer against each clip's midpoint (Alessio,
 * 2026-09-20: dropping a video on an empty timeline did nothing, because the only target
 * was a 12-pixel sliver behind the "drag something here" line).
 */

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { Clip } from "@/lib/builder/draft";
import { formatClock } from "@/lib/builder/draft";
import { KindCover } from "@/components/builder/KindCover";
import { cn } from "@/components/ui";
import { identityOf } from "@/lib/builder/kinds";

/** What a drag carries: a new block from the bin, or a clip being moved. */
export const DRAG_TYPE = "application/x-brain-trails-clip";

export interface DragPayload {
  from: "bin-media" | "bin-element" | "timeline";
  /** The media id, the element kind, or the clip index. */
  value: string | number;
}

/** Put a payload on a drag, in both types: Safari only carries `text/plain` reliably. */
export function setDragPayload(
  event: React.DragEvent,
  payload: DragPayload
): void {
  const raw = JSON.stringify(payload);
  event.dataTransfer.setData(DRAG_TYPE, raw);
  event.dataTransfer.setData("text/plain", raw);
  // "copyMove", not "copy": the strip accepts both a new block and a clip being moved,
  // and a browser refuses a drop whose dropEffect the source did not allow.
  event.dataTransfer.effectAllowed = "copyMove";
}

export function dragPayload(event: React.DragEvent): DragPayload | null {
  const raw =
    event.dataTransfer.getData(DRAG_TYPE) ||
    event.dataTransfer.getData("text/plain");
  try {
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null; // something else was dropped on the timeline
  }
}

const PX_PER_SECOND = 2.2;
const MIN_WIDTH = 112;

export interface TimelineProps {
  clips: Clip[];
  selected: number[];
  zoom: number;
  issues: Record<number, { errors: number; warnings: number }>;
  onSelect: (index: number, additive: boolean) => void;
  onDropAt: (index: number, payload: DragPayload) => void;
  onOpenGroup: (index: number) => void;
  /** Cover URLs by media id, so a media clip wears its own still. */
  covers?: Record<string, string | null | undefined>;
}

export function Timeline({
  clips,
  selected,
  zoom,
  issues,
  onSelect,
  onDropAt,
  onOpenGroup,
  covers = {},
}: TimelineProps) {
  const t = useTranslations("builder.timeline");
  const [over, setOver] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const total = clips.reduce((sum, clip) => sum + clip.seconds, 0);

  /** Where a drop at `clientX` would insert: before the first clip whose middle is past it. */
  const indexAt = (clientX: number): number => {
    const cards = strip.current?.querySelectorAll("[data-clip-index]") ?? [];
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (clientX < box.left + box.width / 2)
        return Number((card as HTMLElement).dataset.clipIndex);
    }
    return clips.length;
  };

  const gap = (index: number) => (
    <div
      key={`gap-${index}`}
      data-testid={`gap-${index}`}
      aria-label={t("insert_at", { position: index + 1 })}
      // The gap is the precise target between two clips; the strip around it handles
      // everything else, so this one must not let the drop reach it twice.
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(index);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
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
        ref={strip}
        data-testid="timeline"
        className={cn(
          "flex min-h-[7.5rem] items-stretch gap-0 overflow-x-auto rounded-[var(--radius-card)] border p-3 transition-colors",
          over !== null
            ? "border-accent bg-accent-soft"
            : "border-hairline bg-surface-2"
        )}
        role="list"
        aria-label={t("title")}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(indexAt(event.clientX));
        }}
        onDragLeave={(event) => {
          // only when the pointer really left the strip, not on the way over a clip
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setOver(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const index = indexAt(event.clientX);
          setOver(null);
          const payload = dragPayload(event);
          if (payload) onDropAt(index, payload);
        }}
      >
        {clips.length === 0 && (
          <p className="type-caption pointer-events-none m-auto text-ink-3">
            {t("empty")}
          </p>
        )}
        {clips.map((clip) => (
          <div key={clip.index} className="flex items-stretch">
            {gap(clip.index)}
            <ClipCard
              clip={clip}
              zoom={zoom}
              selected={selected.includes(clip.index)}
              issues={issues[clip.index]}
              cover={coverOf(clip, covers)}
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

function coverOf(
  clip: Clip,
  covers: Record<string, string | null | undefined>
): string | null {
  if (clip.node.type !== "block") return null;
  const mediaId = (clip.node.config as { media_id?: unknown }).media_id;
  return typeof mediaId === "string" ? (covers[mediaId] ?? null) : null;
}

function ClipCard({
  clip,
  cover,
  zoom,
  selected,
  issues,
  onSelect,
  onOpenGroup,
}: {
  clip: Clip;
  cover: string | null;
  zoom: number;
  selected: boolean;
  issues?: { errors: number; warnings: number };
  onSelect: (index: number, additive: boolean) => void;
  onOpenGroup: (index: number) => void;
}) {
  const t = useTranslations("builder.timeline");
  const isGroup = clip.node.type !== "block";
  const kind = clip.node.type === "block" ? clip.node.kind : null;
  const width = Math.max(MIN_WIDTH, clip.seconds * PX_PER_SECOND * zoom);

  return (
    <div
      role="listitem"
      data-clip-index={clip.index}
      className={cn(
        "relative flex shrink-0 flex-col justify-between rounded-[var(--radius-control)] border p-2 text-left",
        selected
          ? "border-accent bg-accent-soft"
          : "border-hairline bg-surface hover:border-accent/50",
        isGroup && "shadow-[3px_3px_0_0_var(--hairline)]"
      )}
      style={{
        width,
        borderTopColor: kind ? identityOf(kind).tone : undefined,
        borderTopWidth: kind ? 3 : undefined,
      }}
    >
      <button
        type="button"
        draggable
        onDragStart={(event) =>
          setDragPayload(event, { from: "timeline", value: clip.index })
        }
        onClick={(event) =>
          onSelect(clip.index, event.shiftKey || event.metaKey)
        }
        onDoubleClick={() => isGroup && onOpenGroup(clip.index)}
        className="flex min-w-0 flex-1 cursor-grab items-start gap-2 text-left"
        aria-pressed={selected}
        title={clip.label}
      >
        {kind && (
          <span className="w-11 shrink-0">
            <KindCover kind={kind} image={cover} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[12px] leading-tight font-medium">
            {clip.label}
          </span>
          {/* a block still called after its kind would say the same word twice */}
          {(!kind || identityOf(kind).label !== clip.label) && (
            <span className="type-caption block truncate text-ink-3">
              {kind
                ? identityOf(kind).label
                : t("group_blocks", { count: clip.count })}
            </span>
          )}
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
