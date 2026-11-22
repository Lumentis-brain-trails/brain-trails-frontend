"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/components/ui";
import type { DocumentKind, DocumentStatus } from "@console/lib/client";

const STATUS_TONE: Record<DocumentStatus, string> = {
  draft: "bg-warn-soft text-ink",
  final: "bg-ok-soft text-ink",
  archived: "bg-surface-2 text-ink-3",
};

/** A document's status as a small coloured label. */
export function StatusBadge({ status }: { status: DocumentStatus }) {
  const t = useTranslations("console.documents.status");
  return (
    <span
      className={cn(
        "inline-block rounded-md px-2 py-0.5 text-[12px] font-medium",
        STATUS_TONE[status]
      )}
    >
      {t(status)}
    </span>
  );
}

/** A document's kind as a plain label. */
export function KindBadge({ kind }: { kind: DocumentKind }) {
  const t = useTranslations("console.documents.kind");
  return (
    <span className="inline-block rounded-md border border-hairline px-2 py-0.5 text-[12px] text-ink-2">
      {t(kind)}
    </span>
  );
}
