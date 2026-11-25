"use client";

import { useTranslations } from "next-intl";

/** The backend's `documents.drafts` panel, as stored in its snapshot. */
interface DraftsPayload {
  drafts: number;
  total: number;
  by_status: Record<string, number>;
  by_kind: Record<string, number>;
}

/** "Drafts": documents still being written, out of every document. */
export function DraftsWidget({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("console.documents.widgets");
  const p = payload as unknown as DraftsPayload;
  return (
    <div>
      <p className="type-figure">{p.drafts}</p>
      <p className="text-[12px] text-ink-3">
        {t("drafts", { total: p.total })}
      </p>
    </div>
  );
}
