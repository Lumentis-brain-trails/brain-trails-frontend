import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, expect, test } from "vitest";
import it from "../../../messages/it.json";
import { IntlEn } from "@/i18n/testing";
import { type ConsentData, PrivacyCard } from "./PrivacyCard";

afterEach(() => cleanup());

const consent: ConsentData = {
  current_version: "2026-09",
  core_version: "2026-09",
  core_at: "2026-09-18T10:00:00Z",
  research: false,
  research_at: null,
  research_version: null,
};

function withQueries(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

test("the closing sentence keeps its two links and reads as one sentence", () => {
  render(
    withQueries(
      <IntlEn>
        <PrivacyCard data={consent} />
      </IntlEn>
    )
  );
  const note = screen.getByRole("link", { name: /privacy note/ });
  expect(note.getAttribute("href")).toBe("/privacy?in=tab");
  expect(note.textContent).toBe("privacy note (opens in a new tab)");
  const address = screen.getByRole("link", { name: "privacy@lumentis.ca" });
  expect(address.getAttribute("href")).toBe("mailto:privacy@lumentis.ca");
  expect(note.closest("p")?.textContent).toBe(
    "Read the privacy note (opens in a new tab), or write to privacy@lumentis.ca. You can export or delete everything below."
  );
});

test("what was agreed to is shown with its date and version", () => {
  render(
    withQueries(
      <IntlEn>
        <PrivacyCard data={consent} />
      </IntlEn>
    )
  );
  const date = new Date(consent.core_at).toLocaleDateString("en");
  expect(screen.getByText(`Agreed on ${date} · version 2026-09`)).toBeTruthy();
  expect(screen.getByText(/^Optional\./)).toBeTruthy();
});

test("a given research consent says when, and how to take it back", () => {
  const given = {
    ...consent,
    research: true,
    research_at: "2026-09-20T10:00:00Z",
    research_version: "2026-09",
  };
  render(
    withQueries(
      <IntlEn>
        <PrivacyCard data={given} />
      </IntlEn>
    )
  );
  const date = new Date(given.research_at).toLocaleDateString("en");
  expect(
    screen.getByText(
      new RegExp(`^Agreed on ${date} · version 2026-09\\. Untick to withdraw`)
    )
  ).toBeTruthy();
});

test("in Italian the same sentence carries the same two links, dated the Italian way", () => {
  render(
    withQueries(
      <NextIntlClientProvider locale="it" messages={it}>
        <PrivacyCard data={consent} />
      </NextIntlClientProvider>
    )
  );
  expect(
    screen
      .getByRole("link", { name: /informativa sulla privacy/ })
      .getAttribute("href")
  ).toBe("/privacy?in=tab");
  expect(
    screen
      .getByRole("link", { name: "privacy@lumentis.ca" })
      .getAttribute("href")
  ).toBe("mailto:privacy@lumentis.ca");
  const date = new Date(consent.core_at).toLocaleDateString("it");
  expect(
    screen.getByText(`Consenso dato il ${date} · versione 2026-09`)
  ).toBeTruthy();
});
