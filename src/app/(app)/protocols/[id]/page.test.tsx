import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../../../messages/en.json";
import { fakeWorkspaceApi } from "@/test/workspaceApi";
import ProtocolPage from "./page";

const fake = vi.hoisted(() => ({
  api: null as unknown as ReturnType<typeof fakeWorkspaceApi>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (path: string) => fake.api.get(path),
    post: (path: string, body: unknown) => fake.api.post(path, body),
    delete: vi.fn(),
  },
}));

afterEach(cleanup);

const someoneElses = {
  id: "p1",
  workspace_id: "other",
  slug: "breathe",
  title: "Breathe",
  summary: null,
  cover_url: null,
  preview_url: null,
  visibility: "public",
  access: "open",
  review_state: "accepted",
  tags: [],
  language: null,
  current_version: 1,
  est_duration_s: 60,
  content_warning: null,
  mine: false,
  archived: false,
  created_at: "2026-10-20T00:00:00Z",
  description: null,
  outline: [],
  definition: null,
};

test("a copy waits for the workspace, then lands in the clinic's library", async () => {
  fake.api = fakeWorkspaceApi({ "protocols/p1": someoneElses });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <ProtocolPage params={Promise.resolve({ id: "p1" })} />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  const copy = await screen.findByRole("button", {
    name: messages.protocols.detail.actions.copy,
  });
  expect((copy as HTMLButtonElement).disabled).toBe(true); // flags unknown
  await act(async () => fake.api.answerConfig());
  await vi.waitFor(() =>
    expect((copy as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(copy);
  await vi.waitFor(() => expect(fake.api.post).toHaveBeenCalledOnce());
  expect(fake.api.post.mock.calls[0][0]).toBe(
    "protocols/p1/duplicate?workspace=c1"
  );
});
