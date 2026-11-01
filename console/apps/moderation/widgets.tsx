"use client";

import { useTranslations } from "next-intl";

interface QueuePayload {
  review: number;
  media: number;
  protocols: number;
  stand_waiting: number;
}

/** "Review queue": items waiting for a review, split, and who waits at the stand. */
export function ReviewQueueWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.moderation.widgets");
  const p = payload as unknown as QueuePayload;
  return (
    <div>
      <p className="type-figure">{p.review}</p>
      <p className="text-[12px] text-ink-3">
        {t("queue", {
          media: p.media,
          protocols: p.protocols,
          stand: p.stand_waiting,
        })}
      </p>
    </div>
  );
}
