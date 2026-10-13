import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn } from "@/i18n/testing";
import AdminDashboardPage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: (path: string) => get(path) },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlEn>
      <QueryClientProvider client={client}>
        <AdminDashboardPage />
      </QueryClientProvider>
    </IntlEn>
  );
}

beforeEach(() => {
  get.mockImplementation((path: string) =>
    Promise.resolve(
      path === "admin/stats"
        ? {
            users_by_status: { active: 7, pending: 2, rejected: 3 },
            recordings: {
              count: 12,
              total_minutes: 40,
              by_task: { rest_eyes_open: 5, brand_new_task: 1 },
              by_source: { stream: 1 },
              per_day: [{ day: "2026-10-12", count: 4 }],
            },
            jobs_by_status: { failed: 2 },
          }
        : [
            {
              id: "u1",
              email: "ada@example.com",
              status: "active",
              member_since: "2026-10-01T10:00:00Z",
              recordings: 3,
              total_minutes: 9,
              last_activity: null,
            },
            {
              id: "u2",
              email: "bo@example.com",
              status: "suspended",
              member_since: "2026-10-01T10:00:00Z",
              recordings: 0,
              total_minutes: 0,
              last_activity: null,
            },
          ]
    )
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the figures carry their hints, counted in whole sentences", async () => {
  renderPage();
  expect(await screen.findByText("Active participants")).toBeTruthy();
  expect(screen.getByText("3 rejected")).toBeTruthy();
  expect(screen.getByText("1 live session")).toBeTruthy();
  expect(screen.getByText("2 failed jobs")).toBeTruthy();
});

test("a task is named by the catalogue, an unknown one by its label", async () => {
  renderPage();
  expect(await screen.findByText("rest eyes open")).toBeTruthy();
  expect(screen.getByText("brand new task")).toBeTruthy();
  expect(screen.getByTitle("2026-10-12: 4")).toBeTruthy();
});

test("an account status gets its word, an unknown one stays as stored", async () => {
  renderPage();
  expect(await screen.findByText("ada@example.com")).toBeTruthy();
  expect(screen.getByText("Active")).toBeTruthy();
  expect(screen.getByText("suspended")).toBeTruthy();
});
