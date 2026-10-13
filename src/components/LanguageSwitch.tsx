"use client";

/**
 * The language switch: English or Italian, applied at once.
 *
 * A choice is written to the `bt-locale` cookie and the route is refreshed, so the
 * server renders the same page again with the other messages - no reload, nothing the
 * person typed is lost. Each language is listed under its own name ("Italiano", not
 * "Italian"), which is how somebody who cannot read the current one finds theirs.
 *
 * `variant="links"` is the quiet form for the entry screens' footer, where a segmented
 * control would compete with the form.
 */
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Segmented, cn } from "@/components/ui";
import {
  type AppLocale,
  LOCALES,
  LOCALE_NAMES,
  setLocale,
} from "@/i18n/locales";

export function LanguageSwitch({
  variant = "segmented",
  className,
}: {
  variant?: "segmented" | "links";
  className?: string;
}) {
  const t = useTranslations("language");
  const current = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function choose(locale: AppLocale) {
    if (locale === current) return;
    setLocale(locale);
    startTransition(() => router.refresh());
  }

  if (variant === "links") {
    return (
      <span
        role="group"
        aria-label={t("label")}
        className={cn("inline-flex items-center gap-x-2", className)}
      >
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={locale === current}
            onClick={() => choose(locale)}
            className={cn(
              "tracking-[inherit] uppercase hover:text-ink-2",
              locale === current && "text-ink-2"
            )}
          >
            {LOCALE_NAMES[locale]}
          </button>
        ))}
      </span>
    );
  }

  return (
    <Segmented
      label={t("label")}
      value={current}
      onChange={choose}
      options={LOCALES.map((locale) => ({
        value: locale,
        label: LOCALE_NAMES[locale],
      }))}
    />
  );
}
