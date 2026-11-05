import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn } from "@console/i18n/testing";
import { RoadmapApp } from "./RoadmapApp";
import type { Roadmap } from "./lib/gantt";

const get = vi.fn();
vi.mock("@console/lib/client", async (orig) => ({
  ...(await orig<typeof import("@console/lib/client")>()),
  ops: { get: (path: string) => get(path) },
}));

const ROADMAP: Roadmap = {
  updated: "2026-11-05",
  assumptions: "Planned dates are estimates.",
  tracks: [
    { id: "v4", name: "Plan V4", plan: null },
    { id: "mobile", name: "Phone app", plan: null },
  ],
  items: [
    {
      id: "t2",
      track: "v4",
      label: "T2",
      name: "Organisations and care teams",
      start: "2026-10-20",
      end: "2026-10-28",
      status: "done",
      tentative: false,
      size: "7-8 days",
      depends_on: [],
      note: null,
      tasks: [],
      questions: [],
      links: [],
    },
    {
      id: "apk",
      track: "mobile",
      label: "APK",
      name: "Android app downloadable from the site",
      start: "2026-11-06",
      end: "2026-11-15",
      status: "planned",
      tentative: false,
      size: "10 days",
      depends_on: ["t2"],
      note: "Not the app store.",
      tasks: [{ day: "Day 1 · 6 Nov", text: "Add the Android platform." }],
      questions: ["Where does the file live?"],
      links: [{ label: "Capacitor Android", url: "https://capacitorjs.com/docs/android" }],
    },
  ],
  milestones: [
    { id: "m-apk", track: "mobile", date: "2026-11-15", name: "Phone app on the site", status: "planned" },
  ],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlEn>
      <QueryClientProvider client={client}>
        <RoadmapApp semver="1.0.0" />
      </QueryClientProvider>
    </IntlEn>
  );
}

beforeEach(() => {
  get.mockImplementation(() => Promise.resolve(ROADMAP));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the chart draws every track and item, and the milestones list", async () => {
  renderPage();
  const chart = await screen.findByRole("img", { name: "Gantt of the roadmap" });
  expect(chart).toBeTruthy();
  expect(get).toHaveBeenCalledWith("roadmap");
  expect(screen.getByText("Plan V4")).toBeTruthy();
  expect(screen.getByText("Phone app")).toBeTruthy();
  expect(screen.getByRole("button", { name: "T2 Organisations and care teams" })).toBeTruthy();
  expect(screen.getByText("Phone app on the site")).toBeTruthy();
  expect(screen.getByText(/Pick an item on the chart/)).toBeTruthy();
});

test("a click on a row opens the item with its tasks, questions and dependencies", async () => {
  renderPage();
  const row = await screen.findByRole("button", {
    name: "APK Android app downloadable from the site",
  });
  fireEvent.click(row);
  expect(screen.getByRole("heading", { name: "Android app downloadable from the site" })).toBeTruthy();
  expect(screen.getByText("Add the Android platform.")).toBeTruthy();
  expect(screen.getByText("Where does the file live?")).toBeTruthy();
  expect(screen.getByText(/Depends on:/)).toBeTruthy();
  expect(screen.getByText("T2 Organisations and care teams", { selector: "p" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Capacitor Android" })).toHaveAttribute(
    "href",
    "https://capacitorjs.com/docs/android"
  );
  expect(screen.getByText("planned", { selector: "span" })).toBeTruthy();
});
