import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";
import messages from "../../messages/en.json";
import { ApiRequestError } from "./api";
import { describeError } from "./errorMessage";

const t = createTranslator({
  locale: "en",
  messages,
  namespace: "errors",
}) as unknown as Parameters<typeof describeError>[0];

const apiError = (status: number, code: string, message = "") =>
  new ApiRequestError(status, { code, message });

describe("describeError", () => {
  test("a known code is translated", () => {
    expect(
      describeError(t, apiError(404, "not_found", "media not found"))
    ).toBe(messages.errors.not_found);
  });

  test("an unknown code falls back to the server's message", () => {
    expect(
      describeError(
        t,
        apiError(422, "slug_taken", "you already have this slug")
      )
    ).toBe("you already have this slug");
  });

  test("no usable message falls back to the status, then to generic", () => {
    expect(describeError(t, apiError(429, "unknown"))).toBe(
      messages.errors.rate_limited
    );
    expect(describeError(t, apiError(500, "unknown"))).toBe(
      messages.errors.unknown
    );
  });

  test("a failed fetch is a network error; anything else is generic", () => {
    expect(describeError(t, new TypeError("Failed to fetch"))).toBe(
      messages.errors.network
    );
    expect(describeError(t, new Error("x"))).toBe(messages.errors.unknown);
  });
});
