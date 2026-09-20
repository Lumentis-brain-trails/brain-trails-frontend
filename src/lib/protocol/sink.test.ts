import { describe, expect, test, vi } from "vitest";
import { MAX_PAYLOAD_BYTES, type Marker } from "./marker";
import { createMemorySink, createSessionSink } from "./sink";

function marker(label: string, overrides: Partial<Marker> = {}): Marker {
  return {
    label,
    kind: "stimulus",
    tSessionS: null,
    tMonotonicMs: 1000,
    tRunMs: 500,
    meta: {},
    ...overrides,
  };
}

/** A post that resolves only when the test says so, to observe ordering. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createMemorySink", () => {
  test("keeps every marker in order and never reports pending work", async () => {
    const sink = createMemorySink();
    sink.push(marker("a"));
    sink.push(marker("b"));
    await sink.flush();
    sink.flushBeacon();

    expect(sink.all().map((m) => m.label)).toEqual(["a", "b"]);
    expect(sink.pending).toBe(0);
  });
});

describe("createSessionSink", () => {
  test("posts to the session's events path in the wire format", async () => {
    const post = vi.fn().mockResolvedValue({});
    const sink = createSessionSink("sess-1", { post, highWater: 99 });

    sink.push(marker("target_onset", { tRunMs: 2500 }));
    await sink.flush();

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("sessions/sess-1/events");
    expect(body).toEqual({
      events: [
        {
          t: 2.5,
          type: "target_onset",
          payload: {
            kind: "stimulus",
            t_monotonic_ms: 1000,
            t_run_ms: 2500,
            t_session_estimated: true,
          },
        },
      ],
    });
  });

  test("splits the buffer into batches no larger than the batch cap", async () => {
    const post = vi.fn().mockResolvedValue({});
    const sink = createSessionSink("s", { post, batchMax: 2, highWater: 99 });
    for (const label of ["a", "b", "c", "d", "e"]) sink.push(marker(label));

    await sink.flush();

    expect(post.mock.calls.map((c) => c[1].events.length)).toEqual([2, 2, 1]);
    expect(sink.pending).toBe(0);
  });

  test("flushes on its own once the high-water mark is reached", async () => {
    const post = vi.fn().mockResolvedValue({});
    const sink = createSessionSink("s", { post, highWater: 2 });

    sink.push(marker("a"));
    expect(post).not.toHaveBeenCalled();
    sink.push(marker("b"));
    await sink.flush();

    expect(post).toHaveBeenCalled();
    expect(sink.pending).toBe(0);
  });

  /**
   * The backend appends each POST as a new numbered part and merges without dedup, so two
   * batches in flight at once can duplicate events. Posting must be strictly serial.
   */
  test("never has two batches in flight at once", async () => {
    const first = deferred();
    let concurrent = 0;
    let maxConcurrent = 0;
    const post = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (post.mock.calls.length === 1) await first.promise;
      concurrent--;
    });

    const sink = createSessionSink("s", { post, batchMax: 1, highWater: 99 });
    sink.push(marker("a"));
    sink.push(marker("b"));

    const flushA = sink.flush();
    const flushB = sink.flush();
    first.resolve();
    await Promise.all([flushA, flushB]);

    expect(maxConcurrent).toBe(1);
    expect(post).toHaveBeenCalledTimes(2);
  });

  test("keeps a failed batch buffered and resends exactly it, not a second part", async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    const sink = createSessionSink("s", { post, highWater: 99 });
    sink.push(marker("a"));
    sink.push(marker("b"));

    await expect(sink.flush()).rejects.toThrow("offline");
    expect(sink.pending).toBe(2);

    await sink.flush();
    expect(sink.pending).toBe(0);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1].events.map((e: { type: string }) => e.type)) //
      .toEqual(["a", "b"]);
  });

  test("a rejected flush does not wedge the sink for later flushes", async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({});
    const sink = createSessionSink("s", { post, highWater: 99 });
    sink.push(marker("a"));

    await expect(sink.flush()).rejects.toThrow("boom");
    await expect(sink.flush()).resolves.toBeUndefined();
  });

  test("truncates an oversized payload instead of failing its batch", async () => {
    const post = vi.fn().mockResolvedValue({});
    const sink = createSessionSink("s", { post, highWater: 99 });
    sink.push(
      marker("huge", {
        meta: {
          step_id: "challenge_a",
          phase: "challenge_a",
          trial_id: 7,
          note: "x".repeat(MAX_PAYLOAD_BYTES * 2),
        },
      })
    );

    await sink.flush();

    const [event] = post.mock.calls[0][1].events;
    expect(event.payload.payload_truncated).toBe(true);
    expect(event.payload.note).toBeUndefined();
    // The identifying fields survive, so the marker is still locatable in analysis.
    expect(event.payload.step_id).toBe("challenge_a");
    expect(event.payload.trial_id).toBe(7);
    expect(event.type).toBe("huge");
  });

  test("an event within the size cap keeps its full payload", async () => {
    const post = vi.fn().mockResolvedValue({});
    const sink = createSessionSink("s", { post, highWater: 99 });
    sink.push(marker("small", { meta: { note: "fine" } }));

    await sink.flush();

    expect(post.mock.calls[0][1].events[0].payload.note).toBe("fine");
    expect(
      post.mock.calls[0][1].events[0].payload.payload_truncated
    ).toBeUndefined();
  });

  test("flushBeacon drops the batch only when the beacon was accepted", () => {
    const beacon = vi.fn().mockReturnValue(false);
    const sink = createSessionSink("s", {
      post: vi.fn(),
      beacon,
      highWater: 99,
    });
    sink.push(marker("a"));

    sink.flushBeacon();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(sink.pending).toBe(1);

    beacon.mockReturnValue(true);
    sink.flushBeacon();
    expect(sink.pending).toBe(0);
  });

  test("flushBeacon is a no-op with nothing buffered", () => {
    const beacon = vi.fn().mockReturnValue(true);
    const sink = createSessionSink("s", {
      post: vi.fn(),
      beacon,
      highWater: 99,
    });
    sink.flushBeacon();
    expect(beacon).not.toHaveBeenCalled();
  });

  test("all() keeps the whole run even after batches are posted away", async () => {
    const post = vi.fn().mockResolvedValue({});
    const sink = createSessionSink("s", { post, batchMax: 1, highWater: 99 });
    sink.push(marker("a"));
    sink.push(marker("b"));

    await sink.flush();

    expect(sink.pending).toBe(0);
    expect(sink.all().map((m) => m.label)).toEqual(["a", "b"]);
  });

  test("flushing an empty sink posts nothing", async () => {
    const post = vi.fn().mockResolvedValue({});
    const sink = createSessionSink("s", { post });
    await sink.flush();
    expect(post).not.toHaveBeenCalled();
  });
});
