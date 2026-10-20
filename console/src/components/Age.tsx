"use client";

import { useTranslations } from "next-intl";
import { ageParts, isStale } from "@console/lib/format";
import { cn } from "@/components/ui";

/** How old a snapshot is, in words; greyed after a day. */
export function Age({
  seconds,
  className,
}: {
  seconds: number;
  className?: string;
}) {
  const t = useTranslations("console.age");
  const { unit, n } = ageParts(seconds);
  return (
    <span
      className={cn(
        "text-[12px]",
        isStale(seconds) ? "text-warn" : "text-ink-3",
        className
      )}
    >
      {t(unit, { n })}
    </span>
  );
}
