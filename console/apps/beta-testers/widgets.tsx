"use client";

import { useTranslations } from "next-intl";
import type { PendingPayload } from "./lib/pending";

/** "Pending applications": how many wait, how many came from the stand, and organisations. */
export function PendingWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.betaTesters.widgets");
  const p = payload as unknown as PendingPayload;
  return (
    <div>
      <p className="type-figure">{p.pending}</p>
      <p className="text-[12px] text-ink-3">
        {t("pending", {
          stand: p.pending_wants_beta,
          organisations: p.organisations_pending,
        })}
      </p>
    </div>
  );
}
