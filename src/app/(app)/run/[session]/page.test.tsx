import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { afterEach, expect, test, vi } from "vitest";
import messages from "../../../../../messages/en.json";
import { type ChannelMessage, channelName } from "@/lib/console/channel";
import type { ProtocolDefinition } from "@/lib/protocol/types";
import ParticipantRunPage from "./page";

const post = vi.fn<(path: string, body: unknown) => Promise<unknown>>(() =>
  Promise.resolve({})
);
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { post: (p: string, b: unknown) => post(p, b) },
}));

afterEach(() => cleanup());

const plan: ProtocolDefinition = {
  id: "p1",
  version: 1,
  title: "One prompt",
  startMarker: "session_start",
  endMarker: "session_end",
  steps: [
    {
      id: "first",
      kind: "prompt",
      label: "First",
      config: {
        lines: [{ text: "Step one", holdMs: 100 }],
        advance: { mode: "timed", ms: 60_000 },
      },
    },
  ],
};

test("the participant's window runs what the console boots, and obeys its commands", async () => {
  const console_ = new BroadcastChannel(channelName("run-2"));
  const heard: ChannelMessage[] = [];
  console_.onmessage = (event) => heard.push(event.data);

  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Suspense fallback="loading">
          <ParticipantRunPage params={Promise.resolve({ session: "run-2" })} />
        </Suspense>
      </NextIntlClientProvider>
    );
  });
  expect(
    screen.getByText(messages.console.participant.waiting)
  ).toBeInTheDocument();
  await waitFor(() => expect(heard).toContainEqual({ type: "hello" }));

  console_.postMessage({
    type: "boot",
    boot: {
      sessionId: "s1",
      plan,
      seed: 1,
      officialSlug: null,
      warningShown: true,
      firstSampleIndex: 0,
      fit: { hostMsAtIndex0: 0, msPerSample: 1000 / 256 },
      origin: performance.timeOrigin,
    },
  });
  expect(await screen.findByText("Step one")).toBeInTheDocument();

  console_.postMessage({
    type: "command",
    command: { id: "m1", type: "message", text: "Nearly there" },
  });
  expect(await screen.findByText("Nearly there")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      heard.some(
        (m) =>
          m.type === "marker" &&
          m.marker.label === "operator_command" &&
          m.marker.meta.command === "message"
      )
    ).toBe(true)
  );
  // stamped on the EEG clock the console sent, not flagged as estimated
  const command = heard.find(
    (m) => m.type === "marker" && m.marker.label === "operator_command"
  );
  expect(command?.type === "marker" && command.marker.tSessionS).not.toBeNull();
  expect(heard.some((m) => m.type === "state")).toBe(true);

  console_.postMessage({
    type: "command",
    command: { id: "a1", type: "abort" },
  });
  expect(
    await screen.findByText(messages.console.participant.ended)
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(heard.some((m) => m.type === "exited")).toBe(true)
  );
  console_.close();
});

test("a window opened after the run began says it cannot resume", async () => {
  const console_ = new BroadcastChannel(channelName("run-3"));
  console_.onmessage = (event) => {
    if (event.data?.type === "hello")
      console_.postMessage({ type: "detached" });
  };
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Suspense fallback="loading">
          <ParticipantRunPage params={Promise.resolve({ session: "run-3" })} />
        </Suspense>
      </NextIntlClientProvider>
    );
  });
  expect(
    await screen.findByText(messages.console.participant.detached)
  ).toBeInTheDocument();
  console_.close();
});
