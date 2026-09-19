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
import messages from "../../../../../../messages/en.json";
import RunProtocolPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (p: string) => get(p),
    post: (p: string, b: unknown) => post(p, b),
  },
}));

afterEach(() => cleanup());

const video = {
  id: "m1",
  kind: "video",
  visibility: "workspace",
  status: "ready",
  access: "open",
  tags: [],
  slug: "clip",
  title: "Clip",
  description: null,
  module: null,
  manifest: {},
  definition: {},
  duration_s: 1,
  language: null,
  review_state: "none",
  probe: {},
  created_at: "2026-09-19T00:00:00Z",
  mine: true,
  url: "https://example.com/v.mp4",
  cover_url: null,
};

const form = { key: "k", url: "https://s3", fields: {} };

test("a video protocol goes from pre-flight to the runner with the simulated headband", async () => {
  get.mockResolvedValue(video);
  post.mockResolvedValue({
    id: "s1",
    recording_id: "r1",
    seed: 7,
    capture: "upload",
    upload: {
      original: form,
      extras: form,
      ble: form,
      max_mb: 50,
      max_ble_mb: 200,
    },
    manifest: {},
    module: null,
    definition: {},
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const params = Promise.resolve({ id: "m1" });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <RunProtocolPage params={params} />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  fireEvent.click(
    await screen.findByRole(
      "button",
      { name: messages.run.preflight.connect },
      { timeout: 5000 }
    )
  );
  await screen.findByText(/Connected to/, {}, { timeout: 5000 });
  const override = screen.queryByLabelText(messages.run.preflight.override);
  if (override) fireEvent.click(override);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.run.preflight.start })
    );
  });
  expect(post).toHaveBeenCalledWith(
    "sessions",
    expect.objectContaining({ media_id: "m1" })
  );
  // the recording light shows once the run surface is up
  expect(await screen.findByRole("status", {}, { timeout: 5000 })).toBeTruthy();
  await act(() => new Promise((r) => setTimeout(r, 1500)));
}, 20_000);
