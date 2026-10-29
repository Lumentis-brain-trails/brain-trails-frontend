import { describe, expect, test, vi } from "vitest";
import {
  type ChannelLike,
  type ChannelMessage,
  channelName,
  commandPortFrom,
  eegFeedFrom,
  mergeMarkers,
  owedMarkers,
  openChannel,
  resumePoint,
  shiftFit,
  teeSink,
} from "./channel";
import { eegAnchor } from "@/lib/protocol/clock";
import type { OperatorCommand, RunnerState } from "@/lib/protocol/commands";
import type { Marker } from "@/lib/protocol/marker";
import { createMemorySink } from "@/lib/protocol/sink";

/** Two ends of one in-memory channel, delivering like BroadcastChannel: not to self. */
function pair(): [ChannelLike, ChannelLike] {
  const listeners = new Map<ChannelLike, Set<(e: MessageEvent) => void>>();
  const make = (): ChannelLike => {
    const self: ChannelLike = {
      postMessage(message) {
        for (const [end, set] of listeners)
          if (end !== self)
            for (const l of set) l({ data: message } as MessageEvent);
      },
      addEventListener: (_type, l) => void listeners.get(self)?.add(l),
      removeEventListener: (_type, l) => void listeners.get(self)?.delete(l),
      close: () => void listeners.delete(self),
    };
    listeners.set(self, new Set());
    return self;
  };
  return [make(), make()];
}

describe("console channel", () => {
  test("names the channel after the run key", () => {
    expect(channelName("abc")).toBe("bt-console:abc");
  });

  test("is null where the browser has no BroadcastChannel", () => {
    expect(openChannel("k", () => null)).toBeNull();
  });

  test("carries messages between the two windows, and ignores junk", () => {
    const [a, b] = pair();
    const opened: string[] = [];
    const console_ = openChannel("k", (name) => (opened.push(name), a))!;
    const participant = openChannel("k", () => b)!;
    const received: ChannelMessage[] = [];
    const unsubscribe = console_.subscribe((m) => received.push(m));
    participant.post({ type: "hello" });
    b.postMessage("not a message");
    b.postMessage(null);
    expect(received).toEqual([{ type: "hello" }]);
    expect(opened).toEqual(["bt-console:k"]);
    unsubscribe();
    participant.post({ type: "gone" });
    expect(received).toHaveLength(1);
  });

  test("the runner only hears commands that parse", () => {
    const [a, b] = pair();
    const console_ = openChannel("k", () => a)!;
    const participant = openChannel("k", () => b)!;
    const heard: OperatorCommand[] = [];
    commandPortFrom(participant).subscribe((c) => heard.push(c));
    console_.post({
      type: "command",
      command: { id: "1", type: "pause", source: "console" },
    });
    console_.post({
      type: "command",
      command: { id: "2", type: "teleport" } as never,
    });
    console_.post({
      type: "command",
      command: { id: "3", type: "message", text: "x".repeat(281) } as never,
    });
    console_.post({ type: "hello" } as never);
    expect(heard.map((c) => c.id)).toEqual(["1"]);
  });

  test("a fit crosses windows on the shared machine clock", () => {
    // the console opened 1500 ms before the participant's window
    const consoleOrigin = 1_000_000;
    const participantOrigin = 1_001_500;
    const fit = { hostMsAtIndex0: 20_000, msPerSample: 1000 / 256 };
    const shifted = shiftFit(fit, consoleOrigin, participantOrigin);
    expect(shifted).toEqual({
      hostMsAtIndex0: 18_500,
      msPerSample: fit.msPerSample,
    });
    // the same instant reads the same session second in both windows
    const consoleNow = 25_000;
    const participantNow = consoleNow + consoleOrigin - participantOrigin;
    const there = eegAnchor(0, () => fit, 256).toSessionS(consoleNow);
    const here = eegAnchor(0, () => shifted, 256).toSessionS(participantNow);
    expect(here).toBeCloseTo(there as number, 9);
  });

  test("teeSink mirrors every marker and keeps the session sink's contract", async () => {
    const inner = createMemorySink();
    const mirrored = vi.fn();
    const sink = teeSink(inner, mirrored);
    const marker = { label: "x", kind: "system", seq: 0 } as Marker;
    sink.push(marker);
    expect(mirrored).toHaveBeenCalledWith(marker);
    expect(sink.all()).toEqual([marker]);
    expect(sink.pending).toBe(0);
    await sink.flush();
    sink.flushBeacon();
  });
});

describe("the EEG feed to the participant's window (V4-0009)", () => {
  test("carries packets, with arrival times moved into this window's frame", () => {
    const [a, b] = pair();
    const console_ = openChannel("k", () => a)!;
    const participant = openChannel("k", () => b)!;
    const heard: { hostMs: number; sampleIndex: number }[] = [];
    // the console's clock started 250 ms before this window's
    const off = eegFeedFrom(participant, 1000, 1250).subscribe((p) =>
      heard.push({ hostMs: p.hostMs, sampleIndex: p.sampleIndex })
    );
    console_.post({ type: "hello" });
    console_.post({
      type: "eeg",
      packet: { channel: "TP9", sampleIndex: 24, samples: [1, 2], hostMs: 500 },
    });
    expect(heard).toEqual([{ hostMs: 250, sampleIndex: 24 }]);
    off();
    console_.post({
      type: "eeg",
      packet: { channel: "TP9", sampleIndex: 36, samples: [1], hostMs: 600 },
    });
    expect(heard).toHaveLength(1);
  });
});

describe("resuming a reloaded participant window", () => {
  const marker = (seq: number, label: string, stepId = "a"): Marker => ({
    label,
    kind: "stage",
    tMonotonicMs: seq * 10,
    tRunMs: seq * 10,
    tSessionS: seq / 100,
    seq,
    meta: { step_id: stepId },
  });
  const running = (stepIndex: number, stepId: string): RunnerState => ({
    status: "running",
    stepIndex,
    stepId,
    pausePending: false,
    extendable: false,
    attempt: 0,
    message: null,
  });

  test("the block on screen runs again, closed first when it never ended", () => {
    const markers = [
      marker(0, "block_start", "a"),
      marker(1, "block_end", "a"),
      marker(2, "block_start", "b"),
    ];
    expect(resumePoint(running(1, "b"), markers, 3)).toEqual({
      stepIndex: 1,
      seqFrom: 3,
      interrupted: true,
    });
    expect(
      resumePoint(running(1, "b"), [...markers, marker(3, "block_end", "b")], 3)
    ).toMatchObject({ interrupted: false, seqFrom: 4 });
  });

  test("a run held between blocks resumes held at the next one; a finished plan does not", () => {
    const paused = { ...running(0, "a"), status: "paused" as const };
    expect(resumePoint(paused, [marker(0, "block_end", "a")], 2)).toEqual({
      stepIndex: 1,
      seqFrom: 1,
      interrupted: false,
      held: true,
    });
    expect(resumePoint(paused, [], 1)).toBeNull();
  });

  test("a run whose notice was still up starts afresh", () => {
    const notice = { ...running(0, "a"), status: "warning" as const };
    expect(resumePoint(notice, [], 2)).toBe("fresh");
    expect(resumePoint(null, [], 2)).toBe("fresh");
  });

  test("the merged timeline has every marker once, in seq order", () => {
    const merged = mergeMarkers(
      [marker(0, "x"), marker(1, "y")],
      [marker(1, "y"), marker(2, "z")]
    );
    expect(merged.map((m) => m.seq)).toEqual([0, 1, 2]);
  });
});

describe("what a console's finish still owes", () => {
  const m = (seq: number | undefined): Marker =>
    ({
      label: "x",
      kind: "stage",
      tSessionS: 0,
      tMonotonicMs: 0,
      tRunMs: 0,
      seq,
      meta: {},
    }) as Marker;

  test("only markers no window had acknowledged, and any without a seq", () => {
    const owed = owedMarkers(
      [m(0), m(1), m(2), m(undefined), m(7)],
      new Set([0, 2, 7])
    );
    expect(owed.map((x) => x.seq)).toEqual([1, undefined]);
  });
});
