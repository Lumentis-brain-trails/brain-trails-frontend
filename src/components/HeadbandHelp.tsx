"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { HeadbandDiagram } from "@/components/HeadbandDiagram";
import { Sheet } from "@/components/Sheet";
import { Icon, KeyValue } from "@/components/ui";
import { EEG_CHANNELS, type EegChannel } from "@/lib/muse/protocol";
import type { ChannelQuality } from "@/lib/muse/quality";

/**
 * The question mark beside the contact lights, and the sheet it opens.
 *
 * Four electrode names mean nothing to someone putting the band on for the
 * first time, and the fix is a picture rather than more words next to each
 * light. It stays behind a control so the fitting screen keeps one job: the
 * diagram is there for the first run and out of the way for the hundredth.
 * The lights on the head are live, so the sheet doubles as a second reading.
 */
export function HeadbandHelp({
  quality,
}: {
  quality: Record<EegChannel, ChannelQuality>;
}) {
  const t = useTranslations("signals.help");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        className="pressable flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-ink-3 hover:bg-surface-3 hover:text-ink-2"
      >
        <Icon name="help" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <Sheet title={t("title")} onClose={() => setOpen(false)}>
          <div className="space-y-5">
            <div className="flex justify-center">
              <HeadbandDiagram quality={quality} />
            </div>
            <p className="type-caption text-pretty text-ink-3">{t("intro")}</p>
            <div className="space-y-0.5">
              {EEG_CHANNELS.map((channel) => (
                <KeyValue
                  key={channel}
                  label={channel}
                  value={t(`where.${channel}`)}
                />
              ))}
              <KeyValue label={t("reference_label")} value={t("reference")} />
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
