import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import PrivacyPage, { generateMetadata } from "./page";

// The note is a server component: its strings come through `next-intl/server`, which
// needs a request to resolve the locale from. Outside one, the English catalogue
// stands in, as in `src/app/page.test.tsx`.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("../../../../messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: "en",
        messages,
        namespace: namespace as never,
      }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

afterEach(cleanup);

/** The page as a route would hand it over; the exit control is a client component. */
async function renderNote(query: Record<string, string> = {}) {
  return render(
    <IntlEn>
      {await PrivacyPage({ searchParams: Promise.resolve(query) } as never)}
    </IntlEn>
  );
}

test("the note renders its title, its version and every section in English", async () => {
  await renderNote();
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "What happens to your data.",
    })
  ).toBeInTheDocument();
  expect(screen.getByText("Privacy note · v2026-09-22")).toBeInTheDocument();
  const sections = screen.getAllByRole("heading", { level: 2 });
  expect(sections).toHaveLength(16);
  expect(sections[0]).toHaveTextContent("1. What Brain Trails is, and is not");
  expect(sections[15]).toHaveTextContent("16. Contact");
});

test("sentences keep their emphasis and links, and print no message syntax", async () => {
  const { container } = await renderNote();
  expect(
    screen.getByText(
      "Brain Trails is a non-clinical research prototype, and this note is a draft published pending legal review."
    ).tagName
  ).toBe("STRONG");
  const mail = screen.getAllByRole("link", { name: "privacy@lumentis.ca" });
  expect(mail).toHaveLength(3);
  for (const link of mail)
    expect(link).toHaveAttribute("href", "mailto:privacy@lumentis.ca");
  expect(
    screen.getByRole("link", { name: "AWS documents this" })
  ).toHaveAttribute("target", "_blank");
  expect(container.textContent).not.toMatch(/[{}<>]/);
});

test("`?in=tab` swaps the back control for one that closes the tab", async () => {
  await renderNote();
  expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  cleanup();
  await renderNote({ in: "tab" });
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
});

test("the tab is titled from the catalogue", async () => {
  expect(await generateMetadata()).toEqual({ title: "Privacy" });
});
