"use client";

import { useTranslations } from "next-intl";
import { HeadbandHelp } from "@/components/HeadbandHelp";
import { SignalRibbon } from "@/components/SignalRibbon";
import { cn } from "@/components/ui";
import { EEG_CHANNELS, type EegChannel } from "@/lib/muse/protocol";
import type { ChannelQuality, QualityLevel } from "@/lib/muse/quality";

const DOT: Record<QualityLevel, string> = {
  unknown: "bg-ink-3/40",
  good: "bg-ok",
  noisy: "bg-warn",
  saturated: "bg-warn",
  flat: "bg-danger",
};

/**
 * Contact across the four electrodes: one band, four lamps under it.
 *
 * The band is the reading — it rears up and frays over an electrode that is
 * losing contact — and the lamps under it say in words which one that is. Both
 * are needed: colour alone fails colour-blind readers and screen readers, and
 * four words alone never showed anyone *where* the trouble was.
 *
 * The lamps sit in four equal columns because the electrodes are placed on
 * those column centres (`lib/signalRibbon`), so a lamp is always directly under
 * its own stretch of band, at any width.
 */
export function ContactLights({
  quality,
  active = true,
}: {
  quality: Record<EegChannel, ChannelQuality>;
  /** False pauses the band (disconnected headband, or a finished run). */
  active?: boolean;
}) {
  const t = useTranslations("signals");

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <span className="type-subhead">{t("title")}</span>
        <HeadbandHelp quality={quality} />
      </div>
      <SignalRibbon quality={quality} active={active} />
      <div className="grid grid-cols-4">
        {EEG_CHANNELS.map((channel) => {
          const q = quality[channel];
          return (
            <div
              key={channel}
              role="status"
              aria-label={`${channel}: ${t(`levels.${q.level}`)}. ${t(`hints.${q.level}`)}`}
              className="flex flex-col items-center gap-1.5 px-1.5 py-3.5 text-center"
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-colors duration-300",
                  DOT[q.level]
                )}
                aria-hidden
              />
              <span className="type-caption font-medium text-ink">
                {channel}
              </span>
              <span className="type-caption text-ink-3">
                {t(`hints.${q.level}`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
