import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Home from "./page";

// A server component reads its strings through `next-intl/server`, which needs a
// request to resolve the locale from. Outside one, the English catalogue stands in.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("../../messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: "en",
        messages,
        namespace: namespace as never,
      }),
  };
});

test("entry screen shows the name and both ways in", async () => {
  render(await Home());
  expect(
    screen.getByRole("heading", { name: "Braintrails" })
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login"
  );
  expect(
    screen.getByRole("link", { name: "Create an account" })
  ).toHaveAttribute("href", "/register");
  expect(screen.getByRole("link", { name: "privacy" })).toHaveAttribute(
    "href",
    "/privacy"
  );
});
