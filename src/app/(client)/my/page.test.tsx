import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../../messages/en.json";
import MyPage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (p: string) => get(p) } }));

afterEach(() => {
  cleanup();
  get.mockReset();
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <MyPage />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

test("a card per assignment with Play, past runs as a plain list", async () => {
  get.mockImplementation(async (path: string) =>
    path.startsWith("me/assignments")
      ? [
          {
            id: "a1",
            protocol_id: "p1",
            title: "Breathe",
            slug: "breathe",
            visibility: "workspace",
            summary: "Slow breathing",
            cover_url: null,
            est_duration_s: 300,
            organisation: "Studio Uno",
            runs_allowed: 3,
            runs_done: 1,
            due_at: "2020-01-01T12:00:00Z",
            note: "Evenings",
            created_at: "2019-12-01T00:00:00Z",
          },
        ]
      : [
          {
            id: "s1",
            title: "Breathe",
            slug: "breathe",
            visibility: "workspace",
            status: "aborted",
            started_at: "2019-12-02T10:00:00Z",
            ended_at: null,
          },
        ]
  );
  renderPage();
  expect(await screen.findByText("From Studio Uno")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Play" }).getAttribute("href")).toBe(
    "/my/run/a1"
  );
  expect(screen.getByText(/About 5 minutes/)).toBeTruthy();
  expect(screen.getByText(/2 sessions left/)).toBeTruthy();
  expect(screen.getByText("Evenings")).toBeTruthy();
  // a passed date is said kindly
  expect(screen.getByText(/you can still do it/)).toBeTruthy();
  expect(await screen.findByText("Stopped")).toBeTruthy();
});

test("nothing assigned says so", async () => {
  get.mockResolvedValue([]);
  renderPage();
  expect(await screen.findByText("Nothing to do right now")).toBeTruthy();
  expect(await screen.findByText("None yet.")).toBeTruthy();
});
