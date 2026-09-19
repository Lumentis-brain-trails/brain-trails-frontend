/**
 * Type-checks every `t("...")` against `messages/en.json`: a missing or misspelt key
 * is a compile error, not an untranslated string in production.
 */
import type messages from "../../messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "en";
    Messages: typeof messages;
  }
}
