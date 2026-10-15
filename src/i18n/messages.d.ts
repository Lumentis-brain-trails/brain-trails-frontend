/**
 * Type-checks every `t("...")` against `messages/en.json`: a missing or misspelt key
 * is a compile error, not an untranslated string in production. English is the
 * reference; `messages.test.ts` holds every other locale to the same keys.
 */
import type messages from "../../messages/en.json";
import type { AppLocale } from "./locales";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
