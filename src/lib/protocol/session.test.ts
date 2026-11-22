import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiRequestError } from "@/lib/api";
import {
  type FinishProgress,
  finishSession,
  isSessionClosed,
  postPlan,
  startSession,
} from "./session";
import "@/components/protocol/kinds";

const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    post: (path: string, body: unknown) => post(path, body),
  },
  ApiRequestError: class extends Error {
    status: number;
    error: { code: string; message: string };
    constructor(status: number, error: { code: string; message: string }) {
      super(error.message);
      this.status = status;
      this.error = error;
    }
  },
}));

// braces: a function returned from beforeEach is run as its teardown, and `post` is one
beforeEach(() => {
  post.mockReset().mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("startSession", () => {
  test("posts the protocol id, asks for upload capture, defaults the device", async () => {
    await startSession("protocol-1");

    expect(post).toHaveBeenCalledWith("sessions", {
      protocol_id: "protocol-1",
      capture: "upload",
      device: "muse-2",
      params: {},
    });
  });

  test("passes a version, a title and params through when given", async () => {
    await startSession("protocol-1", {
      version: 2,
      title: "Signal Navigator",
      params: { rehearsal: true },
    });

    expect(post.mock.calls[0][1]).toEqual({
      protocol_id: "protocol-1",
      capture: "upload",
      version: 2,
      title: "Signal Navigator",
      device: "muse-2",
      params: { rehearsal: true },
    });
  });

  /**
   * `task_label` is a closed CHECK constraint in SQL with no go/no-go value, so sending
   * one would fail at the database rather than at the API.
   */
  test("never sends a task label", async () => {
    await startSession("protocol-1", { title: "x" });
    expect(post.mock.calls[0][1]).not.toHaveProperty("task_label");
  });
});

describe("finishSession", () => {
  test("closes a completed run with its summary and its capture", async () => {
    const capture = { original: "k/original.csv", extras: null, ble: null };
    await finishSession("sess-1", {
      summary: { challenge_a: { hitRate: 0.9 } },
      aborted: false,
      capture,
      events: [{ t: 1, type: "session_start", payload: {}, seq: 0 }],
    });

    // the events still owed go first, through the events endpoint
    expect(post).toHaveBeenNthCalledWith(1, "sessions/sess-1/events", {
      events: [{ t: 1, type: "session_start", payload: {}, seq: 0 }],
    });
    expect(post).toHaveBeenNthCalledWith(2, "sessions/sess-1/finish", {
      summary: { challenge_a: { hitRate: 0.9 } },
      aborted: false,
      capture,
    });
  });

  test("a long timeline goes in batches of 500, never in one finish body", async () => {
    const events = Array.from({ length: 1201 }, (_, i) => ({
      t: i / 10,
      type: "nf_update",
      payload: {},
      seq: i,
    }));
    await finishSession("sess-1", { summary: {}, aborted: false, events });
    const sizes = post.mock.calls
      .filter(([path]) => path === "sessions/sess-1/events")
      .map(([, body]) => (body as { events: unknown[] }).events.length);
    expect(sizes).toEqual([500, 500, 201]);
    expect(post.mock.calls.at(-1)?.[0]).toBe("sessions/sess-1/finish");
    expect(post.mock.calls.at(-1)?.[1]).not.toHaveProperty("events");
  });

  test("an aborted run with nothing captured sends no capture", async () => {
    await finishSession("sess-1", { summary: {}, aborted: true });
    expect(post.mock.calls[0][1]).toEqual({ summary: {}, aborted: true });
  });

  const closed = () =>
    new ApiRequestError(409, {
      code: "session_closed",
      message: "this session is already finished",
    });
  const events = [{ t: 1, type: "session_start", payload: {}, seq: 0 }];

  /**
   * The first finish closed the session but its answer was lost; the retry's events get
   * 409 `session_closed`. That is the run already saved, not a failure to show forever.
   */
  test("a retry whose events meet a closed session still finishes", async () => {
    const session = { id: "sess-1", status: "finished" };
    post.mockImplementation((path: string) =>
      path.endsWith("/events")
        ? Promise.reject(closed())
        : Promise.resolve(session)
    );
    await expect(
      finishSession("sess-1", { summary: {}, aborted: false, events })
    ).resolves.toBe(session);
    expect(post.mock.calls.map(([path]) => path)).toEqual([
      "sessions/sess-1/events",
      "sessions/sess-1/finish",
    ]);
  });

  test("a finish answering session_closed counts as saved", async () => {
    post.mockImplementation((path: string) =>
      path.endsWith("/finish") ? Promise.reject(closed()) : Promise.resolve({})
    );
    await expect(
      finishSession("sess-1", { summary: {}, aborted: false, events })
    ).resolves.toBeNull();
  });

  test("once finish was sent, a retry sends finish alone", async () => {
    const progress: FinishProgress = {};
    post.mockImplementation((path: string) =>
      path.endsWith("/finish")
        ? Promise.reject(new TypeError("network"))
        : Promise.resolve({})
    );
    await expect(
      finishSession("sess-1", { summary: {}, aborted: false, events }, progress)
    ).rejects.toThrow("network");
    expect(progress.finishSent).toBe(true);

    post.mockReset().mockResolvedValue({});
    await finishSession(
      "sess-1",
      { summary: {}, aborted: false, events },
      progress
    );
    expect(post.mock.calls.map(([path]) => path)).toEqual([
      "sessions/sess-1/finish",
    ]);
  });

  test("events that failed for another reason are sent again on retry", async () => {
    const progress: FinishProgress = {};
    post.mockRejectedValueOnce(
      new ApiRequestError(500, { code: "internal", message: "boom" })
    );
    await expect(
      finishSession("sess-1", { summary: {}, aborted: false, events }, progress)
    ).rejects.toThrow("boom");
    expect(progress.finishSent).toBeFalsy();
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("isSessionClosed", () => {
  test("is only the 409 session_closed", () => {
    expect(
      isSessionClosed(
        new ApiRequestError(409, { code: "session_closed", message: "" })
      )
    ).toBe(true);
    expect(
      isSessionClosed(
        new ApiRequestError(409, { code: "plan_fixed", message: "" })
      )
    ).toBe(false);
    expect(isSessionClosed(new Error("session_closed"))).toBe(false);
  });
});

describe("postPlan", () => {
  /** The plan is a record of what was shown; the backend refuses a second, different one. */
  test("posts the resolved plan to the session", async () => {
    const plan = {
      id: "p1",
      version: 1,
      title: "T",
      steps: [{ id: "rest", kind: "rest", label: "Rest", config: {} }],
    };
    await postPlan("sess-1", plan);
    expect(post).toHaveBeenCalledWith("sessions/sess-1/plan", { plan });
  });
});
