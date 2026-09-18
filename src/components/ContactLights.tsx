"use client";

import { EEG_CHANNELS, type EegChannel } from "@/lib/muse/protocol";
import type { ChannelQuality, QualityLevel } from "@/lib/muse/quality";
import { cn } from "@/components/ui";

const DOT: Record<QualityLevel, string> = {
  unknown: "bg-ink-3/40",
  good: "bg-ok",
  noisy: "bg-warn",
  saturated: "bg-warn",
  flat: "bg-danger",
};

const LABEL: Record<QualityLevel, string> = {
  unknown: "Waiting",
  good: "Good",
  noisy: "Noisy",
  saturated: "Saturated",
  flat: "No contact",
};

/**
 * Four electrode lights. Colour is the only status channel here, so the
 * label repeats it in words for colour-blind readers and screen readers.
 */
export function ContactLights({
  quality,
}: {
  quality: Record<EegChannel, ChannelQuality>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {EEG_CHANNELS.map((channel) => {
        const q = quality[channel];
        return (
          <div
            key={channel}
            role="status"
            aria-label={`${channel}: ${LABEL[q.level]}`}
            className="flex flex-col gap-2.5 rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-4"
          >
            <div className="flex items-center justify-between">
              <span className="type-subhead">{channel}</span>
              <span
                className={cn(
                  "h-3 w-3 rounded-full transition-colors duration-300",
                  DOT[q.level]
                )}
              />
            </div>
            <div>
              <div className="font-medium">{LABEL[q.level]}</div>
              <div className="type-caption text-ink-3 tabular-nums">
                {q.stdUv !== null ? `σ ${q.stdUv.toFixed(0)} µV` : ""}
                {q.level !== "good" && q.level !== "unknown"
                  ? ` · ${q.hint.split("·")[1]?.trim() ?? q.hint}`
                  : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
