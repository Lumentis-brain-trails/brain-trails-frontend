/**
 * The console once the run is in the participant's window: what happens when that
 * window is lost, and when the headband drops. Real timers and the simulated headband,
 * as the run page's own test; the participant's window is a plain BroadcastChannel.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../../../messages/en.json";
import { type ChannelMessage, channelName } from "@/lib/console/channel";
import { SimulatedMuse } from "@/lib/muse/device";
import type { Marker } from "@/lib/protocol/marker";
import ConsolePage from "./page";

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
// the capture goes to storage straight from the browser; not in a test
vi.mock("@/lib/upload", async (orig) => ({
  ...(await orig<typeof import("@/lib/upload")>()),
  uploadToStorage: () => Promise.resolve(),
}));

afterEach(() => {
  cleanup();
  get.mockReset();
  post.mockReset();
  vi.restoreAllMocks();
});

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

const protocol = {
  id: "p1",
  workspace_id: "w1",
  slug: "free",
  title: "Free recording",
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
  created_at: "2026-10-15T00:00:00Z",
  description: null,
  outline: [
    { kind: "rest", label: "Free recording", count: 1, duration_s: 60 },
  ],
  definition: tree,
  draft: tree,
  draft_rev: 1,
};

const form = { key: "k", url: "https://s3", fields: {} };

function serve() {
  get.mockImplementation((path: string) =>
    path === "config"
      ? Promise.resolve({
          env: "test",
          version: "x",
          features: { console: true },
        })
      : Promise.resolve(protocol)
  );
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
        started_at: "2026-10-15T00:00:00Z",
        ended_at: null,
        capture: "upload",
        protocol_version_id: "v1",
        upload: {
          original: { ...form, key: "uploads-pending/w/s1/original.csv" },
          extras: form,
          ble: form,
          max_mb: 50,
          max_ble_mb: 200,
        },
        manifest: {},
        definition: tree,
        media: {},
        media_expires_at: "2026-10-15T01:00:00Z",
      });
    return Promise.resolve({});
  });
}

/** Render the console, connect the simulated headband, open the "window", Start. */
async function startRun(runKey: string) {
  serve();
  vi.spyOn(window, "open").mockReturnValue(null);
  const connect = vi.spyOn(SimulatedMuse.prototype, "connect");
  const participant = new BroadcastChannel(channelName(runKey));
  const heard: ChannelMessage[] = [];
  participant.onmessage = (event) => heard.push(event.data);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <ConsolePage
              params={Promise.resolve({ session: runKey })}
              searchParams={Promise.resolve({ protocol: "p1" })}
            />
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

  participant.postMessage({ type: "hello" });
  await screen.findByText(messages.console.participant.connected);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.run.preflight.start })
    );
  });
  // a console run says so, for the stats (T1)
  expect(post).toHaveBeenCalledWith(
    "sessions",
    expect.objectContaining({ console: "local" })
  );
  // the console boots the participant's window once the headband clock is fitted
  await waitFor(() => expect(heard.some((m) => m.type === "boot")).toBe(true), {
    timeout: 8000,
  });
  participant.postMessage({
    type: "state",
    state: {
      status: "running",
      stepIndex: 0,
      stepId: "free",
      pausePending: false,
      extendable: false,
      attempt: 0,
      message: null,
    },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: messages.console.commands.endBlock })
    ).toBeEnabled()
  );
  const muse = connect.mock.contexts[0] as SimulatedMuse;
  return { participant, heard, muse };
}

const finishCalls = () =>
  post.mock.calls.filter(([path]) => path === "sessions/s1/finish");

test("a participant window closed mid-run is lost until it is opened again; stop-and-save works", async () => {
  const { participant, heard } = await startRun("run-lost");

  participant.postMessage({ type: "gone" });
  expect(
    await screen.findByText(messages.console.participantGone)
  ).toBeInTheDocument();
  expect(screen.getByText(messages.console.plan.lost)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: messages.console.commands.endBlock })
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: messages.console.participant.reopen })
  ).toBeInTheDocument();
  expect(heard.some((m) => m.type === "detached")).toBe(false);

  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: messages.console.stopAndSave })
    );
  });
  await waitFor(() => expect(finishCalls()).toHaveLength(1), {
    timeout: 5000,
  });
  expect(finishCalls()[0][1]).toMatchObject({ aborted: true });
  participant.close();
}, 30_000);

test("a participant window reloaded mid-run is booted again where the run was", async () => {
  const { participant, heard } = await startRun("run-reload");
  const stamp = (seq: number, label: string, meta = {}) => ({
    label,
    kind: "stage",
    tMonotonicMs: seq,
    tRunMs: seq,
    tSessionS: seq / 1000,
    seq,
    meta: { step_id: "free", ...meta },
  });
  participant.postMessage({ type: "marker", marker: stamp(0, "block_start") });
  participant.postMessage({ type: "marker", marker: stamp(1, "rest_start") });
  // the lost window had its first marker acknowledged before it went
  participant.postMessage({ type: "acked", seqs: [0] });

  // the window reloads: it goes, then the new one says hello
  participant.postMessage({ type: "gone" });
  await screen.findByText(messages.console.participantGone);
  participant.postMessage({ type: "hello" });

  await waitFor(() =>
    expect(heard.filter((m) => m.type === "boot" && m.boot.resume).length).toBe(
      1
    )
  );
  const boot = heard.find((m) => m.type === "boot" && m.boot.resume);
  expect(boot?.type === "boot" && boot.boot.resume).toEqual({
    stepIndex: 0,
    seqFrom: 2,
    interrupted: true,
  });
  expect(
    await screen.findByText(messages.console.participantResumed)
  ).toBeInTheDocument();
  expect(screen.queryByText(messages.console.participantGone)).toBeNull();
  expect(heard.some((m) => m.type === "detached")).toBe(false);

  // a second window while this one runs cannot take over
  participant.postMessage({ type: "hello" });
  await waitFor(() =>
    expect(heard.some((m) => m.type === "detached")).toBe(true)
  );

  // the end: the timeline is both windows', once each
  participant.postMessage({
    type: "finished",
    results: [],
    markers: [
      stamp(2, "block_end", { ended_by: "reload" }),
      stamp(3, "block_start"),
    ],
  });
  await waitFor(() => expect(finishCalls()).toHaveLength(1), {
    timeout: 5000,
  });
  // a reloaded run sends what neither window had acknowledged, through the events endpoint
  const sent = post.mock.calls
    .filter(([path]) => path === "sessions/s1/events")
    .flatMap(([, body]) => (body as { events: { seq: number }[] }).events);
  expect(sent.map((e) => e.seq)).toEqual([1, 2, 3]);
  participant.close();
}, 30_000);

test("a participant window reloaded on the notice starts the run afresh", async () => {
  const { participant, heard } = await startRun("run-notice");
  // the participant had not pressed Begin yet
  participant.postMessage({
    type: "state",
    state: {
      status: "warning",
      stepIndex: 0,
      stepId: "free",
      pausePending: false,
      extendable: false,
      attempt: 0,
      message: null,
    },
  });
  await act(() => new Promise((r) => setTimeout(r, 50)));
  participant.postMessage({ type: "gone" });
  await screen.findByText(messages.console.participantGone);
  participant.postMessage({ type: "hello" });
  await waitFor(() =>
    expect(heard.filter((m) => m.type === "boot").length).toBe(2)
  );
  const again = heard.filter((m) => m.type === "boot").at(-1);
  expect(again?.type === "boot" && again.boot.resume).toBeUndefined();
  participant.close();
}, 30_000);

test("a dropped headband asks the runner to stop and closes on its exited", async () => {
  const { participant, heard, muse } = await startRun("run-drop");

  await act(async () => {
    await muse.disconnect();
  });
  await waitFor(() =>
    expect(
      heard.some((m) => m.type === "command" && m.command.type === "abort")
    ).toBe(true)
  );
  // the runner has not answered yet: the session stays open for its run_aborted
  await act(() => new Promise((r) => setTimeout(r, 300)));
  expect(finishCalls()).toHaveLength(0);

  participant.postMessage({ type: "exited", reason: "operator", markers: [] });
  await waitFor(() => expect(finishCalls()).toHaveLength(1), {
    timeout: 5000,
  });
  expect(
    await screen.findByText(messages.run.upload.dropped)
  ).toBeInTheDocument();
  participant.close();
}, 30_000);

test("a dropped headband with a silent runner still closes after the grace period", async () => {
  const { participant, muse } = await startRun("run-silent");
  await act(async () => {
    await muse.disconnect();
  });
  await act(() => new Promise((r) => setTimeout(r, 1000)));
  expect(finishCalls()).toHaveLength(0);
  await waitFor(() => expect(finishCalls()).toHaveLength(1), {
    timeout: 6000,
  });
  participant.close();
}, 30_000);

test("a finished run sends only what no window had acknowledged", async () => {
  const { participant } = await startRun("run-acked");
  const stamp = (seq: number, label: string): Marker => ({
    label,
    kind: "stage",
    tSessionS: seq,
    tMonotonicMs: seq,
    tRunMs: seq,
    seq,
    meta: {},
  });
  // the console mirrored four markers; the window's sink had three acknowledged
  for (const [seq, label] of [
    [0, "session_start"],
    [1, "block_start"],
    [2, "nf_update"],
    [3, "block_end"],
  ] as const)
    participant.postMessage({ type: "marker", marker: stamp(seq, label) });
  participant.postMessage({ type: "acked", seqs: [0, 1, 2] });
  participant.postMessage({
    type: "finished",
    results: [],
    markers: [0, 1, 2, 3].map((n) => stamp(n, "x")),
  });
  await waitFor(() => expect(finishCalls()).toHaveLength(1), {
    timeout: 5000,
  });
  const sent = post.mock.calls
    .filter(([path]) => path === "sessions/s1/events")
    .flatMap(([, body]) => (body as { events: { seq: number }[] }).events);
  expect(sent.map((e) => e.seq)).toEqual([3]);
  expect(finishCalls()[0][1]).not.toHaveProperty("events");
  participant.close();
}, 30_000);
