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
import messages from "../../../../../../messages/en.json";
import { FakeSocket } from "@/lib/live/fakeSocket";
import WaitingRoomPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    get: (p: string) => get(p),
    post: (p: string, b: unknown) => post(p, b),
    delete: (p: string) => del(p),
  },
}));

const t = messages.live.wait;

beforeEach(() => {
  FakeSocket.reset();
  push.mockReset();
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
      : Promise.resolve({
          id: "a1",
          subject_id: "p1",
          protocol_title: "Letters",
        })
  );
  post.mockResolvedValue({ ticket: "w", ws_path: "/live/waiting/a1" });
  del.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the carer opens the room, sees the patient's headband, and follows them into the session", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <Suspense fallback="loading">
            <WaitingRoomPage params={Promise.resolve({ assignment: "a1" })} />
          </Suspense>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  await act(() => new Promise((r) => setTimeout(r, 0)));
  expect(post).toHaveBeenCalledWith("assignments/a1/live-room", {});
  const socket = FakeSocket.last();
  expect(socket.url).toBe("wss://api.test/live/waiting/a1");
  await act(async () => {
    socket.open();
    socket.receive({
      type: "hello",
      role: "observer",
      preflight: null,
      session_id: null,
    });
  });
  expect(await screen.findByText(t.patientAway)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Letters" })).toBeTruthy();

  await act(async () =>
    socket.receive({
      type: "preflight",
      preflight: {
        status: "connected",
        model: "muse-2",
        battery: 76,
        allGood: true,
      },
    })
  );
  expect(screen.getByText(t.patientHere)).toBeTruthy();
  expect(
    screen.getByText("Headband muse-2 connected · battery 76%")
  ).toBeTruthy();
  expect(screen.getByText(t.contactGood)).toBeTruthy();

  await act(async () => socket.receive({ type: "session", session_id: "s9" }));
  expect(push).toHaveBeenCalledWith("/live/s9");

  fireEvent.click(screen.getByRole("button", { name: t.close }));
  await act(() => new Promise((r) => setTimeout(r, 0)));
  expect(del).toHaveBeenCalledWith("assignments/a1/live-room");
  expect(push).toHaveBeenLastCalledWith("/patients/p1");
});
