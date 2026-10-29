/**
 * Type-checks every `t("...")` of the console against `console/messages/en.json` plus
 * the product namespaces it shares (`./catalogue`).
 */
import type own from "../../messages/en.json";
import type product from "../../../messages/en.json";
import type { AppLocale } from "@/i18n/locales";
import type { Shared } from "./catalogue";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof own & Pick<typeof product, Shared>;
  }
}
