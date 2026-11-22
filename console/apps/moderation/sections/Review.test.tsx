import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn } from "@console/i18n/testing";
import { ReviewSection as AdminReviewPage } from "./Review";

const get = vi.fn();
vi.mock("@console/lib/product", async (orig) => ({
  ...(await orig<typeof import("@console/lib/product")>()),
  api: { get: (path: string) => get(path), post: vi.fn() },
}));

let protocols: unknown[] = [];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlEn>
      <QueryClientProvider client={client}>
        <AdminReviewPage />
      </QueryClientProvider>
    </IntlEn>
  );
}

beforeEach(() => {
  protocols = [
    {
      id: "p1",
      title: "Calm before the task",
      current_version: 3,
      est_duration_s: 600,
      tags: ["attention", "a_new_tag"],
      description: "Two minutes of rest, then arrows.",
      summary: null,
      cover_url: null,
      content_warning: "Flashing images",
      outline: [
        { label: "Rest", kind: "baseline", count: 1, duration_s: 120 },
        { label: "Arrows", kind: "flanker", count: 2, duration_s: null },
        { label: "Later", kind: "kind-of-tomorrow", count: 1, duration_s: 20 },
      ],
    },
  ];
  get.mockImplementation((path: string) =>
    Promise.resolve(path === "admin/review/protocols" ? protocols : [])
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("a protocol comes with its version, length, tags and warning", async () => {
  renderPage();
  expect(await screen.findByText("Calm before the task")).toBeTruthy();
  expect(
    screen.getByText("version 3 · 10 min · Attention, a_new_tag")
  ).toBeTruthy();
  expect(screen.getByText("Content warning: Flashing images")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Refuse" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
});

test("the outline reads as it will on the protocol's own page", async () => {
  renderPage();
  await screen.findByText("Calm before the task");
  const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(steps).toEqual([
    "Rest — Resting baseline, 2 min",
    "Arrows — Arrows game ×2",
    "Later — kind-of-tomorrow, 20 s",
  ]);
});

test("an empty queue says so", async () => {
  protocols = [];
  renderPage();
  expect(await screen.findByText("Nothing to review.")).toBeTruthy();
});
