/**
 * Where next-intl finds the console's locale and messages for a request.
 *
 * The language is picked by the product's rule (`@/i18n/locales`: the `bt-locale`
 * cookie, then `Accept-Language`, then English) and the console speaks the product's two
 * languages. What it reads is `catalogue`: its own files plus the product namespaces it
 * shares.
 */
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/locales";
import { catalogue } from "./catalogue";

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
  return { locale, messages: catalogue(own.default, product.default) };
});
