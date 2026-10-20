/**
 * Where next-intl finds the console's locale and messages for a request.
 *
 * The language is picked by the product's rule (`@/i18n/locales`: the `bt-locale`
 * cookie, then `Accept-Language`, then English) and the console speaks the product's two
 * languages. Its own words live under `console.*` in `console/messages/`; the product's
 * `common` namespace is added from the product's files, because the shared primitives
 * (`@/components/ui`) read it - shared, not copied.
 */
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/locales";

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language")
  );
  const [own, product] = await Promise.all([
    import(`../../messages/${locale}.json`),
    import(`../../../messages/${locale}.json`),
  ]);
  return {
    locale,
    messages: { ...own.default, common: product.default.common },
  };
});
