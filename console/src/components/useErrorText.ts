"use client";

import { useTranslations } from "next-intl";
import { OpsRequestError } from "@console/lib/client";

/** Error codes the console words itself; anything else falls back to `generic`. */
const KNOWN = [
  "product_login_refused",
  "not_a_console_user",
  "invalid_credentials",
  "wrong_code",
  "signed_out",
  "forbidden",
  "rate_limited",
  "product_unavailable",
  "upstream_unavailable",
  "console_unavailable",
  "read_unavailable",
  "already_enrolled",
  "cluster_unavailable",
  "cluster_forbidden",
  "no_pod",
  "invalid_pod",
] as const;

type Known = (typeof KNOWN)[number];

/** A function turning any thrown value into a sentence in the reader's language. */
export function useErrorText(): (error: unknown) => string {
  const t = useTranslations("console.errors");
  return (error: unknown) => {
    if (
      error instanceof OpsRequestError &&
      (KNOWN as readonly string[]).includes(error.code)
    ) {
      return t(error.code as Known);
    }
    return t("generic");
  };
}
