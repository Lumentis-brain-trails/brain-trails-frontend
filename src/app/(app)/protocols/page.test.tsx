import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ProtocolCard } from "@/lib/protocol/catalog";
import ProtocolsPage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", () => ({
  ApiRequestError: class extends Error {},
  api: {
    get: (p: string) =>
      p === "workspaces"
        ? Promise.resolve([{ id: "w1", kind: "personal" }])
        : get(p),
  },
}));

function card(over: Partial<ProtocolCard>): ProtocolCard {
  return {
    id: crypto.randomUUID(),
    workspace_id: "w1",
    slug: "slug",
    title: "Title",
    summary: null,
    cover_url: null,
    preview_url: null,
    visibility: "official",
    access: "open",
    review_state: "none",
    tags: [],
    language: null,
    current_version: 1,
    est_duration_s: 120,
    content_warning: null,
    mine: false,
    archived: false,
    created_at: new Date().toISOString(),
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProtocolsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => get.mockReset());
// vitest runs without globals, so testing-library never registers its own auto-cleanup.
afterEach(() => cleanup());

test("one row per shelf and per tag, and drafts only in yours", async () => {
  get.mockImplementation((path?: string) =>
    Promise.resolve(
      (path ?? "").includes("mine=true")
        ? [
            card({
              title: "My draft",
              visibility: "workspace",
              mine: true,
              current_version: null,
            }),
          ]
        : [
            card({ title: "Signal Navigator", tags: ["attention"] }),
            card({
              title: "Breath Pacing",
              tags: ["anxiety"],
              access: "locked",
            }),
            card({ title: "Shared one", visibility: "public" }),
          ]
    )
  );
  renderPage();

  await waitFor(() =>
    expect(screen.getByText("Attention")).toBeInTheDocument()
  );
  expect(
    screen.getByRole("heading", { name: "Official", level: 2 })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Community", level: 2 })
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "Yours", level: 2 })
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: /Signal Navigator/ })[0]
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "My draft" })).toBeInTheDocument();
  // Cognitive Decline has nothing tagged to it, so the row is not drawn empty.
  expect(screen.queryByText("Cognitive Decline")).not.toBeInTheDocument();
});

test("asks for locked protocols, since showing what is coming is the point", async () => {
  get.mockResolvedValue([]);
  renderPage();
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(get).toHaveBeenCalledWith("protocols?include_locked=true&limit=100");
});

/** A locked card must not be a link: there is nothing behind it to open. */
test("a locked protocol is shown but cannot be opened", async () => {
  get.mockImplementation((path?: string) =>
    Promise.resolve(
      (path ?? "").includes("mine=true")
        ? []
        : [
            card({
              title: "Visual Oddballs",
              tags: ["cognitive_decline"],
              access: "locked",
            }),
          ]
    )
  );
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

test("runnable protocols lead their row, ahead of locked ones", async () => {
  get.mockImplementation((path?: string) =>
    Promise.resolve(
      (path ?? "").includes("mine=true")
        ? []
        : [
            card({
              title: "Zebra Locked",
              tags: ["attention"],
              access: "locked",
            }),
            card({
              title: "Apple Locked",
              tags: ["attention"],
              access: "locked",
            }),
            card({ title: "Runnable", tags: ["attention"] }),
          ]
    )
  );
  renderPage();

  await waitFor(() =>
    expect(screen.getByText("Attention")).toBeInTheDocument()
  );
  const attention = screen.getByRole("region", { name: "Attention" });
  const titles = Array.from(attention.querySelectorAll("h3")).map(
    (h) => h.textContent
  );
  expect(titles).toEqual(["Runnable", "Apple Locked", "Zebra Locked"]);
});

test("an empty catalog points at My media", async () => {
  get.mockResolvedValue([]);
  renderPage();
  await waitFor(() =>
    expect(screen.getByText("No protocols yet")).toBeInTheDocument()
  );
});

test("survives an API that predates tags and access", async () => {
  // The deployed API has been ahead of and behind the frontend before; a missing
  // `tags` threw during render and took the page to the error boundary.
  const legacy = card({ title: "Signal Navigator" });
  delete (legacy as Partial<ProtocolCard>).tags;
  delete (legacy as Partial<ProtocolCard>).access;
  get.mockImplementation((path?: string) =>
    Promise.resolve((path ?? "").includes("mine=true") ? [] : [legacy])
  );

  renderPage();

  expect(await screen.findByText("Signal Navigator")).toBeTruthy();
  expect(screen.queryByText("No protocols yet")).toBeNull();
  expect(screen.queryByText(/Beta testers get them first/)).toBeNull();
});
