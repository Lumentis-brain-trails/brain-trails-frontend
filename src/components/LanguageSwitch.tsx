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
 *
 * `account` says the reader is signed in: the choice is then also stored on the account
 * (`PUT /auth/me/locale`), so it follows them to another browser and the backend writes
 * its mail in it. Signed out, the choice is noted for the next sign-in in this tab
 * (`src/i18n/accountLocale.ts` has the whole rule).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Segmented, cn } from "@/components/ui";
import { rememberChosenHere } from "@/i18n/accountLocale";
import { api } from "@/lib/api";
import type { UserInfo } from "@/lib/types";
import {
  type AppLocale,
  LOCALES,
  LOCALE_NAMES,
  setLocale,
} from "@/i18n/locales";

export function LanguageSwitch({
  variant = "segmented",
  account = false,
  className,
}: {
  variant?: "segmented" | "links";
  account?: boolean;
  className?: string;
}) {
  const t = useTranslations("language");
  const current = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  function choose(locale: AppLocale) {
    if (locale === current) return;
    setLocale(locale);
    if (account) {
      // The cache first, so the shell's sync sees browser and account agree already.
      queryClient.setQueryData<UserInfo>(["me"], (user) =>
        user ? { ...user, locale } : user
      );
      api
        .put("auth/me/locale", { locale })
        // Not stored: note it, and the next sync in this tab stores it again.
        .catch(() => rememberChosenHere(locale));
    } else {
      rememberChosenHere(locale);
    }
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
