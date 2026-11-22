"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import type { ContextItem, ContextOption } from "@/lib/context";

/**
 * The words of a context item: a built-in one's from `context.items.<key>...`, a
 * person's own as stored. A built-in key the catalogue does not know yet (a newer
 * backend) falls back to the key itself rather than to nothing.
 */
export function useContextWords() {
  const t = useTranslations("context.items");
  const say = useCallback(
    (key: string, fallback: string) =>
      t.has(key as never) ? t(key as never) : fallback,
    [t]
  );
  return useMemo(
    () => ({
      item: (item: ContextItem): string =>
        item.custom
          ? (item.label ?? item.key)
          : say(`${item.key}.label`, item.key),
      hint: (item: ContextItem): string | null =>
        item.custom || !t.has(`${item.key}.hint` as never)
          ? null
          : t(`${item.key}.hint` as never),
      option: (item: ContextItem, option: ContextOption): string =>
        option.custom || option.label
          ? (option.label ?? option.key)
          : say(`${item.key}.options.${option.key}`, option.key),
      point: (item: ContextItem, value: string): string | null => {
        if (item.custom) {
          if (value === "1") return item.low_label;
          if (value === "5") return item.high_label;
          return null;
        }
        return say(`${item.key}.points.${value}`, value);
      },
    }),
    [say, t]
  );
}
