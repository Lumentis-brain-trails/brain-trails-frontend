import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { finishSession, postPlan, startSession } from "./session";
import "@/components/protocol/kinds";

const post = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    post: (path: string, body: unknown) => post(path, body),
  },
  ApiRequestError: class extends Error {},
}));

beforeEach(() => post.mockReset().mockResolvedValue({}));
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

    expect(post).toHaveBeenCalledWith("sessions/sess-1/finish", {
      summary: { challenge_a: { hitRate: 0.9 } },
      aborted: false,
      capture,
      events: [{ t: 1, type: "session_start", payload: {}, seq: 0 }],
    });
  });

  test("an aborted run with nothing captured sends no capture", async () => {
    await finishSession("sess-1", { summary: {}, aborted: true });
    expect(post.mock.calls[0][1]).toEqual({ summary: {}, aborted: true });
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
