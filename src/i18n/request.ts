/**
 * Where next-intl finds the locale and the messages for a request.
 *
 * No locale in the URL: the language is the reader's preference, resolved by
 * `resolveLocale` (the `bt-locale` cookie, then `Accept-Language`, then English). Every
 * string goes through a key in `messages/<locale>.json`, so a new language is a new file
 * plus one entry in `LOCALES`; `messages.test.ts` holds the files to the same keys.
 *
 * Reading the cookie makes every route render per request. That is the price of a
 * language without a URL segment, and nothing here was cached across readers anyway:
 * the pages fetch their data from the browser.
 */
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "./locales";

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language")
  );
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
