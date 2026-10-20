import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import AdminApplicationsPage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: (path: string) => get(path), post: vi.fn() },
}));

const COHORT = {
  id: "c1",
  name: "Therapists, autumn",
  profile: "therapist",
  target: 10,
  counts: { accepted: 4, waitlisted: 1 },
};

function row() {
  return {
    user: { id: "u1", email: "ada@example.com", status: "pending" },
    profile: { full_name: "Ada Rossi" },
    cohort: { id: "c1", name: "Therapists, autumn" },
    application: {
      requested_profile: "therapist",
      decision: "pending",
      created_at: "2026-10-12T09:30:00Z",
      admin_note: null,
      purpose: "Sessions with my patients.",
      organisation: "Studio Rossi",
      role_title: null,
      registration_no: "12345",
      institution: null,
      supervisor: null,
      headband: "none",
      device: "MacBook",
      browser: null,
      country: "IT",
      language: null,
      expected_subjects: 8,
      web_bluetooth: false,
    },
  };
}

let rows: ReturnType<typeof row>[] = [];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlEn>
      <QueryClientProvider client={client}>
        <AdminApplicationsPage />
      </QueryClientProvider>
    </IntlEn>
  );
}

beforeEach(() => {
  rows = [row()];
  get.mockImplementation((path: string) =>
    Promise.resolve(path === "admin/cohorts" ? [COHORT] : rows)
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("a card says who applied, as what, when and into which cohort", async () => {
  renderPage();
  expect(await screen.findByText("Ada Rossi")).toBeTruthy();
  expect(
    screen.getByText(
      /^Therapist · ada@example\.com · applied .*2026.* · Therapists, autumn$/
    )
  ).toBeTruthy();
  expect(screen.getByText("Pending", { selector: "span" })).toBeTruthy();
});

test("answers take the form's labels or the board's, and the headband its words", async () => {
  renderPage();
  await screen.findByText("Ada Rossi");
  expect(screen.getByText("Organisation")).toBeTruthy();
  expect(screen.getByText("Registration no.")).toBeTruthy();
  expect(screen.getByText("Expected subjects")).toBeTruthy();
  expect(screen.getByText("Headband")).toBeTruthy();
  expect(screen.getByText("None yet")).toBeTruthy();
  expect(screen.getByText("No - cannot pair here")).toBeTruthy();
  // What nobody answered has no row.
  expect(screen.queryByText("Supervisor")).toBeNull();
});

test("a cohort shows its counts against its target", async () => {
  renderPage();
  expect(
    await screen.findByText("4 / 10 accepted · 1 waitlisted")
  ).toBeTruthy();
});

test("each decision tab has its own empty sentence", async () => {
  rows = [];
  renderPage();
  expect(await screen.findByText("Nothing pending.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Waitlisted" }));
  expect(await screen.findByText("Nothing waitlisted.")).toBeTruthy();
  expect(get).toHaveBeenCalledWith(
    "admin/applications?decision=waitlisted&limit=200"
  );
});
