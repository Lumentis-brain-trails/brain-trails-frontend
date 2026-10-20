/**
 * The console and the participant's window, on one machine (backend V3-0007, step 1).
 *
 * The console page owns the headband, the capture and the session; it opens the
 * participant's window, which runs the protocol and nothing else. The two talk over one
 * `BroadcastChannel` named after the run: no server, no added latency, and it keeps
 * working offline once the media are loaded.
 *
 * The runner in the participant's window stays the only clock (V2-0002): it stamps every
 * marker itself, on the EEG clock the console fitted. The fit is in the console's
 * `performance.now()` frame, so it crosses the channel with the console's
 * `performance.timeOrigin` and is shifted into the participant's frame (`shiftFit`) -
 * both windows read the same machine clock, only their origins differ.
 *
 * This is the feed the console's panels read (plan V4, T1): a second implementation over
 * the live service arrives with the remote console (T5) behind the same messages.
 */

import type { TimelineFit } from "@/lib/protocol/clock";
import {
  type CommandPort,
  type OperatorCommand,
  type RunnerState,
  operatorCommandSchema,
} from "@/lib/protocol/commands";
import type { Marker } from "@/lib/protocol/marker";
import type { MarkerSink } from "@/lib/protocol/sink";
import type { ProtocolDefinition, TaskResult } from "@/lib/protocol/types";

/**
 * How long the console waits, after asking the runner to stop because the headband
 * dropped, for the runner to log and flush `run_aborted` and say `exited` before it
 * closes the session anyway: a batch posted after the finish would be refused (409).
 */
export const EXIT_GRACE_MS = 3000;

/** Everything the participant's window needs to run the protocol. */
export interface RunBoot {
  sessionId: string;
  plan: ProtocolDefinition;
  seed: number;
  officialSlug: string | null;
  /** The console already showed the content warning and took consent. */
  warningShown: boolean;
  firstSampleIndex: number;
  fit: TimelineFit;
  /** The console's `performance.timeOrigin`, the frame `fit` is in. */
  origin: number;
}

/** What the console sends. */
export type ConsoleMessage =
  | { type: "boot"; boot: RunBoot }
  | { type: "fit"; fit: TimelineFit; origin: number }
  | { type: "command"; command: OperatorCommand }
  /** To a window that opened after the run began there: it cannot resume it. */
  | { type: "detached" };

/** What the participant's window sends. */
export type RunMessage =
  | { type: "hello" }
  | { type: "state"; state: RunnerState }
  | { type: "marker"; marker: Marker }
  | { type: "finished"; results: TaskResult[]; markers: Marker[] }
  | { type: "exited"; reason: string; markers: Marker[] }
  | { type: "gone" };

export type ChannelMessage = ConsoleMessage | RunMessage;

/** The channel's name for one run; the same key is in both pages' URLs. */
export function channelName(runKey: string): string {
  return `bt-console:${runKey}`;
}

/** The slice of `BroadcastChannel` this module uses, so tests can hand in a fake. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void
  ): void;
  close(): void;
}

export interface ConsoleChannel {
  post(message: ChannelMessage): void;
  /** Every message the other window sends; returns the unsubscribe. */
  subscribe(listener: (message: ChannelMessage) => void): () => void;
  close(): void;
}

/**
 * Open the run's channel; null where the browser has no `BroadcastChannel` (the console
 * then says so rather than opening a window it cannot talk to).
 */
export function openChannel(
  runKey: string,
  open: (name: string) => ChannelLike | null = defaultOpen
): ConsoleChannel | null {
  const channel = open(channelName(runKey));
  if (!channel) return null;
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as ChannelMessage | null;
        if (data && typeof data === "object" && typeof data.type === "string")
          listener(data);
      };
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
    close: () => channel.close(),
  };
}

function defaultOpen(name: string): ChannelLike | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(name);
}

/**
 * The commands arriving on `channel`, as the runner's port. A command that does not
 * parse is dropped: the runner must never act on something it cannot log faithfully.
 */
export function commandPortFrom(channel: ConsoleChannel): CommandPort {
  return {
    subscribe: (listener) =>
      channel.subscribe((message) => {
        if (message.type !== "command") return;
        const parsed = operatorCommandSchema.safeParse(message.command);
        if (parsed.success) listener(parsed.data);
      }),
  };
}

/**
 * A fit made in a window whose time origin is `from`, in the frame of a window whose
 * origin is `to`. Absolute time is `origin + performance.now()` in both windows, so
 * only the sample-0 instant moves; the period is the same clock's.
 */
export function shiftFit(
  fit: TimelineFit,
  from: number,
  to: number
): TimelineFit {
  return {
    hostMsAtIndex0: fit.hostMsAtIndex0 + (from - to),
    msPerSample: fit.msPerSample,
  };
}

/**
 * A sink that also hands every marker to `onMarker` - the participant's window posts
 * them to the console's event ticker - while the wrapped sink still posts them to the
 * session.
 */
export function teeSink(
  sink: MarkerSink,
  onMarker: (marker: Marker) => void
): MarkerSink {
  return {
    push(marker) {
      sink.push(marker);
      onMarker(marker);
    },
    flush: () => sink.flush(),
    flushBeacon: () => sink.flushBeacon(),
    all: () => sink.all(),
    get pending() {
      return sink.pending;
    },
  };
}
