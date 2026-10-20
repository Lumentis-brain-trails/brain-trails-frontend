/**
 * Type-checks every `t("...")` of the console against `console/messages/en.json` plus
 * the product's `common` namespace (which the shared primitives read).
 */
import type own from "../../messages/en.json";
import type product from "../../../messages/en.json";
import type { AppLocale } from "@/i18n/locales";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof own & { common: (typeof product)["common"] };
  }
}
