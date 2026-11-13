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
    if (path === "sessions/s1/live/observer-ticket")
      return Promise.resolve({ ticket: "o", ws_path: "/live/sessions/s1" });
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
  // a patient's run never offers the trail over the stage
  expect(screen.queryByText(messages.run.preflight.selfView)).toBeNull();
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

test("on yourself, the run can show your own live trail in the corner", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <RunProtocol
            protocolId="p1"
            detailPath="protocols/p1"
            backHref="/protocols/p1"
          />
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
  fireEvent.click(screen.getByText(messages.run.preflight.selfView));
  const override = screen.queryByLabelText(messages.run.preflight.override);
  if (override) fireEvent.click(override);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.run.preflight.start })
    );
  });
  await act(() => new Promise((r) => setTimeout(r, 100)));
  // the page publishes the run and watches it: two sockets on the session's room
  const sockets = FakeSocket.all.filter((s) =>
    s.url.endsWith("/live/sessions/s1")
  );
  expect(sockets).toHaveLength(2);
  for (const socket of sockets) await act(async () => socket.open());
  const watcher = sockets.find((s) => s.sent[0]?.ticket === "o");
  expect(watcher).toBeTruthy();
  await act(async () => {
    watcher!.receive({ type: "hello", you: "me", command: true, observers: 1 });
    watcher!.receive({
      id: "1-0",
      type: "trail",
      n: 3,
      final: false,
      points: [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
    });
  });
  const corner = screen.getByLabelText(messages.run.surface.selfTrail);
  expect(corner.querySelectorAll("path")).toHaveLength(2);
  // no map yet: the landscape waits for the first one the session grows
  const landscape = screen.getByRole("button", {
    name: messages.run.surface.selfViewLandscape,
  });
  expect(landscape).toBeDisabled();
  expect(screen.getByText(messages.run.surface.selfMapSoon)).toBeTruthy();
  await act(async () => {
    watcher!.receive({
      id: "2-0",
      type: "landscape",
      live: true,
      bounds: [0, 1, 0, 1],
      grid: {
        nx: 2,
        ny: 2,
        z: [
          [0, 0.5],
          [0.5, 1],
        ],
      },
      categories: [],
      cells: [],
      epoch: 1,
      n_windows: 30,
      trail: { t: [0, 1], x: [0.2, 0.4], y: [0.2, 0.6] },
    });
  });
  // then a switch: the trail in 2D or the landscape in 3D, with the dot on it
  expect(landscape).toBeEnabled();
  fireEvent.click(landscape);
  expect(landscape.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText(messages.run.surface.selfMap)).toBeTruthy();
  expect(corner.querySelectorAll("path")).toHaveLength(0);
  fireEvent.click(
    screen.getByRole("button", { name: messages.run.surface.selfViewTrail })
  );
  expect(corner.querySelectorAll("path")).toHaveLength(2);
});
