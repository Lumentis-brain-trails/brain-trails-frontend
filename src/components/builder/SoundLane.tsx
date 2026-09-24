"use client";

/**
 * The sound lane: sounds drawn over the clips they play under (backend V3-0014).
 *
 * It lives inside the timeline's horizontal scroll and uses the timeline's own column
 * widths, so a sound's bar sits exactly under the blocks it spans. Drop a sound from the
 * bin onto a column to start it there; drag a bar to move its start; drag its right edge
 * to the column it should stop at. Everything the drags do can also be done from the
 * inspector with the keyboard, so the lane is never the only way in.
 */
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  GAP_PX,
  PX_PER_SECOND,
  STRIP_INSET_PX,
  clipWidth,
  dragPayload,
  setDragPayload,
} from "@/components/builder/Timeline";
import { cn } from "@/components/ui";
import type { BinMedia, Clip } from "@/lib/builder/draft";
import { laneSpan } from "@/lib/builder/soundtrack";
import type { Cue } from "@/lib/protocol/tree";

const ROW_PX = 28;
const MIN_BAR_PX = 44;
/** A sound whose file length is unknown is drawn as if it lasted this long. */
const UNKNOWN_S = 30;

interface Column {
  left: number;
  width: number;
}

export function SoundLane({
  clips,
  zoom,
  soundtrack,
  media,
  selected,
  onSelect,
  onAdd,
  onMoveStart,
  onSetStop,
}: {
  clips: Clip[];
  zoom: number;
  soundtrack: Cue[];
  media: Record<string, BinMedia>;
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: (mediaId: string, clipIndex: number) => void;
  onMoveStart: (id: string, clipIndex: number) => void;
  onSetStop: (id: string, clipIndex: number) => void;
}) {
  const t = useTranslations("builder.soundtrack");
  const [over, setOver] = useState<number | null>(null);
  const [refused, setRefused] = useState(false);

  const columns: Column[] = [];
  for (const clip of clips) {
    const previous = columns[columns.length - 1];
    const left =
      (previous ? previous.left + previous.width : STRIP_INSET_PX) + GAP_PX;
    columns.push({ left, width: clipWidth(clip, zoom) });
  }
  const last = columns[columns.length - 1];
  const end = last ? last.left + last.width : STRIP_INSET_PX;
  const width = end + GAP_PX + STRIP_INSET_PX;
  const height = Math.max(1, soundtrack.length) * ROW_PX + 16;

  /** The column under `clientX`, clamped to the clips that exist. */
  const columnAt = (clientX: number, box: DOMRect): number => {
    const at = clientX - box.left;
    const index = columns.findIndex((c) => at < c.left + c.width + GAP_PX / 2);
    return index < 0 ? Math.max(0, columns.length - 1) : index;
  };

  const barOf = (cue: Cue) => {
    const span = laneSpan(cue, clips);
    const start = columns[span.startClip] ?? {
      left: STRIP_INSET_PX,
      width: 0,
    };
    const delay = (cue.start?.offset_s ?? 0) * PX_PER_SECOND * zoom;
    const left = start.left + Math.min(delay, Math.max(0, start.width - 24));
    let right: number;
    if (span.endClip === null) {
      const seconds = media[cue.media_id]?.duration_s ?? UNKNOWN_S;
      right = left + seconds * PX_PER_SECOND * zoom;
    } else {
      const end = columns[span.endClip] ?? start;
      right = end.left + end.width;
    }
    return { left, width: Math.max(MIN_BAR_PX, right - left) };
  };

  return (
    <div
      data-testid="sound-lane"
      aria-label={t("title")}
      className="relative mt-2"
      style={{ width, minWidth: "100%", height }}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(
          columnAt(event.clientX, event.currentTarget.getBoundingClientRect())
        );
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOver(null);
          setRefused(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const column = columnAt(
          event.clientX,
          event.currentTarget.getBoundingClientRect()
        );
        setOver(null);
        const payload = dragPayload(event);
        if (!payload) return;
        if (payload.from === "bin-media") {
          const item = media[String(payload.value)];
          if (item?.kind !== "audio") {
            setRefused(true);
            return;
          }
          setRefused(false);
          onAdd(item.id, column);
        } else if (payload.from === "lane-cue") {
          onMoveStart(String(payload.value), column);
        } else if (payload.from === "lane-stop") {
          onSetStop(String(payload.value), column);
        }
      }}
    >
      {/* the columns, lined up under the clips, as drop targets */}
      {columns.map((column, index) => (
        <div
          key={index}
          aria-hidden
          className={cn(
            "absolute top-0 bottom-0 rounded-md transition-colors",
            over === index ? "bg-accent-soft" : "bg-surface-2/60"
          )}
          style={{ left: column.left, width: column.width }}
        />
      ))}

      {soundtrack.length === 0 && (
        <p
          className={cn(
            "type-caption pointer-events-none absolute inset-0 flex items-center px-4",
            refused ? "text-danger" : "text-ink-3"
          )}
        >
          {refused ? t("only_audio") : t("empty")}
        </p>
      )}
      {soundtrack.length > 0 && refused && (
        <p className="type-caption pointer-events-none absolute right-3 bottom-1 text-danger">
          {t("only_audio")}
        </p>
      )}

      {soundtrack.map((cue, row) => {
        const bar = barOf(cue);
        const item = media[cue.media_id];
        const isSelected = selected === cue.id;
        return (
          <div
            key={cue.id}
            role="button"
            tabIndex={0}
            draggable
            data-testid={`sound-${cue.id}`}
            aria-pressed={isSelected}
            onDragStart={(event) =>
              setDragPayload(event, { from: "lane-cue", value: cue.id })
            }
            onClick={() => onSelect(cue.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(cue.id);
              }
            }}
            className={cn(
              "absolute flex items-center gap-1.5 overflow-hidden rounded-full pr-4 pl-3 text-[12px] font-medium whitespace-nowrap text-white shadow-sm",
              isSelected ? "ring-2 ring-ink ring-offset-1" : ""
            )}
            style={{
              left: bar.left,
              width: bar.width,
              top: 8 + row * ROW_PX,
              height: ROW_PX - 6,
              background: "#0a84ff",
              opacity: 0.35 + 0.65 * (cue.volume ?? 0.6),
            }}
            title={cue.label ?? item?.title ?? cue.media_id}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 shrink-0">
              <path
                d="M6 12.5a2 2 0 1 1-2-2 2 2 0 0 1 2 2zm0 0V3.5l7-1.5v8.5a2 2 0 1 1-2-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <span className="truncate">
              {cue.label ?? item?.title ?? "Sound"}
            </span>
            {cue.loop && (
              <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 shrink-0">
                <path
                  d="M3 8a5 5 0 0 1 8.5-3.5L13 6m0-3v3h-3M13 8a5 5 0 0 1-8.5 3.5L3 10m0 3v-3h3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
            <span
              draggable
              role="separator"
              aria-label={t("drag_stop")}
              title={t("drag_stop")}
              onDragStart={(event) => {
                event.stopPropagation();
                setDragPayload(event, { from: "lane-stop", value: cue.id });
              }}
              className="absolute top-0 right-0 bottom-0 w-3 cursor-ew-resize bg-white/30"
            />
          </div>
        );
      })}
    </div>
  );
}
