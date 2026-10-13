/**
 * The languages the app speaks, and the rule that picks one for a request.
 *
 * There is no locale segment in the URL (plan V3, "Internationalisation"): a link is the
 * same link for everyone, and the language is a preference of the reader. It is resolved
 * in this order:
 *
 * 1. the explicit choice, kept in the `bt-locale` cookie by the language switch;
 * 2. the browser's `Accept-Language`, so a first visit already reads right;
 * 3. English.
 *
 * Kept free of `next/*` imports so the rule can be tested as a plain function and used
 * from both the server (`request.ts`) and the client (`setLocale`).
 */

/** Every locale with a `messages/<locale>.json`. The first one is the fallback. */
export const LOCALES = ["en", "it"] as const;

export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** Cookie holding an explicit choice; absent means "follow the browser". */
export const LOCALE_COOKIE = "bt-locale";

/** One year: a language is not something to ask again every month. */
const LOCALE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/** Each language under its own name, which is how a reader looks for it in a menu. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: "English",
  it: "Italiano",
};

/** Narrows an arbitrary string (a cookie, a header token) to a supported locale. */
export function isLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * The best supported locale in an `Accept-Language` header, or null when none matches.
 *
 * Tags are ranked by their `q` weight (missing means 1, `q=0` means "never") and matched
 * on the primary subtag, so `it-CH` reads Italian. Ties keep the header's order, which
 * is the order the reader listed them in.
 */
export function fromAcceptLanguage(
  header: string | null | undefined
): AppLocale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const weight = q === undefined ? 1 : Number(q);
      return {
        primary: tag.trim().toLowerCase().split("-")[0],
        weight: Number.isFinite(weight) ? weight : 0,
        index,
      };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const entry of ranked) {
    if (isLocale(entry.primary)) return entry.primary;
  }
  return null;
}

/** Cookie, then `Accept-Language`, then English. */
export function resolveLocale(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined
): AppLocale {
  if (isLocale(cookie)) return cookie;
  return fromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/**
 * Remember an explicit choice in this browser.
 *
 * Only writes the cookie: the caller refreshes the route (`router.refresh()`) so the
 * server renders again with the new messages. Not `HttpOnly` on purpose - it is a
 * display preference, and the switch that sets it runs in the page.
 */
export function setLocale(locale: AppLocale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_S}; SameSite=Lax`;
}
