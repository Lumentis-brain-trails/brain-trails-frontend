"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { parseLabel } from "@/lib/compare/labels";
import type { LandscapeCategory } from "@/lib/brainLandscape";

/**
 * Trial labels in the reader's words, one definition for every surface that names them
 * (the trail's legend, the landscape's hover): the task's own names where it has them
 * ("Cargo hit"), "match · right" otherwise.
 */
export function useLabelNamer(): {
  label: (label: string) => string;
  category: (category: LandscapeCategory) => string;
} {
  const tr = useTranslations("compare");
  const label = useCallback(
    (value: string) => {
      const key = `labels.${value}`;
      if (tr.has(key as never)) return tr(key as never);
      const { group, act } = parseLabel(value);
      return act ? `${group} · ${tr(`labels.${act}`)}` : group;
    },
    [tr]
  );
  const category = useCallback(
    (c: LandscapeCategory) =>
      c.label ? `${c.task} · ${label(c.label)}` : c.task,
    [label]
  );
  return { label, category };
}
