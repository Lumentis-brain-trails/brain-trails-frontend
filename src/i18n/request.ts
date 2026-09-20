/**
 * Where next-intl finds the locale and the messages for a request.
 *
 * English is the only locale until sprint S26 (plan V3, "Internationalisation"), so
 * there is no locale in the URL and nothing to negotiate: every request gets `en`.
 * Every new string still goes through a key in `messages/en.json`, which is what turns
 * a later translation into a new file instead of a rewrite. S26 replaces the constant
 * with `users.locale` -> `Accept-Language` -> `en`.
 */
import { getRequestConfig } from "next-intl/server";

export const DEFAULT_LOCALE = "en";

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages: (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default,
}));
