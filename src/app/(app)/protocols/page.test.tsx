import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { Media } from "@/lib/types";
import LibraryPage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (p: string) =>
      p === "workspaces"
        ? Promise.resolve([{ id: "w1", kind: "personal" }])
        : get(p),
  },
}));

function item(over: Partial<Media>): Media {
  return {
    id: crypto.randomUUID(),
    kind: "video",
    visibility: "workspace",
    status: "ready",
    access: "open",
    tags: [],
    slug: "slug",
    title: "Title",
    description: null,
    module: null,
    manifest: {},
    definition: {},
    duration_s: 120,
    language: null,
    review_state: "none",
    probe: {},
    created_at: new Date().toISOString(),
    mine: true,
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LibraryPage />
    </QueryClientProvider>
  );
}

beforeEach(() => get.mockReset());
// vitest runs without globals, so testing-library never registers its own auto-cleanup.
afterEach(() => cleanup());

test("builds one row per tag and keeps other people's videos out of yours", async () => {
  get.mockResolvedValue([
    item({
      kind: "game",
      title: "Signal Navigator",
      mine: false,
      visibility: "official",
      tags: ["attention"],
    }),
    item({
      kind: "quiz",
      title: "Breath Pacing",
      mine: false,
      visibility: "official",
      tags: ["anxiety"],
      access: "locked",
    }),
    item({ kind: "video", title: "My clip", mine: true }),
  ]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText("Attention")).toBeInTheDocument()
  );
  expect(screen.getByText("Anxiety")).toBeInTheDocument();
  expect(screen.getByText("Your uploads")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Signal Navigator/ })
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "My clip" })).toBeInTheDocument();

  // Cognitive Decline has nothing tagged to it, so the row is not drawn empty.
  expect(screen.queryByText("Cognitive Decline")).not.toBeInTheDocument();
});

test("asks for locked items, since showing what is coming is the point", async () => {
  get.mockResolvedValue([]);
  renderPage();
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(get).toHaveBeenCalledWith("media?include_locked=true&workspace=w1");
});

/** A locked card must not be a link: there is nothing behind it to open. */
test("a locked item is shown but cannot be opened", async () => {
  get.mockResolvedValue([
    item({
      kind: "quiz",
      title: "Visual Oddballs",
      mine: false,
      visibility: "official",
      tags: ["cognitive_decline"],
      access: "locked",
    }),
  ]);
  renderPage();

  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Visual Oddballs" })
    ).toBeInTheDocument()
  );
  expect(
    screen.queryByRole("link", { name: /Visual Oddballs/ })
  ).not.toBeInTheDocument();
  expect(screen.getByText("Beta testers only")).toBeInTheDocument();
  expect(screen.getByText(/Beta testers get them first/)).toBeInTheDocument();
});

test("runnable items lead their row, ahead of locked ones", async () => {
  get.mockResolvedValue([
    item({
      title: "Zebra Locked",
      kind: "quiz",
      mine: false,
      tags: ["attention"],
      access: "locked",
    }),
    item({
      title: "Apple Locked",
      kind: "quiz",
      mine: false,
      tags: ["attention"],
      access: "locked",
    }),
    item({
      title: "Runnable",
      kind: "game",
      mine: false,
      tags: ["attention"],
      access: "open",
    }),
  ]);
  renderPage();

  await waitFor(() =>
    expect(screen.getByText("Attention")).toBeInTheDocument()
  );
  const titles = screen
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent);
  // open first, then locked alphabetically
  expect(titles).toEqual(["Runnable", "Apple Locked", "Zebra Locked"]);
});

test("an empty catalog invites the first upload", async () => {
  get.mockResolvedValue([]);
  renderPage();
  await waitFor(() =>
    expect(screen.getByText("No protocols yet")).toBeInTheDocument()
  );
});

test("survives an API that predates tags and access, and still shows the catalog", async () => {
  // Exactly what the deployed API returned while the frontend was ahead of it: no `tags`
  // and no `access` keys at all. This threw `TypeError: i.tags is undefined` during render
  // and took the whole page to the error boundary, so the fields are optional now.
  const legacy = item({ kind: "game", title: "Signal Navigator", mine: false });
  delete (legacy as Partial<Media>).tags;
  delete (legacy as Partial<Media>).access;
  get.mockResolvedValue([legacy]);

  renderPage();

  // One fallback row rather than three empty ones plus "nothing in the library yet".
  expect(await screen.findByText("Everything")).toBeTruthy();
  expect(screen.getByText("Signal Navigator")).toBeTruthy();
  expect(screen.queryByText("No protocols yet")).toBeNull();
  // Nothing is locked, so the beta-tester footnote stays away.
  expect(screen.queryByText(/Beta\s+testers get them first/)).toBeNull();
});

test("an item missing only access is treated as open, not locked", async () => {
  // Not `mine`, so it lands in the Attention row only and not also in "Your uploads".
  const partial = item({
    kind: "game",
    title: "Half Migrated",
    mine: false,
    visibility: "official",
    tags: ["attention"],
  });
  delete (partial as Partial<Media>).access;
  get.mockResolvedValue([partial]);

  renderPage();

  const card = await screen.findByText("Half Migrated");
  await waitFor(() => expect(card.closest("a")).not.toBeNull());
});
