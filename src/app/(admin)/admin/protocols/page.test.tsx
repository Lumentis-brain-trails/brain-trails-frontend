import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AdminProtocolsPage from "./page";

const get = vi.fn();
const patch = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (path: string) => get(path),
    patch: (path: string, body: unknown) => patch(path, body),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Shaped like the API's ProtocolCard: `archived` is a boolean, there is no `archived_at`.
function card(
  id: string,
  title: string,
  access: "open" | "locked",
  archived = false
) {
  return {
    id,
    slug: id,
    title,
    summary: null,
    access,
    archived,
    est_duration_s: 600,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminProtocolsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockResolvedValue([
    card("signal-navigator", "Signal Navigator", "open"),
    card("flanker-control", "Flanker control", "locked"),
    card("old-one", "Retired", "open", true),
  ]);
  patch.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("lists the official protocols that are not archived, with their locks", async () => {
  renderPage();
  expect(await screen.findByText("Signal Navigator")).toBeTruthy();
  expect(screen.getByText("Flanker control")).toBeTruthy();
  expect(screen.queryByText("Retired")).toBeNull();
  expect(screen.getByText("1 of 2 can be started")).toBeTruthy();
  expect(get).toHaveBeenCalledWith(
    "protocols?circle=official&include_locked=true&limit=100"
  );
});

test("Lock and Unlock send the new access for that protocol", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Lock" }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      "admin/protocols/signal-navigator/access",
      {
        access: "locked",
      }
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      "admin/protocols/flanker-control/access",
      {
        access: "open",
      }
    )
  );
});
