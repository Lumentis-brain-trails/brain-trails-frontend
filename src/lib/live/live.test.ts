import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ChunkAssembler } from "./chunks";
import { FakeSocket } from "./fakeSocket";
import { LiveProducer } from "./producer";
import { applyFrame, emptyRoom, holdsCommands } from "./room";
import { LiveSocket, backoffMs, wsUrl } from "./socket";

const Impl = FakeSocket as unknown as typeof WebSocket;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => FakeSocket.reset());
afterEach(() => vi.useRealTimers());

describe("LiveSocket", () => {
  test("opens with a fresh ticket, says hello, and reconnects after a drop", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const tickets = vi
      .fn()
      .mockResolvedValue({ ticket: "t", ws_path: "/live/sessions/s1" });
    const frames: unknown[] = [];
    const states: string[] = [];
    const socket = new LiveSocket({
      baseUrl: "https://api.example",
      ticket: tickets,
      hello: () => ({ since: { signal: "1-0" } }),
      onFrame: (f) => frames.push(f),
      onState: (s) => states.push(s),
      WebSocketImpl: Impl,
      backoff: () => 10,
    });
    socket.start();
    await flush();
    const first = FakeSocket.last();
    expect(first.url).toBe("wss://api.example/live/sessions/s1");
    first.open();
    expect(first.sent[0]).toEqual({ ticket: "t", since: { signal: "1-0" } });
    first.receive({ type: "hello" });
    expect(states.at(-1)).toBe("open");
    expect(socket.send({ type: "x" })).toBe(true);

    first.drop();
    expect(states.at(-1)).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(20);
    expect(tickets).toHaveBeenCalledTimes(2);
    expect(FakeSocket.all).toHaveLength(2);
    socket.close();
  });

  test("a final refusal stops trying", async () => {
    const socket = new LiveSocket({
      baseUrl: "http://localhost:8000",
      ticket: async () => ({ ticket: "t", ws_path: "/p" }),
      onFrame: () => undefined,
      WebSocketImpl: Impl,
      backoff: () => 1,
    });
    socket.start();
    await flush();
    expect(FakeSocket.last().url).toBe("ws://localhost:8000/p");
    FakeSocket.last().drop(4409);
    await new Promise((r) => setTimeout(r, 10));
    expect(FakeSocket.all).toHaveLength(1);
    expect(socket.state).toBe("closed");
  });

  test("backoff doubles to a cap, with jitter", () => {
    expect(backoffMs(0, () => 0.5)).toBe(500);
    expect(backoffMs(3, () => 0.5)).toBe(4000);
    expect(backoffMs(20, () => 0.5)).toBe(15000);
    expect(backoffMs(0, () => 0)).toBe(400);
    expect(wsUrl("https://h/", "/x")).toBe("wss://h/x");
  });
});

describe("ChunkAssembler", () => {
  const channels = ["TP9", "AF7", "AF8", "TP10"] as const;

  test("one second of the four channels, with the device's counter", () => {
    const assembler = new ChunkAssembler(256, 256);
    const out = [];
    for (let packet = 0; packet < 30; packet++)
      for (const c of channels)
        out.push(
          ...assembler.push(
            c,
            1000 + packet * 12,
            Array.from({ length: 12 }, (_, i) => packet + i / 3)
          )
        );
    expect(out).toHaveLength(1);
    expect(out[0].first).toBe(1000);
    expect(out[0].seq).toBe(0);
    expect(out[0].eeg).toHaveLength(4);
    expect(out[0].eeg[0]).toHaveLength(256);
    expect(out[0].eeg[0][1]).toBe(0.3); // one decimal
  });

  test("the feed stays under 8 KB a second", () => {
    const assembler = new ChunkAssembler(256, 256);
    let chunk = null;
    for (let packet = 0; packet < 22 && !chunk; packet++)
      for (const c of channels) {
        const samples = Array.from(
          { length: 12 },
          () => (Math.random() - 0.5) * 400
        );
        chunk = assembler.push(c, packet * 12, samples)[0] ?? chunk;
      }
    expect(chunk).not.toBeNull();
    const bytes = new TextEncoder().encode(JSON.stringify(chunk)).length;
    // plus a quality frame of well under 1 KB a second
    expect(bytes).toBeLessThan(7 * 1024);
  });
});

describe("LiveProducer", () => {
  async function started() {
    const presence: unknown[] = [];
    const producer = new LiveProducer({
      sessionId: "s1",
      baseUrl: "https://api",
      WebSocketImpl: Impl,
      ticket: async () => ({ ticket: "t", ws_path: "/live/sessions/s1" }),
      onPresence: (p) => presence.push(p),
    });
    producer.start();
    await flush();
    return { producer, socket: FakeSocket.last(), presence };
  }

  function second(producer: LiveProducer, from: number) {
    for (const c of ["TP9", "AF7", "AF8", "TP10"] as const)
      producer.pushEeg(c, from, new Array(256).fill(1));
  }

  test("after a reconnect it re-sends only what the room did not keep", async () => {
    const { producer, socket } = await started();
    socket.open();
    socket.receive({ type: "hello", last_seq: -1 });
    producer.setPlan({ steps: [] });
    for (let i = 0; i < 3; i++) second(producer, i * 256);
    expect(socket.sent.filter((f) => f.type === "chunk")).toHaveLength(3);

    // the gateway restarted: a new socket, and the room had kept seq 0 only
    socket.drop();
    await new Promise((r) => setTimeout(r, 1200));
    const again = FakeSocket.last();
    expect(again).not.toBe(socket);
    again.open();
    again.receive({ type: "hello", last_seq: 0, observers: 0 });
    const resent = again.sent.filter((f) => f.type === "chunk");
    expect(resent.map((f) => f.seq)).toEqual([1, 2]);
    expect(again.sent.some((f) => f.type === "plan")).toBe(true);
    producer.close();
  });

  test("commands reach the runner as remote; losing every observer pauses when asked", async () => {
    const { producer, socket, presence } = await started();
    const got: unknown[] = [];
    producer.commands.subscribe((c) => got.push(c));
    socket.open();
    socket.receive({ type: "hello", last_seq: -1, observers: 1 });
    socket.receive({
      type: "command",
      command: { id: "c1", type: "skip_block", source: "console" },
    });
    socket.receive({
      type: "command",
      command: { id: "c2", type: "nonsense" },
    });
    expect(got).toEqual([{ id: "c1", type: "skip_block", source: "remote" }]);

    socket.receive({
      type: "presence",
      observers: 0,
      pause_on_lost_sight: true,
    });
    expect(got.at(-1)).toMatchObject({ type: "pause", source: "auto" });
    expect(presence.at(-1)).toEqual({ observers: 0, pauseOnLostSight: true });
    producer.end();
    expect(socket.sent.at(-1)).toEqual({ type: "end" });
  });
});

describe("the room an observer sees", () => {
  test("hello, trail, points, places, acks, results and the commander", () => {
    let room = emptyRoom();
    room = applyFrame(room, {
      type: "hello",
      you: "u1",
      command: true,
      commander: null,
      observers: 1,
      landscape: true,
      producer: "on",
      plan: { steps: [{ id: "a", label: "Rest", kind: "rest" }] },
      state: { status: "running", stepIndex: 0 },
    });
    expect(room.plan).toEqual([{ id: "a", label: "Rest", kind: "rest" }]);
    expect(holdsCommands(room)).toBe(false);
    room = applyFrame(room, { type: "commander", user: "u1" });
    expect(holdsCommands(room)).toBe(true);

    room = applyFrame(room, {
      id: "5-0",
      type: "trail",
      n: 2,
      final: false,
      points: [
        [0, 0],
        [1, 1],
      ],
      map: [[3, 4]],
    });
    room = applyFrame(room, { id: "6-0", type: "window", i: 2, x: 2, y: 0 });
    room = applyFrame(room, { id: "7-0", type: "place", i: 1, mx: 5, my: 6 });
    room = applyFrame(room, { id: "1-0", type: "chunk", eeg: [] });
    expect(room.trail).toEqual({ x: [0, 1, 2], y: [0, 1, 0] });
    expect(room.map).toEqual({ x: [3, 5], y: [4, 6] });
    expect(room.since).toEqual({ signal: "1-0", windows: "7-0" });

    room = applyFrame(room, {
      type: "event",
      event: {
        label: "operator_command",
        seq: 9,
        tSessionS: 12.5,
        meta: { command_id: "c1", command: "pause", effect: "deferred" },
      },
    });
    expect(room.acks.c1).toEqual({ effect: "deferred", command: "pause" });
    expect(room.events[0]).toEqual({
      seq: 9,
      label: "operator_command",
      tS: 12.5,
    });
    room = applyFrame(room, {
      type: "event",
      event: {
        kind: "block_result",
        stepId: "a",
        taskKind: "rest",
        summary: {},
      },
    });
    expect(room.results).toHaveLength(1);
    room = applyFrame(
      room,
      {
        type: "quality",
        quality: { packets: 10, lostPackets: 1, tSessionS: 3 },
      },
      1000
    );
    expect(room.quality).toMatchObject({
      packets: 10,
      lostPackets: 1,
      tSessionS: 3,
      receivedAt: 1000,
    });
    room = applyFrame(room, { type: "room", producer: "ended" });
    room = applyFrame(room, { id: "8-0", type: "end" });
    expect(room.producer).toBe("ended");
    expect(room.ended).toBe(true);
  });
});
