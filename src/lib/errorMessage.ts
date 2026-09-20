/**
 * Turn anything an API call can throw into a sentence for the user.
 *
 * The backend's error envelope carries a stable `code` and an English `message` meant
 * for logs. The UI shows the translation of the code when `messages/*.json` has one
 * (`errors.<code>`), the server's message when it does not, and a generic sentence when
 * there is neither - so a new backend error is readable on day one and translatable
 * the day someone adds its key (plan V3, "Internationalisation").
 */
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { ApiRequestError } from "@/lib/api";

type ErrorsT = ReturnType<typeof useTranslations<"errors">>;

/** HTTP statuses whose meaning does not depend on the endpoint. */
const STATUS_CODES: Record<number, string> = {
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  429: "rate_limited",
};

/** The pure rule, separate from the hook so it can be tested without React. */
export function describeError(t: ErrorsT, error: unknown): string {
  if (error instanceof ApiRequestError) {
    // "unknown" is what the client invents for a body it could not read, not a code
    // the server chose: the status says more than it does.
    const code = error.error.code === "unknown" ? "" : error.error.code;
    if (code && t.has(code as never)) return t(code as never);
    const message = error.error.message?.trim();
    if (code && message) return message;
    const byStatus = STATUS_CODES[error.status];
    return byStatus ? t(byStatus as never) : t("unknown");
  }
  if (error instanceof TypeError) return t("network"); // fetch itself failed
  return t("unknown");
}

/** `const message = useErrorMessage(); message(error)` inside a component. */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations("errors");
  return useCallback((error: unknown) => describeError(t, error), [t]);
}
