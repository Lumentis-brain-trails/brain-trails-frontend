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
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../../../messages/en.json";
import { FakeSocket } from "@/lib/live/fakeSocket";
import RemoteConsolePage from "./page";

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

const t = messages.live.console;

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
  get.mockImplementation((path: string) =>
    path === "config"
      ? Promise.resolve({
          env: "test",
          version: "x",
          consent_version: "v",
          features: { console_remote: true, live: true },
          live_url: "https://api.test",
        })
      : path === "sessions/s1"
        ? Promise.resolve({ id: "s1", title: "Letters", recording_id: "r1" })
        : Promise.reject(new Error(path))
  );
  post.mockResolvedValue({ ticket: "t", ws_path: "/live/sessions/s1" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <RemoteConsolePage params={Promise.resolve({ session: "s1" })} />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  await act(() => new Promise((r) => setTimeout(r, 0)));
  const socket = FakeSocket.last();
  await act(async () => socket.open());
  return socket;
}

test("a carer watches, takes control, sends a command and sees it done", async () => {
  const socket = await renderPage();
  expect(post).toHaveBeenCalledWith("sessions/s1/live/observer-ticket", {});
  expect(socket.url).toBe("wss://api.test/live/sessions/s1");
  expect(socket.sent[0]).toMatchObject({ ticket: "t", since: {} });

  await act(async () => {
    socket.receive({
      type: "hello",
      you: "u1",
      command: true,
      commander: null,
      observers: 1,
      producer: "on",
      plan: {
        steps: [
          { id: "a", label: "Rest", kind: "rest" },
          { id: "b", label: "Letters", kind: "n-back" },
        ],
      },
      state: {
        status: "running",
        stepIndex: 1,
        stepId: "b",
        pausePending: false,
        extendable: false,
        attempt: 0,
        message: null,
      },
    });
  });
  expect(await screen.findByText(t.connection.open)).toBeTruthy();
  expect(screen.getAllByText("Letters").length).toBeGreaterThan(0);
  // not the holder: the commands are off, the way to take them is on
  expect(
    screen.getByRole("button", { name: messages.console.commands.endBlock })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: t.take }));
  expect(socket.sent.at(-1)).toEqual({ type: "take_command" });

  await act(async () => socket.receive({ type: "commander", user: "u1" }));
  const end = screen.getByRole("button", {
    name: messages.console.commands.endBlock,
  });
  expect(end).toBeEnabled();
  fireEvent.click(end);
  const sent = socket.sent.at(-1) as {
    type: string;
    command: { id: string; type: string; source: string };
  };
  expect(sent.type).toBe("command");
  expect(sent.command).toMatchObject({ type: "end_block", source: "remote" });
  expect(
    screen.getByText("end_block: sent, waiting for the run…")
  ).toBeTruthy();

  // the runner's marker is the acknowledgement
  await act(async () =>
    socket.receive({
      type: "event",
      event: {
        label: "operator_command",
        seq: 4,
        tSessionS: 9,
        meta: {
          command_id: sent.command.id,
          command: "end_block",
          effect: "applied",
        },
      },
    })
  );
  expect(screen.getByText("end_block: done")).toBeTruthy();

  // the trail as the worker draws it, and a block's result
  await act(async () => {
    socket.receive({
      id: "3-0",
      type: "trail",
      n: 3,
      final: false,
      points: [
        [0, 0],
        [1, 2],
        [2, 1],
      ],
      map: [],
    });
    socket.receive({
      type: "event",
      event: {
        kind: "block_result",
        stepId: "a",
        taskKind: "rest",
        summary: {},
      },
    });
  });
  expect(
    screen.getByRole("img", { name: "The live trail, 3 windows" })
  ).toBeTruthy();
  expect(screen.getByText(t.liveMark)).toBeTruthy();
  expect(screen.getByText("· done", { exact: false })).toBeTruthy();

  // holding the commands: "pause if I lose sight" and letting go
  fireEvent.click(screen.getByLabelText(t.pauseOnLostSight));
  expect(socket.sent.at(-1)).toEqual({
    type: "settings",
    pause_on_lost_sight: true,
  });
  fireEvent.click(screen.getByRole("button", { name: t.release }));
  expect(socket.sent.at(-1)).toEqual({ type: "release_command" });
});

test("a dropped room says so and reconnects from where it stopped", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const socket = await renderPage();
  await act(async () => {
    socket.receive({
      type: "hello",
      you: "u1",
      command: true,
      producer: "on",
      observers: 1,
    });
    socket.receive({ id: "9-1", type: "chunk", eeg: [[1], [2], [3], [4]] });
    socket.receive({ id: "4-0", type: "window", i: 0, x: 0, y: 0 });
    // this carer held control when the room dropped
    socket.receive({ type: "commander", user: "u1" });
  });
  await act(async () => socket.drop());
  expect(screen.getByText(t.connection.reconnecting)).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  const again = FakeSocket.last();
  expect(again).not.toBe(socket);
  await act(async () => again.open());
  expect(again.sent[0]).toEqual({
    ticket: "t",
    since: { signal: "9-1", windows: "4-0" },
  });
  // the gateway restarted and forgot the holder: the console takes control back
  await act(async () =>
    again.receive({
      type: "hello",
      you: "u1",
      command: true,
      commander: null,
      producer: "on",
    })
  );
  expect(again.sent.at(-1)).toEqual({ type: "take_command" });
  vi.useRealTimers();
});
