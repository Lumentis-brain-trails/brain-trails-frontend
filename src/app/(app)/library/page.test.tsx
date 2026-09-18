import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import type { Media } from "@/lib/types";
import LibraryPage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (p: string) => get(p) } }));

function item(over: Partial<Media>): Media {
  return {
    id: crypto.randomUUID(),
    kind: "video",
    visibility: "private",
    status: "ready",
    slug: "slug",
    title: "Title",
    description: null,
    module: null,
    manifest: {},
    definition: {},
    duration_s: 120,
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

test("groups the catalog into rows and keeps other people's videos out of yours", async () => {
  get.mockResolvedValue([
    item({
      kind: "game",
      title: "Breathe",
      mine: false,
      visibility: "official",
    }),
    item({
      kind: "scenario",
      title: "The lever",
      mine: false,
      visibility: "official",
    }),
    item({
      kind: "video",
      title: "Official clip",
      mine: false,
      visibility: "official",
    }),
    item({ kind: "video", title: "My clip", mine: true }),
  ]);
  renderPage();

  await waitFor(() => expect(screen.getByText("Games")).toBeInTheDocument());
  expect(screen.getByText("Scenarios")).toBeInTheDocument();
  expect(screen.getByText("Your uploads")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "My clip" })).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Official clip/ })
  ).toBeInTheDocument();
});

test("an empty catalog invites the first upload", async () => {
  get.mockResolvedValue([]);
  renderPage();
  await waitFor(() =>
    expect(screen.getByText("Nothing in the library yet")).toBeInTheDocument()
  );
});
