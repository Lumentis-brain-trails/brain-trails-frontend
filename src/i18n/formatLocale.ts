"use client";

/**
 * The locale to hand `Intl` and `toLocale*String`.
 *
 * The app speaks a language ("en", "it"); a date is written in a region. "13 October
 * 2026" in London and "October 13, 2026" in New York are both English, and plain `en`
 * means the second to every browser. So when the browser lists a flavour of the app's
 * language (`en-GB`, `it-CH`), dates and numbers use that flavour; when it does not -
 * an Italian browser reading the app in English - they follow the app's language.
 */
import { useLocale } from "next-intl";
import { useMemo, useSyncExternalStore } from "react";

/** The first of the browser's languages that is a flavour of `appLocale`, else it. */
export function regionalLocale(
  appLocale: string,
  browserLanguages: readonly string[]
): string {
  const match = browserLanguages.find(
    (tag) => tag.toLowerCase().split("-")[0] === appLocale.toLowerCase()
  );
  return match ?? appLocale;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
}

/**
 * `const locale = useFormatLocale()` wherever a component formats a date or a number.
 *
 * The server does not know the browser's languages, so the first render uses the app's
 * locale and the regional flavour arrives right after hydration - a second render, not
 * a mismatch.
 */
export function useFormatLocale(): string {
  const appLocale = useLocale();
  const languages = useSyncExternalStore(
    subscribe,
    () => navigator.languages.join(","),
    () => ""
  );
  return useMemo(
    () => regionalLocale(appLocale, languages ? languages.split(",") : []),
    [appLocale, languages]
  );
}
