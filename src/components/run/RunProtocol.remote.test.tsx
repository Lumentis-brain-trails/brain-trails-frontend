import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../messages/en.json";
import { FakeSocket } from "@/lib/live/fakeSocket";
import { RunProtocol } from "./RunProtocol";

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

const tree = {
  schema: 1,
  manifest: {},
  root: {
    type: "sequence",
    children: [
      {
        type: "block",
        id: "free",
        kind: "rest",
        label: "Free recording",
        config: { mode: "self_paced" },
      },
    ],
  },
};
const form = { key: "k", url: "https://s3", fields: {} };

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
  get.mockImplementation((path: string) => {
    if (path === "config")
      return Promise.resolve({
        env: "test",
        version: "x",
        consent_version: "v",
        features: { console_remote: true, live: true },
        live_url: "https://api.test",
      });
    if (path === "me/assignments/a1/live-room")
      return Promise.resolve({
        open: true,
        ticket: {
          ticket: "w",
          ws_path: "/live/waiting/a1",
          expires_in: 300,
          protocol: 2,
        },
      });
    return Promise.resolve({
      id: "p1",
      title: "Free recording",
      slug: "free",
      visibility: "workspace",
      outline: [
        { kind: "rest", label: "Free recording", count: 1, duration_s: 60 },
      ],
      summary: null,
      definition: tree,
      photosensitive: false,
    });
  });
  post.mockImplementation((path: string) => {
    if (path === "sessions")
      return Promise.resolve({
        id: "s1",
        status: "running",
        protocol_id: "p1",
        protocol_version: 1,
        title: "Free recording",
        recording_id: "r1",
        seed: 3,
        params: {},
        summary: {},
        n_events: 0,
        started_at: "2026-10-28T00:00:00Z",
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
        media: {},
        media_expires_at: "2026-10-28T01:00:00Z",
      });
    if (path === "sessions/s1/live/producer-ticket")
      return Promise.resolve({ ticket: "p", ws_path: "/live/sessions/s1" });
    return Promise.resolve(undefined);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the patient's Play joins the waiting room, then publishes the run and takes commands", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <RunProtocol
            protocolId="p1"
            detailPath="me/assignments/a1/protocol"
            backHref="/my"
            target={{ assignmentId: "a1" }}
            client
            remote
          />
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  await act(() => new Promise((r) => setTimeout(r, 50)));
  const waiting = FakeSocket.all.find((s) =>
    s.url.endsWith("/live/waiting/a1")
  );
  expect(waiting).toBeTruthy();
  await act(async () => {
    waiting!.open();
    waiting!.receive({
      type: "hello",
      role: "producer",
      preflight: null,
      session_id: null,
    });
  });
  expect(screen.getByText(messages.my.run.carerWaiting)).toBeTruthy();

  fireEvent.click(
    await screen.findByRole(
      "button",
      { name: messages.run.preflight.connect },
      { timeout: 5000 }
    )
  );
  await screen.findByText(/Connected to/, {}, { timeout: 5000 });
  await act(() => new Promise((r) => setTimeout(r, 1100)));
  // the carer sees the pre-flight
  expect(waiting!.sent.some((f) => f.type === "preflight")).toBe(true);
  const override = screen.queryByLabelText(messages.run.preflight.override);
  if (override) fireEvent.click(override);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.run.preflight.start })
    );
  });
  await act(() => new Promise((r) => setTimeout(r, 50)));
  const room = FakeSocket.all.find((s) => s.url.endsWith("/live/sessions/s1"));
  expect(room).toBeTruthy();
  await act(async () => {
    room!.open();
    room!.receive({
      type: "hello",
      last_seq: -1,
      observers: 1,
      pause_on_lost_sight: false,
    });
  });
  expect(room!.sent[0]).toEqual({ ticket: "p" });
  // the signal goes out a second at a time, with the plan
  await act(() => new Promise((r) => setTimeout(r, 2500)));
  expect(room!.sent.some((f) => f.type === "plan")).toBe(true);
  expect(room!.sent.some((f) => f.type === "chunk")).toBe(true);
  expect(room!.sent.some((f) => f.type === "quality")).toBe(true);
  // a carer's message reaches the participant's screen, and its marker goes back
  await act(async () =>
    room!.receive({
      type: "command",
      command: { id: "c9", type: "message", text: "All good?" },
    })
  );
  await act(() => new Promise((r) => setTimeout(r, 50)));
  expect(screen.getByText("All good?")).toBeTruthy();
  const acks = room!.sent.filter(
    (f) =>
      f.type === "event" &&
      (f.event as { label?: string }).label === "operator_command"
  );
  expect(acks).toHaveLength(1);
}, 30_000);
