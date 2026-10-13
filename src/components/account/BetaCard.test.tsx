import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import { type ApplicationData, BetaCard } from "./BetaCard";

beforeEach(() => {
  // the card asks for the answer lists; nothing here depends on what comes back
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const application: ApplicationData = {
  decision: "waitlisted",
  wants_beta: true,
  intended_use: "patients",
  intended_use_other: null,
};

function renderCard(data: ApplicationData, locale: "en" | "it" = "en") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "en" ? en : it}
      >
        <BetaCard data={data} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

test("an applicant reads where the board got to and what they answered", () => {
  renderCard(application);
  expect(screen.getByText(en.beta.status.waitlisted)).toBeTruthy();
  expect(screen.getByText("With patients or clients")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Edit your answers" })
  ).toBeTruthy();
});

test("a decision this build does not know reads as answers received", () => {
  renderCard({ ...application, decision: "deferred" });
  expect(screen.getByText(en.beta.status.pending)).toBeTruthy();
});

test("someone who never applied is offered the application", () => {
  renderCard({ ...application, wants_beta: false, intended_use: null });
  expect(screen.getByText("You are not on the list.")).toBeTruthy();
  expect(screen.getByRole("button", { name: en.beta.apply })).toBeTruthy();
});

test("their own words stand in for the `other` option, and its label when there are none", () => {
  renderCard({
    ...application,
    intended_use: "other",
    intended_use_other: "A school project",
  });
  expect(screen.getByText("A school project")).toBeTruthy();
  cleanup();
  renderCard({ ...application, intended_use: "other" });
  expect(screen.getByText("Other")).toBeTruthy();
});

test("the card reads in Italian, answer included", () => {
  renderCard(application, "it");
  expect(screen.getByText(it.beta.status.waitlisted)).toBeTruthy();
  expect(screen.getByText("Con pazienti o clienti")).toBeTruthy();
});
