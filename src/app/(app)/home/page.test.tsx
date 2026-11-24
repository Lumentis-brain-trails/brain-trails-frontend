import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../../messages/en.json";
import HomePage from "./page";

const get = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));

const state: {
  workspace: { id: string; kind: string } | undefined;
  config: { isPending: boolean; data?: { features: Record<string, boolean> } };
} = { workspace: undefined, config: { isPending: true } };
vi.mock("@/lib/workspace", async (orig) => ({
  ...(await orig<typeof import("@/lib/workspace")>()),
  useCurrentWorkspace: () => state.workspace,
  useWorkspaceConfig: () => state.config,
}));
vi.mock("@/components/therapy/ClinicHome", () => ({
  ClinicHome: () => <p>clinic home</p>,
}));

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <HomePage />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue([]);
});
afterEach(() => cleanup());

test("a practice waits for its flags: no personal home, no recordings call", async () => {
  state.workspace = { id: "w1", kind: "practice" };
  state.config = { isPending: true };
  const view = renderHome();
  await act(() => new Promise((r) => setTimeout(r, 0)));
  expect(screen.queryByText(messages.home.start.title)).toBeNull();
  expect(screen.queryByText("clinic home")).toBeNull();
  expect(get).not.toHaveBeenCalled();

  state.config = { isPending: false, data: { features: { therapy: true } } };
  view.rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={new QueryClient()}>
        <HomePage />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  expect(await screen.findByText("clinic home")).toBeTruthy();
  expect(screen.queryByText(messages.home.start.title)).toBeNull();
  await act(() => new Promise((r) => setTimeout(r, 0)));
  expect(get).not.toHaveBeenCalled();
});

test("a personal workspace opens on its own home without waiting for flags", async () => {
  state.workspace = { id: "w0", kind: "personal" };
  state.config = { isPending: true };
  renderHome();
  expect(await screen.findByText(messages.home.start.title)).toBeTruthy();
  await act(() => new Promise((r) => setTimeout(r, 0)));
  expect(get).toHaveBeenCalledWith("recordings?workspace=w0");
});
