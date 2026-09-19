"use client";

/**
 * The review timeline: block bands, event ticks, and the one cursor everything follows
 * (sprint S20).
 *
 * The session clock is the single axis of the page - the video, the trail and the band
 * powers are all drawn against it - so scrubbing happens here and everything else reads
 * `t`. Dragging moves the cursor; dragging with Shift brushes a range, which is what an
 * annotation over a stretch of signal needs.
 *
 * Pointer events, not a range input: a range input cannot brush, and it would fight the
 * block bands for the same pixels.
 */

import { useCallback, useRef, useState } from "react";
import type { RunBlock } from "@/lib/review/timeline";
import { cn } from "@/components/ui";

const TICK_COLOR: Record<string, string> = {
  stimulus_onset: "bg-accent",
  stimulus_offset: "bg-accent/50",
  response: "bg-ok",
  questionnaire_answer: "bg-ok",
  quality_drop: "bg-danger",
  quality_recover: "bg-warn",
  pause: "bg-ink-3",
  resume: "bg-ink-3",
};

export interface ScrubberProps {
  duration: number;
  t: number;
  blocks: RunBlock[];
  ticks: { t: number; type: string }[];
  range: [number, number] | null;
  onSeek: (t: number) => void;
  onRange: (range: [number, number] | null) => void;
  onSelectBlock?: (block: RunBlock) => void;
}

export function Scrubber({
  duration,
  t,
  blocks,
  ticks,
  range,
  onSeek,
  onRange,
  onSelectBlock,
}: ScrubberProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [brushFrom, setBrushFrom] = useState<number | null>(null);
  const pct = (seconds: number) =>
    duration > 0
      ? (Math.max(0, Math.min(seconds, duration)) / duration) * 100
      : 0;

  const timeAt = useCallback(
    (clientX: number) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box || box.width === 0) return 0;
      const ratio = (clientX - box.left) / box.width;
      return Math.max(0, Math.min(1, ratio)) * duration;
    },
    [duration]
  );

  return (
    <div className="space-y-1">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Session timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(t)}
        className="relative h-14 w-full cursor-pointer touch-none overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-2"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const at = timeAt(event.clientX);
          if (event.shiftKey) {
            setBrushFrom(at);
            onRange([at, at]);
          } else {
            onRange(null);
            onSeek(at);
          }
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return;
          const at = timeAt(event.clientX);
          if (brushFrom !== null)
            onRange([Math.min(brushFrom, at), Math.max(brushFrom, at)]);
          else onSeek(at);
        }}
        onPointerUp={() => setBrushFrom(null)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          if (event.key === "ArrowLeft") onSeek(Math.max(0, t - step));
          if (event.key === "ArrowRight") onSeek(Math.min(duration, t + step));
        }}
      >
        {blocks.map((block, index) => {
          const end = block.tEnd ?? duration;
          return (
            <button
              key={`${block.blockId}-${index}`}
              type="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onSelectBlock?.(block);
                onSeek(block.tStart);
              }}
              title={block.label}
              className={cn(
                "absolute top-0 h-8 overflow-hidden border-r border-surface/60 px-1 text-left",
                index % 2 === 0 ? "bg-accent-soft" : "bg-surface"
              )}
              style={{
                left: `${pct(block.tStart)}%`,
                width: `${Math.max(0.5, pct(end) - pct(block.tStart))}%`,
              }}
            >
              <span className="type-caption truncate text-ink-2">
                {block.label}
              </span>
            </button>
          );
        })}

        {ticks.map((tick, index) => (
          <span
            key={index}
            aria-hidden
            className={cn(
              "absolute bottom-0 h-5 w-px",
              TICK_COLOR[tick.type] ?? "bg-ink-3"
            )}
            style={{ left: `${pct(tick.t)}%` }}
          />
        ))}

        {range && (
          <span
            aria-hidden
            className="absolute inset-y-0 bg-accent/20"
            style={{
              left: `${pct(range[0])}%`,
              width: `${Math.max(0.3, pct(range[1]) - pct(range[0]))}%`,
            }}
          />
        )}

        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-danger"
          style={{ left: `${pct(t)}%` }}
        />
      </div>
      <p className="type-caption text-ink-3">
        Drag to scrub · Shift-drag to select a stretch · arrows step a second
      </p>
    </div>
  );
}
