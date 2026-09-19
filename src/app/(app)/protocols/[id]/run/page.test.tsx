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

const MEDIA_ID = "11111111-1111-4111-8111-111111111111";

const tree = {
  schema: 1,
  manifest: {},
  root: {
    type: "sequence",
    children: [
      {
        type: "block",
        id: "clip",
        kind: "video",
        label: "Clip",
        config: { media_id: MEDIA_ID },
      },
    ],
  },
};

const protocol = {
  id: "p1",
  workspace_id: "w1",
  slug: "clip",
  title: "Clip",
  summary: null,
  cover_url: null,
  preview_url: null,
  visibility: "workspace",
  access: "open",
  review_state: "none",
  tags: [],
  language: null,
  current_version: 1,
  est_duration_s: 60,
  content_warning: null,
  mine: true,
  archived: false,
  created_at: "2026-09-19T00:00:00Z",
  description: null,
  outline: [{ kind: "video", label: "Clip", count: 1, duration_s: 60 }],
  definition: tree,
  draft: tree,
  draft_rev: 1,
};

const form = { key: "k", url: "https://s3", fields: {} };

test("a video protocol goes from pre-flight to the runner with the simulated headband", async () => {
  get.mockResolvedValue(protocol);
  post.mockImplementation((path: string) =>
    path.endsWith("/plan")
      ? Promise.resolve(undefined)
      : Promise.resolve({
          id: "s1",
          status: "running",
          protocol_id: "p1",
          protocol_version: 1,
          title: "Clip",
          recording_id: "r1",
          seed: 7,
          params: {},
          summary: {},
          n_events: 0,
          started_at: "2026-09-19T00:00:00Z",
          ended_at: null,
          capture: "upload",
          protocol_version_id: "v1",
          upload: {
            original: form,
            extras: form,
            ble: form,
            max_mb: 50,
            max_ble_mb: 200,
          },
          manifest: {},
          definition: tree,
          media: {
            [MEDIA_ID]: {
              url: "https://example.com/v.mp4",
              kind: "video",
              poster_url: null,
              duration_s: 1,
            },
          },
          media_expires_at: "2026-09-19T01:00:00Z",
        })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const params = Promise.resolve({ id: "p1" });
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
    expect.objectContaining({ protocol_id: "p1" })
  );
  // the plan this run resolved is posted back before the first block (V3-0004)
  expect(post).toHaveBeenCalledWith(
    "sessions/s1/plan",
    expect.objectContaining({ plan: expect.anything() })
  );
  // the recording light shows once the run surface is up
  expect(await screen.findByRole("status", {}, { timeout: 5000 })).toBeTruthy();
  await act(() => new Promise((r) => setTimeout(r, 1500)));
}, 20_000);
